/**
 * Mermaid fence renderer, host half: serves the mermaid UMD build to the
 * browser over one loopback route on the Web GUI server.
 *
 *   GET /dsh-mermaid/mermaid.min.js
 *       The self-contained mermaid UMD bundle (resolved from the package's
 *       own mermaid dependency), cached in memory after the first read.
 *
 * The route answers same-origin loopback requests only, mirroring the origin
 * fence the other GUI asset routes use.
 *
 * @module @neplich/dsh-mermaid
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: the ctx.webServer Context merge.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { MERMAID_SCRIPT_PATH } from './shared.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'mermaid'

/**
 * The client injects the served script from the Web GUI origin, so the route
 * must exist before the browser half can render: compose in a `dsh web`
 * profile only — a profile without `ctx.webServer` leaves the fiber waiting.
 */
export const inject = ['webServer']

/** Absolute path of the installed mermaid UMD build. */
const MERMAID_BUNDLE = fileURLToPath(import.meta.resolve('mermaid/dist/mermaid.min.js'))

/**
 * Same-origin loopback fence: refuse cross-site fetches and non-loopback
 * hosts; requests without an Origin header (script tags, same-origin
 * navigation) pass when Sec-Fetch-Site does not mark them cross-site.
 * @param origin - request Origin header.
 * @param host - request Host header.
 * @param fetchSite - request Sec-Fetch-Site header.
 * @returns true when the request may be served.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  host: string | undefined,
  fetchSite?: string,
): boolean {
  if (host === undefined || fetchSite === 'cross-site') return false
  try {
    const authority = new URL(`http://${host}`)
    const hostname = authority.hostname
    const loopback = hostname === 'localhost'
      || hostname === '[::1]'
      || /^127(?:\.\d{1,3}){3}$/.test(hostname)
    if (!loopback) return false
    return origin === undefined || new URL(origin).host === authority.host
  } catch {
    return false
  }
}

/**
 * Register the mermaid bundle route; disposing the plugin fiber removes it.
 * @param ctx - host root context.
 */
export function apply(ctx: Context): void {
  let cache: string | null = null
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: MERMAID_SCRIPT_PATH,
    async handler(req, res) {
      if (!isAllowedOrigin(req.headers.origin, req.headers.host, req.headers['sec-fetch-site'])) {
        res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'forbidden origin' }))
        return
      }
      try {
        cache ??= await readFile(MERMAID_BUNDLE, 'utf8')
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'content-length': Buffer.byteLength(cache),
          'cache-control': 'no-cache',
        })
        res.end(cache)
      } catch (error) {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: `mermaid bundle read failed: ${String(error)}` }))
      }
    },
  }), 'mermaid: bundle route')
}
