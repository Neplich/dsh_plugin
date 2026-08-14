/**
 * '@' file-mention plugin, browser half: registers the 'file' source on the
 * input-trigger pipeline. Typing '@' in the composer opens the grouped menu;
 * picking a row inserts one ReferenceInsert occurrence (U+FFFC placeholder +
 * chip label), so a single prompt can mention several files; on submit the
 * codec serializes each occurrence by fetching its content and inlining it as
 * `<file path="...">...</file>` text riding the ordinary prompt. A failed
 * read blocks the send (the pipeline's contract — never a silent downgrade).
 *
 * Candidate strategy mirrors the ui-skill pattern: one listing fetch per
 * session (single-flight, scope-birth prewarmed), then every keystroke
 * filters the settled snapshot locally — the menu never waits on the network,
 * so its pending window never paints. When the host reports the listing was
 * cut (tree bigger than maxListed), candidates fall back to per-keystroke
 * server-side ranking instead. A failed listing never poisons the key: the
 * next consumer retries. Connection reset drops every cached catalog.
 *
 * The reference string is self-contained (`<sessionId>:<relative-path>`)
 * because ReferenceCodec.serialize receives no session argument; clipboardText
 * strips the session leg back to the user-facing `@<path>` projection.
 *
 * @module @neplich/dsh-file-mention/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientSessionContext, InputTriggerCandidate, InputTriggerServiceContract, InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { fitChipLabel, rankFiles, toDisplayRows, type FileEntry } from '../shared/rank.ts'

/** Services this plugin reads: the trigger-source roster. */
export const inject = ['inputTriggers']

/** Wire body of the search route (both listing and fallback modes). */
interface SearchResponse {
  readonly files: readonly FileEntry[]
  /** True when `files` (listing mode) covers the whole walked tree. */
  readonly complete: boolean
  /** The host's configured menu page size (local ranking cap). */
  readonly pageSize: number
}

/** Wire body of the read route. */
interface ReadResponse {
  readonly content: string
}

/** One session's catalog fetch: the shared promise plus its settled snapshot. */
interface CatalogFetch {
  readonly promise: Promise<SearchResponse>
  /** Settled listing for synchronous reuse (unset while in flight or after failure). */
  settled?: SearchResponse
}

/** Separator between the session leg and the path leg of one reference. */
const REF_SEPARATOR = ':'

/** Basename of one relative posix path, used as the chip label. */
function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
}

/** File marker shown before the name in menu rows (icon slot) and reference chips (label prefix). */
const FILE_MARKER = '📄'

/**
 * Usable chip-label window in px. The composer reference chip is a fixed
 * 4em cell (measured: 64px cell, 56.8px label box at scale 0.72); the label
 * is pre-elided a touch under the box so the marker and both name ends
 * survive instead of the CSS central clip eating a random middle slice.
 */
const CHIP_LABEL_MAX_WIDTH = 56

/** Canvas text probe bound to the chip label's rendered size (16px × 0.72); null = no DOM (tests). */
let probe: CanvasRenderingContext2D | null | undefined

/** Coarse px estimate for the no-DOM path (vitest node): buckets by glyph class. */
function estimateWidth(text: string): number {
  let width = 0
  for (const char of text) {
    width += (char.codePointAt(0) ?? 0) > 0xff ? 14 // emoji / CJK / wide glyphs
      : char !== char.toLowerCase() ? 8.8 // Latin uppercase
        : ' .:/'.includes(char) ? 3.2
          : 6.5 // Latin lowercase / digits
  }
  return width
}

/** Label text width in px at the chip's rendered size; bucket estimate when no DOM exists. */
function measureChipText(text: string): number {
  if (probe === undefined) {
    probe = typeof document === 'undefined'
      ? null
      : document.createElement('canvas').getContext('2d')
    if (probe !== null) probe.font = `${16 * 0.72}px ${getComputedStyle(document.body).fontFamily}`
  }
  if (probe === null) return estimateWidth(text)
  return probe.measureText(text).width
}

/** Fetch JSON or throw with the server's own error text when it carried one. */
async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    let reason = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (typeof body.error === 'string') reason = body.error
    } catch {
      // A non-JSON error body keeps the status-line reason.
    }
    throw new Error(reason)
  }
  return await response.json() as T
}

/**
 * Build the '@' file source plus its cache-reset verb. Exported for tests;
 * the plugin body registers the source and wires the reset.
 * @returns the source bound to the same-origin host routes, and `reset` dropping every cached catalog.
 */
export function createFileSource(): { source: InputTriggerSource, reset: () => void } {
  // Session-keyed listing cache; single-flight per key.
  const fetches = new Map<string, CatalogFetch>()
  // Pick-time path identity: the menu contract keys rows by display name, so
  // candidates carry the (disambiguated) basename, and the full path rides
  // this side table from candidate object to path.
  const paths = new WeakMap<InputTriggerCandidate, string>()

  const search = (sessionId: string, query: string, signal: AbortSignal): Promise<SearchResponse> =>
    fetchJson<SearchResponse>(`/file-mention/search?${new URLSearchParams({ session: sessionId, q: query })}`, signal)

  const fetchCatalog = (sessionId: string, signal: AbortSignal): Promise<SearchResponse> => {
    const existing = fetches.get(sessionId)
    if (existing !== undefined) return existing.promise
    const promise = search(sessionId, '', signal)
    const entry: CatalogFetch = { promise }
    fetches.set(sessionId, entry)
    promise.then(
      (data) => {
        entry.settled = data
      },
      // A failed listing must not poison the key: the next consumer retries.
      () => {
        if (fetches.get(sessionId) === entry) fetches.delete(sessionId)
      },
    )
    return promise
  }

  const toCandidates = (files: readonly FileEntry[]): InputTriggerCandidate[] =>
    toDisplayRows(files).map((row) => {
      const candidate: InputTriggerCandidate = row.dir === ''
        ? { name: row.name, icon: FILE_MARKER }
        : { name: row.name, description: row.dir, icon: FILE_MARKER }
      paths.set(candidate, row.path)
      return candidate
    })

  const source: InputTriggerSource = {
    trigger: '@',
    name: 'file',
    // After the built-in subagent group (order 0).
    order: 1,
    async candidates(session: ClientSessionContext, { query, signal }) {
      try {
        const catalog = await fetchCatalog(session.sessionId, signal)
        // A superseded keystroke yields to the newer request.
        if (signal.aborted) return []
        if (!catalog.complete) {
          // The listing was cut: rank over the full walk, server-side.
          const data = await search(session.sessionId, query, signal)
          return signal.aborted ? [] : toCandidates(data.files)
        }
        return toCandidates(rankFiles(catalog.files, query, catalog.pageSize))
      } catch {
        // Failed sources drop silently (the pipeline records the console entry).
        return []
      }
    },
    warm(session) {
      // Fire-and-forget scope-birth prewarm; the shared fetch reports
      // through candidates.
      fetchCatalog(session.sessionId, new AbortController().signal).catch(() => {})
    },
    onPick({ candidate, session }) {
      const path = paths.get(candidate)
      // A candidate object this source never issued cannot be resolved.
      if (path === undefined) return undefined
      return {
        insert: {
          source: 'file',
          ref: `${session.sessionId}${REF_SEPARATOR}${path}`,
          // Marker + basename, pre-elided into the chip's fixed 4em cell.
          label: fitChipLabel(`${FILE_MARKER} `, basename(path), CHIP_LABEL_MAX_WIDTH, measureChipText),
          clipboardText: `@${path}`,
        },
      }
    },
    codec: {
      clipboardText(ref) {
        return `@${ref.slice(ref.indexOf(REF_SEPARATOR) + 1)}`
      },
      async serialize(ref, signal) {
        const cut = ref.indexOf(REF_SEPARATOR)
        const sessionId = ref.slice(0, cut)
        const path = ref.slice(cut + 1)
        const params = new URLSearchParams({ session: sessionId, path })
        const data = await fetchJson<ReadResponse>(`/file-mention/read?${params}`, signal)
        return `<file path="${path}">\n${data.content}\n</file>`
      },
    },
  }
  return { source, reset: () => fetches.clear() }
}

/**
 * Client plugin body: register the '@' file source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  const { source, reset } = createFileSource()
  // The host tree may differ across connection generations.
  ctx.on('connection/reset', reset)
  ctx.effect(() => inputTriggers.registerSource(source), 'file-mention: @ file source')
}
