import { expect, test } from 'vitest'

import { parseSse } from '../src/sse.ts'

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

async function collect(text: string): Promise<string[]> {
  const payloads: string[] = []
  for await (const payload of parseSse(streamOf(text))) payloads.push(payload)
  return payloads
}

test('parses simple data events', async () => {
  expect(await collect('data: {"a":1}\n\n')).toEqual(['{"a":1}'])
})

test('parses multiple events including CRLF line endings', async () => {
  // Consecutive data lines form one payload; blank lines separate events.
  expect(await collect('data: one\r\ndata: two\r\n\r\ndata: three\n\n')).toEqual(['one\ntwo', 'three'])
})

test('joins multi-line data payloads with newlines', async () => {
  expect(await collect('data: line1\ndata: line2\n\n')).toEqual(['line1\nline2'])
})

test('ignores comments and non-data fields', async () => {
  expect(await collect(': keepalive\nevent: response\ndata: {"type":"x"}\nid: 3\n\n')).toEqual(['{"type":"x"}'])
})

test('yields a trailing payload without a final blank line', async () => {
  expect(await collect('data: tail')).toEqual(['tail'])
})

test('handles chunked delivery across read boundaries', async () => {
  const bytes = new TextEncoder().encode('data: abc\n\ndata: def\n\n')
  const reader = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, 5))
      controller.enqueue(bytes.slice(5, 14))
      controller.enqueue(bytes.slice(14))
      controller.close()
    },
  })
  const payloads: string[] = []
  for await (const payload of parseSse(reader)) payloads.push(payload)
  expect(payloads).toEqual(['abc', 'def'])
})
