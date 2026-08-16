import { MessageId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message, StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, expect, test, vi } from 'vitest'

import { CodexChatgptAdapter } from '../src/adapter.ts'
import type { CodexConnectionOptions } from '../src/adapter.ts'
import { CodexAuthClient } from '../src/auth.ts'

const BASE_URL = 'https://chatgpt.com/backend-api/codex'

function connection(overrides: Partial<CodexConnectionOptions> = {}): CodexConnectionOptions {
  return {
    baseURL: BASE_URL,
    authJsonPath: '/tmp/codex/auth.json',
    defaults: { reasoningEffort: 'medium' },
    maxTokens: 64_000,
    defaultContextWindow: 400_000,
    models: [],
    streamIdleTimeoutMs: 300_000,
    retryPolicy: resolveRetryPolicy(undefined, 'codex-chatgpt: test'),
    ...overrides,
  }
}

/** Minimal auth-client double satisfying the adapter's two method calls. */
function fakeAuth(tokens = { accessToken: 'at-1', refreshToken: 'rt', accountId: 'acc' }) {
  return {
    tokens: vi.fn(async () => tokens),
    refresh: vi.fn(async () => ({ ...tokens, accessToken: 'at-2' })),
  } as unknown as CodexAuthClient
}

function sseBody(...events: object[]): ReadableStream<Uint8Array> {
  const text = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

function userMessage(text: string): Message {
  return { id: MessageId('m-1'), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }
}

const options: GenerateOptions = {
  provider: 'codex-chatgpt',
  model: 'gpt-5.4',
  messages: [userMessage('hi')],
  system: 'be helpful',
}

async function collect(adapter: CodexChatgptAdapter): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of adapter.stream(options)) chunks.push(chunk)
  return chunks
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('streams a successful response with the expected wire request', async () => {
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe('Bearer at-1')
    expect(headers.get('chatgpt-account-id')).toBe('acc')
    expect(headers.get('originator')).toBe('codex_cli_rs')
    expect(headers.get('accept')).toBe('text/event-stream')
    expect(headers.get('user-agent')).toContain('deepseek-harness')
    const body = JSON.parse(String(init?.body)) as { model: string; instructions: string; stream: boolean }
    expect(body.model).toBe('gpt-5.4')
    expect(body.instructions).toBe('be helpful')
    expect(body.stream).toBe(true)
    return new Response(sseBody(
      { type: 'response.output_text.delta', output_index: 0, delta: 'hi there' },
      {
        type: 'response.completed',
        response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 2 } },
      },
    ), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', fetchMock)

  const auth = fakeAuth()
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => auth })
  const chunks = await collect(adapter)

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(chunks).toContainEqual({ type: 'text-delta', index: 0, text: 'hi there' })
  expect(chunks).toContainEqual({ type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } })
  expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  expect(auth.tokens).toHaveBeenCalledTimes(1)
  expect(auth.refresh).not.toHaveBeenCalled()
})

test('refreshes once on 401 and retries with the new token', async () => {
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    if (headers.get('authorization') === 'Bearer at-1') {
      return new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 })
    }
    return new Response(sseBody(
      { type: 'response.output_text.delta', output_index: 0, delta: 'ok' },
      { type: 'response.completed', response: { status: 'completed' } },
    ), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)

  const auth = fakeAuth()
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => auth })
  const chunks = await collect(adapter)

  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(auth.refresh).toHaveBeenCalledTimes(1)
  expect(chunks[chunks.length - 1]).toEqual({ type: 'finish', reason: { kind: 'stop' } })
})

test('a second 401 surfaces as an AUTH error', async () => {
  const fetchMock = vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'nope' } }),
    { status: 401 },
  ))
  vi.stubGlobal('fetch', fetchMock)
  const auth = fakeAuth()
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => auth })
  await expect(collect(adapter)).rejects.toMatchObject({ failure: { code: 'AUTH' } })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('maps quota-limit errors onto the QUOTA code', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'Insufficient quota', code: 'insufficient_quota' } }),
    { status: 429 },
  )))
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => fakeAuth() })
  await expect(collect(adapter)).rejects.toMatchObject({ failure: { code: 'QUOTA' } })
})

test('maps plain 429s onto RATE_LIMIT with the retry-after delay', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: { message: 'slow down' } }),
    { status: 429, headers: { 'retry-after': '5' } },
  )))
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => fakeAuth() })
  await expect(collect(adapter)).rejects.toMatchObject({
    failure: { code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: 5_000 },
  })
})

test('maps 529 overload onto RATE_LIMIT', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('overloaded', { status: 529 })))
  const adapter = new CodexChatgptAdapter({ options: () => connection(), auth: () => fakeAuth() })
  await expect(collect(adapter)).rejects.toMatchObject({ failure: { code: 'RATE_LIMIT' } })
})

test('resolveModel advertises catalog metadata and reasoning efforts', async () => {
  const adapter = new CodexChatgptAdapter({
    options: () => connection({
      models: [{
        id: 'gpt-5.4',
        name: 'GPT-5.4',
        description: 'Model detail',
        contextWindow: 400_000,
        maxTokens: 32_000,
        efforts: [{ id: 'medium', description: 'Effort detail' }],
      }],
    }),
    auth: () => fakeAuth(),
  })
  const info = await adapter.resolveModel('codex-chatgpt', 'gpt-5.4')
  expect(info).not.toHaveProperty('description')
  expect(info.context?.contextWindow).toBe(400_000)
  expect(info.defaultMaxTokens).toBe(32_000)
  expect(info.reasoning?.defaultEffort).toBe('medium')
  expect(info.reasoning?.efforts).toEqual([
    { id: 'off', name: 'Off' },
    { id: 'medium', name: 'Medium' },
  ])
  const unknown = await adapter.resolveModel('codex-chatgpt', 'future-model')
  expect(unknown.context?.contextWindow).toBe(400_000)
  expect(unknown.defaultMaxTokens).toBe(64_000)
})

test('listModels and providerInfo describe the route', async () => {
  const adapter = new CodexChatgptAdapter({
    options: () => connection({ models: [{ id: 'gpt-5.4', description: 'Model detail' }] }),
    auth: () => fakeAuth(),
  })
  const models = await adapter.listModels('codex-chatgpt')
  expect(models[0]).toMatchObject({ provider: 'codex-chatgpt', id: 'gpt-5.4', inputModalities: ['text'] })
  expect(models[0]).not.toHaveProperty('description')
  expect(adapter.providerInfo('codex-chatgpt')).toEqual({ id: 'codex-chatgpt', name: 'Codex' })
})
