import { describe, expect, test } from 'bun:test'
import {
  CODEX_MODELS,
  DEFAULT_CODEX_MODEL,
  isCodexModel,
  mapClaudeModelToCodex,
} from './codex-models.js'

describe('Codex model catalog', () => {
  test('exposes the three currently available Codex models in picker order', () => {
    expect(CODEX_MODELS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    ])
  })

  test('uses a model from the catalog as the default', () => {
    expect(DEFAULT_CODEX_MODEL).toBe('gpt-6-luna')
    expect(isCodexModel(DEFAULT_CODEX_MODEL)).toBe(true)
  })

  test('recognizes only current Codex IDs, including context suffixes', () => {
    expect(isCodexModel('gpt-6-luna')).toBe(true)
    expect(isCodexModel('gpt-5.6-terra')).toBe(true)
    expect(isCodexModel('gpt-5.6-luna')).toBe(true)
    expect(isCodexModel('gpt-5.6-luna[1m]')).toBe(true)
    expect(isCodexModel('gpt-5.4')).toBe(false)
    expect(isCodexModel('opus')).toBe(false)
  })

  test('preserves explicit current model selections', () => {
    for (const model of CODEX_MODELS) {
      expect(mapClaudeModelToCodex(model.id)).toBe(model.id)
    }
  })

  test('maps saved legacy settings to supported models', () => {
    expect(mapClaudeModelToCodex(null)).toBe('gpt-6-luna')
    expect(mapClaudeModelToCodex('gpt-5.3-codex')).toBe('gpt-5.6-terra')
    expect(mapClaudeModelToCodex('gpt-5.4-mini')).toBe('gpt-5.6-luna')
    expect(mapClaudeModelToCodex('opus')).toBe('gpt-5.6-terra')
    expect(mapClaudeModelToCodex('haiku')).toBe('gpt-5.6-luna')
  })
})
