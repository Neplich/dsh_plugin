import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isAllowedOrigin, isBinaryContent, resolveRealWithin, resolveWithin, walkFiles,
} from '../src/core.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'chat-filemention-'))
  await mkdir(join(root, 'src/client'), { recursive: true })
  await mkdir(join(root, 'node_modules/dep'), { recursive: true })
  await mkdir(join(root, '.git'), { recursive: true })
  await writeFile(join(root, 'src/index.ts'), 'host')
  await writeFile(join(root, 'src/client/index.ts'), 'client')
  await writeFile(join(root, 'README.md'), 'readme')
  await writeFile(join(root, 'node_modules/dep/index.js'), 'dep')
  await writeFile(join(root, '.git/config'), 'git')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('walkFiles', () => {
  it('collects files with posix relative paths, skipping ignored directories', async () => {
    const { files, truncated } = await walkFiles(root, {
      ignoreDirs: ['node_modules', '.git'],
      maxEntries: 100,
    })
    expect(truncated).toBe(false)
    expect(files.map(file => file.path)).toEqual(['README.md', 'src/client/index.ts', 'src/index.ts'])
    expect(files[1]).toMatchObject({ name: 'index.ts', dir: 'src/client' })
    expect(files[2]).toMatchObject({ name: 'index.ts', dir: 'src' })
  })

  it('truncates past the entry cap instead of failing', async () => {
    const { truncated } = await walkFiles(root, { ignoreDirs: [], maxEntries: 2 })
    expect(truncated).toBe(true)
  })

  it('does not follow symlinked directories', async () => {
    await mkdir(join(root, 'real'), { recursive: true })
    await writeFile(join(root, 'real/hidden.ts'), 'x')
    await symlink(join(root, 'real'), join(root, 'src/link'))
    const { files } = await walkFiles(root, { ignoreDirs: ['node_modules', '.git'], maxEntries: 100 })
    expect(files.map(file => file.path)).not.toContain('src/link/hidden.ts')
  })
})

describe('resolveWithin', () => {
  it('resolves ordinary relative paths', () => {
    expect(resolveWithin('/work', 'src/index.ts')).toBe('/work/src/index.ts')
  })

  it('rejects absolute paths and escapes', () => {
    expect(resolveWithin('/work', '/etc/passwd')).toBeUndefined()
    expect(resolveWithin('/work', '../outside')).toBeUndefined()
    expect(resolveWithin('/work', 'src/../../outside')).toBeUndefined()
    expect(resolveWithin('/work', '')).toBeUndefined()
  })
})

describe('resolveRealWithin', () => {
  it('rejects a symlink escaping the cwd', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'chat-filemention-out-'))
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'))
    expect(await resolveRealWithin(root, join(root, 'link.txt'))).toBeUndefined()
    await rm(outside, { recursive: true, force: true })
  })

  it('accepts an inside target and rejects a missing one', async () => {
    const realRoot = await realpath(root)
    expect(await resolveRealWithin(root, join(root, 'README.md'))).toBe(join(realRoot, 'README.md'))
    expect(await resolveRealWithin(root, join(root, 'missing.txt'))).toBeUndefined()
  })
})

describe('isBinaryContent', () => {
  it('flags NUL bytes inside the sniff window only', () => {
    expect(isBinaryContent(Buffer.from([65, 0, 66]))).toBe(true)
    expect(isBinaryContent(Buffer.from('plain text'))).toBe(false)
    const wide = Buffer.alloc(9000, 65)
    wide[8999] = 0
    expect(isBinaryContent(wide)).toBe(false)
  })
})

describe('isAllowedOrigin', () => {
  it('accepts same-origin and origin-less requests, rejects foreign origins', () => {
    expect(isAllowedOrigin(undefined, '127.0.0.1:3080')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:3080', '127.0.0.1:3080')).toBe(true)
    expect(isAllowedOrigin('https://evil.example', '127.0.0.1:3080')).toBe(false)
    expect(isAllowedOrigin('not a url', '127.0.0.1:3080')).toBe(false)
    expect(isAllowedOrigin('http://127.0.0.1:3080', undefined)).toBe(false)
  })
})
