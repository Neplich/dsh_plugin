/**
 * Skills settings section plugin, host half: loopback HTTP routes on the Web
 * GUI server backing the 技能 settings section rendered by src/client.
 *
 *   GET /config-skills/roots
 *       Project roots derived from the workspace registry (durable order).
 *   GET /config-skills/skills?scope=<personal|project>&root=<path>
 *       Read-only skill listing of the scope's discovery directories.
 *   GET /config-skills/skills/read?scope=...&root=...&name=<skill>
 *       One skill document's full text (path re-derived server-side).
 *
 * Every route is origin-fenced; project-scoped reads validate the root
 * against the workspace registry, and every file path is derived
 * server-side — the client never supplies one.
 *
 * @module @neplich/dsh-config-skills
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import { isKnownRoot, listRoots, preflight, send } from '@neplich/dsh-config-shared'
import { listSkills, readSkill } from './server/skills.ts'
import type { Scope } from './shared.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'config-skills'

/**
 * This plugin registers routes on the Web GUI server; compose it in a
 * `dsh web` profile only — a profile without ctx.webServer leaves the
 * fiber waiting on the injection.
 */
export const inject = ['webServer']

/** Deployment-tunable bounds. Invalid values fail plugin load. */
export interface Config {
  /** Maximum bytes read per SKILL.md file. */
  maxFileBytes: number
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  maxFileBytes: Schema.natural().default(512 * 1024),
})

/** Parse the scope query parameter; undefined when malformed. */
function scopeOf(url: URL): Scope | undefined {
  const scope = url.searchParams.get('scope')
  return scope === 'personal' || scope === 'project' ? scope : undefined
}

/**
 * Resolve and validate the project root for a project-scoped request:
 * present, and one of the workspace-derived roots. Personal scope passes.
 */
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
    path: '/config-skills/roots',
    async handler(req, res) {
      if (preflight(req, res) === undefined) return
      try {
        send(res, 200, await listRoots(ctx))
      } catch (error) {
        send(res, 500, { error: String(error) })
      }
    },
  }), 'config-skills: roots route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-skills/skills',
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
        send(res, 200, await listSkills(scope, root, config.maxFileBytes))
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-skills: skills route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/config-skills/skills/read',
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const scope = scopeOf(url)
      const name = url.searchParams.get('name') ?? ''
      if (scope === undefined || name === '') {
        send(res, 400, { error: 'scope and name are required' })
        return
      }
      try {
        const root = await guardRoot(ctx, scope, url.searchParams.get('root'))
        const skill = await readSkill(scope, root, name, config.maxFileBytes)
        if (skill === undefined) {
          send(res, 404, { error: 'unknown skill' })
          return
        }
        send(res, 200, { name, ...skill })
      } catch (error) {
        send(res, 400, { error: String(error) })
      }
    },
  }), 'config-skills: skill read route')
}
