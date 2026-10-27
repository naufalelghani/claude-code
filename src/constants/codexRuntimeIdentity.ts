import { CODEX_MODELS, isCodexModel } from '../services/api/codex-models.js'

/**
 * Keep model identity accurate when Byv Code routes a session through Codex.
 * This is deliberately absent for non-Codex model selections.
 */
export function getCodexRuntimeIdentitySection(model: string): string | null {
  if (!isCodexModel(model)) return null

  const normalized = model.trim().toLowerCase().replace(/\[(?:1|2)m\]$/i, '')
  const selectedModel = CODEX_MODELS.find(candidate => candidate.id === normalized)
  if (!selectedModel) return null

  return `# Model and runtime identity

The selected model is ${selectedModel.label}. This session is using the OpenAI Codex API through Byv Code.

If asked what model or provider you are using, distinguish the two accurately: the model is ${selectedModel.label}, and requests are routed through the Codex API in Byv Code. Do not deny that the session is using Codex, and do not identify yourself as Claude or as an agent running in Claude Code. The host application for this session is Byv Code.`
}
