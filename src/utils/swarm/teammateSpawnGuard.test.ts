import { describe, expect, test } from 'bun:test'
import { withTeammateSpawnDeduplication } from './teammateSpawnGuard.js'

describe('withTeammateSpawnDeduplication', () => {
  test('blocks a repeated spawn already present in the team roster', async () => {
    let spawnCalls = 0

    await expect(
      withTeammateSpawnDeduplication(
        {
          teamName: 'smoke-team-persisted',
          name: 'config-reader',
          prompt: 'Read workerAgent.ts',
        },
        async () => [
          { name: 'config-reader', prompt: 'Read workerAgent.ts' },
        ],
        async () => {
          spawnCalls++
          return 'spawned'
        },
      ),
    ).rejects.toThrow('Duplicate teammate spawn blocked')

    expect(spawnCalls).toBe(0)
  })

  test('blocks a concurrent identical request before its first spawn finishes', async () => {
    let releaseRosterRead: (() => void) | undefined
    const rosterRead = new Promise<void>(resolve => {
      releaseRosterRead = resolve
    })
    let spawnCalls = 0

    const key = {
      teamName: 'smoke-team-concurrent',
      name: 'config-reader',
      prompt: 'Read workerAgent.ts',
    }

    const first = withTeammateSpawnDeduplication(
      key,
      async () => {
        await rosterRead
        return []
      },
      async () => {
        spawnCalls++
        return 'spawned'
      },
    )

    // Allow the first call to reserve its key and reach the async roster read.
    await Promise.resolve()

    await expect(
      withTeammateSpawnDeduplication(
        key,
        async () => [],
        async () => {
          spawnCalls++
          return 'duplicate'
        },
      ),
    ).rejects.toThrow('Duplicate teammate spawn blocked')

    releaseRosterRead?.()
    await expect(first).resolves.toBe('spawned')
    expect(spawnCalls).toBe(1)
  })

  test('allows the same name for a different prompt', async () => {
    let spawnCalls = 0

    await expect(
      withTeammateSpawnDeduplication(
        {
          teamName: 'smoke-team-different-task',
          name: 'config-reader',
          prompt: 'Read coordinatorMode.ts',
        },
        async () => [
          { name: 'config-reader', prompt: 'Read workerAgent.ts' },
        ],
        async () => {
          spawnCalls++
          return 'spawned'
        },
      ),
    ).resolves.toBe('spawned')

    expect(spawnCalls).toBe(1)
  })
})
