// ─── Shared types for the Nexus AI Concierge ─────────────────────────────────

/** A single turn in the conversation as stored on the client */
export interface ChatMessage {
  id:      string
  role:    'user' | 'assistant'
  content: string
  /** Tool calls that fired during this assistant turn */
  toolCalls?: ToolCallStatus[]
  /** Whether this message is still streaming */
  streaming?: boolean
}

/** Live status of one tool call shown inside an assistant message */
export interface ToolCallStatus {
  name:    string
  status:  'calling' | 'done' | 'error'
  /** Human-readable label shown in the UI */
  label:   string
}

/** Payload posted by the client to POST /api/ai/chat */
export interface ChatRequest {
  /** Flat list of conversation history (user + assistant turns) */
  messages: { role: 'user' | 'assistant'; content: string }[]
  /** Currently viewed group — passed to tools as context */
  groupId?: string
  /** Authenticated user id */
  userId?: string
}

/**
 * Server-Sent Event envelope streamed back to the client.
 *
 *   thinking  — model is about to start (show spinner)
 *   tool_start — a tool is being called
 *   tool_end   — a tool finished (includes summary)
 *   text       — a streamed text delta
 *   done       — stream complete
 *   error      — fatal error
 */
export type StreamEvent =
  | { type: 'thinking' }
  | { type: 'tool_start'; tool: string; label: string }
  | { type: 'tool_end';   tool: string; label: string; summary?: string }
  | { type: 'text';       delta: string }
  | { type: 'done' }
  | { type: 'error';      message: string }

/** Context passed to each tool stub — grows as real integrations are wired up */
export interface ToolContext {
  groupId?: string
  userId?:  string
}
