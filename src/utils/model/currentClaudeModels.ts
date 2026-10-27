/**
 * The supported Claude model catalog for this build.
 *
 * Keep the picker and model migration logic aligned with these four families.
 * Provider-specific IDs are normalized separately in configs.ts.
 */
export const CURRENT_CLAUDE_MODELS = [
  {
    alias: 'fable',
    label: 'Fable 5.1',
    modelId: 'claude-fable-5-1',
    description: 'For demanding reasoning and long-horizon agentic work',
  },
  {
    alias: 'opus',
    label: 'Opus 5.5',
    modelId: 'claude-opus-5-5',
    description: 'For long-running agentic coding and knowledge work',
  },
  {
    alias: 'sonnet',
    label: 'Sonnet 5.5',
    modelId: 'claude-sonnet-5-5',
    description: 'Best combination of speed and intelligence',
  },
  {
    alias: 'haiku',
    label: 'Haiku 5.5',
    modelId: 'claude-haiku-5-5',
    description: 'Fastest for high-volume, latency-sensitive tasks',
  },
] as const

export type CurrentClaudeModelAlias =
  (typeof CURRENT_CLAUDE_MODELS)[number]['alias']

/**
 * Convert supported legacy Claude aliases and model IDs to one of the current
 * four families. Unknown custom deployment IDs are returned as null so callers
 * can preserve them.
 */
export function normalizeClaudeModelFamily(
  modelInput: string | null | undefined,
): CurrentClaudeModelAlias | null {
  if (modelInput == null) return null

  const model = modelInput
    .trim()
    .toLowerCase()
    .replace(/\[1m\]$/i, '')
    .trim()

  if (!model) return null

  if (
    /^(?:fable|fable5|fable51|mythos|mythos5|mythos51)$/.test(model) ||
    model.includes('claude-fable-') ||
    model.includes('claude-mythos-')
  ) {
    return 'fable'
  }

  if (
    /^(?:opus|opus3|opus40|opus41|opus45|opus46|opus47|opus48|opus5|opus55|best|opusplan)$/.test(
      model,
    ) ||
    model.includes('claude-opus-') ||
    model.includes('claude-3-opus')
  ) {
    return 'opus'
  }

  if (
    /^(?:sonnet|sonnet35|sonnet37|sonnet40|sonnet45|sonnet46|sonnet5|sonnet55)$/.test(
      model,
    ) ||
    model.includes('claude-sonnet-') ||
    /claude-3-(?:5-|7-)?sonnet/.test(model)
  ) {
    return 'sonnet'
  }

  if (
    /^(?:haiku|haiku3|haiku35|haiku45|haiku55)$/.test(model) ||
    model.includes('claude-haiku-') ||
    /claude-3-(?:5-)?haiku/.test(model)
  ) {
    return 'haiku'
  }

  return null
}
