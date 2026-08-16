/**
 * Codex CLI credential client: load `~/.codex/auth.json` (written by
 * `codex login` with a ChatGPT account), refresh the access token through the
 * Auth0 endpoint the Codex CLI itself uses, and persist new tokens back into
 * the same file so the CLI and this adapter stay in sync.
 *
 * Refresh is single-flight: concurrent callers share one in-flight exchange,
 * and a proactive refresh that fails transiently falls back to the cached
 * access token (the request-time 401 path re-refreshes and throws instead).
 *
 * @module @neplich/dsh-codex-chatgpt/auth
 */

import { readFile, rename, writeFile } from 'node:fs/promises'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { CodexAuthFile, CodexAuthTokens, CodexAuthTokensFile, CodexRefreshResponse } from './types.ts'

export type { CodexAuthTokens } from './types.ts'

/** The Auth0 token endpoint the Codex CLI uses for ChatGPT refresh. */
export const REFRESH_TOKEN_URL = 'https://auth.openai.com/oauth/token'
/** The public OAuth client id the Codex CLI registers with Auth0. */
export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
/** Refresh grace: refresh when the access token has less than this much life left. */
const EXPIRY_GRACE_SECONDS = 60
/** No `exp` claim: treat a token as fresh for this long after load. */
const UNKNOWN_EXPIRY_TTL_MS = 10 * 60 * 1_000

/** Parse a JWT payload without verifying the signature (claims are advisory metadata). */
function jwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] === undefined || parts[1] === undefined) return undefined
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
    const decoded = Buffer.from(padded, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded) as unknown
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/**
 * The access token's expiry as Unix milliseconds, from its JWT `exp` claim.
 * @param token - a cached access token.
 * @returns the expiry, or `undefined` when the token carries no `exp`.
 */
export function tokenExpiryMs(token: string): number | undefined {
  const claims = jwtPayload(token)
  return claims !== undefined && typeof claims.exp === 'number' ? claims.exp * 1_000 : undefined
}

/**
 * True when the access token should still be accepted without a refresh.
 * A JWT `exp` claim is authoritative; without one, tokens younger than
 * {@link UNKNOWN_EXPIRY_TTL_MS} are assumed fresh.
 * @param token - the cached access token.
 * @param loadedAtMs - when the token was loaded.
 * @returns whether the token is likely still valid.
 */
export function tokenStillFresh(token: string, loadedAtMs: number): boolean {
  const claims = jwtPayload(token)
  if (claims !== undefined && typeof claims.exp === 'number') {
    return Date.now() / 1_000 < claims.exp - EXPIRY_GRACE_SECONDS
  }
  return Date.now() - loadedAtMs < UNKNOWN_EXPIRY_TTL_MS
}

/** Map an auth.json `tokens` object onto validated adapter credentials. */
export function parseAuthTokens(tokens: CodexAuthTokensFile | undefined): CodexAuthTokens | undefined {
  const accessToken = tokens?.access_token
  const refreshToken = tokens?.refresh_token
  if (typeof accessToken !== 'string' || accessToken.length === 0) return undefined
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return undefined
  return {
    accessToken,
    refreshToken,
    ...typeof tokens?.account_id === 'string' && tokens.account_id.length > 0
      ? { accountId: tokens.account_id }
      : {},
  }
}

/** One auth-file read: the parsed file (for lossless write-back) plus its tokens. */
export interface AuthFileRead {
  file: CodexAuthFile
  tokens: CodexAuthTokens
}

/**
 * Read and validate the Codex CLI auth file.
 * @param path - the auth.json path.
 * @returns the parsed file and its ChatGPT tokens, or `undefined` when the file does not exist.
 */
export async function readAuthFile(path: string): Promise<AuthFileRead | undefined> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return undefined
    throw new LlmError(`codex-chatgpt: cannot read auth file ${path}: ${code ?? 'unknown error'}`, 'AUTH', { cause: error })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new LlmError(`codex-chatgpt: auth file ${path} is not valid JSON`, 'AUTH')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new LlmError(`codex-chatgpt: auth file ${path} is not a JSON object`, 'AUTH')
  }
  const file = parsed as CodexAuthFile
  const tokens = parseAuthTokens(file.tokens)
  if (tokens === undefined) {
    throw new LlmError(`codex-chatgpt: auth file ${path} has no usable ChatGPT tokens`, 'AUTH')
  }
  return { file, tokens }
}

/**
 * Persist refreshed tokens into the Codex CLI auth file, preserving every
 * field the CLI wrote. The write is atomic (temp file + rename).
 * @param path - the auth.json path.
 * @param file - the last parsed file contents (may be undefined when unreadable).
 * @param tokens - the full new token set.
 */
export async function writeAuthFile(
  path: string,
  file: CodexAuthFile | undefined,
  tokens: CodexAuthTokens & { idToken?: string },
): Promise<void> {
  const next: CodexAuthFile = {
    ...file,
    tokens: {
      ...file?.tokens,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      ...tokens.idToken === undefined ? {} : { id_token: tokens.idToken },
      ...tokens.accountId === undefined ? {} : { account_id: tokens.accountId },
      last_refresh: Date.now(),
    },
  }
  const serialized = `${JSON.stringify(next, null, 2)}\n`
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, serialized, 'utf8')
    await rename(temp, path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new LlmError(`codex-chatgpt: cannot write auth file ${path}: ${code ?? 'unknown error'}`, 'AUTH', { cause: error })
  }
}

/**
 * Remove the ChatGPT tokens from the Codex CLI auth file (logout), preserving
 * every other field the CLI wrote. A missing file is a no-op; the write is
 * atomic (temp file + rename).
 * @param path - the auth.json path.
 */
export async function clearAuthTokens(path: string): Promise<void> {
  let file: CodexAuthFile | undefined
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null) file = parsed as CodexAuthFile
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return
    throw new LlmError(`codex-chatgpt: cannot read auth file ${path}: ${code ?? 'unknown error'}`, 'AUTH', { cause: error })
  }
  if (file === undefined || file.tokens === undefined) return
  const next: CodexAuthFile = { ...file }
  delete next.tokens
  const serialized = `${JSON.stringify(next, null, 2)}\n`
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`
  try {
    await writeFile(temp, serialized, 'utf8')
    await rename(temp, path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new LlmError(`codex-chatgpt: cannot write auth file ${path}: ${code ?? 'unknown error'}`, 'AUTH', { cause: error })
  }
}

/** Constructor options for {@link CodexAuthClient}. */export interface CodexAuthClientOptions {
  /** Absolute path of the Codex CLI auth file. */
  authJsonPath: string
  /** Optional warning sink (refresh failures that fall back to stale tokens). */
  warn?: (message: string) => void
}

/**
 * Stateful ChatGPT/Codex credential holder: file-backed, expiring, and
 * single-flight on refresh. One instance per auth file path.
 */
export class CodexAuthClient {
  /** Parsed file contents preserved for lossless write-back. */
  private file: CodexAuthFile | undefined
  private current: CodexAuthTokens | undefined
  private loadedAtMs = 0
  private refreshing: Promise<CodexAuthTokens> | undefined
  private readonly path: string
  private readonly warn: (message: string) => void

  constructor(options: CodexAuthClientOptions) {
    this.path = options.authJsonPath
    this.warn = options.warn ?? (() => {})
  }

  /**
   * Current valid credentials, refreshing proactively when the cached access
   * token nears expiry. Throws `LlmError` `MISSING_CREDENTIAL` when no auth
   * file exists, `AUTH` when the stored tokens are unusable or the refresh is
   * rejected.
   * @returns access token and account id for one request.
   */
  async tokens(): Promise<CodexAuthTokens> {
    if (this.current === undefined) {
      const loaded = await this.loadFromDisk()
      this.current = loaded.tokens
      this.file = loaded.file
      this.loadedAtMs = Date.now()
    }
    if (tokenStillFresh(this.current.accessToken, this.loadedAtMs)) return this.current
    try {
      return await this.refresh()
    } catch (error) {
      // A proactive refresh failing transiently keeps serving the cached
      // token; the adapter's request-time 401 path re-refreshes and throws.
      if (error instanceof LlmError) {
        this.warn(`codex-chatgpt: proactive token refresh failed (${error.failure.code}); using the cached access token`)
      }
      return this.current
    }
  }

  /**
   * Force a refresh now and persist the result. Single-flight: concurrent
   * callers share the same in-flight exchange.
   * @returns the fresh credentials.
   */
  async refresh(): Promise<CodexAuthTokens> {
    this.refreshing ??= this.refreshImpl().finally(() => {
      this.refreshing = undefined
    })
    return this.refreshing
  }

  private async loadFromDisk(): Promise<AuthFileRead> {
    const loaded = await readAuthFile(this.path)
    if (loaded === undefined) {
      throw new LlmError(
        `codex-chatgpt: no ChatGPT credentials in ${this.path}; run \`codex login\` and sign in with ChatGPT,`
        + ' or configure a different authJsonPath',
        'MISSING_CREDENTIAL',
      )
    }
    return loaded
  }

  private async refreshImpl(): Promise<CodexAuthTokens> {
    if (this.current === undefined) {
      const loaded = await this.loadFromDisk()
      this.current = loaded.tokens
      this.file = loaded.file
      this.loadedAtMs = Date.now()
    }
    const refreshToken = this.current.refreshToken
    let response: Response
    try {
      response = await fetch(REFRESH_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: CODEX_OAUTH_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      })
    } catch (error) {
      throw new LlmError('codex-chatgpt: token refresh request failed', 'TRANSPORT', { cause: error })
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const permanent = response.status === 401
        || /refresh_token_(expired|reused|invalidated)/i.test(body)
      throw new LlmError(
        permanent
          ? `codex-chatgpt: ChatGPT refresh token rejected (HTTP ${response.status}); run \`codex login\` again`
          : `codex-chatgpt: token refresh failed (HTTP ${response.status})`,
        permanent ? 'AUTH' : 'TRANSPORT',
        { status: response.status },
      )
    }
    let parsed: CodexRefreshResponse
    try {
      parsed = await response.json() as CodexRefreshResponse
    } catch (error) {
      throw new LlmError('codex-chatgpt: token refresh returned malformed JSON', 'TRANSPORT', { cause: error })
    }
    const accessToken = parsed.access_token
    const refreshTokenNext = parsed.refresh_token ?? refreshToken
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new LlmError('codex-chatgpt: token refresh returned no access token', 'TRANSPORT')
    }
    const next: CodexAuthTokens = {
      accessToken,
      refreshToken: refreshTokenNext,
      ...this.current.accountId === undefined ? {} : { accountId: this.current.accountId },
    }
    // Persist best-effort: a read-only home must not fail the refresh that
    // already succeeded in memory.
    try {
      await writeAuthFile(this.path, this.file, {
        ...next,
        ...typeof parsed.id_token === 'string' ? { idToken: parsed.id_token } : {},
      })
      this.file = undefined // next write re-reads the file
    } catch (error) {
      this.warn(`codex-chatgpt: refreshed tokens could not be persisted: ${(error as Error).message}`)
    }
    this.current = next
    this.loadedAtMs = Date.now()
    return next
  }
}
