/**
 * Web Backend Server — Fase A
 *
 * Bun HTTP server yang bertindak sebagai proxy API antara Next.js frontend
 * dan Claude Code backend services. Semua API calls ke Anthropic melewati
 * server ini untuk menjaga API key tetap server-side.
 *
 * Endpoints:
 *   GET  /api/auth/status  — return auth + subscription info
 *   GET  /api/models       — return model catalog (3P + internal only)
 *   POST /api/chat         — SSE stream to Anthropic Messages API
 */

import type { ModelOption } from '../../src/utils/model/modelOptions.js'
import { getAPIProvider } from '../../src/utils/model/providers.js'
import { getAuthTokenSource } from '../../src/utils/auth.js'
import { getModelOptions } from '../../src/utils/model/modelOptions.js'
import { getSubscriptionType } from '../../src/utils/auth.js'
import { isInternalSubscriber } from '../../src/utils/auth.js'
import { modelSupportsThinking } from '../../src/utils/thinking.js'
import { modelSupportsEffort } from '../../src/utils/effort.js'

const PORT = Number(process.env.PORT || 5000)
const ORIGIN = process.env.ORIGIN || `http://localhost:${PORT}`

// Enable configs (loads settings, auth, etc.)
import { enableConfigs } from '../../src/utils/config.js'

// CORS headers for dev (frontend runs on :3000)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

type ChatRequest = {
  model: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  thinking?: 'on' | 'off' | 'adaptive'
  effort?: 'low' | 'medium' | 'high' | 'max'
  maxTokens?: number
}

// Extend ModelOption with capability flags
type ExtendedModelOption = ModelOption & {
  supportsThinking: boolean
  supportsEffort: boolean
}

function withCors(headers: Record<string, string>) {
  return { ...CORS_HEADERS, ...headers }
}

async function handleAuthStatus(req: Request): Promise<Response> {
  const authSource = getAuthTokenSource()
  const provider = getAPIProvider()
  const subscriptionType = getSubscriptionType()
  const isInternal = isInternalSubscriber()

  return new Response(
    JSON.stringify({
      authenticated: authSource.hasToken,
      authSource: authSource.source,
      subscriptionType,
      provider,
      isInternal,
    }),
    {
      status: 200,
      headers: withCors({ 'Content-Type': 'application/json' }),
    },
  )
}

async function handleModels(req: Request): Promise<Response> {
  try {
    const options = getModelOptions()
    // Enrich with capability flags
    const extended: ExtendedModelOption[] = options.map((opt) => ({
      ...opt,
      supportsThinking: opt.value ? modelSupportsThinking(opt.value) : false,
      supportsEffort: opt.value ? modelSupportsEffort(opt.value) : false,
    }))

    return new Response(JSON.stringify(extended), {
      status: 200,
      headers: withCors({ 'Content-Type': 'application/json' }),
    })
  } catch (error) {
    console.error('[backend] Error fetching models:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch models' }),
      {
        status: 500,
        headers: withCors({ 'Content-Type': 'application/json' }),
      },
    )
  }
}

async function handleChat(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as ChatRequest | null

  if (!body || !body.model) {
    return new Response(
      JSON.stringify({ error: 'model and messages are required' }),
      {
        status: 400,
        headers: withCors({ 'Content-Type': 'application/json' }),
      },
    )
  }

  // TODO: Fase A — placeholder streaming response
  // Full implementation will use getAnthropicClient() + messages.create({ stream: true })
  // For now, return a simple SSE stream
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()

  // Send a marker
  writer.write(
    encoder.encode(`data: ${JSON.stringify({ type: 'message_start', model: body.model })}\n\n`),
  )

  // Simulate streaming response
  const response = 'Hello from web! Full streaming API integration coming in the complete implementation.'
  for (const word of response.split(' ')) {
    writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ type: 'content_block_delta', text: word ? word + ' ' : word })}\n\n`,
      ),
    )
  }

  writer.write(
    encoder.encode(
      `data: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ),
  )

  return new Response(stream.readable, {
    status: 200,
    headers: withCors({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    }),
  })
}

function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: withCors({}) })
}

async function main() {
  // Load configs (settings, auth context, etc.)
  enableConfigs()

  console.log(`[backend] Web server listening on ${ORIGIN}`)
  console.log(`[backend] Provider: ${getAPIProvider()}`)

  const server = Bun.server({
    port: PORT,
    async fetch(req: Request) {
      const url = new URL(req.url)

      if (req.method === 'OPTIONS') {
        return handleOptions(req)
      }

      switch (url.pathname) {
        case '/api/auth/status':
          return handleAuthStatus(req)

        case '/api/models':
          return handleModels(req)

        case '/api/chat':
          return handleChat(req)

        case '/health':
          return new Response('OK', {
            headers: withCors({ 'Content-Type': 'text/plain' }),
          })

        default:
          return new Response(
            JSON.stringify({ error: `Unknown route: ${url.pathname}` }),
            {
              status: 404,
              headers: withCors({ 'Content-Type': 'application/json' }),
            },
          )
      }
    },
  })

  console.log(`[backend] Ready at ${ORIGIN}`)
}

main().catch((err) => {
  console.error('[backend] Fatal error:', err)
  process.exit(1)
})
