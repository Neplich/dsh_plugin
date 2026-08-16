/**
 * Node-side core of @neplich/dsh-file-mention: the bounded workspace walk and
 * the path/content safety checks behind the host routes in index.ts. Ranking
 * and display-row logic live in shared/rank.ts (inlined by the browser
 * bundle); this module never reaches the browser.
 *
 * @module @neplich/dsh-file-mention/core
 */
import { readdir, realpath } from 'node:fs/promises'
import { isAbsolute, resolve, sep } from 'node:path'
import type { FileEntry } from './shared/rank.ts'

/** Walk bounds. */
export interface WalkOptions {
  /** Directory basenames skipped entirely (e.g. `node_modules`, `.git`). */
  readonly ignoreDirs: readonly string[]
  /** Hard cap on visited entries (files + directories); the walk stops early past it. */
  readonly maxEntries: number
}

/** One cwd walk: the collected files plus the early-stop flag. */
export interface WalkResult {
  readonly files: FileEntry[]
  /** True when maxEntries cut the walk short — ranking then runs over a partial tree. */
  readonly truncated: boolean
}

/** Split one relative posix path into its entry. */
function toEntry(rel: string): FileEntry {
  const slash = rel.lastIndexOf('/')
  return slash < 0
    ? { path: rel, name: rel, dir: '' }
    : { path: rel, name: rel.slice(slash + 1), dir: rel.slice(0, slash) }
}

/**
 * Recursively collect the files under root. Symlinked directories are not
 * followed (cycle and escape guard); unreadable directories are skipped so one
 * permission hole never fails the whole walk.
 * @param root - absolute directory to walk.
 * @param options - ignore set and entry cap.
 * @returns the collected files, sorted by path, plus the truncation flag.
 */
export async function walkFiles(root: string, options: WalkOptions): Promise<WalkResult> {
  const ignore = new Set(options.ignoreDirs)
  const files: FileEntry[] = []
  let visited = 0
  let truncated = false
  // Stack of [absolute dir, relative posix dir] pairs; depth-first.
  const stack: [string, string][] = [[root, '']]
  while (stack.length > 0 && !truncated) {
    const [abs, rel] = stack.pop()!
    let entries
    try {
      entries = await readdir(abs, { withFileTypes: true })
    } catch {
      // Unreadable directory (permissions, race with deletion): skip it.
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited > options.maxEntries) {
        truncated = true
        break
      }
      if (entry.isSymbolicLink()) continue
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) stack.push([resolve(abs, entry.name), childRel])
      } else if (entry.isFile()) {
        files.push(toEntry(childRel))
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { files, truncated }
}

/**
 * Resolve one client-supplied relative path against the session cwd, refusing
 * absolute paths and `..` escapes.
 * @param cwd - absolute session working directory.
 * @param rel - client-supplied relative path (posix separators).
 * @returns the absolute target, or undefined when the path escapes the cwd.
 */
export function resolveWithin(cwd: string, rel: string): string | undefined {
  if (rel === '' || isAbsolute(rel)) return undefined
  const root = resolve(cwd)
  const target = resolve(root, rel)
  return target === root || target.startsWith(root + sep) ? target : undefined
}

/**
 * Symlink-aware escape check: both sides are realpath-resolved and the target
 * must stay under the real cwd. A missing target rejects (ENOENT propagates as
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
 * not model-readable text.
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
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true
  if (host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
