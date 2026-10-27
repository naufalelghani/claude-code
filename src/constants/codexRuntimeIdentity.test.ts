import { describe, expect, test } from 'bun:test'
import { getCodexRuntimeIdentitySection } from './codexRuntimeIdentity.js'

describe('Codex runtime identity prompt', () => {
  test('describes the selected model and Codex API separately', () => {
    const prompt = getCodexRuntimeIdentitySection('gpt-5.6-terra')

    expect(prompt).toContain('GPT-5.6 Terra')
    expect(prompt).toContain('OpenAI Codex API')
    expect(prompt).toContain('Byv Code')
    expect(prompt).toContain('Do not deny that the session is using Codex')
  })

  test('normalizes model IDs with context suffixes', () => {
    expect(getCodexRuntimeIdentitySection('gpt-5.6-luna[1m]')).toContain('GPT-5.6 Luna')
  })

  test('does not override identity for a non-Codex model', () => {
    expect(getCodexRuntimeIdentitySection('claude-sonnet-4-6')).toBeNull()
    expect(getCodexRuntimeIdentitySection('my-custom-model')).toBeNull()
  })
})
