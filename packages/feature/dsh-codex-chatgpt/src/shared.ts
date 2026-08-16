/**
 * Wire types shared by the host HTTP routes (`/codex-chatgpt/*`) and the
 * Web GUI settings section. Lossless JSON only — no live dsh objects.
 * @module @neplich/dsh-codex-chatgpt/shared
 */

/** Auth-file state reported by the status route. */
export interface CodexAuthStatus {
  /** Whether the auth file holds usable ChatGPT tokens. */
  configured: boolean
  /** The signed-in ChatGPT account id, when recorded. */
  accountId?: string
  /** Access-token expiry as Unix milliseconds, when the token carries `exp`. */
  accessTokenExpiresAtMs?: number
}

/** Login-attempt state reported by the status and login routes. */
export interface CodexLoginReport {
  state: 'idle' | 'pending' | 'done' | 'error'
  /** The authorize URL while pending. */
  url?: string
  /** The signed-in account once done. */
  accountId?: string
  /** Failure detail once errored. */
  error?: string
}

/** `GET /codex-chatgpt/status` response. */
export interface CodexStatusResponse {
  auth: CodexAuthStatus
  login: CodexLoginReport
}

/** `POST /codex-chatgpt/login` response. */
export interface CodexLoginStartResponse {
  /** The authorize URL to open in a browser. */
  url: string
  /** The callback server's actual port. */
  port: number
  /** True when an earlier attempt is still waiting for its callback. */
  alreadyPending?: boolean
}

/** One reasoning effort in a model view. */
export interface CodexEffortView {
  id: string
  name?: string
  description?: string
}

/** One model in the `GET /codex-chatgpt/models` response. */
export interface CodexModelView {
  id: string
  name?: string
  description?: string
  contextWindow?: number
  efforts?: CodexEffortView[]
  defaultEffort?: string
}

/** `GET /codex-chatgpt/models` response. */
export interface CodexModelsViewResponse {
  models: CodexModelView[]
}

/** The section values `GET /codex-chatgpt/settings` returns. */
export interface CodexSettingsValues {
  baseURL?: string
  reasoningEffort?: string
  maxTokens?: number
  defaultContextWindow?: number
  enabledModels?: string[]
  clientVersion?: string
}

/** `GET /codex-chatgpt/settings` response. */
export interface CodexSettingsResponse {
  values: CodexSettingsValues
}

/** `POST /codex-chatgpt/settings` request body. */
export interface CodexSettingsMutation {
  set?: Record<string, unknown>
  unset?: string[]
}

/** Generic success body of the mutation routes. */
export interface CodexOkResponse {
  ok: boolean
  changed?: boolean
}
