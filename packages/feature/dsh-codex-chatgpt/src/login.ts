/**
 * ChatGPT OAuth login for the Codex backend: the same PKCE authorization
 * flow the Codex CLI's `codex login` runs, reimplemented on Node's http
 * server so the Web GUI can offer a one-click login. A local callback
 * server binds the CLI's registered port (1455, falling back to an
 * ephemeral port — the redirect URI is sent with the actual port, which the
 * authorization server accepts for loopback clients), the user signs in on
 * `auth.openai.com`, and the returned code is exchanged for tokens that are
 * written into the shared Codex CLI auth file, preserving every field the
 * CLI wrote.
 *
 * @module @neplich/dsh-codex-chatgpt/login
 */

import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { CODEX_OAUTH_CLIENT_ID, writeAuthFile } from './auth.ts'
import { CODEX_ORIGINATOR } from './models.ts'
import type { CodexAuthFile } from './types.ts'

/** The Auth0 issuer the Codex CLI authenticates against. */
export const DEFAULT_ISSUER = 'https://auth.openai.com'
/** The loopback port the Codex CLI's OAuth client registration names. */
export const DEFAULT_LOGIN_PORT = 1455
/** How long one login attempt waits for the browser callback. */
export const DEFAULT_LOGIN_TIMEOUT_MS = 600_000
/** OAuth scopes the Codex CLI requests. */
const LOGIN_SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'

/** Constructor options for {@link startCodexLogin}. */
export interface CodexLoginOptions {
  /** Absolute path of the Codex CLI auth file the tokens are written into. */
  authJsonPath: string
  /** Auth issuer base (default {@link DEFAULT_ISSUER}). */
  issuer?: string
  /** OAuth client id (default the Codex CLI's public client). */
  clientId?: string
  /** Preferred callback port (default 1455); an occupied port falls back to ephemeral. */
  port?: number
  /** Callback wait cap (default ten minutes). */
  timeoutMs?: number
  /** fetch implementation override (tests). */
  fetchImpl?: typeof fetch
}

/** Outcome of a completed login. */
export interface CodexLoginResult {
  /** The ChatGPT account id carried by the id token, when present. */
  accountId?: string
}

/** A running login attempt. */
export interface CodexLoginHandle {
  /** The authorization URL the user must open in a browser. */
  url: string
  /** The callback server's actual port. */
  port: number
  /**
   * Settles with the login outcome: resolves on persisted tokens, rejects
   * on exchange failure, timeout, or {@link CodexLoginHandle.cancel}. The
   * host-side login manager always observes it; direct callers must too.
   */
  done: Promise<CodexLoginResult>
  /** Abort the attempt: close the callback server and reject `done`. */
  cancel(reason?: string): void
}

/** PKCE verifier/challenge pair (S256). */
interface PkcePair {
  verifier: string
  challenge: string
}

function generatePkce(): PkcePair {
  const verifier = randomBytes(64).toString('base64url')
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  }
}

/** The authorize URL, mirroring the Codex CLI's query parameters. */
export function buildAuthorizeUrl(
  issuer: string,
  clientId: string,
  redirectUri: string,
  challenge: string,
  state: string,
): string {
  const query = new URLSearchParams({
    'response_type': 'code',
    'client_id': clientId,
    'redirect_uri': redirectUri,
    'scope': LOGIN_SCOPE,
    'code_challenge': challenge,
    'code_challenge_method': 'S256',
    'id_token_add_organizations': 'true',
    'codex_cli_simplified_flow': 'true',
    'state': state,
    'originator': CODEX_ORIGINATOR,
  })
  return `${issuer}/oauth/authorize?${query.toString()}`
}

/** The `chatgpt_account_id` claim of an id token, when it carries one. */
export function accountIdFromIdToken(idToken: string): string | undefined {
  const parts = idToken.split('.')
  if (parts.length !== 3 || parts[1] === undefined) return undefined
  try {
    const decoded = Buffer.from(parts[1], 'base64url').toString('utf8')
    const payload = JSON.parse(decoded) as Record<string, unknown>
    const claims = payload['https://api.openai.com/auth']
    if (typeof claims !== 'object' || claims === null) return undefined
    const accountId = (claims as Record<string, unknown>)['chatgpt_account_id']
    return typeof accountId === 'string' && accountId.length > 0 ? accountId : undefined
  } catch {
    return undefined
  }
}

/** Browser page shown after the callback completes (success or failure). */
function callbackPage(ok: boolean, detail: string): string {
  const title = ok ? 'Login successful' : 'Login failed'
  const hint = ok ? 'You can close this tab and return to dsh.' : detail
  return '<!doctype html><html><head><meta charset="utf-8"><title>Codex login</title>'
    + '<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;'
    + 'justify-content:center;margin:0;background:#f7f7f8;color:#1a1a1a}main{text-align:center;max-width:32rem;padding:2rem}'
    + 'h1{font-size:1.25rem}p{color:#555}</style></head><body><main>'
    + `<h1>${title}</h1><p>${hint}</p></main></body></html>`
}

/** Send the terminal callback page and close the response. */
function sendPage(res: import('node:http').ServerResponse, status: number, ok: boolean, detail: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
  res.end(callbackPage(ok, detail))
}

/** Read the existing auth file for lossless write-back; unreadable files start empty. */
async function readExistingAuthFile(path: string): Promise<CodexAuthFile | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as CodexAuthFile : undefined
  } catch {
    return undefined
  }
}

/** The token-exchange response fields this flow consumes. */
interface TokenExchangeResponse {
  id_token?: string
  access_token?: string
  refresh_token?: string
}

/**
 * Start one ChatGPT login attempt: bind the callback server, then return
 * the authorize URL. Nothing is persisted until the browser callback
 * completes the exchange.
 * @param options - auth file path and optional flow overrides.
 * @returns the running attempt: URL to open, outcome promise, and cancel.
 */
export async function startCodexLogin(options: CodexLoginOptions): Promise<CodexLoginHandle> {
  const issuer = (options.issuer ?? DEFAULT_ISSUER).replace(/\/+$/, '')
  const clientId = options.clientId ?? CODEX_OAUTH_CLIENT_ID
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch
  const pkce = generatePkce()
  const state = randomBytes(32).toString('hex')

  const server: Server = createServer()
  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      if (error.code === 'EADDRINUSE' && (options.port ?? DEFAULT_LOGIN_PORT) !== 0) {
        // The CLI's registered port is taken (possibly by a real `codex
        // login`): loopback redirect URIs match any port, so retry ephemeral.
        server.listen(0, '127.0.0.1')
        return
      }
      reject(new LlmError(`codex-chatgpt: cannot bind the login callback server: ${error.code ?? 'unknown error'}`, 'TRANSPORT', { cause: error }))
    }
    server.once('error', onError)
    server.listen(options.port ?? DEFAULT_LOGIN_PORT, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'object' === false) {
    server.close()
    throw new LlmError('codex-chatgpt: login callback server has no bound address', 'TRANSPORT')
  }
  const port = address.port
  const redirectUri = `http://localhost:${port}/auth/callback`

  let settle: (result: CodexLoginResult) => void
  let fail: (error: Error) => void
  const done = new Promise<CodexLoginResult>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  let settled = false
  const finish = (error: Error | undefined, result?: CodexLoginResult): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    server.close()
    if (error === undefined) settle(result ?? {})
    else fail(error)
  }
  const timer = setTimeout(() => {
    finish(new LlmError('codex-chatgpt: login timed out waiting for the browser callback', 'AUTH'))
  }, timeoutMs)
  // An idle login must not keep the process alive on its own.
  timer.unref()

  server.on('request', (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`)
    if (url.pathname !== '/auth/callback') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    if (url.searchParams.get('state') !== state) {
      sendPage(res, 400, false, 'State mismatch; restart the login from dsh.')
      finish(new LlmError('codex-chatgpt: login callback state mismatch', 'AUTH'))
      return
    }
    const code = url.searchParams.get('code')
    if (code === null || code.length === 0) {
      const detail = url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? 'missing code'
      sendPage(res, 400, false, `Authorization failed: ${detail}`)
      finish(new LlmError(`codex-chatgpt: authorization failed: ${detail}`, 'AUTH'))
      return
    }
    void exchangeAndPersist(code).then(
      (result) => {
        sendPage(res, 200, true, '')
        finish(undefined, result)
      },
      (error: Error) => {
        sendPage(res, 502, false, error.message)
        finish(error)
      },
    )
  })

  const exchangeAndPersist = async (code: string): Promise<CodexLoginResult> => {
    const body = new URLSearchParams({
      'grant_type': 'authorization_code',
      'code': code,
      'redirect_uri': redirectUri,
      'client_id': clientId,
      'code_verifier': pkce.verifier,
    })
    let response: Response
    try {
      response = await fetchImpl(`${issuer}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
    } catch (error) {
      throw new LlmError('codex-chatgpt: token exchange request failed', 'TRANSPORT', { cause: error })
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new LlmError(
        `codex-chatgpt: token exchange failed (HTTP ${response.status})${detail.length > 0 ? `: ${detail.slice(0, 200)}` : ''}`,
        response.status === 401 || response.status === 403 ? 'AUTH' : 'TRANSPORT',
        { status: response.status },
      )
    }
    let tokens: TokenExchangeResponse
    try {
      tokens = await response.json() as TokenExchangeResponse
    } catch (error) {
      throw new LlmError('codex-chatgpt: token exchange returned malformed JSON', 'TRANSPORT', { cause: error })
    }
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0
      || typeof tokens.refresh_token !== 'string' || tokens.refresh_token.length === 0) {
      throw new LlmError('codex-chatgpt: token exchange returned incomplete tokens', 'TRANSPORT')
    }
    const accountId = typeof tokens.id_token === 'string' ? accountIdFromIdToken(tokens.id_token) : undefined
    const existing = await readExistingAuthFile(options.authJsonPath)
    await writeAuthFile(options.authJsonPath, existing, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      ...accountId === undefined ? {} : { accountId },
      ...typeof tokens.id_token === 'string' ? { idToken: tokens.id_token } : {},
    })
    return accountId === undefined ? {} : { accountId }
  }

  return {
    url: buildAuthorizeUrl(issuer, clientId, redirectUri, pkce.challenge, state),
    port,
    done,
    cancel(reason?: string) {
      finish(new LlmError(reason ?? 'codex-chatgpt: login cancelled', 'ABORTED'))
    },
  }
}
