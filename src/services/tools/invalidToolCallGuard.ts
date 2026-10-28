/**
 * Tracks malformed tool calls across the follow-up turns within one user
 * request. It identifies input-validation failures only, not ordinary tool
 * failures, so callers can stop a loop without suppressing legitimate retries.
 */
export function getInputValidationToolUseIds(message: unknown): string[] {
  if (typeof message !== 'object' || message === null) return []
  const envelope = message as Record<string, unknown>
  if (envelope.type !== 'user') return []
  if (typeof envelope.message !== 'object' || envelope.message === null)
    return []

  const content = (envelope.message as Record<string, unknown>).content
  if (!Array.isArray(content)) return []

  const toolUseIds: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const result = block as Record<string, unknown>
    if (result.type !== 'tool_result' || result.is_error !== true) continue
    if (
      typeof result.content !== 'string' ||
      !result.content.includes('InputValidationError:')
    ) {
      continue
    }
    if (typeof result.tool_use_id === 'string') {
      toolUseIds.push(result.tool_use_id)
    }
  }
  return toolUseIds
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`
}

/**
 * Record a tool call that failed validation. Returns true when the same tool
 * name and canonicalized input have already failed validation in this request.
 */
export function recordInvalidToolCall(
  failedSignatures: Set<string>,
  toolName: string,
  input: unknown,
): boolean {
  const signature = `${toolName}\u0000${stableSerialize(input)}`
  if (failedSignatures.has(signature)) return true
  failedSignatures.add(signature)
  return false
}
