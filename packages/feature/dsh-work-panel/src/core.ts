/**
 * Node-side core of @neplich/dsh-work-panel: path confinement, directory
 * listing, content sniffing, the loopback origin fence, and the bounded
 * terminal scrollback buffer. This module never reaches the browser.
 *
 * @module @neplich/dsh-work-panel/core
 */
import { readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { DirEntry } from './shared/protocol.ts'

const PDF_JS_DIRECT_ASSETS = new Set([
  'build/pdf.mjs',
  'build/pdf.worker.min.mjs',
  'web/pdf_viewer.mjs',
])
const PDF_JS_ASSET_GROUPS = ['cmaps', 'iccs', 'standard_fonts', 'wasm', 'image_decoders', 'web/images'] as const
const OOXML_WASM_ASSETS = new Set([
  'docx_parser_bg.wasm',
  'xlsx_parser_bg.wasm',
  'pptx_parser_bg.wasm',
])

/**
 * Turn one PDF.js route pathname into an allowlisted package-relative asset.
 * Runtime modules are explicit; support resources may contain one filename
 * below one known directory. Encoded separators and traversal are refused.
 */
export function pdfJsAssetPath(pathname: string): string | undefined {
  const prefix = '/work-panel/pdfjs/'
  if (!pathname.startsWith(prefix)) return undefined
  let relative: string
  try {
    relative = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return undefined
  }
  if (PDF_JS_DIRECT_ASSETS.has(relative)) return relative
  for (const group of PDF_JS_ASSET_GROUPS) {
    const groupPrefix = `${group}/`
    if (!relative.startsWith(groupPrefix)) continue
    const filename = relative.slice(groupPrefix.length)
    return filename !== '' && filename !== '.' && filename !== '..' && !filename.includes('/') && !filename.includes('\\')
      ? relative
      : undefined
  }
  return undefined
}

/**
 * Turn one OOXML route pathname into a package-relative browser asset.
 * Public entry modules, their hashed same-directory chunks, and the three
 * parser WASM binaries are allowed; nested paths and traversal are refused.
 */
export function ooxmlAssetPath(pathname: string): string | undefined {
  const prefix = '/work-panel/ooxml/'
  if (!pathname.startsWith(prefix)) return undefined
  let relative: string
  try {
    relative = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return undefined
  }
  if (OOXML_WASM_ASSETS.has(relative)) return relative
  if (relative === 'docx.mjs' || relative === 'xlsx.mjs' || relative === 'pptx.mjs') return relative
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/.test(relative) ? relative : undefined
}

/**
 * Resolve one client-supplied relative path against the session cwd, refusing
 * absolute paths and `..` escapes. The cwd itself resolves for the empty
 * relative path (the listing root).
 * @param cwd - absolute session working directory.
 * @param rel - client-supplied relative path (posix separators).
 * @returns the absolute target, or undefined when the path escapes the cwd.
 */
export function resolveWithin(cwd: string, rel: string): string | undefined {
  if (isAbsolute(rel)) return undefined
  const root = resolve(cwd)
  const target = resolve(root, rel)
  return target === root || target.startsWith(root + sep) ? target : undefined
}

/**
 * Symlink-aware escape check: both sides are realpath-resolved and the target
 * must stay under the real cwd. A missing target rejects (ENOENT surfaces as
 * undefined, not a thrown read).
 * @param cwd - absolute session working directory.
 * @param target - absolute path already inside cwd lexically.
 * @returns the canonical absolute target, or undefined on escape or absence.
 */
export async function resolveRealWithin(cwd: string, target: string): Promise<string | undefined> {
  try {
    const [realRoot, realTarget] = await Promise.all([realpath(cwd), realpath(target)])
    return realTarget === realRoot || realTarget.startsWith(realRoot + sep) ? realTarget : undefined
  } catch {
    return undefined
  }
}

/**
 * Binary sniff: a NUL byte inside the first 8192 bytes marks the content as
 * not displayable text.
 * @param content - file bytes.
 * @returns true when the content looks binary.
 */
export function isBinaryContent(content: Buffer): boolean {
  return content.subarray(0, 8192).includes(0)
}

/**
 * Cross-origin guard for the loopback routes: a browser fetch from another
 * origin carries an Origin header; accept only requests with no Origin (same
 * origin GET) or an Origin whose host matches the request's own Host header.
 * @param origin - the request's Origin header, when present.
 * @param host - the request's Host header, when present.
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

/** One directory listing: the capped rows plus the truncation flag. */
export interface Listing {
  readonly entries: DirEntry[]
  readonly truncated: boolean
}

/**
 * List one directory's immediate children, directories first, each group
 * name-sorted (case-insensitive, numeric-aware). Unreadable stat races drop
 * the row instead of failing the listing.
 * @param target - absolute directory path.
 * @param maxEntries - per-directory row cap.
 * @returns the capped rows plus the truncation flag.
 */
export async function listDirectory(target: string, maxEntries: number): Promise<Listing> {
  const dirents = await readdir(target, { withFileTypes: true })
  const rows: DirEntry[] = []
  for (const dirent of dirents) {
    const kind = dirent.isDirectory() ? 'dir' : dirent.isFile() ? 'file' : 'other'
    let size = 0
    let mtimeMs = 0
    if (kind !== 'other') {
      try {
        const info = await stat(resolve(target, dirent.name))
        size = info.isFile() ? info.size : 0
        mtimeMs = info.mtimeMs
      } catch {
        // The entry vanished or is unreadable between readdir and stat: keep
        // the row with zeroed facts rather than failing the whole listing.
      }
    }
    rows.push({ name: dirent.name, kind, size, mtimeMs })
  }
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : b.kind === 'dir' ? 1 : a.kind === 'file' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  })
  return { entries: rows.slice(0, maxEntries), truncated: rows.length > maxEntries }
}

/**
 * Byte-bounded terminal scrollback: appended chunks accumulate until the cap,
 * then the oldest bytes drop from the head. Replay joins the retained chunks.
 */
export class TerminalBuffer {
  private chunks: string[] = []
  private bytes = 0

  /** @param maxBytes - retained-output cap in bytes (approximate: counted as UTF-16 length). */
  constructor(readonly maxBytes: number) {}

  /** Append one output chunk, trimming the oldest chunks past the cap. */
  append(chunk: string): void {
    if (chunk.length === 0) return
    this.chunks.push(chunk)
    this.bytes += chunk.length
    while (this.bytes > this.maxBytes && this.chunks.length > 1) {
      this.bytes -= this.chunks[0]!.length
      this.chunks.shift()
    }
    if (this.bytes > this.maxBytes) {
      // One chunk larger than the cap: keep its tail.
      const only = this.chunks[0]!
      this.chunks = [only.slice(only.length - this.maxBytes)]
      this.bytes = this.maxBytes
    }
  }

  /** Join the retained output in arrival order. */
  contents(): string {
    return this.chunks.join('')
  }

  /** Drop every retained chunk (terminal restart). */
  clear(): void {
    this.chunks = []
    this.bytes = 0
  }
}
