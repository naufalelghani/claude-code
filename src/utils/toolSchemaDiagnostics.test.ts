import { describe, expect, test } from 'bun:test'
import { summarizeToolSchemas } from './toolSchemaDiagnostics.js'

describe('summarizeToolSchemas', () => {
  test('preserves required parameter names and deferred status from the request schema', () => {
    expect(
      summarizeToolSchemas([
        {
          name: 'TeamCreate',
          defer_loading: true,
          input_schema: {
            type: 'object',
            properties: {
              team_name: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['team_name'],
          },
        },
      ]),
    ).toEqual([
      {
        name: 'TeamCreate',
        properties: ['team_name', 'description'],
        required: ['team_name'],
        deferred: true,
      },
    ])
  })

  test('handles server-side tools without an input schema', () => {
    expect(summarizeToolSchemas([{ type: 'web_search_20250305' }])).toEqual([
      {
        name: '<web_search_20250305>',
        properties: [],
        required: [],
        deferred: false,
      },
    ])
  })
})
