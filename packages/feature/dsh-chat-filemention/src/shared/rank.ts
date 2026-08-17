/**
 * Pure ranking core shared by the host routes and the browser bundle of
 * @neplich/dsh-chat-filemention: substring filtering, menu ranking, and display
 * rows. Zero Node/DOM/cordis imports so the client bundle can inline it.
 *
 * @module @neplich/dsh-chat-filemention/shared/rank
 */

/** One walkable file, addressed relative to the session cwd with posix separators. */
export interface FileEntry {
  /** Relative posix path from the session cwd, e.g. `src/client/index.ts`. */
  readonly path: string
  /** Basename, e.g. `index.ts`. */
  readonly name: string
  /** Containing directory relative to the cwd (`''` at the root), e.g. `src/client`. */
  readonly dir: string
}

/** Rank tier: lower scores surface first. Plain substring matching only — the
 * query must appear verbatim in the basename or the path. */
function score(entry: FileEntry, query: string): number {
  const name = entry.name.toLowerCase()
  const path = entry.path.toLowerCase()
  if (name.startsWith(query)) return 0
  if (name.includes(query)) return 1
  if (path.includes(query)) return 2
  return -1
}

/**
 * All substring matches of one query, best tier first, shorter paths first
 * within a tier. An empty query answers the whole path-sorted set.
 * @param files - walked entries (already path-sorted).
 * @param query - raw menu query.
 * @returns every match, uncapped.
 */
export function filterMatches(files: readonly FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return [...files]
  return files
    .map(entry => ({ entry, tier: score(entry, q) }))
    .filter(match => match.tier >= 0)
    .sort((a, b) => a.tier - b.tier || a.entry.path.length - b.entry.path.length
      || (a.entry.path < b.entry.path ? -1 : a.entry.path > b.entry.path ? 1 : 0))
    .map(match => match.entry)
}

/**
 * Filter and rank one walked file set against a menu query.
 * @param files - walked entries (already path-sorted).
 * @param query - raw menu query.
 * @param maxResults - result cap.
 * @returns the top matches, best tier first, shorter paths first within a tier.
 */
export function rankFiles(
  files: readonly FileEntry[],
  query: string,
  maxResults: number,
): FileEntry[] {
  return filterMatches(files, query).slice(0, maxResults)
}

/**
 * One menu-ready row. `name` is the display cell: the basename, suffixed with
 * ` (dir)` when the basename collides inside the returned list — the trigger
 * menu keys rows by name, so names must be unique within one group. `dir`
 * rides the description column; `path` stays the pick identity.
 */
export interface DisplayRow {
  readonly path: string
  readonly name: string
  readonly dir: string
}

/**
 * Project ranked entries to display rows with per-list name disambiguation.
 * @param entries - ranked entries (one menu page).
 * @returns display rows in the input order.
 */
export function toDisplayRows(entries: readonly FileEntry[]): DisplayRow[] {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1)
  return entries.map(entry => ({
    path: entry.path,
    name: (counts.get(entry.name) ?? 0) > 1 ? `${entry.name} (${entry.dir})` : entry.name,
    dir: entry.dir,
  }))
}

/**
 * Fit one chip label into the composer reference chip's fixed window. The chip
 * is a constant-width cell (its advance must equal the textarea's U+FFFC
 * advance, so it can never grow) and its CSS clips an over-wide label
 * centrally, cutting BOTH ends. Pre-elide the name's tail instead so the
 * marker and as many leading name characters as possible stay visible.
 * @param marker - leading file marker (e.g. `'⎘ '`).
 * @param name - the file basename.
 * @param maxWidth - usable window width in px (measured: 56.8px cell, safety margin applied by the caller).
 * @param measure - text-width probe in px (canvas measureText in the browser, estimate in tests).
 * @returns the label, whole when it fits, tail-elided otherwise.
 */
export function fitChipLabel(
  marker: string,
  name: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  const full = `${marker}${name}`
  if (measure(full) <= maxWidth) return full
  for (let keep = name.length - 1; keep > 0; keep--) {
    const candidate = `${marker}${name.slice(0, keep)}…`
    if (measure(candidate) <= maxWidth) return candidate
  }
  return `${marker}…`
}
