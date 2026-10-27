/**
 * Model catalog for the OpenAI Codex OAuth adapter.
 *
 * Keep the picker and the request adapter on this single source of truth so a
 * model shown to the user is a model we can route without a silent fallback.
 */
export const CODEX_MODELS = [
  {
    id: 'gpt-6-luna',
    label: 'GPT-6 Luna',
    description: 'Fast, efficient model for focused coding and high-volume tasks',
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    description: 'Balanced capability and efficiency for everyday coding work',
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: 'Fast, efficient model for focused tasks',
  },
] as const

export type CodexModelId = (typeof CODEX_MODELS)[number]['id']

export const DEFAULT_CODEX_MODEL: CodexModelId = 'gpt-6-luna'

const CODEX_MODEL_IDS = new Set<string>(CODEX_MODELS.map(model => model.id))
const LEGACY_CODEX_MODEL_IDS = new Set([
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1-codex-max',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.2',
])

/** Returns true only for IDs in the picker catalog. */
export function isCodexModel(model: string): boolean {
  const normalized = model.trim().toLowerCase().replace(/\[(?:1|2)m\]$/i, '')
  return CODEX_MODEL_IDS.has(normalized)
}

/**
 * Normalize a stored picker setting only when it is a recognized current or
 * legacy Codex/Claude choice. Unknown custom model IDs are left untouched.
 */
export function normalizeCodexModelSelection(model: string): CodexModelId | null {
  const normalized = model.trim().toLowerCase().replace(/\[(?:1|2)m\]$/i, '')
  if (CODEX_MODEL_IDS.has(normalized)) return normalized as CodexModelId

  const isClaudeFamily =
    /^(opus|sonnet|haiku|fable|mythos)(?:$|[0-9])/.test(normalized) ||
    /^claude-(?:opus|sonnet|haiku|fable|mythos)-/.test(normalized) ||
    /^claude-3-(?:7-sonnet|5-sonnet|5-haiku|opus|sonnet|haiku)-?/.test(normalized)

  if (LEGACY_CODEX_MODEL_IDS.has(normalized) || isClaudeFamily || normalized === 'best' || normalized === 'opusplan') {
    return mapClaudeModelToCodex(normalized)
  }
  return null
}

/**
 * Routes a selected Codex model to itself. Old saved model values are mapped
 * to the closest currently supported family so stale settings keep working.
 */
export function mapClaudeModelToCodex(claudeModel: string | null): CodexModelId {
  if (!claudeModel) return DEFAULT_CODEX_MODEL

  const normalized = claudeModel.trim().toLowerCase().replace(/\[(?:1|2)m\]$/i, '')
  if (CODEX_MODEL_IDS.has(normalized)) return normalized as CodexModelId

  // Migrate the old picker IDs to the current Codex catalog.
  if (
    normalized.includes('gpt-5.4-mini') ||
    normalized.includes('gpt-5.1-codex-mini') ||
    normalized.includes('haiku')
  ) {
    return 'gpt-5.6-luna'
  }
  if (
    normalized.startsWith('gpt-') ||
    normalized.includes('codex') ||
    normalized.includes('opus') ||
    normalized.includes('sonnet')
  ) {
    return 'gpt-5.6-terra'
  }

  return DEFAULT_CODEX_MODEL
}
