/**
 * Live model catalog: `GET {baseURL}/models?client_version=…` against the
 * ChatGPT Codex backend, the same endpoint the Codex CLI populates
 * `~/.codex/models_cache.json` from. Entries carrying `visibility: "list"`
 * and `supported_in_api: true` become {@link CodexCatalogModel}s with their
 * own reasoning-effort vocabulary, replacing the static configured catalog
 * whenever credentials and the network allow.
 *
 * Fetching is single-flight with a success TTL and a short failure backoff:
 * `listModels`/`resolveModel` are advisory discovery calls and must not
 * hammer the backend on every picker render. A stale success is served when
 * a refresh fails; with no success at all the error propagates and the
 * adapter falls back to the configured catalog.
 *
 * @module @neplich/dsh-codex-chatgpt/models
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { CodexCatalogModel } from './adapter.ts'
import type { CodexAuthClient } from './auth.ts'
import type { CodexModelsResponse, CodexWireModel } from './types.ts'

/** The originator value the Codex CLI family sends; the backend routes on it. */
export const CODEX_ORIGINATOR = 'codex_cli_rs'

/** How long a failed fetch suppresses retries. */
const FAILURE_BACKOFF_MS = 30_000
/** Hard cap on one model-list request. */
const REQUEST_TIMEOUT_MS = 30_000

/** Display name for one wire effort id known to the Codex CLI family. */
export function effortDisplayName(id: string): string {
  switch (id) {
    case 'none': return 'Off'
    case 'minimal': return 'Minimal'
    case 'low': return 'Low'
    case 'medium': return 'Medium'
    case 'high': return 'High'
    case 'xhigh': return 'Extra High'
    case 'max': return 'Max'
    case 'ultra': return 'Ultra'
    default: return id.charAt(0).toUpperCase() + id.slice(1)
  }
}

/**
 * Map the wire model list onto validated catalog entries: user-visible,
 * API-supported models only, in the endpoint's own priority order.
 * @param response - the parsed `/models` body.
 * @returns catalog entries; malformed entries are skipped, not fatal.
 */
export function mapWireModels(response: CodexModelsResponse): CodexCatalogModel[] {
  const out: CodexCatalogModel[] = []
  for (const model of response.models ?? []) {
    out.push(...mapWireModel(model))
  }
  return out
}

/** Map one wire entry, or nothing when it is hidden, API-unsupported, or malformed. */
function mapWireModel(model: CodexWireModel): CodexCatalogModel[] {
  if (typeof model.slug !== 'string' || model.slug.length === 0) return []
  if (model.visibility !== 'list' || model.supported_in_api !== true) return []
  const efforts = (model.supported_reasoning_levels ?? [])
    .filter(level => typeof level.effort === 'string' && level.effort.length > 0)
    .map(level => ({
      id: level.effort as string,
      name: effortDisplayName(level.effort as string),
      ...typeof level.description === 'string' && level.description.length > 0
        ? { description: level.description }
        : {},
    }))
  return [{
    id: model.slug,
    ...typeof model.display_name === 'string' && model.display_name.length > 0
      ? { name: model.display_name }
      : {},
    ...typeof model.description === 'string' && model.description.length > 0
      ? { description: model.description }
      : {},
    ...typeof model.context_window === 'number' && Number.isInteger(model.context_window) && model.context_window > 0
      ? { contextWindow: model.context_window }
      : {},
    ...efforts.length > 0 ? { efforts } : {},
    ...typeof model.default_reasoning_level === 'string' && model.default_reasoning_level.length > 0
      ? { defaultEffort: model.default_reasoning_level }
      : {},
  }]
}

/** Connection facts the catalog needs, resolved per call like the adapter's. */
export interface CodexModelCatalogConnection {
  /** Endpoint base; `/models` is appended. */
  baseURL: string
  /** Value sent as the required `client_version` query parameter. */
  clientVersion: string
  /** How long a successful fetch is reused. */
  modelsCacheTtlMs: number
}

/** Constructor options for {@link CodexModelCatalog}. */
export interface CodexModelCatalogOptions {
  /** Current connection facts; called once per fetch. */
  connection: () => CodexModelCatalogConnection
  /** The credential client for the current connection's auth file. */
  auth: () => CodexAuthClient
  /** Optional warning sink (stale-cache fallbacks). */
  warn?: (message: string) => void
}

/**
 * Caching live-model client. One instance per adapter; cache entries are
 * facts about the backend, so a base-URL change simply misses the cache on
 * the next fetch and stores under the new facts.
 */
export class CodexModelCatalog {
  private cached: { at: number; models: CodexCatalogModel[] } | undefined
  private lastError: { at: number; error: LlmError } | undefined
  private pending: Promise<CodexCatalogModel[]> | undefined
  private readonly warn: (message: string) => void

  constructor(private readonly options: CodexModelCatalogOptions) {
    this.warn = options.warn ?? (() => {})
  }

  /**
   * The live catalog, from cache when fresh. Throws `LlmError` when no
   * fetch has ever succeeded and the current attempt fails.
   * @returns user-visible, API-supported models in backend priority order.
   */
  async models(): Promise<readonly CodexCatalogModel[]> {
    const now = Date.now()
    const ttl = this.options.connection().modelsCacheTtlMs
    if (this.cached !== undefined && now - this.cached.at < ttl) return this.cached.models
    if (this.lastError !== undefined && now - this.lastError.at < FAILURE_BACKOFF_MS) {
      if (this.cached !== undefined) return this.cached.models
      throw this.lastError.error
    }
    try {
      return await this.fetch()
    } catch (error) {
      if (this.cached !== undefined) {
        this.warn(`codex-chatgpt: model list refresh failed (${(error as Error).message}); serving the cached list`)
        return this.cached.models
      }
      throw error
    }
  }

  /** Force a fresh fetch, bypassing the success TTL and honoring caller cancellation. */
  async refresh(signal?: AbortSignal): Promise<readonly CodexCatalogModel[]> {
    if (signal === undefined) return await this.fetch()
    try {
      const models = await this.fetchImpl(signal)
      this.cached = { at: Date.now(), models }
      this.lastError = undefined
      return models
    } catch (error: unknown) {
      const failure = error instanceof LlmError
        ? error
        : new LlmError('codex-chatgpt: model list request failed', 'TRANSPORT', { cause: error })
      this.lastError = { at: Date.now(), error: failure }
      throw failure
    }
  }

  /** Forget the failure backoff (e.g. right after a new login completed). */
  reset(): void {
    this.lastError = undefined
  }

  private fetch(): Promise<CodexCatalogModel[]> {
    this.pending ??= this.fetchImpl()
      .then((models) => {
        this.cached = { at: Date.now(), models }
        return models
      })
      .catch((error: unknown) => {
        const failure = error instanceof LlmError
          ? error
          : new LlmError('codex-chatgpt: model list request failed', 'TRANSPORT', { cause: error })
        this.lastError = { at: Date.now(), error: failure }
        throw failure
      })
      .finally(() => {
        this.pending = undefined
      })
    return this.pending
  }

  private async fetchImpl(signal?: AbortSignal): Promise<CodexCatalogModel[]> {
    const connection = this.options.connection()
    const tokens = await this.options.auth().tokens()
    const requestSignal = signal === undefined
      ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      : AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
    let response: Response
    try {
      response = await fetch(
        `${connection.baseURL}/models?client_version=${encodeURIComponent(connection.clientVersion)}`,
        {
          headers: {
            'authorization': `Bearer ${tokens.accessToken}`,
            ...tokens.accountId === undefined ? {} : { 'chatgpt-account-id': tokens.accountId },
            'accept': 'application/json',
            'originator': CODEX_ORIGINATOR,
          },
          signal: requestSignal,
        },
      )
    } catch (error) {
      if (signal?.aborted) {
        throw new LlmError('codex-chatgpt: model list request aborted', 'ABORTED', { cause: error })
      }
      throw new LlmError(`codex-chatgpt: model list request to ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    }
    if (response.status === 401) {
      // Same unauthorized-recovery as the adapter's stream path.
      const refreshed = await this.options.auth().refresh()
      return await this.fetchWithRefreshed(
        connection,
        refreshed.accessToken,
        refreshed.accountId,
        requestSignal,
        signal,
      )
    }
    return await this.parseResponse(response)
  }

  private async fetchWithRefreshed(
    connection: CodexModelCatalogConnection,
    accessToken: string,
    accountId: string | undefined,
    requestSignal: AbortSignal,
    callerSignal: AbortSignal | undefined,
  ): Promise<CodexCatalogModel[]> {
    let response: Response
    try {
      response = await fetch(
        `${connection.baseURL}/models?client_version=${encodeURIComponent(connection.clientVersion)}`,
        {
          headers: {
            'authorization': `Bearer ${accessToken}`,
            ...accountId === undefined ? {} : { 'chatgpt-account-id': accountId },
            'accept': 'application/json',
            'originator': CODEX_ORIGINATOR,
          },
          signal: requestSignal,
        },
      )
    } catch (error) {
      if (callerSignal?.aborted) {
        throw new LlmError('codex-chatgpt: model list request aborted', 'ABORTED', { cause: error })
      }
      throw new LlmError(`codex-chatgpt: model list request to ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    }
    return await this.parseResponse(response)
  }

  private async parseResponse(response: Response): Promise<CodexCatalogModel[]> {
    if (!response.ok) {
      throw new LlmError(
        `codex-chatgpt: model list request failed (HTTP ${response.status})`,
        response.status === 401 || response.status === 403 ? 'AUTH' : 'TRANSPORT',
        { status: response.status },
      )
    }
    let parsed: CodexModelsResponse
    try {
      parsed = await response.json() as CodexModelsResponse
    } catch (error) {
      throw new LlmError('codex-chatgpt: model list returned malformed JSON', 'TRANSPORT', { cause: error })
    }
    const models = mapWireModels(parsed)
    if (models.length === 0) {
      throw new LlmError('codex-chatgpt: model list returned no usable models', 'TRANSPORT')
    }
    return models
  }
}
