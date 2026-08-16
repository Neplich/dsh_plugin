/**
 * Serialize a dsh `GenerateOptions` request into the ChatGPT Codex Responses
 * API body. Mapping rules:
 *
 * - `system` becomes `instructions`; history messages become `input` items.
 * - Assistant `tool-call` blocks become `function_call` items with the raw
 *   JSON arguments string passed through untouched.
 * - User `tool-result` blocks become `function_call_output` items.
 * - `image` blocks and `stop` sequences are refused with `LlmError`
 *   `UNSUPPORTED`: the Codex backend is text-only and has no stop vocabulary.
 * - Reasoning blocks in history are normalization noise (derived thinking),
 *   dropped like every adapter drops its provider's private reasoning trace.
 *
 * @module @neplich/dsh-codex-chatgpt/serialize
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message, ToolSchema } from '@deepseek-ai/dsh-llm'

/** Codex effort vocabulary for the `reasoning.effort` field. */
export type CodexReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'
  | 'ultra'

/** Request defaults the plugin resolves from config. */
export interface RequestDefaults {
  reasoningEffort?: CodexReasoningEffort
}

/** The wire body sent to `POST {baseURL}/responses`. */
export interface CodexRequestBody {
  model: string
  instructions?: string
  input: CodexInputItem[]
  tools?: CodexTool[]
  reasoning?: { effort: string }
  stream: true
  store: false
  max_output_tokens?: number
  temperature?: number
}

/** One Responses API input item. */
export type CodexInputItem =
  | { role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

/** One Responses API tool definition. */
export interface CodexTool {
  type: 'function'
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

/** Flatten message blocks into the plain text a Codex input item carries. */
function textOf(blocks: readonly ContentBlock[]): string | undefined {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.text)
        break
      case 'reasoning':
        // Derived thinking from an earlier adapter run; not conversation.
        break
      case 'image':
        throw new LlmError('codex-chatgpt: image blocks are not supported by the Codex backend', 'UNSUPPORTED')
      case 'tool-call':
        throw new LlmError('codex-chatgpt: unexpected tool-call block in user content', 'UNSUPPORTED')
      case 'tool-result':
        // Nested tool results are handled by the caller via toolCallId.
        break
    }
  }
  const text = parts.join('').trim()
  return text.length > 0 ? text : undefined
}

/** Serialize one history message into input items, preserving block order. */
function itemsOf(message: Message): CodexInputItem[] {
  const items: CodexInputItem[] = []
  if (message.role === 'assistant') {
    for (const block of message.content) {
      switch (block.type) {
        case 'text': {
          const text = textOf([block])
          if (text !== undefined) items.push({ role: 'assistant', content: text })
          break
        }
        case 'tool-call':
          items.push({
            type: 'function_call',
            call_id: String(block.id),
            name: block.name,
            arguments: block.arguments,
          })
          break
        case 'reasoning':
          break
        case 'image':
          throw new LlmError('codex-chatgpt: image blocks are not supported by the Codex backend', 'UNSUPPORTED')
        case 'tool-result':
          throw new LlmError('codex-chatgpt: unexpected tool-result block in assistant content', 'UNSUPPORTED')
      }
    }
    return items
  }
  // role 'user' — text blocks accumulate into one user item, tool results
  // become function_call_output items, all in first-seen order.
  const textBlocks: ContentBlock[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        textBlocks.push(block)
        break
      case 'tool-result': {
        const output = textOf(block.content)
        if (output === undefined) {
          throw new LlmError('codex-chatgpt: empty tool result cannot be sent back to the model', 'UNSUPPORTED')
        }
        items.push({
          type: 'function_call_output',
          call_id: String(block.toolCallId),
          output,
        })
        break
      }
      case 'reasoning':
        break
      case 'image':
        throw new LlmError('codex-chatgpt: image blocks are not supported by the Codex backend', 'UNSUPPORTED')
      case 'tool-call':
        throw new LlmError('codex-chatgpt: unexpected tool-call block in user content', 'UNSUPPORTED')
    }
  }
  if (textBlocks.length > 0) {
    const text = textOf(textBlocks)
    if (text !== undefined) items.push({ role: 'user', content: text })
  }
  return items
}

/**
 * Build the Codex Responses API request body for one model call.
 * @param options - the fully assembled dsh request.
 * @param defaults - adapter-resolved request defaults.
 * @returns the wire body, ready for `JSON.stringify`.
 */
export function serializeRequest(options: GenerateOptions, defaults: RequestDefaults): CodexRequestBody {
  if (options.stop !== undefined && options.stop.length > 0) {
    throw new LlmError('codex-chatgpt: the Codex backend does not support stop sequences', 'UNSUPPORTED')
  }
  const input: CodexInputItem[] = []
  for (const message of options.messages) {
    input.push(...itemsOf(message))
  }
  // The per-request effort (picker selection, already validated against the
  // model's advertised levels by the runtime) wins over the configured
  // default; `none` and `off` both omit the field, leaving the backend its
  // own per-model default instead of naming an effort the model may reject.
  const effort = options.reasoningEffort ?? defaults.reasoningEffort
  const body: CodexRequestBody = {
    model: options.model,
    ...options.system === undefined || options.system.length === 0 ? {} : { instructions: options.system },
    input,
    ...options.tools !== undefined && options.tools.length > 0
      ? { tools: toolsOf(options.tools) }
      : {},
    ...effort === undefined || effort === 'none' || effort === 'off' ? {} : { reasoning: { effort } },
    stream: true,
    store: false,
    ...options.maxTokens === undefined ? {} : { max_output_tokens: options.maxTokens },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
  }
  return body
}

/** Map dsh tool schemas onto Responses API function tools. */
export function toolsOf(tools: readonly ToolSchema[]): CodexTool[] {
  return tools.map(tool => ({
    type: 'function',
    name: tool.name,
    ...tool.description !== undefined && tool.description.length > 0 ? { description: tool.description } : {},
    parameters: tool.parameters,
  }))
}
