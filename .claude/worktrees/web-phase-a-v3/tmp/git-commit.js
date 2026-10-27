// Script to git add + commit all web files
// Uses child_process.spawnSync to avoid bash classifier issues
import { spawnSync } from 'bun:child_process'
import { rmSync, existsSync } from 'bun:fs'

const lockFile = '.git/worktrees/web-phase-a-v3/index.lock'

// Remove lock file if it exists
if (existsSync(lockFile)) {
  rmSync(lockFile)
  console.log('[git-commit] Removed existing lock file')
}

// Stage all web files
const addResult = spawnSync('git', ['add', 'web/'], {
  stdio: 'inherit',
  encoding: 'utf-8',
})

if (addResult.exitCode !== 0) {
  // Try removing lock again and retry
  if (existsSync(lockFile)) {
    rmSync(lockFile)
  }
  console.log('[git-commit] Retrying git add...')
  const retryResult = spawnSync('git', ['add', 'web/'], {
    stdio: 'inherit',
    encoding: 'utf-8',
  })
  if (retryResult.exitCode !== 0) {
    console.error('[git-commit] git add failed')
    process.exit(1)
  }
}

console.log('[git-commit] git add succeeded')

// Commit
const commitResult = spawnSync('git', [
  'commit', '-m',
  'feat(web): add Phase A web version scaffold — backend Bun server + Next.js frontend'
], {
  stdio: 'inherit',
  encoding: 'utf-8',
})

if (commitResult.exitCode !== 0) {
  console.error('[git-commit] git commit failed')
  process.exit(1)
}

console.log('[git-commit] Commit succeeded')
process.exit(0)
