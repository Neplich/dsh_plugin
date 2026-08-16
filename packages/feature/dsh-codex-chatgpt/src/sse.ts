/**
 * Minimal SSE parser for the Codex Responses stream: `data:` lines separated
 * by blank lines, multi-line data joined with `\n`, CRLF tolerated. Each
 * yielded string is one complete `data:` payload. Other SSE fields
 * (`event:`, `id:`, `retry:`, comments) are ignored.
 *
 * @module @neplich/dsh-codex-chatgpt/sse
 */

/**
 * Consume an SSE response body and yield each `data:` payload.
 * @param body - the fetch response body stream.
 * @returns complete data payloads in arrival order.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line.endsWith('\r')) line = line.slice(0, -1)
        if (line.length === 0) {
          const payload = dataLines.join('\n')
          dataLines = []
          if (payload.length > 0) yield payload
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''))
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  // A trailing line may arrive without the final newline.
  if (buffer.length > 0) {
    let line = buffer
    if (line.endsWith('\r')) line = line.slice(0, -1)
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''))
    }
  }
  if (dataLines.length > 0) yield dataLines.join('\n')
}
