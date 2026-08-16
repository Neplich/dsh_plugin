import { CallId, LlmError, MessageId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { expect, test } from 'vitest'

import { serializeRequest, toolsOf } from '../src/serialize.ts'

let nextId = 0

function userMessage(content: Message['content']): Message {
  return { id: MessageId(`u-${nextId++}`), role: 'user', content, source: { kind: 'user' } }
}

function assistantMessage(content: Message['content']): Message {
  return {
    id: MessageId(`a-${nextId++}`),
    role: 'assistant',
    content,
    source: { kind: 'model', provider: 'codex-chatgpt', model: 'gpt-5.4' },
  }
}

function options(messages: Message[]): GenerateOptions {
  return { provider: 'codex-chatgpt', model: 'gpt-5.4', messages }
}

test('maps system, user, and assistant text into instructions and input items', () => {
  const body = serializeRequest(
    {
      ...options([userMessage([{ type: 'text', text: 'hello' }]), assistantMessage([{ type: 'text', text: 'hi' }])]),
      system: 'be helpful',
    },
    { reasoningEffort: 'medium' },
  )
  expect(body.instructions).toBe('be helpful')
  expect(body.input).toEqual([
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' },
  ])
  expect(body.reasoning).toEqual({ effort: 'medium' })
  expect(body.stream).toBe(true)
  expect(body.store).toBe(false)
})

test('maps assistant tool calls and user tool results to Responses API items', () => {
  const callId = CallId('call-1')
  const body = serializeRequest(options([
    assistantMessage([
      { type: 'text', text: 'looking up' },
      { type: 'tool-call', id: callId, name: 'get_weather', arguments: '{"city":"beijing"}' },
    ]),
    userMessage([
      { type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: 'sunny' }] },
      { type: 'text', text: 'thanks' },
    ]),
  ]), {})
  expect(body.input).toEqual([
    { role: 'assistant', content: 'looking up' },
    { type: 'function_call', call_id: 'call-1', name: 'get_weather', arguments: '{"city":"beijing"}' },
    { type: 'function_call_output', call_id: 'call-1', output: 'sunny' },
    { role: 'user', content: 'thanks' },
  ])
})

test('drops reasoning blocks from history and keeps maxTokens and temperature', () => {
  const body = serializeRequest(options([
    assistantMessage([
      { type: 'reasoning', text: 'thinking' },
      { type: 'text', text: 'answer' },
    ]),
  ]), {})
  expect(body.input).toEqual([{ role: 'assistant', content: 'answer' }])
  const withCaps = serializeRequest(
    { ...options([]), maxTokens: 1234, temperature: 0.5 },
    {},
  )
  expect(withCaps.max_output_tokens).toBe(1234)
  expect(withCaps.temperature).toBe(0.5)
})

test('maps tool schemas with raw parameters', () => {
  const tools = toolsOf([
    { name: 'f', description: 'desc', parameters: { type: 'object', properties: { a: { type: 'string' } } } },
    { name: 'g', description: '', parameters: { type: 'object' } },
  ])
  expect(tools).toEqual([
    {
      type: 'function',
      name: 'f',
      description: 'desc',
      parameters: { type: 'object', properties: { a: { type: 'string' } } },
    },
    { type: 'function', name: 'g', parameters: { type: 'object' } },
  ])
  const body = serializeRequest({
    ...options([]),
    tools: [
      { name: 'f', description: 'desc', parameters: { type: 'object', properties: { a: { type: 'string' } } } },
      { name: 'g', description: '', parameters: { type: 'object' } },
    ],
  }, {})
  expect(body.tools).toEqual(tools)
})

test('refuses stop sequences as UNSUPPORTED', () => {
  expect(() => serializeRequest({ ...options([]), stop: ['\n'] }, {}))
    .toThrowError(LlmError)
  try {
    serializeRequest({ ...options([]), stop: ['\n'] }, {})
  } catch (error) {
    expect((error as LlmError).failure.code).toBe('UNSUPPORTED')
  }
})

test('refuses image blocks as UNSUPPORTED', () => {
  const image = {
    type: 'image',
    attachment: { id: 'att-1', mime: 'image/png', bytes: 4, width: 1, height: 1, kind: 'bytes' },
  } as unknown as Message['content'][number]
  expect(() => serializeRequest(options([userMessage([image])]), {}))
    .toThrowError(LlmError)
  try {
    serializeRequest(options([userMessage([image])]), {})
  } catch (error) {
    expect((error as LlmError).failure.code).toBe('UNSUPPORTED')
  }
})
