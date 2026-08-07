/**
 * POST /api/ai/chat
 *
 * Streaming AI Concierge endpoint using the OpenAI Responses API.
 *
 * Flow:
 *  1. Call openai.responses.create() (non-streaming) to resolve tool calls.
 *     – If the model returns no tool calls, the text from this response is
 *       sent directly to the client (one round-trip total).
 *     – If tool calls are present, they are executed in parallel while
 *       streaming status events to the client.
 *  2. (Tool path only) Second streaming call with tool results produces the
 *     final text, which is streamed character-by-character to the client.
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

function sseBytes(enc: TextEncoder, event: StreamEvent): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(event)}\n\n`)
}

/** Map OpenAI API errors to user-friendly messages */
function friendlyError(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    const { status } = err
    const code = (err as { code?: string }).code ?? ''

    if (status === 401 || status === 403) {
      return 'The AI service key is invalid or missing. Please check OPENAI_API_KEY.'
    }
    if (status === 429) {
      if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') {
        return 'The OpenAI account has no remaining credits. Add billing at platform.openai.com.'
      }
      return 'Too many requests — please wait a moment and try again.'
    }
    if (status === 503 || status === 529) {
      return 'OpenAI is experiencing high load right now. Please try again shortly.'
    }
    if (status && status >= 500) {
      return 'OpenAI returned a server error. Please try again in a moment.'
    }
  }
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred.'
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: ChatRequest
  try {
    body = await req.json() as ChatRequest
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { messages = [], groupId, userId } = body
  const context: ToolContext = { groupId, userId }

  // Convert client history to Responses API input items
  const conversationInput = messages.map(m => ({
    role:    m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const openai = new OpenAI({ apiKey })
  const enc    = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) =>
        controller.enqueue(sseBytes(enc, event))

      try {
        // ── Phase 1: Non-streaming call — resolve tool calls ───────────────
        send({ type: 'thinking' })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const responses = openai.responses as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phase1: any = await responses.create({
          model:        'gpt-4o',
          instructions: SYSTEM_PROMPT,
          input:        conversationInput,
          tools:        TOOL_DEFINITIONS,
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const outputItems: any[] = phase1.output ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionCalls = outputItems.filter((item: any) => item.type === 'function_call')

        // ── No tool calls — send phase1 text directly (one round-trip) ────
        if (functionCalls.length === 0) {
          // output_text is a property on the response that concatenates text
          const text: string =
            typeof phase1.output_text === 'string'
              ? phase1.output_text
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              : outputItems
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  .flatMap((item: any) =>
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (item.content ?? []).map((c: any) => (c.type === 'output_text' || c.type === 'text') ? (c.text ?? '') : ''),
                  )
                  .join('')

          if (text) send({ type: 'text', delta: text })
          send({ type: 'done' })
          controller.close()
          return
        }

        // ── Phase 2: Execute tools in parallel, stream status events ───────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toolOutputItems: any[] = await Promise.all(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          functionCalls.map(async (call: any) => {
            const label = TOOL_LABELS[call.name] ?? `Running ${call.name}…`
            send({ type: 'tool_start', tool: call.name, label })
            let result: unknown
            try {
              result = await executeToolCall(
                call.name,
                JSON.parse(call.arguments ?? '{}'),
                context,
              )
            } catch (toolErr) {
              result = { error: toolErr instanceof Error ? toolErr.message : String(toolErr) }
            }
            send({ type: 'tool_end', tool: call.name, label })
            return {
              type:    'function_call_output',
              call_id: call.call_id,
              output:  JSON.stringify(result),
            }
          }),
        )

        // ── Phase 3: Streaming final response with tool results ────────────
        const followUpInput = [
          ...conversationInput,
          ...outputItems,       // model's phase-1 output (including function_call items)
          ...toolOutputItems,   // our tool results
        ]

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const phase2Stream: AsyncIterable<any> = await responses.create({
          model:        'gpt-4o',
          instructions: SYSTEM_PROMPT,
          input:        followUpInput,
          tools:        TOOL_DEFINITIONS,
          stream:       true,
        })

        for await (const event of phase2Stream) {
          if (event.type === 'response.output_text.delta') {
            send({ type: 'text', delta: event.delta ?? '' })
          }
          if (event.type === 'response.completed') break
        }

        send({ type: 'done' })
      } catch (err) {
        console.error('[ai/chat]', err)
        send({ type: 'error', message: friendlyError(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
