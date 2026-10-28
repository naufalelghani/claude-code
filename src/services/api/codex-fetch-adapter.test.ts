import { describe, expect, test } from 'bun:test'
import { translateToCodexBody } from './codex-fetch-adapter.js'

describe('Codex fetch adapter tool choice translation', () => {
  test('preserves Anthropic forced tool choice for Auto Mode classification', () => {
    const { codexBody } = translateToCodexBody({
      model: 'gpt-5.6-luna',
      messages: [{ role: 'user', content: 'Classify this action.' }],
      tools: [
        {
          name: 'classify_result',
          description: 'Return the security classification.',
          input_schema: {
            type: 'object',
            properties: { shouldBlock: { type: 'boolean' } },
            required: ['shouldBlock'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'classify_result' },
    })

    expect(codexBody.tool_choice).toEqual({
      type: 'function',
      name: 'classify_result',
    })
    expect(codexBody.tools).toEqual([
      {
        type: 'function',
        name: 'classify_result',
        description: 'Return the security classification.',
        parameters: {
          type: 'object',
          properties: { shouldBlock: { type: 'boolean' } },
          required: ['shouldBlock'],
        },
        strict: null,
      },
    ])
  })

  test('maps Anthropic any-tool choice to Codex required mode', () => {
    const { codexBody } = translateToCodexBody({
      model: 'gpt-5.6-luna',
      messages: [],
      tool_choice: { type: 'any' },
    })

    expect(codexBody.tool_choice).toBe('required')
  })

  test('keeps automatic tool selection when no forced choice is supplied', () => {
    const { codexBody } = translateToCodexBody({
      model: 'gpt-5.6-luna',
      messages: [],
    })

    expect(codexBody.tool_choice).toBe('auto')
  })
})
