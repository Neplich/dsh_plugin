/**
 * Same-origin fetch client for the config-skills host routes. Server error
 * bodies carry { error } and become the thrown Error's message.
 */
import type { RootsResponse, Scope, SkillReadResponse, SkillsResponse } from '../shared.ts'

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
    fetchJson('/config-skills/roots'),
  skills: (scope: Scope, root?: string): Promise<SkillsResponse> =>
    fetchJson('/config-skills/skills' + scopeQuery(scope, root)),
  readSkill: (scope: Scope, root: string | undefined, name: string): Promise<SkillReadResponse> => {
    const params = new URLSearchParams({ scope, name })
    if (scope === 'project' && root !== undefined) params.set('root', root)
    return fetchJson('/config-skills/skills/read?' + params.toString())
  },
}
