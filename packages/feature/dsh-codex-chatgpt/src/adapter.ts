/**
 * `CodexChatgptAdapter`: fetch + SSE against the ChatGPT Codex Responses
 * backend (`chatgpt.com/backend-api/codex/responses`), emitting harness
 * StreamChunks. Transport-only like `dsh-llm-deepseek`: connection facts
 * arrive through a thunk resolved once per operation and credentials through
 * a per-path auth client, so the registering plugin owns validation,
 * layering, and credential policy.
 *
 * A 401 triggers exactly one token refresh and retry (the Codex CLI's own
 * unauthorized-recovery behavior); any second 401 is reported as `AUTH`.
 *
 * @module @neplich/dsh-codex-chatgpt/adapter
 */

import {
  attributionHeaders,
  CONTEXT_WINDOW_EXCEEDED_CODE,
  isContextWindowExceededError,
  isQuotaExceededError,
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  QUOTA_EXCEEDED_CODE,
  ReasoningEffortId,
} from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  ResolvedRetryPolicy,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { idleWatchdog, timeoutOf } from '@deepseek-ai/dsh-timeout'
import type { CodexAuthClient, CodexAuthTokens } from './auth.ts'
import { CODEX_ORIGINATOR, effortDisplayName } from './models.ts'
import type { CodexModelCatalog } from './models.ts'
import { serializeRequest } from './serialize.ts'
import type { RequestDefaults } from './serialize.ts'
import { parseSse } from './sse.ts'
import { translate } from './translate.ts'
import type { CodexWireError } from './types.ts'

export { CODEX_ORIGINATOR } from './models.ts'

/** Default combined request/response context capacity. */
export const DEFAULT_CONTEXT_WINDOW = 400_000
/** Default per-request output-token cap. */
export const DEFAULT_MAX_TOKENS = 64_000
/** Default maximum idle interval while a stream read is outstanding. */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const STREAM_IDLE_TIMEOUT_CODE = 'LLM_STREAM_IDLE_TIMEOUT'
const MAX_AUTH_ATTEMPTS = 2

const OFF_EFFORT = ReasoningEffortId('off')

/**
 * The effort advertised for "let the backend decide": selecting it omits the
 * reasoning field on the wire (see serialize.ts). Always present so a stored
 * `off` selection from an earlier catalog keeps resolving after a model's
 * live effort list replaces the static one.
 */
const OFF_EFFORT_INFO = { id: OFF_EFFORT, name: 'Off' } as const

/** Fallback effort list for a model that advertises none. */
const FALLBACK_EFFORTS: readonly CodexCatalogEffort[] = [
  { id: 'low' },
  { id: 'medium' },
  { id: 'high' },
]

/** One reasoning effort a catalog model advertises. */
export interface CodexCatalogEffort {
  /** Wire effort id (`low` … `ultra`). */
  id: string
  /** Selector label; derived from {@link id} when omitted. */
  name?: string
  /** Provider-written or configured selector detail. */
  description?: string
}

/** One optional model entry advertised by the adapter. */
export interface CodexCatalogModel {
  /** Wire model id accepted by the configured endpoint. */
  id: string
  /** Selector label; defaults to {@link id}. */
  name?: string
  /** Optional selector detail for deployments with similar model variants. */
  description?: string
  /** Known combined request/response context capacity; omitted when unknown. */
  contextWindow?: number
  /** Per-request output cap for this model; omission falls back to the profile's {@link CodexConnectionOptions.maxTokens}. */
  maxTokens?: number
  /** Reasoning efforts this model accepts; omission falls back to low/medium/high. */
  efforts?: readonly CodexCatalogEffort[]
  /** Provider-chosen default effort, used when the profile configures none. */
  defaultEffort?: string
}

/** Validated connection facts for one operation. */
export interface CodexConnectionOptions {
  /** Endpoint base; `/responses` is appended. */
  baseURL: string
  /** Absolute path of the Codex CLI auth file. */
  authJsonPath: string
  /** Request defaults applied to every call. */
  defaults: RequestDefaults
  /** Default per-request output cap; explicit request values win. */
  maxTokens: number
  /** Positive context capacity used when the selected model has no exact value. */
  defaultContextWindow: number
  /** Advisory models exposed to discovery consumers; requests remain unrestricted. */
  models: readonly CodexCatalogModel[]
  /** Optional allow-list of model ids shown by discovery consumers; unset shows every catalog model. */
  enabledModels?: readonly string[]
  /** Value sent as the required `client_version` query parameter on `/models`. */
  clientVersion: string
  /** How long a successful live-catalog fetch is reused. */
  modelsCacheTtlMs: number
  /** Maximum provider idle time while one stream read is outstanding. */
  streamIdleTimeoutMs: number
  /** Provider-owned model-request retry policy, already resolved. */
  retryPolicy: ResolvedRetryPolicy
}

/** Constructor options for {@link CodexChatgptAdapter}. */
export interface CodexAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  options: () => CodexConnectionOptions
  /** The credential client for the current connection's auth file. */
  auth: () => CodexAuthClient
  /** The live model catalog; failures fall back to the configured catalog. */
  catalog: CodexModelCatalog
}

function modelInfo(provider: string, model: CodexCatalogModel): LlmModelInfo {
  return {
    provider,
    id: model.id,
    name: model.name ?? model.id,
    inputModalities: ['text'],
  }
}

function providerRetryAfterMs(value: string | null): number | undefined {
  if (value === null) return undefined
  if (/^\d+$/.test(value)) {
    const delay = Number(value) * 1_000
    return Number.isFinite(delay) && delay > 0 ? delay : undefined
  }
  const delay = Date.parse(value) - Date.now()
  return Number.isFinite(delay) && delay > 0 ? delay : undefined
}

function requestId(headers: Headers): ReturnType<typeof ProviderRequestId> | undefined {
  const value = headers.get('x-request-id')
  return value === null || value.length === 0 ? undefined : ProviderRequestId(value)
}

/**
 * Map an HTTP status plus parsed provider detail onto a stable LlmError code.
 * @param status - status of a non-2xx provider response.
 * @param detail - parsed provider error message/code/type, when available.
 * @returns the normalized harness error code.
 */
export function httpErrorCode(status: number, detail: string): string {
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 429 || status === 529) {
    if (isQuotaExceededError(detail)) return QUOTA_EXCEEDED_CODE
    return 'RATE_LIMIT'
  }
  if (status === 400) {
    if (isContextWindowExceededError(detail)) return CONTEXT_WINDOW_EXCEEDED_CODE
    return 'INVALID_REQUEST'
  }
  if (status >= 500) return 'SERVER'
  if (status === 402) return QUOTA_EXCEEDED_CODE
  return `HTTP_${status}`
}

/**
 * The ChatGPT Codex backend adapter. One instance serves every model name it
 * was registered under (the harness model name IS the wire model name).
 */
export class CodexChatgptAdapter extends LlmAdapter {
  constructor(private readonly config: CodexAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Codex' }
  }

  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy {
    return this.config.options().retryPolicy
  }

  /**
   * The live catalog when a fetch has succeeded, else undefined. Advisory
   * discovery must not surface a credential or network failure as a picker
   * error, so failures degrade to the configured catalog.
   */
  private async liveModels(): Promise<readonly CodexCatalogModel[] | undefined> {
    try {
      return await this.config.catalog.models()
    } catch {
      return undefined
    }
  }

  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const connection = this.config.options()
    const catalog = await this.liveModels() ?? connection.models
    const enabled = connection.enabledModels
    const visible = enabled === undefined ? catalog : catalog.filter(model => enabled.includes(model.id))
    return visible.map(model => modelInfo(provider, model))
  }

  override async resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const connection = this.config.options()
    const catalog = await this.liveModels() ?? connection.models
    const configured = catalog.find(entry => entry.id === model)
    // The model's own effort vocabulary wins; `off` is always selectable and
    // omits the reasoning field on the wire. The configured default applies
    // only when the model actually accepts it, then the model's own default,
    // then nothing (the runtime tolerates an absent default).
    const modelEfforts = configured?.efforts ?? FALLBACK_EFFORTS
    const efforts = [
      OFF_EFFORT_INFO,
      ...modelEfforts.map(effort => ({
        id: ReasoningEffortId(effort.id),
        name: effort.name ?? effortDisplayName(effort.id),
      })),
    ]
    const configuredDefault = connection.defaults.reasoningEffort
    const accepts = (id: string | undefined): id is string =>
      id !== undefined && modelEfforts.some(effort => effort.id === id)
    const modelDefault = configured?.defaultEffort
    const defaultEffort = configuredDefault === 'none'
      ? OFF_EFFORT
      : accepts(configuredDefault)
        ? ReasoningEffortId(configuredDefault)
        : accepts(modelDefault)
          ? ReasoningEffortId(modelDefault)
          : undefined
    return {
      ...configured === undefined
        ? { provider, id: model, name: model, inputModalities: ['text' as const] }
        : modelInfo(provider, configured),
      context: { contextWindow: configured?.contextWindow ?? connection.defaultContextWindow },
      defaultMaxTokens: configured?.maxTokens ?? connection.maxTokens,
      reasoning: {
        efforts,
        ...defaultEffort === undefined ? {} : { defaultEffort },
      },
    }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // One resolution per stream call: connection facts freeze here and hold
    // for this whole request, so an in-flight stream never observes a
    // configuration change and the next call re-resolves.
    const connection = this.config.options()
    const auth = this.config.auth()
    const consumer = new AbortController()
    const upstream = options.signal === undefined
      ? consumer.signal
      : AbortSignal.any([options.signal, consumer.signal])
    using watchdog = idleWatchdog(upstream, connection.streamIdleTimeoutMs, STREAM_IDLE_TIMEOUT_CODE)
    const iterator = this.request(
      options,
      watchdog.signal,
      connection,
      auth,
      () => { watchdog.pulse() },
    )[Symbol.asyncIterator]()
    let exhausted = false
    try {
      while (true) {
        const result = await watchdog.next(iterator)
        if (result.done) {
          exhausted = true
          return
        }
        yield result.value
      }
    } catch (error: unknown) {
      if (timeoutOf(watchdog.signal, STREAM_IDLE_TIMEOUT_CODE) !== undefined) {
        throw new LlmError(
          `Codex stream idle timeout after ${connection.streamIdleTimeoutMs}ms`,
          'TIMEOUT',
          { cause: error },
        )
      }
      if (options.signal?.aborted) {
        throw new LlmError('Codex request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError(`Codex API stream from ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    } finally {
      consumer.abort('Codex stream consumer stopped')
      if (!exhausted && iterator.return !== undefined) {
        try {
          await iterator.return()
        } catch (_abortedTransportTeardown) {
          // The consumer controller already owns termination; a return-time abort cannot add a second outcome.
        }
      }
    }
  }

  private async * request(
    options: GenerateOptions,
    signal: AbortSignal,
    connection: CodexConnectionOptions,
    auth: CodexAuthClient,
    onPulse: () => void,
  ): AsyncIterable<StreamChunk> {
    // Serialized outside the retry loop and the transport try: serialization
    // failures (unsupported fields) are request-shaping errors, not transport
    // failures, and must not be re-attempted after a 401.
    const payload = JSON.stringify(serializeRequest(options, connection.defaults))
    let tokens: CodexAuthTokens = await auth.tokens()
    for (let attempt = 1; ; attempt++) {
      let response: Response
      try {
        response = await fetch(`${connection.baseURL}/responses`, {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${tokens.accessToken}`,
            ...tokens.accountId === undefined ? {} : { 'chatgpt-account-id': tokens.accountId },
            'content-type': 'application/json',
            'accept': 'text/event-stream',
            'originator': CODEX_ORIGINATOR,
            ...attributionHeaders(),
          },
          body: payload,
          signal,
        })
      } catch (error: unknown) {
        // The outer stream distinguishes caller cancellation and watchdog expiry.
        if (signal.aborted) throw error
        throw new LlmError(
          `Codex API request to ${connection.baseURL} failed`,
          'TRANSPORT',
          { cause: error },
        )
      }
      if (response.status === 401 && attempt < MAX_AUTH_ATTEMPTS) {
        // One refresh-and-retry per stream, exactly like the Codex CLI.
        tokens = await auth.refresh()
        continue
      }
      if (!response.ok) {
        let message = `Codex API error (HTTP ${response.status})`
        let detail = ''
        try {
          const parsed = await response.json() as CodexWireError
          const providerError = parsed.error
          if (providerError?.message !== undefined && providerError.message.length > 0) {
            message = providerError.message
          }
          detail = [providerError?.code, providerError?.type, providerError?.message]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(' ')
        } catch {
          // Only swallow error-body parsing: the HTTP status still identifies the
          // failure, so malformed gateway JSON must not mask it.
        }
        const delay = providerRetryAfterMs(response.headers.get('retry-after'))
        const id = requestId(response.headers)
        throw new LlmError(message, httpErrorCode(response.status, detail), {
          status: response.status,
          ...delay === undefined ? {} : { providerRetryAfterMs: delay },
          ...id === undefined ? {} : { requestId: id },
        })
      }
      if (!response.body) {
        throw new LlmError('Codex API returned no response body', 'EMPTY_RESPONSE')
      }
      yield* translate(parseSse(response.body), onPulse)
      return
    }
  }
}
