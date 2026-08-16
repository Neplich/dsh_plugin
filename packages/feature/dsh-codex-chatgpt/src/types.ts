/**
 * Wire types for the ChatGPT Codex Responses backend and the Codex CLI auth
 * file. Everything here is lossless JSON crossing the provider boundary —
 * no live dsh objects, no secrets beyond the credential fields they describe.
 * @module @neplich/dsh-codex-chatgpt/types
 */

/** The `tokens` object the Codex CLI writes into `~/.codex/auth.json`. */
export interface CodexAuthTokensFile {
  /** ChatGPT OAuth id token (JWT, carries plan/account claims). */
  id_token?: string
  /** Bearer token sent to the chatgpt.com backend. */
  access_token?: string
  /** Refresh token exchanged at auth.openai.com for new tokens. */
  refresh_token?: string
  /** Unix milliseconds of the last refresh, when the CLI recorded one. */
  last_refresh?: number
  /** ChatGPT account id sent as the `ChatGPT-Account-ID` header. */
  account_id?: string
}

/** The top-level `~/.codex/auth.json` shape (other fields are preserved verbatim). */
export interface CodexAuthFile {
  /** Legacy API key slot; the ChatGPT flow leaves it unset. */
  OPENAI_API_KEY?: string | null
  /** ChatGPT OAuth tokens. */
  tokens?: CodexAuthTokensFile
}

/** Validated credentials the adapter actually sends. */
export interface CodexAuthTokens {
  accessToken: string
  refreshToken: string
  accountId?: string
}

/** Auth0 token-exchange response for `grant_type=refresh_token`. */
export interface CodexRefreshResponse {
  id_token?: string
  access_token?: string
  refresh_token?: string
}

/** One `data:` payload from the Codex Responses SSE stream. */
export interface CodexSseEvent {
  type?: string
  [key: string]: unknown
}

/** `usage` reported on the completed response. */
export interface CodexWireUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  /** Present on some plans; may itself carry `reasoning_tokens`. */
  reasoning_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

/** Provider error body: `{"error": {"message", "code", "type", ...}}`. */
export interface CodexWireError {
  error?: {
    message?: string
    code?: string
    type?: string
  }
}

/** One reasoning level entry in the `GET {baseURL}/models` response. */
export interface CodexWireReasoningLevel {
  /** Wire effort id (`low` … `ultra`). */
  effort?: string
  /** Provider-written user-facing description. */
  description?: string
}

/**
 * One model entry in the `GET {baseURL}/models` response. Only the fields
 * this plugin consumes are typed; the backend adds plan-specific extras.
 */
export interface CodexWireModel {
  /** Wire model id sent as `model` on `/responses`. */
  slug?: string
  /** Selector label. */
  display_name?: string
  /** Selector detail. */
  description?: string
  /** Combined request/response context capacity. */
  context_window?: number
  /** `list` entries are user-visible; `hide` entries are routing aliases. */
  visibility?: string
  /** Whether the model answers on the Responses endpoint this plugin calls. */
  supported_in_api?: boolean
  /** Provider-chosen reasoning effort when the request names none. */
  default_reasoning_level?: string
  /** Reasoning efforts the model accepts, cheapest first. */
  supported_reasoning_levels?: CodexWireReasoningLevel[]
}

/** Top-level `GET {baseURL}/models` response body. */
export interface CodexModelsResponse {
  models?: CodexWireModel[]
}
