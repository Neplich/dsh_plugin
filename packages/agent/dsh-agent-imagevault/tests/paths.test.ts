import { describe, expect, it } from 'vitest'
import { attachmentObjectPath } from '../src/index.ts'

const HEX = 'a'.repeat(64)

describe('attachmentObjectPath', () => {
  it('maps a sha256 attachment id onto the two-level object layout', () => {
    expect(attachmentObjectPath('/store', `sha256:${HEX}`)).toBe(`/store/aa/${HEX}`)
  })

  it('rejects malformed ids instead of building a path', () => {
    expect(attachmentObjectPath('/store', 'sha256:xyz')).toBeUndefined()
    expect(attachmentObjectPath('/store', `md5:${HEX}`)).toBeUndefined()
    expect(attachmentObjectPath('/store', `sha256:${HEX}x`)).toBeUndefined()
  })
})
