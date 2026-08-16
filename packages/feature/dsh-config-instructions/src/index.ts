/**
 * Instructions settings section plugin, host half: loopback HTTP routes on
 * the Web GUI server backing the 指令文档 settings section.
 *
 *   GET /config-instructions/roots
 *       Project roots derived from the workspace registry (durable order).
 *   GET /config-instructions/instructions?scope=<personal|project>&root=<path>
 *       The level's AGENTS.md / AGENTS.local.md / CLAUDE.md files.
 *   PUT /config-instructions/instructions/write
 *       Atomic write of one writable instruction file (base/local only).
 *
 * Every route is origin-fenced; project-scoped reads/writes validate the
 * root against the workspace registry, and every file path is derived
 * server-side — the client never supplies one.
 *
 * @module @neplich/dsh-config-instructions
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { isKnownRoot, listRoots, preflight, readJsonBody, send } from '@neplich/dsh-config-shared'
import { listInstructions, writeInstruction } from './server/instructions.ts'
import type { InstructionWriteRequest, Scope } from './shared.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'config-instructions'

/**
 * This plugin registers routes on the Web GUI server; compose it in a
 * `dsh web` profile only — a profile without ctx.webServer leaves the
 * fiber waiting on the injection.
 */
export const inject = ['webServer']

/** Deployment-tunable bounds. Invalid values fail plugin load. */
export interface Config {
  /** Maximum bytes read per instruction file (and per write). */
  maxFileBytes: number
  /** Maximum JSON mutation body size in bytes. */
  maxBodyBytes: number
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  maxFileBytes: Schema.natural().default(512 * 1024),
  maxBodyBytes: Schema.natural().default(1024 * 1024),
})

/** Parse the scope query parameter; undefined when malformed. */
function scopeOf(url: URL): Scope | undefined {
  const scope = url.searchParams.get('scope')
  return scope === 'personal' || scope === 'project' ? scope : undefined
}

/** Validate the project root: present for project scope, and workspace-derived. */
async function guardRoot(ctx: Context, scope: Scope, root: string | null): Promise<string | undefined> {
  if (scope === 'personal') return undefined
  if (root === null || root === '') throw new Error('project scope requires a root')
  if (!(await isKnownRoot(ctx, root))) {
    throw new Error('root is not a known workspace project root')
  }
  return root
}

/**
 * Register the routes; disposing the plugin fiber removes them.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config) {
  const webServer = ctx.webServer

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-instructions/roots',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        send(res, 200, await listRoots(ctx))
      } catch (error) {
        send(res, 500, { error: String(error) })
      }
    },
  }), 'config-instructions: roots route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-instructions/instructions',
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const scope = scopeOf(url)
      if (scope === undefined) {
        send(res, 400, { error: 'scope must be personal or project' })
        return
      }
      try {
        const root = await guardRoot(ctx, scope, url.searchParams.get('root'))
        send(res, 200, await listInstructions(scope, root, config.maxFileBytes))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-instructions: instructions route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-instructions/instructions/write',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      if (req.method !== 'PUT') {
        send(res, 405, { error: 'PUT required' })
        return
      }
      try {
        const body = await readJsonBody<InstructionWriteRequest>(req, config.maxBodyBytes)
        if (body.kind !== 'base' && body.kind !== 'local') {
          throw new Error('only base and local instruction files are writable')
        }
        const root = await guardRoot(ctx, body.scope, body.root ?? null)
        send(res, 200, await writeInstruction(body.scope, root, body.kind, body.content, config.maxFileBytes))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-instructions: instruction write route')
}
