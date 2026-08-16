/**
 * Right-side work panel plugin, host half: loopback HTTP routes behind the
 * Web GUI server for browsing and previewing workspace files, plus one
 * WebSocket route carrying the session's interactive terminal.
 *
 *   GET /work-panel/list?session=<id>&path=<relative>
 *       One directory's immediate children (dirs first), confined to the
 *       session cwd (lexical + realpath escape checks), row-capped.
 *   GET /work-panel/read?session=<id>&path=<relative>
 *       One file's text content as JSON, size-bounded, binary-refused.
 *   GET /work-panel/raw?session=<id>&path=<relative>
 *       One allowlisted image, PDF, or modern Office document with its content
 *       type, size-bounded, for inline preview through the work panel surface.
 *   GET /work-panel/pdfjs/<allowlisted-asset>
 *       PDF.js runtime, worker, viewer, fonts, color maps and WASM resources.
 *   WS  /work-panel/terminal?session=<id>&terminal=<id>&cols=<n>&rows=<n>
 *       One tab-keyed interactive PTY (spawned on first attach through the
 *       subprocess seam). Disconnects never kill the process; a fresh socket
 *       replays the retained scrollback. Plugin disposal terminates every PTY.
 *
 * The session's cwd resolves from its live Agent first, then the in-memory
 * session header (blank sessions have no Agent yet but already carry a cwd).
 * Every route rejects cross-origin browser fetches (Origin/Host mismatch).
 *
 * @module @neplich/dsh-work-panel
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
// Type-only: pull the ctx.agents / ctx.sessions / ctx.subprocess / ctx.webServer Context merges in.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-subprocess'
import Schema from '@deepseek-ai/schemastery'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  isAllowedOrigin, isBinaryContent, listDirectory, ooxmlAssetPath, pdfJsAssetPath, resolveRealWithin, resolveWithin,
} from './core.ts'
import { TerminalManager } from './terminal.ts'
import { extensionOf, isTerminalId, ROUTES } from './shared/protocol.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'work-panel'

/**
 * This plugin reads the live Agent and session registries, spawns PTYs
 * through the subprocess seam, and registers routes on the Web GUI server;
 * the declared injections sequence activation after all four services.
 * Compose it in a `dsh web` profile only — a profile without `ctx.webServer`
 * leaves the fiber waiting on the injection.
 */
export const inject = ['agents', 'sessions', 'subprocess', 'webServer']

/** Deployment-tunable bounds. Invalid values fail plugin load. */
export interface Config {
  /** Maximum rows one directory listing answers. */
  maxListEntries: number
  /** Maximum file size in bytes one text read answers. */
  maxFileBytes: number
  /** Maximum image, PDF, or modern Office file size in bytes the raw route serves. */
  maxImageBytes: number
  /** Retained terminal output per terminal tab, in bytes (replay source). */
  terminalScrollbackBytes: number
  /** PTY TERM-to-KILL cleanup grace in milliseconds. */
  terminalGraceMs: number
  /** Shell executable for the interactive terminal; empty reads $SHELL, then falls back to /bin/bash. */
  shell: string
}

/** Schemastery validation for {@link Config}. */
export const Config: Schema<Config> = Schema.object({
  maxListEntries: Schema.natural().default(2000),
  maxFileBytes: Schema.natural().default(256 * 1024),
  maxImageBytes: Schema.natural().default(10 * 1024 * 1024),
  terminalScrollbackBytes: Schema.natural().default(512 * 1024),
  terminalGraceMs: Schema.natural().default(4000),
  shell: Schema.string().default(''),
})

/** JSON response helper: status plus a serialized body. */
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Content types for the raw route's previewable-media allowlist. */
const RAW_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** Installed PDF.js root; the host exposes only the allowlisted viewer assets below. */
const PDF_JS_ROOT = dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')))
const OOXML_ROOT = dirname(fileURLToPath(import.meta.resolve('@silurus/ooxml/docx')))

/** Content types needed by PDF.js runtime and optional support resources. */
function pdfJsContentType(path: string): string {
  if (path.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (path.endsWith('.wasm')) return 'application/wasm'
  if (path.endsWith('.svg')) return 'image/svg+xml'
  if (path.endsWith('.gif')) return 'image/gif'
  if (path.endsWith('.ttf')) return 'font/ttf'
  if (path.endsWith('.icc')) return 'application/vnd.iccprofile'
  return 'application/octet-stream'
}

/** Content types for browser-side OOXML modules and parsers. */
function ooxmlContentType(path: string): string {
  return path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8'
}

/**
 * Register the file routes and the terminal WebSocket route; disposing the
 * plugin fiber removes the routes and terminates every live PTY.
 * @param ctx - host root context.
 * @param config - validated plugin config.
 */
export function apply(ctx: Context, config: Config) {
  const webServer = ctx.webServer
  const terminals = new TerminalManager(ctx.subprocess, {
    scrollbackBytes: config.terminalScrollbackBytes,
    graceMs: config.terminalGraceMs,
  })

  /** Resolve the session query parameter to its cwd: live Agent first, then the in-memory session header. */
  const cwdOf = (session: string | null): string | undefined => {
    if (session === null || session === '') return undefined
    const id = session as SessionId
    return ctx.agents.get(id)?.session.header.cwd ?? ctx.sessions.get(id)?.header.cwd
  }

  /** Shared preflight: origin fence plus request-target parsing. */
  const preflight = (req: IncomingMessage, res: ServerResponse): URL | undefined => {
    if (!isAllowedOrigin(req.headers.origin, req.headers.host, req.headers['sec-fetch-site'])) {
      send(res, 403, { error: 'forbidden origin' })
      return undefined
    }
    return new URL(req.url ?? '/', 'http://localhost')
  }

  /**
   * Resolve the confined absolute target for one request, answering the
   * common failures itself; undefined means the response is already sent.
   */
  const confinedTarget = async (url: URL, res: ServerResponse): Promise<{ cwd: string, real: string, rel: string } | undefined> => {
    const cwd = cwdOf(url.searchParams.get('session'))
    if (cwd === undefined) {
      send(res, 404, { error: 'unknown or offline session' })
      return undefined
    }
    const rel = url.searchParams.get('path') ?? ''
    const target = resolveWithin(cwd, rel)
    const real = target === undefined ? undefined : await resolveRealWithin(cwd, target)
    if (real === undefined) {
      send(res, 400, { error: 'path escapes the session workspace or does not exist' })
      return undefined
    }
    return { cwd, real, rel }
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTES.list,
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const found = await confinedTarget(url, res)
      if (found === undefined) return
      try {
        const info = await stat(found.real)
        if (!info.isDirectory()) {
          send(res, 400, { error: 'not a directory' })
          return
        }
        const listing = await listDirectory(found.real, config.maxListEntries)
        send(res, 200, listing)
      } catch (error) {
        send(res, 500, { error: `list failed: ${String(error)}` })
      }
    },
  }), 'work-panel: list route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTES.read,
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const found = await confinedTarget(url, res)
      if (found === undefined) return
      try {
        const info = await stat(found.real)
        if (!info.isFile()) {
          send(res, 400, { error: 'not a regular file' })
          return
        }
        if (info.size > config.maxFileBytes) {
          send(res, 413, { error: `file exceeds the ${config.maxFileBytes}-byte preview limit`, size: info.size })
          return
        }
        const content = await readFile(found.real)
        if (isBinaryContent(content)) {
          send(res, 415, { error: 'binary files cannot be previewed as text' })
          return
        }
        send(res, 200, { path: found.rel, size: info.size, content: content.toString('utf8') })
      } catch (error) {
        send(res, 500, { error: `read failed: ${String(error)}` })
      }
    },
  }), 'work-panel: read route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTES.raw,
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const contentType = RAW_CONTENT_TYPES[extensionOf(url.searchParams.get('path') ?? '')]
      if (contentType === undefined) {
        send(res, 415, { error: 'not a previewable media type' })
        return
      }
      const found = await confinedTarget(url, res)
      if (found === undefined) return
      try {
        const info = await stat(found.real)
        if (!info.isFile()) {
          send(res, 400, { error: 'not a regular file' })
          return
        }
        if (info.size > config.maxImageBytes) {
          send(res, 413, { error: `preview file exceeds the ${config.maxImageBytes}-byte limit`, size: info.size })
          return
        }
        const content = await readFile(found.real)
        res.writeHead(200, {
          'content-type': contentType,
          'content-length': content.byteLength,
          'cache-control': 'no-cache',
        })
        res.end(content)
      } catch (error) {
        send(res, 500, { error: `read failed: ${String(error)}` })
      }
    },
  }), 'work-panel: raw route')

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTES.pdfJs,
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const relative = pdfJsAssetPath(url.pathname)
      const target = relative === undefined ? undefined : resolveWithin(PDF_JS_ROOT, relative)
      const real = target === undefined ? undefined : await resolveRealWithin(PDF_JS_ROOT, target)
      if (relative === undefined || real === undefined) {
        send(res, 404, { error: 'unknown PDF.js asset' })
        return
      }
      try {
        const info = await stat(real)
        if (!info.isFile()) {
          send(res, 404, { error: 'unknown PDF.js asset' })
          return
        }
        const content = await readFile(real)
        res.writeHead(200, {
          'content-type': pdfJsContentType(relative),
          'content-length': content.byteLength,
          'cache-control': 'no-cache',
        })
        res.end(content)
      } catch (error) {
        send(res, 500, { error: `PDF.js asset read failed: ${String(error)}` })
      }
    },
  }), 'work-panel: PDF.js assets')

  ctx.effect(() => webServer.register({
    kind: 'prefix',
    path: ROUTES.ooxml,
    async handler(req, res) {
      const url = preflight(req, res)
      if (url === undefined) return
      const relative = ooxmlAssetPath(url.pathname)
      const target = relative === undefined ? undefined : resolveWithin(OOXML_ROOT, relative)
      const real = target === undefined ? undefined : await resolveRealWithin(OOXML_ROOT, target)
      if (relative === undefined || real === undefined) {
        send(res, 404, { error: 'unknown OOXML asset' })
        return
      }
      try {
        const info = await stat(real)
        if (!info.isFile()) {
          send(res, 404, { error: 'unknown OOXML asset' })
          return
        }
        const content = await readFile(real)
        res.writeHead(200, {
          'content-type': ooxmlContentType(relative),
          'content-length': content.byteLength,
          'cache-control': 'no-cache',
        })
        res.end(content)
      } catch (error) {
        send(res, 500, { error: `OOXML asset read failed: ${String(error)}` })
      }
    },
  }), 'work-panel: OOXML assets')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTES.terminalClose,
    async handler(req, res) {
      if (req.method !== 'POST') {
        send(res, 405, { error: 'method not allowed' })
        return
      }
      const url = preflight(req, res)
      if (url === undefined) return
      const session = url.searchParams.get('session') ?? ''
      const terminal = url.searchParams.get('terminal')
      if (cwdOf(session) === undefined || !isTerminalId(terminal)) {
        send(res, 404, { error: 'unknown session or terminal' })
        return
      }
      await terminals.close(session, terminal)
      send(res, 200, { closed: true })
    },
  }), 'work-panel: terminal close route')

  // The terminal upgrade: one WebSocket per browser view onto one tab-keyed
  // PTY. The origin fence applies here too — a cross-site page cannot open a
  // shell through the loopback server.
  const wss = new WebSocketServer({ noServer: true })
  ctx.effect(() => webServer.registerUpgrade({
    path: ROUTES.terminal,
    async handler(req, socket, head) {
      if (!isAllowedOrigin(req.headers.origin, req.headers.host, req.headers['sec-fetch-site'])) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
        socket.destroy()
        return
      }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const session = url.searchParams.get('session') ?? ''
      const terminal = url.searchParams.get('terminal')
      const cwd = cwdOf(session)
      if (cwd === undefined || !isTerminalId(terminal)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }
      const cols = Number(url.searchParams.get('cols') ?? '')
      const rows = Number(url.searchParams.get('rows') ?? '')
      const shell = config.shell !== '' ? config.shell : process.env['SHELL'] ?? '/bin/bash'
      const ws: WebSocket = await new Promise((resolveWs, rejectWs) => {
        wss.handleUpgrade(req, socket, head, resolveWs)
        wss.once('error', rejectWs)
      })
      try {
        await terminals.attach(session, terminal, {
          cwd,
          argv: [shell],
          cols: Number.isFinite(cols) ? cols : 120,
          rows: Number.isFinite(rows) ? rows : 30,
        }, ws)
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'error',
          message: `terminal spawn failed: ${error instanceof Error ? error.message : String(error)}`,
        }))
        ws.close()
      }
    },
  }), 'work-panel: terminal route')

  ctx.effect(() => () => { void terminals.dispose() }, 'work-panel: PTY cleanup')
  ctx.on('session/disposed', (session) => { void terminals.closeSession(session.id) })
}
