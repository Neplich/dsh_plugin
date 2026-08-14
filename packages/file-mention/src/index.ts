/**
 * '@' file-mention plugin, host half: two loopback HTTP routes on the Web GUI
 * server that the browser source (src/client) drives while composing a prompt.
 *
 *   GET /file-mention/search?session=<id>&q=<query>
 *       Walks the session's cwd (bounded, ignore-listed, briefly cached) and
 *       answers the ranked top matches as JSON.
 *   GET /file-mention/read?session=<id>&path=<relative>
 *       Answers one file's text content as JSON, confined to the session cwd
 *       (lexical + realpath escape checks), size-bounded, binary-refused.
 *
 * The session's cwd comes from its live Agent (`ctx.agents`); a session with
 * no live Agent answers 404 — the composer that produced the query always
 * addresses an open session. Both routes reject cross-origin browser fetches
 * (Origin/Host mismatch) since the dev server carries no other origin policy.
 *
 * @module @neplich/dsh-file-mention
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pull the ctx.agents / ctx.webServer Context merges in.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import Schema from '@deepseek-ai/schemastery'
import {
  isAllowedOrigin, isBinaryContent, rankFiles, resolveRealWithin, resolveWithin,
  walkFiles, type WalkResult,
} from './core.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'file-mention'

/**
 * This plugin reads the live Agent registry and registers routes on the Web
 * GUI server; the declared injections sequence activation after both
 * services. Compose it in a `dsh web` profile only — a profile without
 * `ctx.webServer` leaves the fiber waiting on the injection.
 */
export const inject = ['agents', 'webServer']

/** Deployment-tunable bounds. Invalid values fail plugin load. */
export interface Config {
  /** Maximum menu candidates one search answers. */
  maxResults: number
  /** Maximum file size in bytes one read (and thus one mention) inlines. */
  maxFileBytes: number
  /** Maximum walk entries (files + directories) visited per cwd scan. */
  maxWalkEntries: number
  /** Per-cwd walk cache lifetime in milliseconds; keystrokes inside the window reuse one scan. */
  cacheTtlMs: number
  /** Directory basenames the walk skips entirely. */
  ignoreDirs: string[]
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  maxResults: Schema.natural().default(20),
  maxFileBytes: Schema.natural().default(128 * 1024),
  maxWalkEntries: Schema.natural().default(20000),
  cacheTtlMs: Schema.natural().default(3000),
  ignoreDirs: Schema.array(Schema.string()).default([
    'node_modules', '.git', '.svn', '.hg', 'dist', 'out', 'build',
    '.next', '.cache', '.turbo', 'coverage',
  ]),
})

/** JSON response helper: status plus a serialized body. */
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * Register the search/read routes; disposing the plugin fiber removes them.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config) {
  const webServer = ctx.webServer

  /** Resolve the session query parameter to its live cwd. */
  const cwdOf = (session: string | null): string | undefined => {
    if (session === null || session === '') return undefined
    return ctx.agents.get(session as SessionId)?.session.header.cwd
  }

  // Per-cwd walk cache: a menu session is a burst of keystrokes over one tree.
  const walks = new Map<string, { at: number, result: WalkResult }>()
  const walkCached = async (cwd: string): Promise<WalkResult> => {
    const cached = walks.get(cwd)
    if (cached !== undefined && Date.now() - cached.at < config.cacheTtlMs) return cached.result
    const result = await walkFiles(cwd, {
      ignoreDirs: config.ignoreDirs,
      maxEntries: config.maxWalkEntries,
    })
    walks.set(cwd, { at: Date.now(), result })
    return result
  }

  /** Shared preflight: origin fence plus request-target parsing. */
  const preflight = (req: IncomingMessage, res: ServerResponse): URL | undefined => {
    if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
      send(res, 403, { error: 'forbidden origin' })
      return undefined
    }
    return new URL(req.url ?? '/', 'http://localhost')
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/file-mention/search',
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const cwd = cwdOf(url.searchParams.get('session'))
      if (cwd === undefined) {
        send(res, 404, { error: 'unknown or offline session' })
        return
      }
      try {
        const walk = await walkCached(cwd)
        send(res, 200, {
          files: rankFiles(walk.files, url.searchParams.get('q') ?? '', config.maxResults),
          truncated: walk.truncated,
        })
      } catch (error) {
        send(res, 500, { error: `walk failed: ${String(error)}` })
      }
    },
  }), 'file-mention: search route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/file-mention/read',
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const cwd = cwdOf(url.searchParams.get('session'))
      if (cwd === undefined) {
        send(res, 404, { error: 'unknown or offline session' })
        return
      }
      const rel = url.searchParams.get('path') ?? ''
      const target = resolveWithin(cwd, rel)
      const real = target === undefined ? undefined : await resolveRealWithin(cwd, target)
      if (real === undefined) {
        send(res, 400, { error: 'path escapes the session workspace or does not exist' })
        return
      }
      try {
        const info = await stat(real)
        if (!info.isFile()) {
          send(res, 400, { error: 'not a regular file' })
          return
        }
        if (info.size > config.maxFileBytes) {
          send(res, 413, { error: `file exceeds the ${config.maxFileBytes}-byte mention limit`, size: info.size })
          return
        }
        const content = await readFile(real)
        if (isBinaryContent(content)) {
          send(res, 415, { error: 'binary files cannot be mentioned' })
          return
        }
        send(res, 200, { path: rel, size: info.size, content: content.toString('utf8') })
      } catch (error) {
        send(res, 500, { error: `read failed: ${String(error)}` })
      }
    },
  }), 'file-mention: read route')
}
