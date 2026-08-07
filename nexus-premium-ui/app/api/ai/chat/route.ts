/**
 * POST /api/ai/chat
 *
 * Streaming AI Concierge endpoint using the OpenAI Responses API.
 *
 * Flow:
 *  1. Call openai.responses.create() (non-streaming) to resolve any tool calls.
 *  2. Execute all requested tools in parallel, streaming status events to the client.
 *  3. Call openai.responses.create() again with tool results, this time streaming
 *     the final text response back via Server-Sent Events.
 *
 * Client-side SSE event envelope: StreamEvent from lib/ai/types.ts
 */

import OpenAI from 'openai'
import { SYSTEM_PROMPT }  from '@/lib/ai/system-prompt'
import { TOOL_DEFINITIONS, TOOL_LABELS, executeToolCall } from '@/lib/ai/tools'
import type { StreamEvent, ChatRequest, ToolContext } from '@/lib/ai/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Helpers ───────────────────────────────────────────────────────────────────

function sseEncode(enc: TextEncoder, event: StreamEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(event)}\n\n`)
}

function errorResponse(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return errorResponse('OPENAI_API_KEY is not configured.', 503)
  }

  let body: ChatRequest
  try {
    body = await req.json() as ChatRequest
  } catch {
    return errorResponse('Invalid JSON body.', 400)
  }

  const { messages = [], groupId, userId } = body
  const context: ToolContext = { groupId, userId }

  // Convert client messages to Responses API input items.
  // The Responses API accepts { role, content } objects directly.
  const conversationInput = messages.map(m => ({
    role:    m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const openai = new OpenAI({ apiKey })

  const enc     = new TextEncoder()
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) =>
        controller.enqueue(sseEncode(enc, event))

      try {
        // ── Phase 1: Resolve tool calls ────────────────────────────────────
        send({ type: 'thinking' })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phase1 = await (openai.responses as any).create({
          model:        'gpt-4o',
          instructions: SYSTEM_PROMPT,
          input:        conversationInput,
          tools:        TOOL_DEFINITIONS,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any

        // Extract function call items from the response output
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionCalls: any[] = (phase1.output ?? []).filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item: any) => item.type === 'function_call',
        )

        // ── Phase 2: Execute tools in parallel ─────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolOutputItems: any[] = []

        if (functionCalls.length > 0) {
          await Promise.all(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            functionCalls.map(async (call: any) => {
              const label = TOOL_LABELS[call.name] ?? `Running ${call.name}…`
              send({ type: 'tool_start', tool: call.name, label })
              try {
                const args   = JSON.parse(call.arguments ?? '{}')
                const result = await executeToolCall(call.name, args, context)
                send({ type: 'tool_end', tool: call.name, label })
                toolOutputItems.push({
                  type:    'function_call_output',
                  call_id: call.call_id,
                  output:  JSON.stringify(result),
                })
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                send({ type: 'tool_end', tool: call.name, label })
                toolOutputItems.push({
                  type:    'function_call_output',
                  call_id: call.call_id,
                  output:  JSON.stringify({ error: msg }),
                })
              }
            }),
          )
        }

        // ── Phase 3: Stream the final response ─────────────────────────────
        // Build the follow-up input: original conversation + model's phase-1
        // output items + tool results.
        const followUpInput = [
          ...conversationInput,
          ...(phase1.output ?? []),
          ...toolOutputItems,
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phase2Stream = await (openai.responses as any).create({
          model:        'gpt-4o',
          instructions: SYSTEM_PROMPT,
          input:        followUpInput,
          tools:        TOOL_DEFINITIONS,  // keep available for follow-ups
          stream:       true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as AsyncIterable<any>

        for await (const event of phase2Stream) {
          if (event.type === 'response.output_text.delta') {
            send({ type: 'text', delta: event.delta ?? '' })
          }
          // Stop early if the stream signals it's done
          if (event.type === 'response.completed' || event.type === 'response.done') {
            break
          }
        }

        send({ type: 'done' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
        console.error('[ai/chat] error:', err)
        send({ type: 'error', message: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',  // disable nginx buffering in some deploy envs
    },
  })
}
