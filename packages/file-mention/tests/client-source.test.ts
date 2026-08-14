import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createFileSource } from '../src/client/index.ts'

const session: ClientSessionContext = { sessionId: 's-1' as ClientSessionContext['sessionId'] }

const LISTING = {
  files: [
    { path: 'README.md', name: 'README.md', dir: '' },
    { path: 'src/client/index.ts', name: 'index.ts', dir: 'src/client' },
    { path: 'src/index.ts', name: 'index.ts', dir: 'src' },
  ],
  complete: true,
  pageSize: 20,
}

/** Stub one fetch response. */
function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  })))
}

/** The URL query of the nth fetch call. */
function calledQuery(call: number): URLSearchParams {
  return new URL(String(vi.mocked(fetch).mock.calls[call]![0]), 'http://localhost').searchParams
}

const req = (query: string) => ({ query, position: 'inline' as const, signal: new AbortController().signal })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createFileSource', () => {
  it('binds to the @ trigger as the file group', () => {
    const { source } = createFileSource()
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('file')
  })

  it('fetches the listing once per session and filters locally per keystroke', async () => {
    stubFetch(LISTING)
    const { source } = createFileSource()
    const first = await source.candidates(session, req(''))
    expect(first.map(c => c.name)).toEqual(['README.md', 'index.ts (src/client)', 'index.ts (src)'])
    const second = await source.candidates(session, req('index'))
    expect(second.map(c => c.name)).toEqual(['index.ts (src)', 'index.ts (src/client)'])
    expect(second[1]).toMatchObject({ description: 'src/client' })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(calledQuery(0).get('q')).toBe('')
  })

  it('prewarms through the same single-flight fetch', async () => {
    stubFetch(LISTING)
    const { source } = createFileSource()
    source.warm!(session)
    const candidates = await source.candidates(session, req('read'))
    expect(candidates.map(c => c.name)).toEqual(['README.md'])
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('falls back to per-keystroke server search when the listing is incomplete', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const q = new URL(String(input), 'http://localhost').searchParams.get('q')
      const body = q === ''
        ? { files: LISTING.files, complete: false, pageSize: 20 }
        : { files: [LISTING.files[1]], complete: false, pageSize: 20 }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { source } = createFileSource()
    const candidates = await source.candidates(session, req('client'))
    expect(candidates.map(c => c.name)).toEqual(['index.ts'])
    expect(calledQuery(1).get('q')).toBe('client')
  })

  it('drops silently on a failed listing and retries next time', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ error: 'walk failed' }) })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(LISTING) })
    vi.stubGlobal('fetch', fetchMock)
    const { source } = createFileSource()
    await expect(source.candidates(session, req('x'))).resolves.toEqual([])
    await expect(source.candidates(session, req('read'))).resolves.toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('reset drops the cached catalogs', async () => {
    stubFetch(LISTING)
    const { source, reset } = createFileSource()
    await source.candidates(session, req(''))
    reset()
    await source.candidates(session, req(''))
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2)
  })

  it('picks into a reference carrying the session leg and full path, labeled with the file marker', async () => {
    stubFetch(LISTING)
    const { source } = createFileSource()
    const candidates = await source.candidates(session, req('client'))
    expect(candidates[0]).toMatchObject({ icon: '📄', description: 'src/client' })
    const outcome = source.onPick({
      candidate: candidates[0]!,
      session,
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 4, draftRev: 1 },
    })
    expect(outcome).toEqual({
      insert: {
        source: 'file',
        ref: 's-1:src/client/index.ts',
        label: expect.stringMatching(/^📄 /),
        clipboardText: '@src/client/index.ts',
      },
    })
  })

  it('refuses a candidate object it never issued', () => {
    const { source } = createFileSource()
    expect(source.onPick({
      candidate: { name: 'ghost' },
      session,
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 4, draftRev: 1 },
    })).toBeUndefined()
  })

  it('projects the clipboard form back to @path', () => {
    const { source } = createFileSource()
    expect(source.codec!.clipboardText('s-1:src/index.ts')).toBe('@src/index.ts')
  })

  it('serializes one reference by inlining the fetched file content', async () => {
    stubFetch({ path: 'src/index.ts', size: 4, content: 'host' })
    const { source } = createFileSource()
    const text = await source.codec!.serialize('s-1:src/index.ts', new AbortController().signal)
    expect(text).toBe('<file path="src/index.ts">\nhost\n</file>')
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe('/file-mention/read?session=s-1&path=src%2Findex.ts')
  })

  it('blocks the send on a failed read with the server reason', async () => {
    stubFetch({ error: 'binary files cannot be mentioned' }, false, 415)
    const { source } = createFileSource()
    await expect(source.codec!.serialize('s-1:logo.png', new AbortController().signal))
      .rejects.toThrow('binary files cannot be mentioned')
  })
})
