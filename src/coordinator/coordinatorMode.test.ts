import { describe, expect, test } from 'bun:test'
import { filterCoordinatorModeTools } from './coordinatorMode.js'
import { getCoordinatorAgents } from './workerAgent.js'

describe('Coordinator Mode workers', () => {
  test('exposes one built-in worker agent', () => {
    const agents = getCoordinatorAgents()

    expect(agents).toHaveLength(1)
    expect(agents[0]?.agentType).toBe('worker')
    expect(agents[0]?.source).toBe('built-in')
    expect(agents[0]?.tools).toEqual(['*'])
  })

  test('adds coordinator-specific execution guidance to the worker prompt', () => {
    const worker = getCoordinatorAgents()[0]
    if (!worker) throw new Error('Coordinator worker is missing')

    const prompt = worker.getSystemPrompt({
      toolUseContext: { options: {} as never },
    })

    expect(prompt).toContain('You are a worker spawned by a coordinator')
    expect(prompt).toContain('Do not try to orchestrate other workers')
  })

  test('keeps the coordinator on orchestration-only tools', () => {
    const tools = [
      { name: 'Agent' },
      { name: 'SendMessage' },
      { name: 'TaskStop' },
      { name: 'ToolSearch' },
      { name: 'Bash' },
      { name: 'FileEdit' },
    ]

    expect(filterCoordinatorModeTools(tools).map(tool => tool.name)).toEqual([
      'Agent',
      'SendMessage',
      'TaskStop',
      'ToolSearch',
    ])
  })
})
