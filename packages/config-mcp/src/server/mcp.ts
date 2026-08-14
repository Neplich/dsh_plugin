/**
 * MCP server management for the Config Center. The live view comes from
 * the Cordis Loader entries (every dsh-mcp-client instance, any source);
 * mutations edit the home-level patch file ($DSH_HOME/cordis.patch.yml)
 * with an AST-preserving YAML document so comments and unrelated rows
 * survive. The harness watches that file and HMR-reloads the composition,
 * so a save is a live disconnect/reconnect of the touched server.
 *
 * Management model: servers whose entry is an insert row in the home patch
 * are "managed" (full edit + delete). Servers from any other layer are
 * read-only here except for the enable/disable toggle, which writes a
 * minimal { id, disabled } override row (home patch applies last and wins).
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import { dshHome } from '@neplich/dsh-config-shared'
import type { McpDetailResponse, McpMutationResponse, McpServerInput, McpServerView } from '../shared.ts'

/** The dsh-mcp-client module name every MCP server entry uses. */
const MCP_MODULE = '@deepseek-ai/dsh-mcp-client'

/** Cordis FiberState numeric enum mirrored locally (cross-package const enum). */
const FIBER_PHASE: Record<number, McpServerView['fiberPhase']> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
}

/** Minimal structural face of a Loader entry this module reads. */
interface LoaderEntryLike {
  readonly id: string
  readonly disabled?: boolean
  readonly fiber?: { readonly state: number }
  readonly options: {
    readonly name?: unknown
    readonly config?: unknown
  }
}

/** Minimal structural face of the Loader service. */
interface LoaderLike {
  entries(): Iterable<LoaderEntryLike>
}

/** Minimal structural face of the tools registry (schema enumeration). */
interface ToolsLike {
  schemas(): readonly { readonly name: string }[]
}

/** The home-level patch file this plugin writes. */
export function homePatchPath(): string {
  return join(dshHome(), 'cordis.patch.yml')
}

/** Parse the home patch file; a missing file is an empty document. */
async function readPatchDoc(): Promise<Document> {
  let text: string
  try {
    text = await readFile(homePatchPath(), 'utf8')
  } catch {
    return new Document([])
  }
  const doc = parseDocument(text)
  if (!isSeq(doc.contents)) return new Document([])
  return doc
}

/** Atomically persist the patch document (temp file + rename). */
async function writePatchDoc(doc: Document): Promise<void> {
  const path = homePatchPath()
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.config-center-' + String(process.pid) + '.tmp'
  await writeFile(tmp, doc.toString(), 'utf8')
  await rename(tmp, path)
}

interface LocatedRow {
  /** Top-level sequence index of the row. */
  readonly rowIndex: number
  /** The entry map itself (insert-member or the top-level patch row). */
  readonly entry: YAMLMap
  /** Insert-row membership: the containing sequence and index inside it. */
  readonly insertSeq?: YAMLSeq
  readonly insertIndex?: number
}

/** Locate the home-patch row owning an entry id (insert member or id-targeted patch row). */
function locateRow(doc: Document, id: string): LocatedRow | undefined {
  if (!isSeq(doc.contents)) return undefined
  const items = doc.contents.items
  for (let rowIndex = 0; rowIndex < items.length; rowIndex++) {
    const row = items[rowIndex]
    if (!isMap(row)) continue
    if (row.get('id') === id) return { rowIndex, entry: row }
    const insert = row.get('insert')
    if (isSeq(insert)) {
      for (let insertIndex = 0; insertIndex < insert.items.length; insertIndex++) {
        const entry = insert.items[insertIndex]
        if (isMap(entry) && entry.get('id') === id) {
          return { rowIndex, entry, insertSeq: insert, insertIndex }
        }
      }
    }
  }
  return undefined
}

/** Every entry id the home patch file mentions. */
async function managedIds(): Promise<ReadonlySet<string>> {
  const doc = await readPatchDoc()
  const ids = new Set<string>()
  if (!isSeq(doc.contents)) return ids
  for (const row of doc.contents.items) {
    if (!isMap(row)) continue
    const id = row.get('id')
    if (typeof id === 'string') ids.add(id)
    const insert = row.get('insert')
    if (isSeq(insert)) {
      for (const entry of insert.items) {
        if (isMap(entry)) {
          const entryId = entry.get('id')
          if (typeof entryId === 'string') ids.add(entryId)
        }
      }
    }
  }
  return ids
}

/** Loader entries that are MCP client instances. */
function mcpEntries(ctx: Context): LoaderEntryLike[] {
  const loader = ctx.get('loader') as LoaderLike | undefined
  if (loader === undefined || loader === null) return []
  const out: LoaderEntryLike[] = []
  for (const entry of loader.entries()) {
    if (entry.options.name === MCP_MODULE) out.push(entry)
  }
  return out
}

/** One-line summary of an entry config: command + args, or the URL. */
function summarize(config: Record<string, unknown>): string {
  if (config.transport === 'stdio') {
    const command = typeof config.command === 'string' ? config.command : ''
    const args = Array.isArray(config.args) ? config.args.filter((a): a is string => typeof a === 'string') : []
    return [command, ...args].join(' ').trim()
  }
  return typeof config.url === 'string' ? config.url : ''
}

/** Count currently registered mcp__<serverName>__* tools. */
function toolCount(ctx: Context, serverName: string): number {
  const tools = ctx.get('tools') as ToolsLike | undefined
  if (tools === undefined || tools === null) return 0
  try {
    const prefix = 'mcp__' + serverName + '__'
    return tools.schemas().filter((schema) => schema.name.startsWith(prefix)).length
  } catch {
    return 0
  }
}

/** Read the live MCP server list, annotated with home-patch management state. */
export async function listMcpServers(ctx: Context): Promise<McpServerView[]> {
  const managed = await managedIds()
  const servers: McpServerView[] = []
  for (const entry of mcpEntries(ctx)) {
    const config = (entry.options.config ?? {}) as Record<string, unknown>
    const serverName = typeof config.serverName === 'string' ? config.serverName : entry.id
    servers.push({
      id: entry.id,
      serverName,
      transport: config.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
      summary: summarize(config),
      enabled: entry.disabled !== true,
      fiberPhase: entry.fiber === undefined ? null : (FIBER_PHASE[entry.fiber.state] ?? null),
      toolCount: toolCount(ctx, serverName),
      managed: managed.has(entry.id),
    })
  }
  servers.sort((a, b) => a.serverName.localeCompare(b.serverName))
  return servers
}

/** Validate a create/update payload; returns the entry config to persist. */
export function toEntryConfig(input: McpServerInput): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(input.serverName)) {
    throw new Error('serverName must match [A-Za-z0-9_-]{1,32}')
  }
  const config: Record<string, unknown> = {
    serverName: input.serverName,
    transport: input.transport,
  }
  if (input.transport === 'stdio') {
    if (typeof input.command !== 'string' || input.command.trim() === '') {
      throw new Error('stdio transport requires a command')
    }
    config.command = input.command
    if (input.args !== undefined && input.args.length > 0) config.args = [...input.args]
    if (input.env !== undefined && Object.keys(input.env).length > 0) config.env = { ...input.env }
    if (typeof input.cwd === 'string' && input.cwd !== '') config.cwd = input.cwd
  } else {
    if (typeof input.url !== 'string' || input.url.trim() === '') {
      throw new Error('streamable-http transport requires a url')
    }
    try { new URL(input.url) } catch { throw new Error('url is not a valid URL') }
    config.url = input.url
    if (input.headers !== undefined && Object.keys(input.headers).length > 0) config.headers = { ...input.headers }
  }
  if (input.toolCallTimeoutMs !== undefined) {
    if (!Number.isInteger(input.toolCallTimeoutMs) || input.toolCallTimeoutMs <= 0) {
      throw new Error('toolCallTimeoutMs must be a positive integer')
    }
    config.toolCallTimeoutMs = input.toolCallTimeoutMs
  }
  if (input.failOnStartupError === true) config.failOnStartupError = true
  return config
}

/** Create a managed server: one insert row appended to the home patch. */
export async function createMcpServer(ctx: Context, input: McpServerInput): Promise<McpMutationResponse> {
  const config = toEntryConfig(input)
  const id = 'mcp-' + input.serverName
  if (mcpEntries(ctx).some((entry) => entry.id === id)) {
    throw new Error('an entry with id ' + id + ' already exists')
  }
  const doc = await readPatchDoc()
  if (locateRow(doc, id) !== undefined) {
    throw new Error('the home patch already manages ' + id)
  }
  if (!isSeq(doc.contents)) throw new Error('the home patch is not a top-level array')
  doc.contents.items.push(doc.createNode({ insert: [{ id, name: MCP_MODULE, config }] }) as YAMLMap)
  await writePatchDoc(doc)
  return { ok: true, servers: await listMcpServers(ctx) }
}

/** Update a managed server: wholesale config replacement, matching patch semantics. */
export async function updateMcpServer(ctx: Context, id: string, input: McpServerInput): Promise<McpMutationResponse> {
  const config = toEntryConfig(input)
  const doc = await readPatchDoc()
  const located = locateRow(doc, id)
  if (located === undefined) {
    throw new Error('server ' + id + ' is not managed by the home patch; only managed servers can be edited')
  }
  const current = located.entry.toJSON() as Record<string, unknown>
  const currentName = typeof current.serverName === 'string' ? current.serverName : undefined
  const currentConfig = (current.config ?? {}) as Record<string, unknown>
  if (currentName !== undefined && typeof currentConfig.serverName === 'string' && currentConfig.serverName !== input.serverName) {
    throw new Error('renaming serverName is not supported; delete and re-create instead')
  }
  located.entry.set('config', doc.createNode(config))
  await writePatchDoc(doc)
  return { ok: true, servers: await listMcpServers(ctx) }
}

/** Enable/disable any server: managed rows flip in place, others get an override row. */
export async function setMcpServerState(ctx: Context, id: string, disabled: boolean): Promise<McpMutationResponse> {
  const doc = await readPatchDoc()
  const located = locateRow(doc, id)
  if (located !== undefined) {
    if (located.insertSeq !== undefined) {
      // Insert-row entry: toggle the disabled key on the entry itself.
      if (disabled) located.entry.set('disabled', true)
      else located.entry.delete('disabled')
    } else {
      // A bare override row whose only content is the toggle disappears on enable.
      const keys = located.entry.items.map((pair) => String(pair.key))
      const toggleOnly = keys.every((key) => key === 'id' || key === 'disabled')
      if (!disabled && toggleOnly && isSeq(doc.contents)) {
        doc.contents.items.splice(located.rowIndex, 1)
      } else if (disabled) {
        located.entry.set('disabled', true)
      } else {
        located.entry.set('disabled', false)
      }
    }
  } else {
    if (!disabled) {
      throw new Error('server ' + id + ' is not disabled here; nothing to enable')
    }
    if (!isSeq(doc.contents)) throw new Error('the home patch is not a top-level array')
    doc.contents.items.push(doc.createNode({ id, disabled: true }) as YAMLMap)
  }
  await writePatchDoc(doc)
  return { ok: true, servers: await listMcpServers(ctx) }
}

/** Delete a managed server: remove its entry (and the row when it becomes empty). */
export async function deleteMcpServer(ctx: Context, id: string): Promise<McpMutationResponse> {
  const doc = await readPatchDoc()
  const located = locateRow(doc, id)
  if (located === undefined) {
    throw new Error('server ' + id + ' is not managed by the home patch; only managed servers can be deleted')
  }
  if (!isSeq(doc.contents)) throw new Error('the home patch is not a top-level array')
  if (located.insertSeq !== undefined && located.insertIndex !== undefined) {
    located.insertSeq.items.splice(located.insertIndex, 1)
    if (located.insertSeq.items.length === 0) doc.contents.items.splice(located.rowIndex, 1)
  } else {
    doc.contents.items.splice(located.rowIndex, 1)
  }
  await writePatchDoc(doc)
  return { ok: true, servers: await listMcpServers(ctx) }
}

/** Raw managed-row detail for the edit dialog (straight from the patch document). */
export async function mcpServerDetail(id: string): Promise<McpDetailResponse> {
  const doc = await readPatchDoc()
  const located = locateRow(doc, id)
  if (located === undefined) {
    throw new Error('server ' + id + ' is not managed by the home patch')
  }
  const row = located.entry.toJSON() as Record<string, unknown>
  const config = (row.config ?? {}) as Record<string, unknown>
  const server: McpServerInput = {
    serverName: typeof config.serverName === 'string' ? config.serverName : id,
    transport: config.transport === 'streamable-http' ? 'streamable-http' : 'stdio',
    ...(typeof config.command === 'string' ? { command: config.command } : {}),
    ...(Array.isArray(config.args) ? { args: config.args.filter((a): a is string => typeof a === 'string') } : {}),
    ...(config.env !== null && typeof config.env === 'object' && !Array.isArray(config.env) ? { env: config.env as Record<string, string> } : {}),
    ...(typeof config.cwd === 'string' ? { cwd: config.cwd } : {}),
    ...(typeof config.url === 'string' ? { url: config.url } : {}),
    ...(config.headers !== null && typeof config.headers === 'object' && !Array.isArray(config.headers) ? { headers: config.headers as Record<string, string> } : {}),
    ...(typeof config.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: config.toolCallTimeoutMs } : {}),
    ...(config.failOnStartupError === true ? { failOnStartupError: true } : {}),
  }
  return { id, server, disabled: row.disabled === true }
}