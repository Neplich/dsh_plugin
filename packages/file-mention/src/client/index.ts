/**
 * '@' file-mention plugin, browser half: registers the 'file' source on the
 * input-trigger pipeline. Typing '@' in the composer opens the grouped menu;
 * candidates ride the host routes registered by the node half (same origin).
 * A pick inserts one ReferenceInsert occurrence (U+FFFC placeholder + chip
 * label), so a single prompt can mention several files; on submit the codec
 * serializes each occurrence by fetching its content and inlining it as
 * `<file path="...">...</file>` text riding the ordinary prompt. A failed
 * read blocks the send (the pipeline's contract — never a silent downgrade).
 *
 * The reference string is self-contained (`<sessionId>:<relative-path>`)
 * because ReferenceCodec.serialize receives no session argument; clipboardText
 * strips the session leg back to the user-facing `@<path>` projection.
 *
 * @module @neplich/dsh-file-mention/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientSessionContext, InputTriggerServiceContract, InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'

/** Services this plugin reads: the trigger-source roster. */
export const inject = ['inputTriggers']

/** Wire row of the search route. */
interface SearchRow {
  readonly path: string
}

/** Wire body of the search route. */
interface SearchResponse {
  readonly files: readonly SearchRow[]
}

/** Wire body of the read route. */
interface ReadResponse {
  readonly content: string
}

/** Separator between the session leg and the path leg of one reference. */
const REF_SEPARATOR = ':'

/** Basename of one relative posix path, used as the chip label. */
function basename(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? path : path.slice(slash + 1)
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
 * Build the '@' file source. Exported for tests; the plugin body registers it.
 * @returns the source bound to the same-origin host routes.
 */
export function createFileSource(): InputTriggerSource {
  return {
    trigger: '@',
    name: 'file',
    // After the built-in subagent group (order 0).
    order: 1,
    async candidates(session: ClientSessionContext, { query, signal }) {
      try {
        const params = new URLSearchParams({ session: session.sessionId, q: query })
        const data = await fetchJson<SearchResponse>(`/file-mention/search?${params}`, signal)
        // A superseded keystroke yields to the newer request.
        if (signal.aborted) return []
        return data.files.map(file => ({ name: file.path }))
      } catch {
        // Failed sources drop silently (the pipeline records the console entry).
        return []
      }
    },
    onPick({ candidate, session }) {
      const path = candidate.name
      return {
        insert: {
          source: 'file',
          ref: `${session.sessionId}${REF_SEPARATOR}${path}`,
          label: basename(path),
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
}

/**
 * Client plugin body: register the '@' file source.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const inputTriggers = ctx.get('inputTriggers') as InputTriggerServiceContract
  ctx.effect(() => inputTriggers.registerSource(createFileSource()), 'file-mention: @ file source')
}
