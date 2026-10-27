/**
 * Background-session management: `claude ps|logs|attach|kill` and
 * `--bg` / `--background` flag handling.
 *
 * Session registry lives in `<CLAUDE_CONFIG_HOME>/sessions/<pid>.json`
 * (written by `concurrentSessions.registerSession()`). Each file holds:
 *   { pid, sessionId, cwd, startedAt, kind, name, logPath, agent }
 *
 * `ps` reads every `.json` file, prunes stale PIDs, and prints a table.
 * `logs <session>` tails the NDJSON transcript for the named session.
 * `attach <session>` execs a fresh interactive CLI for that session.
 * `kill <session>` sends SIGTERM to the PID registered for that session.
 * `--bg` spawns the current invocation as a detached background process.
 *
 * On Windows these commands are best-effort — some utilities (tmux,
 * signal sending, exec spawning) are limited, but the core logic works.
 */

import { chmod, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import { errorMessage, isFsInaccessible } from '../utils/errors.js'
import { isProcessRunning } from '../utils/genericProcessUtils.js'
import { getPlatform } from '../utils/platform.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BgSessionEntry = {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
  kind: 'interactive' | 'bg' | 'daemon' | 'daemon-worker'
  entrypoint?: string
  /** Optional human-readable name set via `--name` at spawn time. */
  name?: string
  /** Path to the NDJSON transcript log. Set only when CLAUDE_CODE_SESSION_LOG is active. */
  logPath?: string
  /** Agent ID if this session was spawned by an agent. */
  agent?: string
  /** Most recent activity timestamp, updated by `updateSessionActivity`. */
  updatedAt?: number
}

type PsFormat = 'table' | 'json'

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function getSessionsDir(): string {
  return join(getClaudeConfigHomeDir(), 'sessions')
}

async function readAllSessions(): Promise<BgSessionEntry[]> {
  const dir = getSessionsDir()
  let entries: BgSessionEntry[] = []
  try {
    const files = await readdir(dir)
    for (const file of files) {
      if (!/^\d+\.json$/.test(file)) continue
      try {
        const raw = await readFile(join(dir, file), 'utf8')
        const data = jsonParse(raw) as Record<string, unknown>
        if (typeof data.pid !== 'number') continue
        entries.push(data as BgSessionEntry)
      } catch {
        // Corrupt JSON — skip silently.
      }
    }
  } catch (e) {
    if (!isFsInaccessible(e)) {
      console.error(`[bg] readdir sessions failed: ${errorMessage(e)}`)
    }
  }
  // Sort newest-first by startedAt (desc).
  entries.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
  return entries
}

/** Remove stale PID files for crashed sessions. Returns count removed. */
async function pruneStaleSessions(sessions: BgSessionEntry[]): Promise<number> {
  if (getPlatform() === 'wsl') return 0 // Skip on WSL — cross-OS PID probing unreliable.
  let removed = 0
  for (const s of sessions) {
    if (isProcessRunning(s.pid)) continue
    try {
      await unlink(join(getSessionsDir(), `${s.pid}.json`))
      removed++
    } catch {
      // ENOENT is fine.
    }
  }
  return removed
}

// ---------------------------------------------------------------------------
// psHandler — list running background / interactive sessions
// ---------------------------------------------------------------------------

export async function psHandler(args: string[]): Promise<void> {
  const formatFlagIndex = args.indexOf('--format')
  const format: PsFormat =
    formatFlagIndex !== -1 && args[formatFlagIndex + 1] === 'json'
      ? 'json'
      : 'table'

  const sessions = await readAllSessions()
  const removed = await pruneStaleSessions(sessions)

  if (format === 'json') {
    // Include the pruned-count so callers can diff if they want.
    console.log(jsonStringify({ sessions, removed }, null, 2))
    return
  }

  if (sessions.length === 0) {
    console.log('No running sessions.')
    return
  }

  // Compute column widths for pretty-printing.
  const maxPid = Math.max(...sessions.map(s => String(s.pid).length))
  const maxName = Math.max(
    ...sessions.map(s => (s.name ? s.name.length : '—'.length)),
  )
  const maxStatus = Math.max(...sessions.map(s => statusLabel(s).length))

  const header = padRight('PID', maxPid) + '  ' + padRight('STATUS', maxStatus) + '  ' + padRight('NAME', maxName) + '  SESSION'
  console.log(header)
  console.log(header.replace(/[^\s]/g, '-'))

  for (const s of sessions) {
    const status = statusLabel(s)
    const name = s.name ?? '—'
    const line =
      padRight(String(s.pid), maxPid) +
      '  ' +
      padRight(status, maxStatus) +
      '  ' +
      padRight(name, maxName) +
      '  ' +
      s.sessionId.slice(0, 8)
    console.log(line)
  }
}

function statusLabel(s: BgSessionEntry): string {
  if (!isProcessRunning(s.pid)) return 'stopped'
  // Heuristic: if updatedAt is recent (< 60 s ago) consider it 'idle',
  // otherwise 'busy' or 'waiting'.
  const age = Date.now() - (s.updatedAt ?? s.startedAt)
  if (age < 60_000) return 'idle'
  return 'busy'
}

function padRight(s: string, w: number): string {
  return s.padEnd(w)
}

// ---------------------------------------------------------------------------
// logsHandler — tail a session's transcript log
// ---------------------------------------------------------------------------

export async function logsHandler(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    console.error('Usage: claude logs <session-id-or-name>')
    process.exit(1)
  }

  const sessions = await readAllSessions()
  const target = sessions.find(
    s =>
      s.sessionId === sessionId ||
      s.name === sessionId ||
      s.sessionId.startsWith(sessionId),
  )

  if (!target) {
    console.error(`Session not found: ${sessionId}`)
    console.error('Run `claude ps` to see available sessions.')
    process.exit(1)
  }

  const logPath = target.logPath
  if (!logPath) {
    console.error(
      `Session "${target.sessionId}" has no log path recorded. ` +
        `It may have been started without --bg or before logs were enabled.`,
    )
    process.exit(1)
  }

  // Stream the log file tail-style.
  const { createReadStream } = await import('fs')
  const { existsSync } = await import('fs')

  if (!existsSync(logPath)) {
    console.error(`Log file not found: ${logPath}`)
    process.exit(1)
  }

  // Use `tail -n` on Unix to skip to the end; fall back to reading whole file on Windows.
  if (process.platform !== 'win32') {
    const { execFileSync } = await import('child_process')
    try {
      const out = execFileSync('tail', ['-n', '50', logPath], {
        encoding: 'utf8',
        timeout: 5000,
      })
      process.stdout.write(out)
    } catch {
      // tail not available — read manually.
      await tailFile(logPath, 50)
    }
  } else {
    // Windows: read last N lines manually.
    await tailFile(logPath, 50)
  }
}

async function tailFile(path: string, n: number): Promise<void> {
  const { createReadStream } = await import('fs')
  const { EOF } = await import('buffer')
  const fs = await import('fs')
  const stats = await fs.stat(path)
  const fileSize = stats.size
  if (fileSize === 0) return

  // Read backwards from the end looking for newline boundaries.
  const chunkSize = Math.min(8192, fileSize)
  const buf = Buffer.alloc(chunkSize)
  const fd = await fs.open(path, 'r')
  try {
    const bytesRead = await fd.read(buf, 0, chunkSize, fileSize - chunkSize)
    const data = buf.slice(0, bytesRead)
    const lines = data.toString('utf8').split('\n')
    // Find the nth-from-last newline.
    let lineStart = 0
    for (let i = lines.length - 2; i >= 0 && lineStart < n; i--) {
      if (lines[i]!.trim()) {
        lineStart++
      }
    }
    const slice = lines.slice(lineStart).join('\n')
    if (slice) process.stdout.write(slice + '\n')
  } finally {
    await fd.close()
  }
}

// ---------------------------------------------------------------------------
// attachHandler — reattach to a background session via tmux or native spawn
// ---------------------------------------------------------------------------

export async function attachHandler(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    console.error('Usage: claude attach <session-id-or-name>')
    process.exit(1)
  }

  const sessions = await readAllSessions()
  const target = sessions.find(
    s =>
      s.sessionId === sessionId ||
      s.name === sessionId ||
      s.sessionId.startsWith(sessionId),
  )

  if (!target) {
    console.error(`Session not found: ${sessionId}`)
    console.error('Run `claude ps` to see available sessions.')
    process.exit(1)
  }

  if (!isProcessRunning(target.pid)) {
    console.error(`Session ${sessionId} (PID ${target.pid}) is no longer running.`)
    process.exit(1)
  }

  // For bg sessions inside tmux, detach the current client and reattach.
  if (process.env['TMUX']) {
    const sessionName = target.name ?? `byv-${target.sessionId.slice(0, 8)}`
    try {
      const { execFileSync } = await import('child_process')
      // Detach current client, then attach to the target session.
      execFileSync('tmux', ['detach-client', '-t', ''])
      // Build new tmux session if it doesn't exist yet.
      const list = execFileSync('tmux', ['list-sessions'], { encoding: 'utf8' })
      const alive = list.includes(sessionName)
      if (!alive) {
        execFileSync('tmux', [
          'new-session',
          '-d',
          '-s',
          sessionName,
          'claude',
          '--resume',
          target.sessionId,
        ])
      }
      execFileSync('tmux', ['attach', '-t', sessionName])
    } catch (e) {
      console.error(`tmux attach failed: ${errorMessage(e)}`)
      console.error('Falling back to direct exec...')
      await spawnResume(target)
    }
    return
  }

  // No tmux — just exec a fresh CLI with --resume.
  await spawnResume(target)
}

async function spawnResume(target: BgSessionEntry): Promise<void> {
  const { spawn } = await import('child_process')
  const nodePath = process.execPath
  const cliScript = join(__dirname, '..', 'entrypoints', 'cli.js')
  // Note: in bundled mode the actual entry is resolved differently.
  // Here we rely on `claude` being on PATH so --resume kicks in.
  const child = spawn('claude', ['--resume', target.sessionId], {
    stdio: 'inherit',
    env: {
      ...process.env,
      CLAUDE_CODE_SESSION_KIND: 'bg',
      CLAUDE_CODE_SESSION_ID: target.sessionId,
    },
  })
  child.on('error', err => {
    console.error(`Failed to spawn resume: ${err.message}`)
  })
  child.on('close', code => {
    process.exit(code ?? 0)
  })
}

// ---------------------------------------------------------------------------
// killHandler — terminate a background session by session ID or name
// ---------------------------------------------------------------------------

export async function killHandler(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    console.error('Usage: claude kill <session-id-or-name>')
    process.exit(1)
  }

  const sessions = await readAllSessions()
  const target = sessions.find(
    s =>
      s.sessionId === sessionId ||
      s.name === sessionId ||
      s.sessionId.startsWith(sessionId),
  )

  if (!target) {
    console.error(`Session not found: ${sessionId}`)
    console.error('Run `claude ps` to see available sessions.')
    process.exit(1)
  }

  if (!isProcessRunning(target.pid)) {
    // Clean up the stale PID file.
    try {
      await unlink(join(getSessionsDir(), `${target.pid}.json`))
    } catch {
      /* already gone */
    }
    console.error(`Session ${sessionId} is not running (stale PID file cleaned).`)
    process.exit(0)
  }

  try {
    process.kill(target.pid, 'SIGTERM')
    console.error(`Sent SIGTERM to session ${sessionId} (PID ${target.pid}).`)
  } catch (e) {
    console.error(`Failed to kill ${target.pid}: ${errorMessage(e)}`)
    process.exit(1)
  }

  // Best-effort: wait a few seconds for the process to exit, then clean up.
  await new Promise(resolve => setTimeout(resolve, 2000))
  if (!isProcessRunning(target.pid)) {
    try {
      await unlink(join(getSessionsDir(), `${target.pid}.json`))
      console.log(`Session ${sessionId} terminated and cleaned up.`)
    } catch {
      /* ignore */
    }
  } else {
    console.warn(
      `Session ${sessionId} (PID ${target.pid}) did not exit after SIGTERM. ` +
        'Use `kill -9 ' + target.pid + '` to force-kill.',
    )
  }
}

// ---------------------------------------------------------------------------
// handleBgFlag — spawn current process in background mode (--bg / --background)
// ---------------------------------------------------------------------------

export async function handleBgFlag(args: string[]): Promise<void> {
  const bgIndex = args.findIndex(a => a === '--bg' || a === '--background')
  if (bgIndex === -1) {
    console.error('No --bg / --background flag found.')
    process.exit(1)
  }

  // Extract --name if provided (must come right after --bg).
  let name: string | undefined
  const nameIndex = args.indexOf('--name', bgIndex)
  if (nameIndex !== -1 && args[nameIndex + 1]) {
    name = args[nameIndex + 1]
  }

  // Remove --bg / --background / --name and its value from the argv before relaunch.
  const newArgs = args
    .filter((_, i) => i !== bgIndex && i !== nameIndex)
    .filter((a, i, arr) => {
      // Also drop the argument after --name if present.
      if (a === '--name' && i > 0 && arr[i - 1] === '--name') return false
      return true
    })

  // On Windows, we can't truly daemonize, but we can detach via detached child process.
  const { spawn } = await import('child_process')
  const nodePath = process.execPath

  // Figure out the script to re-launch. In bundled mode `process.argv[1]` points
  // at the bundled CLI itself, which is what we want.
  const script = process.argv[1] ?? 'claude'

  const env = {
    ...process.env,
    CLAUDE_CODE_SESSION_KIND: 'bg',
    CLAUDE_CODE_SESSION_NAME: name ?? '',
    CLAUDE_CODE_SESSION_LOG: '1',
  }

  const child = spawn(nodePath, [script, ...newArgs], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env,
    // On POSIX, this creates a new process group so SIGHUP doesn't reach it.
    windowsHide: true,
  })

  // Unlink from the parent — the child becomes an orphan adopted by init.
  child.unref()

  console.log(`Started background session (PID ${child.pid}).`)
  console.log(`Use \`claude ps\` to list sessions, \`claude logs <id>\` to view output.`)
  process.exit(0)
}
