import { mkdtemp, mkdir, rm, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isAllowedOrigin, isBinaryContent, listDirectory, ooxmlAssetPath, pdfJsAssetPath, resolveRealWithin, resolveWithin, TerminalBuffer,
} from '../src/core.ts'

describe('resolveWithin', () => {
  it('resolves relative paths inside the cwd and the cwd itself', () => {
    expect(resolveWithin('/tmp/work', 'a/b.txt')).toBe(join('/tmp/work', 'a/b.txt'))
    expect(resolveWithin('/tmp/work', '')).toBe('/tmp/work')
  })

  it('rejects absolute paths and escapes', () => {
    expect(resolveWithin('/tmp/work', '/etc/passwd')).toBeUndefined()
    expect(resolveWithin('/tmp/work', '../outside')).toBeUndefined()
    expect(resolveWithin('/tmp/work', 'a/../../outside')).toBeUndefined()
  })
})

describe('pdfJsAssetPath', () => {
  it('allows the runtime and one-level support assets', () => {
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/build/pdf.mjs')).toBe('build/pdf.mjs')
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/cmaps/78-EUC-H.bcmap')).toBe('cmaps/78-EUC-H.bcmap')
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/web/images/loading-icon.gif')).toBe('web/images/loading-icon.gif')
  })

  it('rejects arbitrary package files and traversal', () => {
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/package.json')).toBeUndefined()
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/cmaps/../package.json')).toBeUndefined()
    expect(pdfJsAssetPath('/web-workpanel/pdfjs/cmaps/%2e%2e%2fpackage.json')).toBeUndefined()
  })
})

describe('ooxmlAssetPath', () => {
  it('allows browser entries, hashed chunks and parser WASM', () => {
    expect(ooxmlAssetPath('/web-workpanel/ooxml/docx.mjs')).toBe('docx.mjs')
    expect(ooxmlAssetPath('/web-workpanel/ooxml/line-metrics-Ab_C-12.js')).toBe('line-metrics-Ab_C-12.js')
    expect(ooxmlAssetPath('/web-workpanel/ooxml/xlsx_parser_bg.wasm')).toBe('xlsx_parser_bg.wasm')
  })

  it('rejects package metadata, nested files and traversal', () => {
    expect(ooxmlAssetPath('/web-workpanel/ooxml/package.json')).toBeUndefined()
    expect(ooxmlAssetPath('/web-workpanel/ooxml/types/index.js')).toBeUndefined()
    expect(ooxmlAssetPath('/web-workpanel/ooxml/%2e%2e%2fpackage.json')).toBeUndefined()
  })
})

describe('resolveRealWithin', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dshwp-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('resolves existing targets inside the root', async () => {
    await writeFile(join(root, 'a.txt'), 'hi')
    expect(await resolveRealWithin(root, join(root, 'a.txt'))).toBeDefined()
  })

  it('rejects symlink escapes and missing targets', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'dshwp-out-'))
    await writeFile(join(outside, 'secret.txt'), 'no')
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'))
    expect(await resolveRealWithin(root, join(root, 'link.txt'))).toBeUndefined()
    expect(await resolveRealWithin(root, join(root, 'missing.txt'))).toBeUndefined()
    await rm(outside, { recursive: true, force: true })
  })
})

describe('isBinaryContent', () => {
  it('flags NUL bytes inside the sniff window only', () => {
    expect(isBinaryContent(Buffer.from('plain text'))).toBe(false)
    expect(isBinaryContent(Buffer.from([65, 0, 66]))).toBe(true)
  })
})

describe('isAllowedOrigin', () => {
  it('accepts same-host and origin-less requests', () => {
    expect(isAllowedOrigin(undefined, 'localhost:3080')).toBe(true)
    expect(isAllowedOrigin('http://localhost:3080', 'localhost:3080')).toBe(true)
  })

  it('rejects foreign origins and missing hosts', () => {
    expect(isAllowedOrigin('https://evil.example', 'localhost:3080')).toBe(false)
    expect(isAllowedOrigin('http://localhost:3080', undefined)).toBe(false)
  })

  it('rejects non-loopback hosts and cross-site fetches', () => {
    expect(isAllowedOrigin('https://evil.example', 'evil.example')).toBe(false)
    expect(isAllowedOrigin(undefined, '127.0.0.1:3080', 'cross-site')).toBe(false)
    expect(isAllowedOrigin(undefined, '127.0.0.1:3080', 'same-origin')).toBe(true)
  })
})

describe('listDirectory', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dshwp-list-'))
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'b.txt'), 'bb')
    await writeFile(join(root, 'a.txt'), 'aaaa')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists directories before files with sizes', async () => {
    const listing = await listDirectory(root, 100)
    expect(listing.truncated).toBe(false)
    expect(listing.entries.map(e => e.name)).toEqual(['src', 'a.txt', 'b.txt'])
    expect(listing.entries[0]!.kind).toBe('dir')
    expect(listing.entries[1]!.size).toBe(4)
  })

  it('caps rows and reports truncation', async () => {
    const listing = await listDirectory(root, 2)
    expect(listing.truncated).toBe(true)
    expect(listing.entries).toHaveLength(2)
  })
})

describe('TerminalBuffer', () => {
  it('replays chunks in arrival order', () => {
    const buffer = new TerminalBuffer(100)
    buffer.append('hello ')
    buffer.append('world')
    expect(buffer.contents()).toBe('hello world')
  })

  it('drops the oldest chunks past the cap', () => {
    const buffer = new TerminalBuffer(10)
    buffer.append('12345')
    buffer.append('67890')
    buffer.append('ab')
    expect(buffer.contents()).toBe('67890ab')
  })

  it('keeps the tail of one oversized chunk', () => {
    const buffer = new TerminalBuffer(4)
    buffer.append('123456')
    expect(buffer.contents()).toBe('3456')
  })

  it('clears on demand', () => {
    const buffer = new TerminalBuffer(10)
    buffer.append('data')
    buffer.clear()
    expect(buffer.contents()).toBe('')
  })
})
