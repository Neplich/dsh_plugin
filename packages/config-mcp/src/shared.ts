/**
 * Wire types shared between the host routes (src/server) and the browser
 * half (src/client). Type-only on the client side; every field is JSON.
 * @module @neplich/dsh-config-mcp/shared
 */

/** One MCP server's live + managed projection. */
export interface McpServerView {
  /** Loader entry id (e.g. mcp-github). */
  readonly id: string
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  /** One-line summary: command + args, or the URL. */
  readonly summary: string
  readonly enabled: boolean
  /** Live fiber phase; null when the entry has no fiber. */
  readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
  /** Currently registered mcp__<serverName>__* tool count. */
  readonly toolCount: number
  /** True when the home patch file owns a row for this id (full edit/delete). */
  readonly managed: boolean
}

/** GET mcp response. */
export interface McpListResponse {
  readonly servers: readonly McpServerView[]
  /** The home-level patch file this plugin writes. */
  readonly patchPath: string
}

/** Editable MCP server fields (create/update payloads). */
export interface McpServerInput {
  readonly serverName: string
  readonly transport: 'stdio' | 'streamable-http'
  readonly command?: string
  readonly args?: readonly string[]
  readonly env?: Readonly<Record<string, string>>
  readonly cwd?: string
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly toolCallTimeoutMs?: number
  readonly failOnStartupError?: boolean
}

/** POST mcp/create request body. */
export interface McpCreateRequest { readonly server: McpServerInput }

/** POST mcp/update request body. */
export interface McpUpdateRequest { readonly id: string, readonly server: McpServerInput }

/** POST mcp/state request body. */
export interface McpStateRequest { readonly id: string, readonly disabled: boolean }

/** Managed-row detail for the edit dialog (raw values from the patch file). */
export interface McpDetailResponse {
  readonly id: string
  readonly server: McpServerInput
  readonly disabled: boolean
}

/** Mutation responses carry the re-read list so the client can repaint. */
export interface McpMutationResponse {
  readonly ok: true
  readonly servers: readonly McpServerView[]
}
