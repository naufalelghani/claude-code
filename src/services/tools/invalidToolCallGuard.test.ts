import { describe, expect, test } from 'bun:test'
import {
  getInputValidationToolUseIds,
  recordInvalidToolCall,
} from './invalidToolCallGuard.js'

describe('invalidToolCallGuard', () => {
  test('detects identical malformed inputs regardless of object key order', () => {
    const failed = new Set<string>()

    expect(recordInvalidToolCall(failed, 'TaskUpdate', {})).toBe(false)
    expect(
      recordInvalidToolCall(failed, 'TaskUpdate', { status: 'pending', taskId: '1' }),
    ).toBe(false)
    expect(
      recordInvalidToolCall(failed, 'TaskUpdate', { taskId: '1', status: 'pending' }),
    ).toBe(true)
    expect(recordInvalidToolCall(failed, 'TaskList', { taskId: '2' })).toBe(
      false,
    )
    expect(recordInvalidToolCall(failed, 'Agent', {})).toBe(false)
  })

  test('stops after repeated validation failures with different malformed inputs', () => {
    const failed = new Set<string>()

    expect(recordInvalidToolCall(failed, 'Read', {})).toBe(false)
    expect(recordInvalidToolCall(failed, 'Read', { file_path: '' })).toBe(false)
    expect(recordInvalidToolCall(failed, 'Read', { path: '' })).toBe(true)
  })

  test('extracts only errored tool results that identify input-validation failures', () => {
    expect(
      getInputValidationToolUseIds({
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bad',
              is_error: true,
              content: '<tool_use_error>InputValidationError: missing taskId</tool_use_error>',
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_other',
              is_error: true,
              content: '<tool_use_error>Permission denied</tool_use_error>',
            },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_ok',
              is_error: false,
              content: 'Success',
            },
          ],
        },
      }),
    ).toEqual(['toolu_bad'])
  })
})
