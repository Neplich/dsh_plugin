/**
 * Same-origin API helpers for the work panel routes, plus the terminal
 * WebSocket URL builder.
 *
 * @module @neplich/dsh-web-workpanel/client/api
 */
import { ROUTES } from '../shared/protocol.ts'
import type { ListResponse, ReadResponse } from '../shared/protocol.ts'

/** Fetch JSON or throw with the server's own error text when it carried one. */
async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    let reason = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (typeof body.error === 'string') reason = body.error
    } catch {
      // A non-JSON error body keeps the status-line reason.
    }
    throw Object.assign(new Error(reason), { status: response.status })
  }
  return await response.json() as T
}

function query(session: string, path: string): URLSearchParams {
  return new URLSearchParams({ session, path })
}

/** List one workspace-relative directory. */
export function listDir(session: string, path: string, signal: AbortSignal): Promise<ListResponse> {
  return fetchJson<ListResponse>(`${ROUTES.list}?${query(session, path)}`, signal)
}

/** Read one workspace-relative text file. */
export function readFile(session: string, path: string, signal: AbortSignal): Promise<ReadResponse> {
  return fetchJson<ReadResponse>(`${ROUTES.read}?${query(session, path)}`, signal)
}

/** The inline-image URL for one workspace-relative file. */
export function rawUrl(session: string, path: string): string {
  return `${ROUTES.raw}?${query(session, path)}`
}

/** The terminal WebSocket URL for one session tab and initial geometry. */
export function terminalSocketUrl(session: string, terminal: string, cols: number, rows: number): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const params = new URLSearchParams({ session, terminal, cols: String(cols), rows: String(rows) })
  return `${protocol}://${location.host}${ROUTES.terminal}?${params}`
}

/** Close exactly one terminal work tab and its host PTY. */
export async function closeTerminal(session: string, terminal: string): Promise<void> {
  const params = new URLSearchParams({ session, terminal })
  const response = await fetch(`${ROUTES.terminalClose}?${params}`, { method: 'POST' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
}
