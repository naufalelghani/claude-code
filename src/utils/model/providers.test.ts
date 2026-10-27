import { describe, expect, test } from 'bun:test'
import { getAPIProvider, resolveAPIProvider, setCodexProviderActive } from './providers.js'

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

  test('changes the in-memory provider after a login/provider switch', () => {
    const names = [
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'CLAUDE_CODE_USE_FOUNDRY',
      'CLAUDE_CODE_USE_OPENAI',
    ] as const
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]))
    try {
      for (const name of names) delete process.env[name]
      setCodexProviderActive(true)
      expect(getAPIProvider()).toBe('openai')
      setCodexProviderActive(false)
      expect(getAPIProvider()).toBe('firstParty')
    } finally {
      for (const name of names) {
        const value = previous[name]
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
      setCodexProviderActive(false)
    }
  })
})
