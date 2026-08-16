import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'

import {
  CODEX_OAUTH_CLIENT_ID,
  CodexAuthClient,
  parseAuthTokens,
  readAuthFile,
  tokenStillFresh,
  writeAuthFile,
} from '../src/auth.ts'

const encoder = (payload: Record<string, unknown>): string =>
  `${Buffer.from(JSON.stringify(payload)).toString('base64url')}`

function jwt(exp: number | undefined): string {
  return `h.${encoder({ exp })}.s`
}

const EXPIRED = Math.floor(Date.now() / 1_000) - 3_600

afterEach(() => {
  vi.unstubAllGlobals()
})

test('parseAuthTokens accepts a codex token object and rejects partial ones', () => {
  expect(parseAuthTokens({
    access_token: 'at',
    refresh_token: 'rt',
    account_id: 'acc-1',
  })).toEqual({ accessToken: 'at', refreshToken: 'rt', accountId: 'acc-1' })
  expect(parseAuthTokens({ access_token: 'at' })).toBeUndefined()
  expect(parseAuthTokens({ refresh_token: 'rt' })).toBeUndefined()
  expect(parseAuthTokens(undefined)).toBeUndefined()
})

test('tokenStillFresh uses the exp claim with a grace period', () => {
  const future = Math.floor(Date.now() / 1_000) + 3_600
  const near = Math.floor(Date.now() / 1_000) + 10
  expect(tokenStillFresh(jwt(future), Date.now())).toBe(true)
  expect(tokenStillFresh(jwt(near), Date.now())).toBe(false)
})

test('tokenStillFresh assumes freshness for a short TTL without exp', () => {
  expect(tokenStillFresh('no-claims-jwt', Date.now())).toBe(true)
  expect(tokenStillFresh('no-claims-jwt', Date.now() - 11 * 60 * 1_000)).toBe(false)
})

test('readAuthFile returns undefined for a missing file and reads tokens otherwise', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  try {
    expect(await readAuthFile(join(root, 'missing.json'))).toBeUndefined()
    const path = join(root, 'auth.json')
    await writeFile(path, JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: { access_token: 'at', refresh_token: 'rt', account_id: 'acc' },
    }), 'utf8')
    const loaded = await readAuthFile(path)
    expect(loaded?.tokens).toEqual({ accessToken: 'at', refreshToken: 'rt', accountId: 'acc' })
    expect(loaded?.file.OPENAI_API_KEY).toBeNull()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readAuthFile rejects malformed JSON with an AUTH LlmError', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  try {
    await writeFile(path, '{not json', 'utf8')
    await expect(readAuthFile(path)).rejects.toMatchObject({ failure: { code: 'AUTH' } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeAuthFile preserves foreign fields and updates the tokens object', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  try {
    await writeAuthFile(
      path,
      { OPENAI_API_KEY: 'legacy', tokens: { access_token: 'old', refresh_token: 'old-rt', account_id: 'acc' } },
      { accessToken: 'new-at', refreshToken: 'new-rt', idToken: 'new-id' },
    )
    const written = JSON.parse(await readFile(path, 'utf8')) as {
      OPENAI_API_KEY: string
      tokens: { access_token: string; refresh_token: string; id_token: string; account_id: string; last_refresh: number }
    }
    expect(written.OPENAI_API_KEY).toBe('legacy')
    expect(written.tokens.access_token).toBe('new-at')
    expect(written.tokens.refresh_token).toBe('new-rt')
    expect(written.tokens.id_token).toBe('new-id')
    expect(written.tokens.account_id).toBe('acc')
    expect(written.tokens.last_refresh).toBeGreaterThan(0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('tokens() loads from disk and refreshes through the Auth0 endpoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.client_id).toBe(CODEX_OAUTH_CLIENT_ID)
    expect(body.grant_type).toBe('refresh_token')
    expect(body.refresh_token).toBe('old-rt')
    return new Response(JSON.stringify({
      access_token: 'fresh-at',
      refresh_token: 'fresh-rt',
      id_token: 'fresh-id',
    }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  try {
    await writeFile(path, JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: { access_token: jwt(EXPIRED), refresh_token: 'old-rt', account_id: 'acc' },
    }), 'utf8')
    const client = new CodexAuthClient({ authJsonPath: path })
    const first = await client.tokens()
    expect(first.accessToken).toBe('fresh-at')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const written = JSON.parse(await readFile(path, 'utf8')) as { tokens: { refresh_token: string } }
    expect(written.tokens.refresh_token).toBe('fresh-rt')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a rejected refresh token surfaces as an AUTH LlmError', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ error: { code: 'refresh_token_expired' } }),
    { status: 401 },
  )))
  try {
    await writeFile(path, JSON.stringify({
      tokens: { access_token: jwt(undefined), refresh_token: 'rt' },
    }), 'utf8')
    const client = new CodexAuthClient({ authJsonPath: path })
    await expect(client.refresh()).rejects.toMatchObject({ failure: { code: 'AUTH' } })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('refresh is single-flight: concurrent callers share one exchange', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  let resolveFetch: (value: Response) => void
  const gate = new Promise<Response>(resolve => { resolveFetch = resolve })
  const fetchMock = vi.fn(async () => gate)
  vi.stubGlobal('fetch', fetchMock)
  try {
    await writeFile(path, JSON.stringify({
      tokens: { access_token: jwt(undefined), refresh_token: 'rt' },
    }), 'utf8')
    const client = new CodexAuthClient({ authJsonPath: path })
    const first = client.refresh()
    const second = client.refresh()
    resolveFetch!(new Response(JSON.stringify({ access_token: 'a1', refresh_token: 'r1' }), { status: 200 }))
    const [a, b] = await Promise.all([first, second])
    expect(a.accessToken).toBe('a1')
    expect(b.accessToken).toBe('a1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a transient proactive refresh failure falls back to the cached token', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  const path = join(root, 'auth.json')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 502 })))
  try {
    await writeFile(path, JSON.stringify({
      tokens: { access_token: jwt(EXPIRED), refresh_token: 'rt' },
    }), 'utf8')
    const warnings: string[] = []
    const client = new CodexAuthClient({ authJsonPath: path, warn: message => { warnings.push(message) } })
    const tokens = await client.tokens()
    expect(tokens.accessToken).toBe(jwt(EXPIRED))
    expect(warnings).toHaveLength(1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('missing auth file raises MISSING_CREDENTIAL with guidance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'codex-auth-'))
  try {
    const client = new CodexAuthClient({ authJsonPath: join(root, 'nope.json') })
    await expect(client.tokens()).rejects.toMatchObject({ failure: { code: 'MISSING_CREDENTIAL' } })
    await expect(client.tokens()).rejects.toMatchObject({
      failure: { message: expect.stringContaining('codex login') },
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
