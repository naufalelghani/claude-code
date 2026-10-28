export type ToolSchemaSummary = {
  name: string
  properties: string[]
  required: string[]
  deferred: boolean
}

/**
 * Summarize the tool contracts immediately before request dispatch. This is
 * intentionally limited to schema metadata; it never includes descriptions
 * or user-provided tool input values.
 */
export function summarizeToolSchemas(
  tools: readonly unknown[],
): ToolSchemaSummary[] {
  return tools.map(tool => {
    const record =
      typeof tool === 'object' && tool !== null
        ? (tool as Record<string, unknown>)
        : {}
    const schema =
      typeof record.input_schema === 'object' && record.input_schema !== null
        ? (record.input_schema as Record<string, unknown>)
        : {}
    const schemaProperties =
      typeof schema.properties === 'object' && schema.properties !== null
        ? (schema.properties as Record<string, unknown>)
        : {}

    return {
      name:
        typeof record.name === 'string'
          ? record.name
          : typeof record.type === 'string'
            ? `<${record.type}>`
            : '<unknown>',
      properties: Object.keys(schemaProperties),
      required: Array.isArray(schema.required)
        ? schema.required.filter(
            (value): value is string => typeof value === 'string',
          )
        : [],
      deferred: record.defer_loading === true,
    }
  })
}
