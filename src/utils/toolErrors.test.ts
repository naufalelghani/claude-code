import { describe, expect, test } from 'bun:test'
import { z } from 'zod/v4'
import { formatToolInputValidationError } from './toolErrors.js'

describe('formatToolInputValidationError', () => {
  test('tells the model to correct missing required parameters instead of repeating the call', () => {
    const result = z.strictObject({ team_name: z.string() }).safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return

    const message = formatToolInputValidationError('TeamCreate', result.error)

    expect(message).toContain('The required parameter `team_name` is missing')
    expect(message).toContain('The tool was not executed')
    expect(message).toContain('Do not retry this tool call with identical arguments')
    expect(message).toContain('look it up with an appropriate list/get tool')
  })

  test('preserves deferred-schema recovery guidance', () => {
    const result = z.object({ command: z.string() }).safeParse({})
    expect(result.success).toBe(false)
    if (result.success) return

    const message = formatToolInputValidationError(
      'Bash',
      result.error,
      'Load the tool schema first with ToolSearch.',
    )

    expect(message).toContain('Load the tool schema first with ToolSearch.')
    expect(message).toContain('Correct the reported parameters first')
  })
})
