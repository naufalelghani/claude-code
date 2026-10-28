import type { BuiltInAgentDefinition } from '../tools/AgentTool/loadAgentsDir.js'
import { GENERAL_PURPOSE_AGENT } from '../tools/AgentTool/built-in/generalPurposeAgent.js'

const COORDINATOR_WORKER_GUIDANCE = `## Coordinator worker rules

You are a worker spawned by a coordinator. Execute only the task in your prompt and return a concise, factual report when finished.

- Do not try to orchestrate other workers or create an agent team. The coordinator owns delegation and synthesis.
- For implementation tasks, make the requested changes, run relevant checks when available, and report exactly what you changed and tested.
- For research tasks, inspect the code and report concrete file paths, symbols, and evidence. Do not make changes unless asked.
- Stay within the assigned scope. Call out blockers or unverified assumptions rather than inventing results.
`

/**
 * Coordinator mode replaces the main agent list with a single worker type.
 * The coordinator itself owns planning and delegation; worker agents execute
 * assigned research, implementation, and verification tasks.
 */
const COORDINATOR_WORKER_AGENT: BuiltInAgentDefinition = {
  ...GENERAL_PURPOSE_AGENT,
  agentType: 'worker',
  whenToUse:
    'Worker controlled by Coordinator Mode. Use for autonomous research, implementation, or verification tasks with a clear, self-contained prompt.',
  // runAgent applies the normal async-agent allowlist while retaining MCP tools.
  // A wildcard here lets resolveAgentTools expose the allowlisted tools plus
  // tools from configured MCP servers, instead of hard-coding a stale tool list.
  tools: ['*'],
  getSystemPrompt: ({ toolUseContext }) =>
    `${GENERAL_PURPOSE_AGENT.getSystemPrompt({ toolUseContext })}\n\n${COORDINATOR_WORKER_GUIDANCE}`,
}

export function getCoordinatorAgents(): BuiltInAgentDefinition[] {
  return [COORDINATOR_WORKER_AGENT]
}
