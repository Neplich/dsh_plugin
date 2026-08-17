/**
 * DOM helpers for the annotation engine: selection anchoring, mark wrapping,
 * and floating-surface positioning. Pure functions over the live message DOM
 * (the shipped chat flow's `data-chat-flow-kind` / `data-chat-anchor-key`
 * rows); the engine maps selections onto child-index paths that survive React
 * re-renders and re-applies marks after mutations.
 */

import type { Rect } from './state.ts'

/** Chat flow row selector (the row wrapper carries the node kind). */
export const FLOW_SEL = '[data-chat-flow-kind]'

/** Attribute stamping one annotation's mark elements. */
export const MARK_ATTR = 'data-dsh-annot'

/** Class applied to every mark element. */
export const MARK_CLS = 'dsh-annot-mark'

/**
 * Child index of `node` inside `parent`, counting only non-mark children, so
 * paths stay stable whether or not marks are currently wrapped.
 * @param parent - the parent node.
 * @param node - the child to locate.
 * @returns the non-mark index, or -1 when `node` is not a child.
 */
export function childIndexOf(parent: Node, node: Node): number {
  let i = 0
  for (const c of parent.childNodes) {
    if (c.nodeType === 1 && (c as Element).hasAttribute(MARK_ATTR)) continue
    if (c === node) return i
    i += 1
  }
  return -1
}

/**
 * Non-mark child-index path from `root` down to `node`.
 * @param root - the flow item element.
 * @param node - the descendant to locate.
 * @returns the path, or null when `node` is not a descendant.
 */
export function pathTo(root: Node, node: Node): readonly number[] | null {
  const path: number[] = []
  let n: Node | null = node
  while (n !== null && n !== root) {
    const p: Node | null = n.parentNode
    if (p === null) return null
    const i = childIndexOf(p, n)
    if (i < 0) return null
    path.unshift(i)
    n = p
  }
  return n === root ? path : null
}

/**
 * Resolve a non-mark child-index path back to a node.
 * @param root - the flow item element.
 * @param path - the stored path.
 * @returns the resolved node, or null when the structure changed beyond the path.
 */
export function nodeAtPath(root: Node, path: readonly number[]): Node | null {
  let n: Node = root
  for (const i of path) {
    let k = 0
    let found: Node | null = null
    for (const c of n.childNodes) {
      if (c.nodeType === 1 && (c as Element).hasAttribute(MARK_ATTR)) continue
      if (k === i) { found = c; break }
      k += 1
    }
    if (found === null) return null
    n = found
  }
  return n
}

/**
 * Collect every text node the range covers (whole nodes only — the caller
 * splits boundaries first).
 * @param range - the live range.
 * @returns the covered text nodes in document order.
 */
export function textNodesInRange(range: Range): Text[] {
  const container = range.commonAncestorContainer
  if (container.nodeType === 3) return [container as Text]
  const out: Text[] = []
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    if (range.intersectsNode(walker.currentNode)) out.push(walker.currentNode as Text)
  }
  return out
}

/**
 * Wrap the range's text nodes in mark elements stamped with `id`. Boundary
 * text nodes are split first so every covered text node is fully wrapped; the
 * mark carries NO padding and inherits the text color, so the message layout
 * and typography stay pixel-identical to the unannotated message.
 * @param range - the range to wrap (mutated by splitting).
 * @param id - the annotation id stamped on each mark.
 * @returns the created marks.
 */
export function wrapRange(range: Range, id: string): HTMLElement[] {
  const makeMark = (): HTMLElement => {
    const mark = document.createElement('mark')
    mark.setAttribute(MARK_ATTR, id)
    mark.className = MARK_CLS
    return mark
  }
  const container = range.commonAncestorContainer
  if (container.nodeType === 3) {
    const parent = container.parentNode
    if (parent === null) return []
    const mark = makeMark()
    const text = (container as Text).data
    const start = range.startOffset
    const end = range.endOffset
    const before = document.createTextNode(text.slice(0, start))
    const mid = document.createTextNode(text.slice(start, end))
    const after = document.createTextNode(text.slice(end))
    mark.appendChild(mid)
    parent.insertBefore(before, container)
    parent.insertBefore(mark, container)
    parent.insertBefore(after, container)
    parent.removeChild(container)
    return [mark]
  }
  const startNode = range.startContainer as Text
  if (startNode.nodeType === 3 && range.startOffset > 0) {
    const tail = startNode.splitText(range.startOffset)
    if (range.endContainer === startNode) {
      range.setEnd(tail, range.endOffset - range.startOffset)
    }
    range.setStart(tail, 0)
  }
  const endNode = range.endContainer as Text
  if (endNode.nodeType === 3 && range.endOffset < endNode.length) {
    endNode.splitText(range.endOffset)
  }
  const marks: HTMLElement[] = []
  for (const n of textNodesInRange(range)) {
    if (n.parentNode === null) continue
    const mark = makeMark()
    n.parentNode.replaceChild(mark, n)
    mark.appendChild(n)
    marks.push(mark)
  }
  return marks
}

/** Project a range's bounding client rect into a plain {@link Rect}. */
export function rectOf(range: Range): Rect {
  const r = range.getBoundingClientRect()
  return { top: r.top, left: r.left, bottom: r.bottom, right: r.right, width: r.width, height: r.height }
}

/** Find the chat flow item carrying one `data-chat-anchor-key`. */
export function findItem(key: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]'))) {
    if (el.getAttribute('data-chat-anchor-key') === key) return el
  }
  return null
}

/**
 * Floating add-button position: above the selection, flipped below when there
 * is no room.
 * @param rect - the selection rect in viewport coordinates.
 * @returns fixed-position top/left.
 */
export function addButtonPos(rect: Rect): { top: number; left: number } {
  const w = 132
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - w - 8))
  const top = rect.top - 40 >= 8 ? rect.top - 40 : rect.bottom + 8
  return { top, left }
}

/**
 * Popover position: right above the composer chip, flipped below when there
 * is no room.
 * @param height - the popover's MEASURED height (reserving the max-height
 * would float the popover high above the chip).
 * @returns fixed-position top/left plus the max width.
 */
export function popoverPos(height: number): { top: number; left: number; maxWidth: number } {
  const maxWidth = Math.min(420, window.innerWidth - 16)
  const chip = document.querySelector('[data-dsh-annot-chip]')
  if (chip === null) return { top: 8, left: 8, maxWidth }
  const r = chip.getBoundingClientRect()
  const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - maxWidth - 8))
  const top = r.top - height - 10 >= 8 ? r.top - height - 10 : r.bottom + 10
  return { top, left, maxWidth }
}
