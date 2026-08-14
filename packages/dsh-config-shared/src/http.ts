/**
 * Shared HTTP helpers for the config-center routes: JSON responses, the
 * loopback origin fence (same policy as dsh-file-mention), and bounded JSON
 * body parsing.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

/** JSON response helper: status plus a serialized body. */
export function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/**
 * The dev server carries no other origin policy, so mutating and reading
 * routes reject cross-origin browser fetches: an Origin header whose host
 * differs from the Host header is refused; non-browser clients (no Origin)
 * pass.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || origin === 'null') return true
  if (host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** Shared preflight: origin fence plus request-target parsing. */
export function preflight(req: IncomingMessage, res: ServerResponse): URL | undefined {
  if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
    send(res, 403, { error: 'forbidden origin' })
    return undefined
  }
  return new URL(req.url ?? '/', 'http://localhost')
}

/** Read a JSON request body with a byte cap; rejects oversize or malformed bodies. */
export async function readJsonBody<T>(req: IncomingMessage, maxBytes: number): Promise<T> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > maxBytes) throw new Error('request body exceeds the ' + maxBytes + '-byte limit')
    chunks.push(buf)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('request body is not valid JSON')
  }
}