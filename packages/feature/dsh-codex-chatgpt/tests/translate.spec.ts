import { expect, test } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'

import { mapErrorCode, mapFinishReason, mapUsage, translate } from '../src/translate.ts'

async function run(payloads: string[]): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of translate(payloads)) chunks.push(chunk)
  return chunks
}

const completed = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  type: 'response.completed',
  response: {
    status: 'completed',
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    ...overrides,
  },
})

test('streams text deltas then closes with usage and a stop finish', async () => {
  const chunks = await run([
    JSON.stringify({ type: 'response.created' }),
    JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'Hel' }),
    JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'lo' }),
    completed(),
  ])
  expect(chunks).toEqual([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'Hel' },
    { type: 'text-delta', index: 0, text: 'lo' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello' } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
})

test('supplies full items when the backend never delta-streams', async () => {
  const chunks = await run([
    JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'message', content: [{ type: 'output_text', text: 'whole answer' }] },
    }),
    completed(),
  ])
  expect(chunks).toContainEqual({ type: 'block-start', index: 0, blockType: 'text' })
  expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'whole answer' })
  expect(chunks).toContainEqual({ type: 'block-end', index: 0, block: { type: 'text', text: 'whole answer' } })
})

test('assembles tool calls from added, argument deltas, and done backfill', async () => {
  const chunks = await run([
    JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'function_call', id: 'call-9', name: 'get_weather', arguments: '' },
    }),
    JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"ci' }),
    JSON.stringify({ type: 'response.function_call_arguments.delta', output_index: 0, delta: 'ty":"x"}' }),
    JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
      item: { type: 'function_call', id: 'call-9', name: 'get_weather', arguments: '{"city":"x"}' },
    }),
    completed(),
  ])
  expect(chunks).toContainEqual({
    type: 'tool-call-delta',
    index: 0,
    id: 'call-9',
    name: 'get_weather',
    argumentsDelta: '{"ci',
  })
  expect(chunks).toContainEqual({
    type: 'block-end',
    index: 0,
    block: { type: 'tool-call', id: 'call-9', name: 'get_weather', arguments: '{"city":"x"}' },
  })
})

test('backfills an added-but-never-delta-streamed function call from done', async () => {
  const chunks = await run([
    JSON.stringify({
      type: 'response.output_item.added',
      output_index: 2,
      item: { type: 'function_call', id: 'call-1', name: 'f' },
    }),
    JSON.stringify({
      type: 'response.output_item.done',
      output_index: 2,
      item: { type: 'function_call', id: 'call-1', name: 'f', arguments: '{"a":1}' },
    }),
    completed(),
  ])
  const blockEnd = chunks.find(chunk => chunk.type === 'block-end')
  expect(blockEnd).toEqual({
    type: 'block-end',
    index: 0,
    block: { type: 'tool-call', id: 'call-1', name: 'f', arguments: '{"a":1}' },
  })
})

test('streams reasoning summary deltas into a reasoning block', async () => {
  const chunks = await run([
    JSON.stringify({ type: 'response.reasoning_summary_text.delta', output_index: 1, delta: 'th' }),
    JSON.stringify({ type: 'response.reasoning_summary_text.delta', output_index: 1, delta: 'ink' }),
    completed(),
  ])
  expect(chunks).toContainEqual({ type: 'block-start', index: 0, blockType: 'reasoning' })
  expect(chunks).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'th' })
  expect(chunks).toContainEqual({
    type: 'block-end',
    index: 0,
    block: { type: 'reasoning', text: 'think' },
  })
})

test('pulses the watchdog on ping and yields no chunk', async () => {
  let pulses = 0
  const chunks: StreamChunk[] = []
  for await (const chunk of translate(
    [
      JSON.stringify({ type: 'ping' }),
      JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'ok' }),
      completed(),
    ],
    () => { pulses++ },
  )) chunks.push(chunk)
  expect(pulses).toBe(1)
  expect(chunks.filter(chunk => chunk.type === 'text-delta')).toEqual([
    { type: 'text-delta', index: 0, text: 'ok' },
  ])
})

test('maps a completed response with no content to an EMPTY_RESPONSE error finish', async () => {
  const chunks = await run([completed()])
  expect(chunks[chunks.length - 1]).toEqual({
    type: 'finish',
    reason: { kind: 'error', failure: { message: expect.any(String), code: 'EMPTY_RESPONSE' } },
  })
})

test('maps incomplete max_output_tokens to a max-tokens finish', async () => {
  const chunks = await run([
    JSON.stringify({
      type: 'response.completed',
      response: {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        usage: { input_tokens: 1, output_tokens: 2 },
      },
    }),
  ])
  expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', reason: { kind: 'max-tokens' } })
})

test('ends in-band failures with an error finish carrying the mapped code', async () => {
  const chunks = await run([
    JSON.stringify({
      type: 'response.failed',
      error: { message: 'quota exceeded', code: 'insufficient_quota' },
    }),
  ])
  expect(chunks).toEqual([
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'quota exceeded', code: 'QUOTA' },
      },
    },
  ])
})

test('throws STREAM_CLOSED when the stream ends without the terminal event', async () => {
  await expect(run([JSON.stringify({ type: 'response.created' })])).rejects.toMatchObject({
    failure: { code: 'STREAM_CLOSED' },
  })
})

test('throws MALFORMED_RESPONSE on non-JSON payloads other than [DONE]', async () => {
  await expect(run(['not json'])).rejects.toMatchObject({ failure: { code: 'MALFORMED_RESPONSE' } })
})

test('tolerates the [DONE] sentinel', async () => {
  const chunks = await run([
    '[DONE]',
    JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: 'x' }),
    completed(),
  ])
  expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', reason: { kind: 'stop' } })
})

test('mapErrorCode covers the harness taxonomy', () => {
  expect(mapErrorCode('rate_limit_exceeded')).toBe('RATE_LIMIT')
  expect(mapErrorCode('context_length_exceeded')).toBe('CONTEXT_WINDOW_EXCEEDED')
  expect(mapErrorCode('server_error')).toBe('SERVER')
  expect(mapErrorCode(undefined)).toBe('PROVIDER')
  expect(mapErrorCode('something_new')).toBe('SOMETHING_NEW')
})

test('mapFinishReason covers the terminal statuses', () => {
  expect(mapFinishReason('completed', undefined)).toEqual({ kind: 'stop' })
  expect(mapFinishReason('incomplete', 'max_output_tokens')).toEqual({ kind: 'max-tokens' })
  expect(mapFinishReason('incomplete', 'other')).toMatchObject({ kind: 'error', failure: { code: 'INCOMPLETE' } })
  expect(mapFinishReason('cancelled', undefined)).toMatchObject({ kind: 'aborted' })
  expect(mapFinishReason('failed', undefined)).toMatchObject({ kind: 'error', failure: { code: 'PROVIDER' } })
  expect(mapFinishReason('weird', undefined)).toMatchObject({ kind: 'error', failure: { code: 'INVALID_RESPONSE' } })
})

test('mapUsage reports disjoint counts and optional cache/reasoning fields', () => {
  expect(mapUsage({ input_tokens: 3, output_tokens: 2 })).toEqual({ inputTokens: 3, outputTokens: 2 })
  expect(mapUsage({
    input_tokens: 3,
    output_tokens: 2,
    input_tokens_details: { cached_tokens: 1 },
    reasoning_tokens: 4,
  })).toEqual({ inputTokens: 3, outputTokens: 2, cacheReadTokens: 1, reasoningTokens: 4 })
  expect(mapUsage(undefined)).toBeUndefined()
  expect(mapUsage({ input_tokens: 'x' as unknown as number, output_tokens: 2 })).toBeUndefined()
})
