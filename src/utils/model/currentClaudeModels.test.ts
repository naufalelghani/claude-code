import { describe, expect, test } from 'bun:test'
import { MODEL_ALIASES, MODEL_FAMILY_ALIASES } from './aliases.js'
import {
  CURRENT_CLAUDE_MODELS,
  normalizeClaudeModelFamily,
} from './currentClaudeModels.js'

describe('current Claude model catalog', () => {
  test('contains exactly the four requested model families in picker order', () => {
    expect(CURRENT_CLAUDE_MODELS.map(model => model.alias)).toEqual([
      'fable',
      'opus',
      'sonnet',
      'haiku',
    ])
    expect(MODEL_ALIASES).toEqual(CURRENT_CLAUDE_MODELS.map(model => model.alias))
    expect(MODEL_FAMILY_ALIASES).toEqual(CURRENT_CLAUDE_MODELS.map(model => model.alias))
  })

  test('uses the requested current display names and model IDs', () => {
    expect(
      CURRENT_CLAUDE_MODELS.map(({ label, modelId }) => ({ label, modelId })),
    ).toEqual([
      { label: 'Fable 5.1', modelId: 'claude-fable-5-1' },
      { label: 'Opus 5.5', modelId: 'claude-opus-5-5' },
      { label: 'Sonnet 5.5', modelId: 'claude-sonnet-5-5' },
      { label: 'Haiku 5.5', modelId: 'claude-haiku-5-5' },
    ])
  })
})

describe('normalizeClaudeModelFamily', () => {
  const cases: [string, string][] = [
    ['fable', 'fable'],
    ['fable51', 'fable'],
    ['mythos', 'fable'],
    ['mythos51', 'fable'],
    ['claude-fable-5-1', 'fable'],
    ['us.anthropic.claude-fable-5-1', 'fable'],
    ['opus', 'opus'],
    ['best', 'opus'],
    ['opusplan', 'opus'],
    ['opus46', 'opus'],
    ['opus55', 'opus'],
    ['claude-opus-4-6', 'opus'],
    ['us.anthropic.claude-opus-5-5-v1', 'opus'],
    ['sonnet', 'sonnet'],
    ['sonnet46', 'sonnet'],
    ['claude-sonnet-4-6', 'sonnet'],
    ['claude-3-7-sonnet-20250219', 'sonnet'],
    ['haiku', 'haiku'],
    ['haiku45', 'haiku'],
    ['claude-haiku-5-5', 'haiku'],
    ['claude-3-5-haiku-20241022', 'haiku'],
    ['fable[1m]', 'fable'],
    ['opus[1m]', 'opus'],
    ['sonnet[1m]', 'sonnet'],
    ['haiku[1m]', 'haiku'],
    ['claude-opus-5-5[1m]', 'opus'],
  ]

  for (const [input, expected] of cases) {
    test(`maps ${input} to ${expected}`, () => {
      expect(normalizeClaudeModelFamily(input)).toBe(expected)
    })
  }

  test('returns null for empty and unknown values', () => {
    expect(normalizeClaudeModelFamily(null)).toBeNull()
    expect(normalizeClaudeModelFamily(undefined)).toBeNull()
    expect(normalizeClaudeModelFamily('')).toBeNull()
    expect(normalizeClaudeModelFamily('gpt-5.4')).toBeNull()
    expect(normalizeClaudeModelFamily('my-sonnet-deployment')).toBeNull()
  })
})
