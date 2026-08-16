/**
 * Register a {@link CodexChatgptAdapter} for the `codex-chatgpt` provider
 * route on `ctx.llm`, with connection facts resolved per request instead of
 * frozen at load: the plugin layers its `cordis.yml` entry config under the
 * optional `codex-chatgpt` user-settings section (`ctx.settings`) and resolves
 * ChatGPT credentials through the Codex CLI auth file, so a changed auth path,
 * base URL, catalog, or reasoning effort reaches the very next request
 * without restarting anything, while an in-flight stream keeps the facts it
 * started with. The one registration-captured fact — the retry policy —
 * re-registers the route in place when it changes.
 *
 * Credentials come from `~/.codex/auth.json` (or a configured `authJsonPath`).
 * Sign in either with the official Codex CLI (`codex login`) or through this
 * plugin's Web GUI section, which runs the same PKCE flow and writes the
 * same file. The adapter refreshes the access token through the same Auth0
 * endpoint the Codex CLI uses and writes the new tokens back.
 *
 * The advertised model catalog comes from the backend's live
 * `GET {baseURL}/models` list (cached briefly) whenever credentials allow,
 * falling back to the configured `models` catalog; each live model carries
 * its own supported reasoning efforts, which the adapter advertises per
 * model so the composer's picker offers exactly what the backend accepts.
 *
 * When a Web GUI server is present (`ctx.webServer`), the plugin also mounts
 * loopback HTTP routes backing its settings section:
 *
 *   GET  /codex-chatgpt/status    Auth and login state
 *   POST /codex-chatgpt/login     Start a PKCE login (returns the authorize URL)
 *   GET  /codex-chatgpt/login     Poll the running attempt's state
 *   POST /codex-chatgpt/logout    Remove the ChatGPT tokens from the auth file
 *   GET  /codex-chatgpt/models    Force-refresh the live model catalog
 *   GET  /codex-chatgpt/settings  Resolved section values the section edits
 *   POST /codex-chatgpt/settings  Mutate whitelisted section fields
 *
 * @module @neplich/dsh-codex-chatgpt
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { resolveRetryPolicy, RetryPolicySchema } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest, RetryPolicyConfig } from '@deepseek-ai/dsh-llm'
import { deepEqualJson, installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import { MAX_TIMER_DELAY_MS } from '@deepseek-ai/dsh-timeout'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { preflight, readJsonBody, send } from '@neplich/dsh-config-shared'
import {
  CodexChatgptAdapter,
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './adapter.ts'
import type { CodexCatalogEffort, CodexCatalogModel, CodexConnectionOptions } from './adapter.ts'
import { clearAuthTokens, CodexAuthClient, readAuthFile, tokenExpiryMs } from './auth.ts'
import { DEFAULT_LOGIN_PORT, DEFAULT_LOGIN_TIMEOUT_MS, startCodexLogin } from './login.ts'
import type { CodexLoginHandle } from './login.ts'
import { CodexModelCatalog } from './models.ts'
import type { CodexReasoningEffort } from './serialize.ts'
import type {
  CodexAuthStatus,
  CodexLoginReport,
  CodexSettingsMutation,
} from './shared.ts'

export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  CodexChatgptAdapter,
} from './adapter.ts'
export type { CodexAdapterOptions, CodexCatalogEffort, CodexCatalogModel, CodexConnectionOptions } from './adapter.ts'
export type { RequestDefaults } from './serialize.ts'
export { CodexAuthClient, parseAuthTokens, readAuthFile, tokenStillFresh, writeAuthFile } from './auth.ts'
export {
  accountIdFromIdToken,
  buildAuthorizeUrl,
  DEFAULT_ISSUER,
  DEFAULT_LOGIN_PORT,
  DEFAULT_LOGIN_TIMEOUT_MS,
  startCodexLogin,
} from './login.ts'
export type { CodexLoginHandle, CodexLoginOptions, CodexLoginResult } from './login.ts'
export { CODEX_ORIGINATOR, CodexModelCatalog, effortDisplayName, mapWireModels } from './models.ts'
export type { CodexModelCatalogConnection, CodexModelCatalogOptions } from './models.ts'
export type * from './types.ts'

export const name = 'codex-chatgpt'
export const inject = ['llm']

const NS = settingsNamespace('codex-chatgpt')
/** The single provider route this plugin owns. */
const PROVIDER = 'codex-chatgpt'

/** The ChatGPT Codex Responses backend the Codex CLI talks to. */
export const PUBLIC_BASE_URL = 'https://chatgpt.com/backend-api/codex'

/** Default Codex CLI auth file: `$CODEX_HOME/auth.json`, else `~/.codex/auth.json`. */
export const DEFAULT_AUTH_JSON_PATH = join(
  process.env.CODEX_HOME ?? join(homedir(), '.codex'),
  'auth.json',
)

/** The `client_version` sent on `/models` when none is configured. */
export const DEFAULT_CLIENT_VERSION = '0.147.0'
/** Default live-catalog reuse window. */
export const DEFAULT_MODELS_CACHE_TTL_MS = 3_600_000

const DEFAULT_MODELS: CodexCatalogModel[] = [
  // Fallback catalog for discovery while the live list is unreachable (no
  // credentials yet, offline); the live `/models` list replaces it whenever
  // a fetch succeeds. Fully configurable.
  { id: 'gpt-5.6-sol', name: 'GPT-5.6-Sol', contextWindow: 272_000 },
  { id: 'gpt-5.5', name: 'GPT-5.5', contextWindow: 272_000 },
  { id: 'gpt-5.4', name: 'GPT-5.4', contextWindow: 272_000 },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4-Mini', contextWindow: 272_000 },
]

/**
 * Plugin config, validated by the same-named schemastery schema and doubling
 * as the `codex-chatgpt` settings-section shape. Every field is optional in
 * yml: a missing auth file fails per request with `MISSING_CREDENTIAL` (not
 * at plugin load), and omitted defaults follow the Codex CLI conventions.
 */
export interface Config {
  /** Absolute path of the Codex CLI auth file (default `~/.codex/auth.json`, honoring `CODEX_HOME`). */
  authJsonPath?: string
  /** Endpoint base; `/responses` and `/models` are appended (default the ChatGPT Codex backend). */
  baseURL?: string
  /** Default reasoning effort; `none` omits the field per request. Unset uses each model's own default. */
  reasoningEffort?: CodexReasoningEffort
  /** Default per-request output cap (default 64,000); a model's own cap and explicit request values win. */
  maxTokens?: number
  /** Positive context capacity used when the selected model has no exact value (default 400,000). */
  defaultContextWindow?: number
  /** Fallback models shown by discovery consumers while the live list is unreachable. */
  models?: CodexCatalogModel[]
  /** Optional allow-list of model ids shown by discovery consumers; unset shows every catalog model. */
  enabledModels?: string[]
  /** `client_version` query value the `/models` endpoint requires (default a recent Codex CLI version). */
  clientVersion?: string
  /** How long a successful live-catalog fetch is reused (default one hour). */
  modelsCacheTtlMs?: number
  /** Preferred PKCE login callback port (default 1455); an occupied port falls back to ephemeral. */
  loginPort?: number
  /** How long one login attempt waits for the browser callback (default ten minutes). */
  loginTimeoutMs?: number
  /** Maximum provider idle time while one stream read is outstanding (default five minutes). */
  streamIdleTimeoutMs?: number
  /** Provider-owned model-request retry policy; omission uses normal defaults. */
  retryPolicy?: RetryPolicyConfig
}

const catalogEffort: z<CodexCatalogEffort> = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
})

const catalogModel = z.object({
  id: z.string().required(),
  name: z.string(),
  description: z.string(),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  efforts: z.array(catalogEffort),
  defaultEffort: z.string(),
}) as unknown as z<CodexCatalogModel>

const REASONING_EFFORT_VALUES = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'] as const

export const Config: z<Config> = z.object({
  authJsonPath: z.string().default(DEFAULT_AUTH_JSON_PATH),
  baseURL: z.string().default(PUBLIC_BASE_URL),
  reasoningEffort: z.union(REASONING_EFFORT_VALUES),
  maxTokens: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_TOKENS),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
  models: z.array(catalogModel).default(DEFAULT_MODELS),
  enabledModels: z.array(z.string()),
  clientVersion: z.string().default(DEFAULT_CLIENT_VERSION),
  modelsCacheTtlMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_MODELS_CACHE_TTL_MS),
  loginPort: z.number().step(1).min(0).max(65535).default(DEFAULT_LOGIN_PORT),
  loginTimeoutMs: z.number().min(1_000).max(MAX_TIMER_DELAY_MS).default(DEFAULT_LOGIN_TIMEOUT_MS),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
  retryPolicy: RetryPolicySchema,
})

/** Validate one configured effort list entry set. */
function resolveEfforts(modelId: string, efforts: readonly CodexCatalogEffort[] | undefined): CodexCatalogEffort[] | undefined {
  if (efforts === undefined) return undefined
  const seen = new Set<string>()
  return efforts.map((effort) => {
    if (effort.id.length === 0) throw new Error(`codex-chatgpt: catalog model "${modelId}" has an empty effort id`)
    if (effort.name !== undefined && effort.name.length === 0) {
      throw new Error(`codex-chatgpt: catalog model "${modelId}" effort "${effort.id}" has an empty name`)
    }
    if (seen.has(effort.id)) throw new Error(`codex-chatgpt: catalog model "${modelId}" duplicates effort "${effort.id}"`)
    seen.add(effort.id)
    return {
      id: effort.id,
      ...effort.name === undefined ? {} : { name: effort.name },
      ...effort.description === undefined ? {} : { description: effort.description },
    }
  })
}

/** Resolve, validate, and detach the advisory model catalog. */
function resolveModels(models: readonly CodexCatalogModel[] | undefined): CodexCatalogModel[] {
  const seen = new Set<string>()
  return (models ?? DEFAULT_MODELS).map((model) => {
    if (model.id.length === 0) throw new Error('codex-chatgpt: catalog model ids must be non-empty')
    if (model.name !== undefined && model.name.length === 0) {
      throw new Error(`codex-chatgpt: catalog model "${model.id}" has an empty name`)
    }
    if (model.contextWindow !== undefined
      && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(
        `codex-chatgpt: catalog model "${model.id}" contextWindow must be a positive integer`,
      )
    }
    if (model.maxTokens !== undefined
      && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      throw new Error(
        `codex-chatgpt: catalog model "${model.id}" maxTokens must be a positive integer`,
      )
    }
    if (seen.has(model.id)) throw new Error(`codex-chatgpt: duplicate catalog model "${model.id}"`)
    seen.add(model.id)
    const efforts = resolveEfforts(model.id, model.efforts)
    if (model.defaultEffort !== undefined) {
      if (model.defaultEffort.length === 0) {
        throw new Error(`codex-chatgpt: catalog model "${model.id}" has an empty defaultEffort`)
      }
      if (efforts !== undefined && !efforts.some(effort => effort.id === model.defaultEffort)) {
        throw new Error(
          `codex-chatgpt: catalog model "${model.id}" defaultEffort "${model.defaultEffort}" is not one of its efforts`,
        )
      }
    }
    return {
      id: model.id,
      ...model.name === undefined ? {} : { name: model.name },
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
      ...efforts === undefined ? {} : { efforts },
      ...model.defaultEffort === undefined ? {} : { defaultEffort: model.defaultEffort },
    }
  })
}

/**
 * The one explicit resolve step from raw config to validated connection
 * facts. Programmatic construction may bypass Schemastery normalization, so
 * every default and bound is re-judged here — for the composition entry at
 * load (fail loud) and for each settings snapshot at its first use.
 * @param config - raw plugin config or resolved settings snapshot.
 * @returns validated connection facts.
 */
export function resolveAdapterOptions(config: Config): CodexConnectionOptions {
  if (config.defaultContextWindow !== undefined
    && (!Number.isInteger(config.defaultContextWindow) || config.defaultContextWindow <= 0)) {
    throw new Error('codex-chatgpt: defaultContextWindow must be a positive integer')
  }
  if (config.maxTokens !== undefined
    && (!Number.isSafeInteger(config.maxTokens) || config.maxTokens <= 0)) {
    throw new Error('codex-chatgpt: maxTokens must be a positive safe integer')
  }
  const streamIdleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS
  if (!Number.isFinite(streamIdleTimeoutMs)
    || streamIdleTimeoutMs <= 0
    || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `codex-chatgpt: streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  const modelsCacheTtlMs = config.modelsCacheTtlMs ?? DEFAULT_MODELS_CACHE_TTL_MS
  if (!Number.isFinite(modelsCacheTtlMs) || modelsCacheTtlMs <= 0 || modelsCacheTtlMs > MAX_TIMER_DELAY_MS) {
    throw new Error(
      `codex-chatgpt: modelsCacheTtlMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`,
    )
  }
  if (config.authJsonPath !== undefined && config.authJsonPath.length === 0) {
    throw new Error('codex-chatgpt: authJsonPath must be a non-empty path')
  }
  if (config.clientVersion !== undefined && config.clientVersion.length === 0) {
    throw new Error('codex-chatgpt: clientVersion must be a non-empty version string')
  }
  const enabledModels = config.enabledModels?.map((id) => {
    if (id.length === 0) throw new Error('codex-chatgpt: enabledModels entries must be non-empty')
    return id
  })
  return {
    baseURL: config.baseURL ?? PUBLIC_BASE_URL,
    authJsonPath: config.authJsonPath ?? DEFAULT_AUTH_JSON_PATH,
    defaults: {
      ...config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort },
    },
    maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
    defaultContextWindow: config.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    models: resolveModels(config.models),
    ...enabledModels === undefined ? {} : { enabledModels },
    clientVersion: config.clientVersion ?? DEFAULT_CLIENT_VERSION,
    modelsCacheTtlMs,
    streamIdleTimeoutMs,
    retryPolicy: resolveRetryPolicy(config.retryPolicy, 'codex-chatgpt: retryPolicy'),
  }
}

/** Section fields the Web GUI settings section may mutate. */
const MUTABLE_SETTINGS_KEYS = new Set([
  'baseURL',
  'reasoningEffort',
  'maxTokens',
  'defaultContextWindow',
  'models',
  'enabledModels',
  'clientVersion',
])

/** Discover the signed-in account's current Codex models for dsh configuration surfaces. */
export async function discoverCodexModels(
  catalog: CodexModelCatalog,
  request: LlmModelDiscoveryRequest,
): Promise<readonly LlmDiscoveredModel[]> {
  if (request.provider !== undefined && request.provider !== PROVIDER) {
    throw new Error(`codex-chatgpt: cannot discover models for provider "${request.provider}"`)
  }
  const models = await catalog.refresh(request.signal)
  return models.map(model => ({
    id: model.id,
    ...model.name === undefined ? {} : { name: model.name },
    ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
    ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
  }))
}

export function apply(ctx: Context, config: Config): void {
  let current: () => Config = () => config
  let lastRaw: Config | undefined
  let lastGood: CodexConnectionOptions | undefined
  const options = (): CodexConnectionOptions => {
    const raw = current()
    if (raw === lastRaw && lastGood !== undefined) return lastGood
    try {
      const next = resolveAdapterOptions(raw)
      lastRaw = raw
      lastGood = next
      return next
    } catch (error) {
      // Static composition resolves before anything registers, so this branch
      // only sees a live settings snapshot failing a beyond-schema bound:
      // keep serving the last good facts and say so once per bad snapshot.
      if (lastGood === undefined) throw error
      lastRaw = raw
      ctx.logger.error('codex-chatgpt: keeping the last good configuration after an invalid settings section')
      ctx.logger.error(error)
      return lastGood
    }
  }
  options()

  // One credential client per auth file path, so a settings change that moves
  // the path starts a fresh client instead of reusing another file's tokens.
  const authClients = new Map<string, CodexAuthClient>()
  const auth = (): CodexAuthClient => {
    const path = options().authJsonPath
    let client = authClients.get(path)
    if (client === undefined) {
      client = new CodexAuthClient({
        authJsonPath: path,
        warn: (message) => { ctx.logger.warn(message) },
      })
      authClients.set(path, client)
    }
    return client
  }

  const catalog = new CodexModelCatalog({
    connection: () => {
      const resolved = options()
      return {
        baseURL: resolved.baseURL,
        clientVersion: resolved.clientVersion,
        modelsCacheTtlMs: resolved.modelsCacheTtlMs,
      }
    },
    auth,
    warn: (message) => { ctx.logger.warn(message) },
  })

  const adapter = new CodexChatgptAdapter({ options, auth, catalog })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'Codex', settingsNs: NS, settingsPath: [] },
  ])
  ctx.llm.registerModelDiscovery(NS, request => discoverCodexModels(catalog, request))
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    const policy = options().retryPolicy
    if (deepEqualJson(policy, registeredPolicy)) return
    // The registry captures the retry policy at registration, so it is the one
    // fact per-request resolution cannot refresh. `replace` re-reads it in one
    // synchronous registry section: disposing and re-registering instead would
    // publish an empty route set between the two, and an observer that reacted
    // to it would see this provider disappear and come back.
    registration.replace([PROVIDER])
    registeredPolicy = policy
  }

  ctx.effect(() => () => {
    authClients.clear()
  }, 'codex-chatgpt: auth clients')

  installSettingsSection(ctx, NS, Config, config, {
    setSource: (source) => {
      current = source
    },
    onChange: ensureRegistrationFacts,
  })

  // The Web GUI server is composed after LLM adapters in the stock web
  // profile. Register these routes when that optional service appears; a
  // headless profile simply leaves this child fiber unresolved.
  ctx.inject(['webServer'], (webCtx: Context) => {
    const webServer = webCtx.webServer

  /** Single-flight login attempt shared by the login routes. */
  let login: { handle: CodexLoginHandle; report: CodexLoginReport } | undefined

  const authStatus = async (): Promise<CodexAuthStatus> => {
    try {
      const auth = await readAuthFile(options().authJsonPath)
      if (auth === undefined) return { configured: false }
      const { tokens } = auth
      const accessTokenExpiresAtMs = tokenExpiryMs(tokens.accessToken)
      return {
        configured: true,
        ...tokens.accountId === undefined ? {} : { accountId: tokens.accountId },
        ...accessTokenExpiresAtMs === undefined ? {} : { accessTokenExpiresAtMs },
      }
    } catch {
      return { configured: false }
    }
  }

    webCtx.effect(() => webServer.register({
    kind: 'exact',
    path: '/codex-chatgpt/status',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        send(res, 200, {
          auth: await authStatus(),
          login: login?.report ?? { state: 'idle' },
        })
      } catch (error) {
        send(res, 500, { error: String(error) })
      }
    },
  }), 'codex-chatgpt: status route')

    webCtx.effect(() => webServer.register({
    kind: 'exact',
    path: '/codex-chatgpt/login',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      if (req.method === 'GET') {
        send(res, 200, login?.report ?? { state: 'idle' })
        return
      }
      try {
        if (login !== undefined && login.report.state === 'pending') {
          send(res, 200, { url: login.handle.url, port: login.handle.port, alreadyPending: true })
          return
        }
        login?.handle.cancel('codex-chatgpt: superseded by a new login attempt')
        const resolved = options()
        const raw = current()
        const handle = await startCodexLogin({
          authJsonPath: resolved.authJsonPath,
          ...raw.loginPort === undefined ? {} : { port: raw.loginPort },
          ...raw.loginTimeoutMs === undefined ? {} : { timeoutMs: raw.loginTimeoutMs },
        })
        const report: CodexLoginReport = { state: 'pending', url: handle.url }
        login = { handle, report }
        void handle.done.then(
          (result) => {
            report.state = 'done'
            delete report.url
            if (result.accountId !== undefined) report.accountId = result.accountId
            // The pre-login failure backoff must not hide the fresh credentials.
            catalog.reset()
          },
          (error: Error) => {
            report.state = 'error'
            delete report.url
            report.error = error.message
          },
        )
        send(res, 200, { url: handle.url, port: handle.port })
      } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'codex-chatgpt: login route')

    webCtx.effect(() => webServer.register({
    kind: 'exact',
    path: '/codex-chatgpt/logout',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        await clearAuthTokens(options().authJsonPath)
        authClients.clear()
        send(res, 200, { ok: true })
      } catch (error) {
        send(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'codex-chatgpt: logout route')

    webCtx.effect(() => webServer.register({
    kind: 'exact',
    path: '/codex-chatgpt/models',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        const models = await catalog.refresh()
        send(res, 200, { models })
      } catch (error) {
        send(res, 502, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), 'codex-chatgpt: models route')

    webCtx.effect(() => webServer.register({
    kind: 'exact',
    path: '/codex-chatgpt/settings',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      if (req.method === 'GET') {
        try {
          const resolved = current()
          send(res, 200, {
            values: {
              baseURL: resolved.baseURL,
              ...resolved.reasoningEffort === undefined ? {} : { reasoningEffort: resolved.reasoningEffort },
              maxTokens: resolved.maxTokens,
              defaultContextWindow: resolved.defaultContextWindow,
              ...resolved.enabledModels === undefined ? {} : { enabledModels: resolved.enabledModels },
              clientVersion: resolved.clientVersion,
            },
          })
        } catch (error) {
          send(res, 500, { error: String(error) })
        }
        return
      }
      try {
        const settings = webCtx.get('settings')
        if (settings === undefined) {
          send(res, 503, { error: 'settings service is not available in this profile' })
          return
        }
        const body = await readJsonBody<CodexSettingsMutation>(req, 256 * 1024)
        const ops: SettingsPathOp[] = []
        for (const [key, value] of Object.entries(body.set ?? {})) {
          if (!MUTABLE_SETTINGS_KEYS.has(key)) throw new Error(`field "${key}" is not editable here`)
          ops.push({ op: 'set', path: [key], value })
        }
        for (const key of body.unset ?? []) {
          if (!MUTABLE_SETTINGS_KEYS.has(key)) throw new Error(`field "${key}" is not editable here`)
          ops.push({ op: 'unset', path: [key] })
        }
        if (ops.length === 0) {
          send(res, 200, { ok: true, changed: false })
          return
        }
        await settings.mutate(NS, ops)
        send(res, 200, { ok: true, changed: true })
      } catch (error) {
        send(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
    }), 'codex-chatgpt: settings route')
  })
}
