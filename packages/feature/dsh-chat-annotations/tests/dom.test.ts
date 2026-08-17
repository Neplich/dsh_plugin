// @vitest-environment jsdom
/**
 * DOM helper tests: path snapshotting around mark elements, range wrapping
 * (single text node and across elements), and floating-surface math.
 */
import { describe, expect, it } from 'vitest'
import {
  addButtonPos, childIndexOf, nodeAtPath, pathTo, textNodesInRange, wrapRange,
} from '../src/client/dom.ts'

function textOf(node: Node): string {
  return Array.from(node.childNodes).map(c => c.textContent ?? '').join('')
}

describe('childIndexOf / pathTo / nodeAtPath', () => {
  it('round-trips a path through a text node', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>alpha</p><p>beta</p>'
    const target = root.querySelectorAll('p')[1]?.firstChild as Text
    const path = pathTo(root, target)
    expect(path).toEqual([1, 0])
    expect(nodeAtPath(root, path ?? [])).toBe(target)
  })

  it('skips unrelated marks so paths stay stable while other marks are wrapped', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>a<strong>b</strong>c</p>'
    const strong = root.querySelector('strong')
    const target = strong?.firstChild as Text
    const before = pathTo(root, target)
    // A mark around OTHER text must not shift the non-mark path space.
    const other = document.createElement('mark')
    other.setAttribute('data-dsh-annot', 'other')
    other.textContent = 'zz'
    const p = root.querySelector('p') as HTMLParagraphElement
    p.insertBefore(other, p.firstChild)
    expect(pathTo(root, target)).toEqual(before)
    expect(nodeAtPath(root, before ?? [])).toBe(target)
    expect(childIndexOf(strong as Node, target)).toBe(0)
  })
})

describe('textNodesInRange / wrapRange', () => {
  it('wraps a single text node range, preserving surrounding text', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>hello world</p>'
    const p = root.querySelector('p') as HTMLParagraphElement
    const node = p.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 6)
    range.setEnd(node, 11)
    const marks = wrapRange(range, 'a1')
    expect(marks).toHaveLength(1)
    expect(p.textContent).toBe('hello world')
    expect(p.innerHTML).toBe('hello <mark data-dsh-annot="a1" class="dsh-annot-mark">world</mark>')
  })

  it('wraps text nodes across elements and splits boundaries', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>alpha<strong>beta</strong>gamma</p>'
    const p = root.querySelector('p') as HTMLParagraphElement
    const alpha = p.firstChild as Text
    const beta = p.querySelector('strong')?.firstChild as Text
    const range = document.createRange()
    range.setStart(alpha, 2)
    range.setEnd(beta, 2)
    const marks = wrapRange(range, 'a2')
    // alpha split (2..4), beta split (0..2) => two marks.
    expect(marks).toHaveLength(2)
    expect(textOf(p)).toBe('alphabetagamma')
    expect(p.querySelector('mark')?.textContent).toBe('pha')
    expect(p.querySelector('strong mark')?.textContent).toBe('be')
  })

  it('collects covered text nodes only', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>one</p><p>two</p>'
    const p1 = root.querySelectorAll('p')[0] as HTMLParagraphElement
    const p2 = root.querySelectorAll('p')[1] as HTMLParagraphElement
    const range = document.createRange()
    range.setStart(p1.firstChild as Text, 1)
    range.setEnd(p2.firstChild as Text, 2)
    const nodes = textNodesInRange(range)
    expect(nodes.map(n => n.data)).toEqual(['one', 'two'])
  })
})

describe('addButtonPos', () => {
  it('places the button above the selection and keeps it in viewport', () => {
    const pos = addButtonPos({ top: 300, left: 100, bottom: 320, right: 300, width: 200, height: 20 })
    expect(pos.top).toBe(260)
    expect(pos.left).toBe(100)
  })

  it('flips below when there is no room above', () => {
    const pos = addButtonPos({ top: 10, left: 100, bottom: 30, right: 300, width: 200, height: 20 })
    expect(pos.top).toBe(38)
  })
})
