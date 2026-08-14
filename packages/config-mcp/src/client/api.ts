/**
 * Same-origin fetch client for the config-mcp host routes. Server error
 * bodies carry { error } and become the thrown Error's message.
 */
import type {
  McpCreateRequest, McpDetailResponse, McpListResponse, McpMutationResponse,
  McpStateRequest, McpUpdateRequest,
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
  mcp: (): Promise<McpListResponse> =>
    fetchJson('/config-mcp/mcp'),
  mcpDetail: (id: string): Promise<McpDetailResponse> =>
    fetchJson('/config-mcp/mcp/detail?id=' + encodeURIComponent(id)),
  mcpCreate: (body: McpCreateRequest): Promise<McpMutationResponse> =>
    postJson('/config-mcp/mcp/create', body),
  mcpUpdate: (body: McpUpdateRequest): Promise<McpMutationResponse> =>
    postJson('/config-mcp/mcp/update', body),
  mcpState: (body: McpStateRequest): Promise<McpMutationResponse> =>
    postJson('/config-mcp/mcp/state', body),
  mcpDelete: (id: string): Promise<McpMutationResponse> =>
    fetchJson('/config-mcp/mcp?id=' + encodeURIComponent(id), { method: 'DELETE' }),
}
