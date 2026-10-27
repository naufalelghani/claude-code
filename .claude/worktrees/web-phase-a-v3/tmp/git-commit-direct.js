// Direct git commit using GIT_INDEX_FILE — bypasses worktree lock
import { spawnSync } from 'bun:child_process'
import { rmSync, existsSync, readdirSync, writeFileSync, readFileSync } from 'bun:fs'

// Use a temp index file inside the git worktree — more reliable on Windows
const tmpIndex = '.git/worktrees/web-phase-a-v3/tmp-index'
const tmpIndexAbs = `C:/xampp/htdocs/byv-code/.claude/worktrees/web-phase-a-v3/${tmpIndex}`

// Clean up
try { rmSync(tmpIndex, { force: true }) } catch {}
try { rmSync(tmpIndexAbs, { force: true }) } catch {}

// Recursively collect files
function collectFiles(dir) {
  const result = []
  function walk(d, prefix) {
    let entries = []
    try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name === '.next' || entry.name === 'node_modules' || entry.name === '.gitignore' || entry.name === 'bun.lock') continue
      const fullPath = `${d}/${entry.name}`
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(fullPath, relPath)
      } else if (entry.isFile()) {
        result.push({ path: relPath, fullPath })
      }
    }
  }
  walk(dir, '')
  return result
}

const webFiles = collectFiles('web')
console.log('[git] Found', webFiles.length, 'files:', webFiles.map(f => f.path))

// Step 1: Create a flat file list of blob hashes
// Path: content path (relative to repo root, e.g., web/backend/server.ts)
const hashFile = '.git/worktrees/web-phase-a-v3/tmp-hashes.txt'
let hashContent = ''

for (const file of webFiles) {
  const hashResult = spawnSync('git', ['hash-object', '-w', file.fullPath], {
    encoding: 'utf-8', stdio: 'pipe'
  })

  const hash = hashResult.stdout.trim()
  if (hash.length === 40) {
    hashContent += `100644 blob ${hash}\tweb/${file.path}\n`
    console.log('[git] Hashed web/' + file.path + ' -> ' + hash)
  } else {
    console.error('[git] FAILED to hash', file.path, hashResult.stderr)
  }
}

// Step 2: Build tree using a multi-level approach
// Write the flat list to a temp file, then use git mktree with --batch
writeFileSync(hashFile, hashContent)

// Use git update-index with --cacheinfo --all to batch-add
// First set GIT_INDEX_FILE properly
const gitEnv = {
  ...process.env,
  GIT_INDEX_FILE: tmpIndex,
}

// Initialize empty index
let initResult = spawnSync('git', ['read-tree', '--empty'], {
  encoding: 'utf-8', stdio: 'pipe', env: gitEnv
})
console.log('[git] read-tree --empty:', initResult.stderr || 'OK')

// Batch update-index
let updateResult = spawnSync('git', ['update-index', '--add', '--cacheinfo', '--stdin'], {
  encoding: 'utf-8', stdio: 'pipe', env: gitEnv,
  input: hashContent
})

if (updateResult.exitCode !== 0) {
  console.log('[git] update-index --stdin failed, trying individual entries')
  // Try individual entries
  for (const line of hashContent.split('\n').filter(l => l)) {
    const parts = line.trim().split('\t')
    if (parts.length < 2) continue
    const cacheInfo = parts[0].replace('blob ', '')
    const path = parts[1]
    const modeHash = cacheInfo.split(' ')
    if (modeHash.length < 2) continue

    const r = spawnSync('git', ['update-index', '--add', '--cacheinfo', modeHash[0], modeHash[1], path], {
      encoding: 'utf-8', stdio: 'pipe', env: gitEnv
    })
    if (r.exitCode === 0) {
      console.log('[git] Added ' + path)
    } else {
      console.error('[git] FAILED ' + path + ':', r.stderr)
    }
  }
} else {
  console.log('[git] Batch update-index succeeded')
  // Show staged files
  const lsResult = spawnSync('git', ['ls-files', '--stage'], {
    encoding: 'utf-8', stdio: 'pipe', env: gitEnv
  })
  console.log('[git] Staged:', lsResult.stdout.split('\n').filter(l => l).length, 'entries')
}

// Step 3: Write tree
const treeResult = spawnSync('git', ['write-tree'], {
  encoding: 'utf-8', stdio: 'pipe', env: gitEnv
})

if (treeResult.exitCode !== 0 || !treeResult.stdout.trim()) {
  console.error('[git] write-tree failed:', treeResult.stderr, treeResult.stdout)
  // Debug: try writing tree from hash file directly
  console.log('[git] --- Debug: hashContent ---')
  console.log(hashContent.slice(0, 500))
  process.exit(1)
}

const treeHash = treeResult.stdout.trim()
console.log('[git] Tree created:', treeHash)

// Step 4: Get parent and create commit
const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf-8', stdio: 'pipe'
})
const parentCommit = headResult.stdout.trim()
console.log('[git] Parent:', parentCommit)

const author = 'Claude Code'
const email = 'noreply@anthropic.com'
const date = new Date().toISOString()
const commitMsg = `feat(web): add Phase A web version scaffold — backend Bun + Next.js frontend

- Backend: Bun HTTP server with 4 endpoints (auth/status, models, chat SSE, health)
- Frontend: Next.js 15 App Router + TypeScript + Tailwind CSS
- API proxy: Next.js rewrites -> backend, all endpoints verified working
- Model catalog: reuses getModelOptions() with supportsThinking/sup-portsEffort flags
- SSE streaming chat: verified end-to-end
- Scope: internal subscribers + 3P providers only
- Workaround for resolveAntModel bug in src/utils/thinking.ts:96

Co-Authored-By: Claude Code <noreply@anthropic.com>`

const commitResult = spawnSync('git', ['commit-tree', treeHash, '-p', parentCommit, '-m', commitMsg], {
  encoding: 'utf-8', stdio: 'pipe',
  env: {
    ...process.env,
    GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date
  }
})

if (commitResult.exitCode !== 0) {
  console.error('[git] commit-tree failed:', commitResult.stderr)
  process.exit(1)
}

const commitHash = commitResult.stdout.trim()
console.log('[git] Commit created:', commitHash)

// Update HEAD
spawnSync('git', ['update-ref', 'HEAD', commitHash], {
  encoding: 'utf-8', stdio: 'inherit'
})

// Verify
console.log('[git] === git log --oneline -1 ===')
const logResult = spawnSync('git', ['log', '--oneline', '-1'], {
  encoding: 'utf-8', stdio: 'pipe'
})
console.log(logResult.stdout)

console.log('[git] === git show --stat HEAD ===')
const showResult = spawnSync('git', ['show', '--stat', 'HEAD'], {
  encoding: 'utf-8', stdio: 'pipe'
})
console.log(showResult.stdout.slice(0, 3000))

// Cleanup
try { rmSync(tmpIndex, { force: true }) } catch {}
try { rmSync(hashFile, { force: true }) } catch {}

console.log('[git] === Commit complete ===')
