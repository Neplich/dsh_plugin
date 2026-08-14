/**
 * Same-origin fetch client for the config-instructions host routes. Server
 * error bodies carry { error } and become the thrown Error's message.
 */
import type { InstructionWriteRequest, InstructionsResponse, RootsResponse, Scope } from '../shared.ts'

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

/** Scope query string leg shared by the scoped routes. */
function scopeQuery(scope: Scope, root?: string): string {
  const params = new URLSearchParams({ scope })
  if (scope === 'project' && root !== undefined) params.set('root', root)
  return '?' + params.toString()
}

export const api = {
  roots: (): Promise<RootsResponse> =>
    fetchJson('/config-instructions/roots'),
  instructions: (scope: Scope, root?: string): Promise<InstructionsResponse> =>
    fetchJson('/config-instructions/instructions' + scopeQuery(scope, root)),
  writeInstruction: (body: InstructionWriteRequest): Promise<InstructionsResponse> =>
    fetchJson('/config-instructions/instructions/write', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
}
