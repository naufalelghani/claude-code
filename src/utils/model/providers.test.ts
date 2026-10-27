import { describe, expect, test } from 'bun:test'
import { resolveAPIProvider } from './providers.js'

describe('resolveAPIProvider', () => {
  test('selects Codex when OAuth is active and no provider override is set', () => {
    expect(resolveAPIProvider({}, true)).toBe('openai')
  })

  test('keeps the first-party default when Codex OAuth is not active', () => {
    expect(resolveAPIProvider({}, false)).toBe('firstParty')
  })

  test('respects an explicit OpenAI environment setting', () => {
    expect(resolveAPIProvider({ CLAUDE_CODE_USE_OPENAI: '1' }, false)).toBe('openai')
    expect(resolveAPIProvider({ CLAUDE_CODE_USE_OPENAI: '0' }, true)).toBe('firstParty')
  })

  test('keeps explicit cloud provider environment settings ahead of Codex', () => {
    expect(resolveAPIProvider({ CLAUDE_CODE_USE_BEDROCK: '1' }, true)).toBe('bedrock')
    expect(resolveAPIProvider({ CLAUDE_CODE_USE_VERTEX: '1' }, true)).toBe('vertex')
    expect(resolveAPIProvider({ CLAUDE_CODE_USE_FOUNDRY: '1' }, true)).toBe('foundry')
  })
})
