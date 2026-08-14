import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createFileSource } from '../src/client/index.ts'

const session: ClientSessionContext = { sessionId: 's-1' as ClientSessionContext['sessionId'] }

/** Stub one fetch response. */
function stubFetch(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createFileSource', () => {
  it('binds to the @ trigger as the file group', () => {
    const source = createFileSource()
    expect(source.trigger).toBe('@')
    expect(source.name).toBe('file')
  })

  it('maps search rows to menu candidates, addressed by session', async () => {
    stubFetch({ files: [{ path: 'src/index.ts' }], truncated: false })
    const source = createFileSource()
    const candidates = await source.candidates(session, {
      query: 'ind', position: 'inline', signal: new AbortController().signal,
    })
    expect(candidates).toEqual([{ name: 'src/index.ts' }])
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe('/file-mention/search?session=s-1&q=ind')
  })

  it('drops silently on a failed search', async () => {
    stubFetch({ error: 'walk failed' }, false, 500)
    const source = createFileSource()
    await expect(source.candidates(session, {
      query: '', position: 'inline', signal: new AbortController().signal,
    })).resolves.toEqual([])
  })

  it('picks into a reference carrying the session leg, labeled by basename', () => {
    const source = createFileSource()
    const outcome = source.onPick({
      candidate: { name: 'src/client/index.ts' },
      session,
      position: 'inline',
      via: 'menu',
      span: { start: 0, end: 4, draftRev: 1 },
    })
    expect(outcome).toEqual({
      insert: {
        source: 'file',
        ref: 's-1:src/client/index.ts',
        label: 'index.ts',
        clipboardText: '@src/client/index.ts',
      },
    })
  })

  it('projects the clipboard form back to @path', () => {
    const source = createFileSource()
    expect(source.codec!.clipboardText('s-1:src/index.ts')).toBe('@src/index.ts')
  })

  it('serializes one reference by inlining the fetched file content', async () => {
    stubFetch({ path: 'src/index.ts', size: 4, content: 'host' })
    const source = createFileSource()
    const text = await source.codec!.serialize('s-1:src/index.ts', new AbortController().signal)
    expect(text).toBe('<file path="src/index.ts">\nhost\n</file>')
    expect(String(vi.mocked(fetch).mock.calls[0]![0])).toBe('/file-mention/read?session=s-1&path=src%2Findex.ts')
  })

  it('blocks the send on a failed read with the server reason', async () => {
    stubFetch({ error: 'binary files cannot be mentioned' }, false, 415)
    const source = createFileSource()
    await expect(source.codec!.serialize('s-1:logo.png', new AbortController().signal))
      .rejects.toThrow('binary files cannot be mentioned')
  })
})
