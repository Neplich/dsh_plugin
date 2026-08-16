import { afterEach, describe, expect, it, vi } from 'vitest'

import type { CodexAuthClient } from '../src/auth.ts'
import { discoverCodexModels } from '../src/index.ts'
import { CodexModelCatalog, mapWireModels } from '../src/models.ts'

function auth(tokens = { accessToken: 'access-1', refreshToken: 'refresh', accountId: 'account-1' }) {
  return {
    tokens: vi.fn(async () => tokens),
    refresh: vi.fn(async () => ({ ...tokens, accessToken: 'access-2' })),
  } as unknown as CodexAuthClient
}

function catalog(authClient = auth()): CodexModelCatalog {
  return new CodexModelCatalog({
    connection: () => ({
      baseURL: 'https://chatgpt.com/backend-api/codex',
      clientVersion: '0.147.0',
      modelsCacheTtlMs: 3_600_000,
    }),
    auth: () => authClient,
  })
}

function wireModel() {
  return {
    slug: 'gpt-5.6-sol',
    display_name: 'GPT-5.6-Sol',
    description: 'Flagship',
    visibility: 'list',
    supported_in_api: true,
    context_window: 272_000,
    default_reasoning_level: 'medium',
    supported_reasoning_levels: [
      { effort: 'low', description: 'Fast' },
      { effort: 'medium', description: 'Balanced' },
    ],
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Codex account model discovery', () => {
  it('maps only listed API models and preserves account metadata', () => {
    expect(mapWireModels({
      models: [
        wireModel(),
        { ...wireModel(), slug: 'hidden', visibility: 'hide' },
        { ...wireModel(), slug: 'unsupported', supported_in_api: false },
      ],
    })).toEqual([{
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6-Sol',
      description: 'Flagship',
      contextWindow: 272_000,
      efforts: [
        { id: 'low', name: 'Low', description: 'Fast' },
        { id: 'medium', name: 'Medium', description: 'Balanced' },
      ],
      defaultEffort: 'medium',
    }])
  })

  it('fetches the signed-in account catalog with Codex headers', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer access-1')
      expect(headers.get('chatgpt-account-id')).toBe('account-1')
      expect(headers.get('originator')).toBe('codex_cli_rs')
      return new Response(JSON.stringify({ models: [wireModel()] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverCodexModels(catalog(), { provider: 'codex-chatgpt' })).resolves.toEqual([{
      id: 'gpt-5.6-sol',
      name: 'GPT-5.6-Sol',
      contextWindow: 272_000,
    }])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://chatgpt.com/backend-api/codex/models?client_version=0.147.0',
    )
  })

  it('refreshes once after an unauthorized model-list response', async () => {
    const authClient = auth()
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const token = new Headers(init?.headers).get('authorization')
      return token === 'Bearer access-1'
        ? new Response('{}', { status: 401 })
        : new Response(JSON.stringify({ models: [wireModel()] }))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(discoverCodexModels(catalog(authClient), { provider: 'codex-chatgpt' }))
      .resolves.toHaveLength(1)
    expect(authClient.refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('settles promptly with ABORTED when the discovery caller cancels', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => { reject(init.signal?.reason) }, { once: true })
      })
      return new Response('{}')
    }))
    const controller = new AbortController()
    const pending = discoverCodexModels(catalog(), {
      provider: 'codex-chatgpt',
      signal: controller.signal,
    })
    controller.abort('closed')

    await expect(pending).rejects.toMatchObject({ failure: { code: 'ABORTED' } })
  })

  it('rejects a route outside the namespace it owns', async () => {
    await expect(discoverCodexModels(catalog(), { provider: 'openai' }))
      .rejects.toThrow('cannot discover models for provider "openai"')
  })
})
