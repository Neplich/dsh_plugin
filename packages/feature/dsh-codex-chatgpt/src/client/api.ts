/**
 * Same-origin fetch client for the codex-chatgpt host routes. Server error
 * bodies carry { error } and become the thrown Error's message.
 */
import type {
  CodexLoginReport,
  CodexLoginStartResponse,
  CodexModelsViewResponse,
  CodexOkResponse,
  CodexSettingsMutation,
  CodexSettingsResponse,
  CodexStatusResponse,
} from '../shared.ts'

/** Fetch JSON or throw with the server's own error text when it carried one. */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    let reason = 'HTTP ' + String(response.status)
    try {
      const body = await response.json() as { error?: string }
      if (typeof body.error === 'string') reason = body.error
    } catch {
      // A non-JSON error body keeps the status-line reason.
    }
    throw new Error(reason)
  }
  return await response.json() as T
}

/** POST a JSON body and read the JSON response. */
function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export const api = {
  status: (): Promise<CodexStatusResponse> =>
    fetchJson('/codex-chatgpt/status'),
  loginStart: (): Promise<CodexLoginStartResponse> =>
    postJson('/codex-chatgpt/login', {}),
  loginState: (): Promise<CodexLoginReport> =>
    fetchJson('/codex-chatgpt/login'),
  logout: (): Promise<CodexOkResponse> =>
    postJson('/codex-chatgpt/logout', {}),
  models: (): Promise<CodexModelsViewResponse> =>
    fetchJson('/codex-chatgpt/models'),
  settings: (): Promise<CodexSettingsResponse> =>
    fetchJson('/codex-chatgpt/settings'),
  saveSettings: (mutation: CodexSettingsMutation): Promise<CodexOkResponse> =>
    postJson('/codex-chatgpt/settings', mutation),
}
