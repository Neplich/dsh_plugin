/**
 * Translate Codex Responses SSE events into the harness `StreamChunk`
 * protocol. Two event families carry content, and both are handled without
 * double emission:
 *
 * - delta events (`response.output_text.delta`, `response.reasoning_*.delta`,
 *   `response.function_call_arguments.delta`) stream text as it arrives;
 * - `response.output_item.done` supplies full assembled items for outputs the
 *   backend did not delta-stream (the ChatGPT backend is known to send final
 *   content only in stream events, so `response.completed.output` is never
 *   trusted).
 *
 * `block-end`s, `usage`, and `finish` are all deferred to the terminal
 * `response.completed` event; a stream that ends without it is a transport
 * contract violation (`STREAM_CLOSED`). `ping` events pulse the idle watchdog
 * and produce no chunks. In-band failures (`response.failed` /
 * `response.error`) end the stream with an error `finish`, never a throw.
 *
 * @module @neplich/dsh-codex-chatgpt/translate
 */

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { CodexSseEvent, CodexWireUsage } from './types.ts'

/** One open block under assembly, keyed by the wire `output_index`. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/** Map an in-band provider error code onto the harness taxonomy. */
export function mapErrorCode(code: string | undefined): string {
  switch (code) {
    case 'invalid_request_error':
    case 'invalid_request':
      return 'INVALID_REQUEST'
    case 'context_length_exceeded':
    case 'context_length_exceeded_error':
      return 'CONTEXT_WINDOW_EXCEEDED'
    case 'rate_limit_exceeded':
    case 'rate_limit_exceeded_error':
      return 'RATE_LIMIT'
    case 'insufficient_quota':
    case 'quota_exceeded':
      return 'QUOTA'
    case 'server_error':
    case 'internal_server_error':
      return 'SERVER'
    case 'authentication_error':
      return 'AUTH'
    default:
      return code === undefined || code.length === 0 ? 'PROVIDER' : code.toUpperCase()
  }
}

/** Map the terminal response `status` onto a harness finish reason. */
export function mapFinishReason(status: string | undefined, incompleteReason: string | undefined): FinishReason {
  switch (status) {
    case 'completed':
      return { kind: 'stop' }
    case 'incomplete':
      return incompleteReason === 'max_output_tokens'
        ? { kind: 'max-tokens' }
        : {
          kind: 'error',
          failure: {
            message: `response incomplete: ${incompleteReason ?? 'unknown reason'}`,
            code: 'INCOMPLETE',
          },
        }
    case 'cancelled':
      return { kind: 'aborted', failure: { message: 'response cancelled by the provider', code: 'ABORTED' } }
    case 'failed':
      return { kind: 'error', failure: { message: 'response failed', code: 'PROVIDER' } }
    default:
      return {
        kind: 'error',
        failure: { message: `response ended with status "${status ?? 'unknown'}"`, code: 'INVALID_RESPONSE' },
      }
  }
}

/** Map the completed-response usage onto disjoint harness counts. */
export function mapUsage(usage: CodexWireUsage | undefined): TokenUsage | undefined {
  if (usage === undefined) return undefined
  const inputTokens = usage.input_tokens
  const outputTokens = usage.output_tokens
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined
  const cacheRead = usage.input_tokens_details?.cached_tokens
  return {
    inputTokens,
    outputTokens,
    ...typeof cacheRead === 'number' && cacheRead > 0 ? { cacheReadTokens: cacheRead } : {},
    ...typeof usage.reasoning_tokens === 'number' && usage.reasoning_tokens > 0
      ? { reasoningTokens: usage.reasoning_tokens }
      : {},
  }
}

/** The final assembled ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/** Extract the wire `output_index` of one event, defaulting to a shared key. */
function outputIndexOf(event: CodexSseEvent): number {
  return typeof event.output_index === 'number' ? event.output_index : -1
}

/** Extract text from an assembled item's content/summary parts. */
function itemText(parts: unknown[] | undefined, partType: string): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter(part => typeof part === 'object' && part !== null
      && (part as { type?: unknown }).type === partType
      && typeof (part as { text?: unknown }).text === 'string')
    .map(part => (part as { text: string }).text)
    .join('')
}

/**
 * Consume Codex SSE payloads and yield StreamChunks, terminating on
 * `response.completed`.
 * @param payloads - SSE data payloads from {@link parseSse}.
 * @param onPulse - optional idle-watchdog pulse invoked on `ping` events.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` on the terminal event.
 */
export async function* translate(
  payloads: AsyncIterable<string>,
  onPulse?: () => void,
): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  const byOutput = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let finished = false

  function open(kind: OpenBlock['kind'], outputIndex: number): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    byOutput.set(outputIndex, block)
    order.push(block)
    return block
  }

  function blockOrOpen(
    kind: OpenBlock['kind'],
    outputIndex: number,
  ): { block: OpenBlock; created: boolean } {
    const existing = byOutput.get(outputIndex)
    if (existing !== undefined) {
      if (existing.kind !== kind) {
        throw new LlmError(
          `codex-chatgpt: output ${outputIndex} switched content kind from ${existing.kind} to ${kind}`,
          'MALFORMED_RESPONSE',
        )
      }
      return { block: existing, created: false }
    }
    return { block: open(kind, outputIndex), created: true }
  }

  for await (const payload of payloads) {
    if (payload === '[DONE]') continue
    let event: CodexSseEvent
    try {
      event = JSON.parse(payload) as CodexSseEvent
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }
    if (typeof event !== 'object' || event === null) {
      throw new LlmError('malformed SSE payload: not a JSON object', 'MALFORMED_RESPONSE')
    }
    const type = event.type
    if (type === 'ping') {
      onPulse?.()
      continue
    }
    if (type === 'response.output_text.delta') {
      const delta = event.delta
      if (typeof delta !== 'string' || delta.length === 0) continue
      const outputIndex = outputIndexOf(event)
      const { block, created } = blockOrOpen('text', outputIndex)
      if (created) yield { type: 'block-start', index: block.index, blockType: 'text' }
      block.text += delta
      yield { type: 'text-delta', index: block.index, text: delta }
      continue
    }
    if (type === 'response.reasoning_summary_text.delta' || type === 'response.reasoning_text.delta') {
      const delta = event.delta
      if (typeof delta !== 'string' || delta.length === 0) continue
      const outputIndex = outputIndexOf(event)
      const { block, created } = blockOrOpen('reasoning', outputIndex)
      if (created) yield { type: 'block-start', index: block.index, blockType: 'reasoning' }
      block.text += delta
      yield { type: 'reasoning-delta', index: block.index, text: delta }
      continue
    }
    if (type === 'response.function_call_arguments.delta') {
      const delta = event.delta
      if (typeof delta !== 'string' || delta.length === 0) continue
      const outputIndex = outputIndexOf(event)
      const { block, created } = blockOrOpen('tool-call', outputIndex)
      if (created) yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
      block.text += delta
      yield {
        type: 'tool-call-delta',
        index: block.index,
        id: CallId(block.callId ?? ''),
        ...block.name === undefined ? {} : { name: block.name },
        argumentsDelta: delta,
      }
      continue
    }
    if (type === 'response.output_item.added') {
      const item = event.item
      if (typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'function_call') {
        const call = item as { id?: unknown; name?: unknown }
        const block = blockOrOpen('tool-call', outputIndexOf(event)).block
        if (typeof call.id === 'string') block.callId = call.id
        if (typeof call.name === 'string') block.name = call.name
      }
      continue
    }
    if (type === 'response.output_item.done') {
      const outputIndex = outputIndexOf(event)
      const item = event.item
      if (typeof item !== 'object' || item === null) continue
      const kind = (item as { type?: unknown }).type
      if (kind === 'message') {
        if (byOutput.has(outputIndex)) continue // deltas already carried this item
        const text = itemText((item as { content?: unknown[] }).content, 'output_text')
        if (text.length === 0) continue
        const block = open('text', outputIndex)
        block.text = text
        yield { type: 'block-start', index: block.index, blockType: 'text' }
        yield { type: 'text-delta', index: block.index, text }
      } else if (kind === 'function_call') {
        const call = item as { id?: unknown; name?: unknown; arguments?: unknown }
        const argumentsRaw = typeof call.arguments === 'string' ? call.arguments : ''
        const existing = byOutput.get(outputIndex)
        if (existing !== undefined) {
          // Opened by output_item.added (or argument deltas): backfill the
          // id/name and any arguments that never delta-streamed.
          if (typeof call.id === 'string' && existing.callId === undefined) existing.callId = call.id
          if (typeof call.name === 'string' && existing.name === undefined) existing.name = call.name
          if (existing.text.length === 0 && argumentsRaw.length > 0) existing.text = argumentsRaw
          continue
        }
        if (argumentsRaw.length === 0) continue
        const block = open('tool-call', outputIndex)
        if (typeof call.id === 'string') block.callId = call.id
        if (typeof call.name === 'string') block.name = call.name
        block.text = argumentsRaw
        yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
        yield {
          type: 'tool-call-delta',
          index: block.index,
          id: CallId(block.callId ?? ''),
          ...block.name === undefined ? {} : { name: block.name },
          argumentsDelta: argumentsRaw,
        }
      } else if (kind === 'reasoning') {
        if (byOutput.has(outputIndex)) continue // deltas already carried this item
        const text = itemText((item as { summary?: unknown[] }).summary, 'summary_text')
        if (text.length === 0) continue
        const block = open('reasoning', outputIndex)
        block.text = text
        yield { type: 'block-start', index: block.index, blockType: 'reasoning' }
        yield { type: 'reasoning-delta', index: block.index, text }
      }
      continue
    }
    if (type === 'response.completed') {
      const response = typeof event.response === 'object' && event.response !== null
        ? event.response as { status?: unknown; incomplete_details?: { reason?: unknown }; usage?: CodexWireUsage }
        : undefined
      for (const block of order) {
        yield { type: 'block-end', index: block.index, block: closeBlock(block) }
      }
      const mapped = mapUsage(response?.usage)
      if (mapped !== undefined) yield { type: 'usage', usage: mapped }
      const reason = mapFinishReason(
        typeof response?.status === 'string' ? response.status : undefined,
        typeof response?.incomplete_details?.reason === 'string' ? response.incomplete_details.reason : undefined,
      )
      yield {
        type: 'finish',
        reason: reason.kind === 'stop' && order.length === 0
          ? {
            kind: 'error',
            failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
          }
          : reason,
      }
      finished = true
      return
    }
    if (type === 'response.failed' || type === 'response.error') {
      const error = typeof event.error === 'object' && event.error !== null
        ? event.error as { message?: unknown; code?: unknown }
        : undefined
      yield {
        type: 'finish',
        reason: {
          kind: 'error',
          failure: {
            message: typeof error?.message === 'string' && error.message.length > 0
              ? error.message
              : 'Codex response failed',
            code: mapErrorCode(typeof error?.code === 'string' ? error.code : undefined),
          },
        },
      }
      finished = true
      return
    }
    // response.created, response.in_progress, response.content_part.added,
    // function_call_output items, and future events carry no chunk meaning.
  }

  if (!finished) {
    throw new LlmError('Codex SSE stream ended without response.completed', 'STREAM_CLOSED')
  }
}
