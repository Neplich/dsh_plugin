import { describe, expect, it } from 'vitest'
import { formatPage, formatSnapshot } from '../src/index.ts'

describe('formatPage', () => {
  it('renders url and title lines', () => {
    expect(formatPage({ url: 'https://example.com/', title: 'Example' })).toBe('url: https://example.com/\ntitle: Example')
  })

  it('tolerates missing fields', () => {
    expect(formatPage({})).toBe('url: \ntitle: ')
  })
})

describe('formatSnapshot', () => {
  it('numbers elements with tag, type, text, and href', () => {
    const out = formatSnapshot({
      url: 'https://example.com/',
      title: 'Example',
      count: 2,
      elements: [
        { idx: 1, tag: 'input', type: 'search' },
        { idx: 2, tag: 'a', text: 'Learn more', href: 'https://iana.org/x' },
      ],
    })
    expect(out).toContain('interactive elements: 2')
    expect(out).toContain('1. <input type=search>')
    expect(out).toContain('2. <a> "Learn more" href=https://iana.org/x')
  })

  it('points at the screenshot tool when nothing is interactive', () => {
    expect(formatSnapshot({ count: 0 })).toContain('(none — try webuse_screenshot to see the page)')
  })
})
