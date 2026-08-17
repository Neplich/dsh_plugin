/**
 * Annotation records plugin, browser half: select text inside a settled
 * assistant message and attach it as a pending annotation to the composer.
 *
 * The floating "add to session" button appears next to a valid selection
 * (single assistant-step flow item, not streaming, not reasoning/tool chrome,
 * not overlapping an existing annotation); clicking wraps the selected text
 * in marks (persisted across React re-renders through child-index paths plus
 * a MutationObserver) and raises the composer chip. The chip's popover lists
 * the annotations (hover strengthens the original highlight, click scrolls to
 * it, per-item delete), the chip's × clears all. On send, the annotation
 * texts ride into the message content verbatim (blank-line separated) —
 * annotations alone never trigger a send; a successful send clears them, a
 * failed one keeps them.
 *
 * Pure DOM strategy over the shipped chat flow plus one scoped `session.prompt`
 * wrapper per session with annotations — no harness change, no slot takeover.
 * Annotation state lives in this plugin only (per browser session, not
 * persisted); the marks are presentation, never part of the log.
 *
 * @module @neplich/dsh-annotations/client
 */
import type {
  ClientContext, SessionFace, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.timer service declaration.
import type {} from '@deepseek-ai/dsh-cordis-client-runner/client'
// Type-only: the 'shell.overlay' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the 'conversation.input.left' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ChipView, OverlayView, type EngineFace } from './components.tsx'
import {
  FLOW_SEL, MARK_ATTR, findItem, nodeAtPath, pathTo, rectOf, textNodesInRange, wrapRange,
} from './dom.ts'
import { en, NS, zh } from './locales.ts'
import { createAnnotationState, type Annotation, type Rect } from './state.ts'
import { PLUGIN_ID, STYLE_TEXT } from './styles.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'sessions', 'timer']

/** A validated selection descriptor (paths are taken before any mark wrap). */
interface SelectionInfo {
  id: string
  sessionId: string
  flowKey: string
  text: string
  startPath: readonly number[]
  startOffset: number
  endPath: readonly number[]
  endOffset: number
  rect: Rect
}

/** The flow item owning a node, or null outside any chat row. */
function flowItemOf(node: Node): HTMLElement | null {
  const el = node.nodeType === 1 ? (node as Element) : (node.parentElement ?? undefined)
  return el === undefined ? null : el.closest<HTMLElement>(FLOW_SEL)
}

/** Resolve a stored selection/annotation range against the live flow item. */
function resolveRange(item: HTMLElement, p: {
  startPath: readonly number[]
  startOffset: number
  endPath: readonly number[]
  endOffset: number
}): Range | null {
  const start = nodeAtPath(item, p.startPath)
  const end = nodeAtPath(item, p.endPath)
  if (start === null || end === null || start.nodeType !== 3 || end.nodeType !== 3) return null
  const range = document.createRange()
  range.setStart(start, Math.min(p.startOffset, (start as Text).data.length))
  range.setEnd(end, Math.min(p.endOffset, (end as Text).data.length))
  return range
}

/** Client plugin body. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-annotations: dictionaries')

  const state = createAnnotationState()
  const { actions } = state

  // --- engine ---
  let leaveTimer: (() => void) | null = null
  let rafId: number | null = null
  let applying = false
  let lastMarksRev = 0
  const patched = new WeakSet<SessionFace>()
  const originalPrompts = new Map<SessionFace, SessionFace['prompt']>()

  function currentSessionId(): SessionId | undefined {
    return ctx.sessions.list.getSnapshot().current
  }

  /** Validate the live browser selection; null when it must not annotate. */
  function selectionInfo(): SelectionInfo | null {
    const sel = window.getSelection()
    if (sel === null || sel.rangeCount === 0 || sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    const text = range.toString()
    if (text.trim() === '') return null
    const startItem = flowItemOf(range.startContainer)
    const endItem = flowItemOf(range.endContainer)
    if (startItem === null || startItem !== endItem) return null
    if (startItem.dataset.chatFlowKind !== 'assistant-step') return null
    if (startItem.querySelector('[data-streaming]') !== null) return null
    const nodes = textNodesInRange(range)
    if (nodes.length === 0) return null
    for (const n of nodes) {
      if (!startItem.contains(n)) return null
      const probe = n.parentElement?.closest(
        '[data-variant="think"], details, summary, button, [role="button"], [data-dsh-annot]',
      )
      if (probe !== null && probe !== undefined) return null
    }
    for (const m of Array.from(startItem.querySelectorAll(`[${MARK_ATTR}]`))) {
      if (range.intersectsNode(m)) return null
    }
    const startPath = pathTo(startItem, range.startContainer)
    const endPath = pathTo(startItem, range.endContainer)
    if (startPath === null || endPath === null) return null
    const sid = currentSessionId()
    if (sid === undefined) return null
    return {
      id: `pend-${Math.random().toString(36).slice(2, 10)}`,
      sessionId: sid,
      flowKey: startItem.dataset.chatAnchorKey ?? '',
      text,
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
      rect: rectOf(range),
    }
  }

  /** Whether the annotation's marks already cover its text (idempotence check). */
  function isWrapped(ann: Annotation): boolean {
    const item = findItem(ann.flowKey)
    if (item === null) return false
    let text = ''
    let found = false
    for (const m of Array.from(item.querySelectorAll(`[${MARK_ATTR}]`))) {
      if (m.getAttribute(MARK_ATTR) !== ann.id) continue
      found = true
      text += m.textContent
    }
    return found && text === ann.text
  }

  /** Re-apply one annotation's marks to its flow item (no-op when wrapped). */
  function applyAnnotation(ann: Annotation, item: HTMLElement): void {
    if (isWrapped(ann)) return
    unmarkId(ann.id)
    const range = resolveRange(item, ann)
    if (range === null || range.toString() !== ann.text) return
    wrapRange(range, ann.id)
  }

  function unmarkId(id: string): void {
    for (const m of Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))) {
      if (m.getAttribute(MARK_ATTR) !== id) continue
      m.replaceWith(...m.childNodes)
    }
  }

  /** Full mark re-sync for the current session (drop stale, re-wrap live). */
  function syncMarks(): void {
    const sid = currentSessionId()
    const anns = sid === undefined ? [] : (state.getSnapshot().bySession[sid] ?? [])
    const keep = new Set(anns.map(a => a.id))
    for (const m of Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))) {
      if (!keep.has(m.getAttribute(MARK_ATTR) ?? '')) m.replaceWith(...m.childNodes)
    }
    const byKey = new Map<string, Annotation[]>()
    for (const a of anns) {
      const list = byKey.get(a.flowKey)
      if (list === undefined) byKey.set(a.flowKey, [a])
      else list.push(a)
    }
    for (const [key, list] of byKey) {
      const item = findItem(key)
      if (item === null) continue
      for (const a of list) applyAnnotation(a, item)
    }
  }

  /** Keep the active/flash classes on the live marks. */
  function syncActiveAndFlash(snap: ReturnType<typeof state.getSnapshot>): void {
    for (const m of Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))) {
      const id = m.getAttribute(MARK_ATTR) ?? ''
      m.classList.toggle('dsh-annot-active', id === snap.activeId)
      m.classList.toggle('dsh-annot-flash', id === snap.flashId)
    }
  }

  function scheduleSync(): void {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      applying = true
      try { syncMarks() } finally { applying = false }
    })
  }

  function onStateChange(): void {
    const snap = state.getSnapshot()
    if (snap.marksRev !== lastMarksRev) {
      lastMarksRev = snap.marksRev
      syncMarks()
      const sid = currentSessionId()
      if (sid !== undefined) ensurePatch(sid)
    }
    syncActiveAndFlash(snap)
  }

  let lastCurrent: SessionId | undefined
  function onSessionsChange(): void {
    const next = currentSessionId()
    if (next === lastCurrent) return
    lastCurrent = next
    actions.setPending(null)
    actions.setPopover(null)
    actions.setActive(null)
    const ids = new Set(ctx.sessions.list.getSnapshot().ids)
    for (const sid of Object.keys(state.getSnapshot().bySession)) {
      if (!ids.has(sid as SessionId)) actions.clearSend(sid)
    }
    syncMarks()
    if (next !== undefined) ensurePatch(next)
  }

  function onMouseUp(e: MouseEvent): void {
    if (e.button !== 0) return
    const t = e.target
    if (t instanceof Element && t.closest('[data-dsh-annot-add]') !== null) return
    const info = selectionInfo()
    if (info !== null) actions.setPending(info)
    else actions.setPending(null)
  }

  function onPointerDown(e: PointerEvent): void {
    const t = e.target
    const inAdd = t instanceof Element && t.closest('[data-dsh-annot-add]') !== null
    if (!inAdd) actions.setPending(null)
    const inPop = t instanceof Element && t.closest('[data-dsh-annot-popover]') !== null
    const inChip = t instanceof Element && t.closest('[data-dsh-annot-chip]') !== null
    const snap = state.getSnapshot()
    if (!inPop && !inChip && snap.popover !== null && snap.popover.open) {
      actions.setPopover(null)
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return
    const snap = state.getSnapshot()
    if (snap.pending !== null) actions.setPending(null)
    if (snap.popover !== null && snap.popover.open) actions.setPopover(null)
    actions.setActive(null)
  }

  function onSelectionChange(): void {
    const pending = state.getSnapshot().pending
    if (pending === null) return
    const sel = window.getSelection()
    if (sel === null || sel.rangeCount === 0 || sel.isCollapsed) { actions.setPending(null); return }
    const info = selectionInfo()
    if (info === null || info.flowKey !== pending.flowKey || info.text !== pending.text) {
      actions.setPending(null)
      return
    }
    actions.setPending({ ...info, id: pending.id, sessionId: pending.sessionId })
  }

  function onScrollCapture(): void {
    const pending = state.getSnapshot().pending
    if (pending === null) return
    const item = findItem(pending.flowKey)
    if (item === null) { actions.setPending(null); return }
    const r = item.getBoundingClientRect()
    if (r.bottom < 0 || r.top > window.innerHeight) { actions.setPending(null); return }
    const range = resolveRange(item, pending)
    if (range === null) { actions.setPending(null); return }
    actions.setPending({ ...pending, rect: rectOf(range) })
  }

  /**
   * Wrap one session's `prompt` so pending annotation texts ride into the
   * sent message verbatim (blank-line separated). A successful send clears
   * the annotations; a failed one keeps them for retry. The wrapper is
   * installed per session instance once, while annotations exist.
   */
  function ensurePatch(sessionId: SessionId): void {
    const anns = state.getSnapshot().bySession[sessionId] ?? []
    if (anns.length === 0) return
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) return
    const session = binding.session
    if (patched.has(session)) return
    const original = session.prompt
    if (typeof original !== 'function') return
    patched.add(session)
    originalPrompts.set(session, original)
    const boundOriginal = original.bind(session)
    session.prompt = async (content, mode) => {
      const list = state.getSnapshot().bySession[sessionId] ?? []
      let next = content
      if (list.length > 0) {
        const blocks = list.map(a => ({ type: 'text' as const, text: `${a.text}\n\n` }))
        next = [...blocks, ...content]
      }
      const result = await boundOriginal(next, mode)
      if (result.ok) actions.clearSend(sessionId)
      return result
    }
  }

  function addFromPending(): void {
    const p = state.getSnapshot().pending
    if (p === null) return
    const item = findItem(p.flowKey)
    if (item === null) return
    const range = resolveRange(item, p)
    if (range === null || range.toString() !== p.text) return
    const id = `ann-${Math.random().toString(36).slice(2, 10)}`
    wrapRange(range, id)
    actions.addAnnotation({
      id,
      sessionId: p.sessionId,
      flowKey: p.flowKey,
      text: p.text,
      startPath: p.startPath,
      startOffset: p.startOffset,
      endPath: p.endPath,
      endOffset: p.endOffset,
    })
    const sel = window.getSelection()
    if (sel !== null) sel.removeAllRanges()
  }

  function scrollToAnnotation(id: string): void {
    const marks = Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))
      .filter(m => m.getAttribute(MARK_ATTR) === id)
    if (marks.length === 0) return
    const first = marks[0] as HTMLElement
    let n: HTMLElement | null = first
    while (n !== null) {
      if (n instanceof HTMLDetailsElement && !n.open) n.open = true
      n = n.parentElement
    }
    first.scrollIntoView({ block: 'center', behavior: 'smooth' })
    actions.setFlash(id)
    ctx.timer.timeout(() => {
      if (state.getSnapshot().flashId === id) actions.setFlash(null)
    }, 1400)
  }

  const hoverEnter = (): void => {
    if (leaveTimer !== null) { leaveTimer(); leaveTimer = null }
  }
  const hoverLeave = (): void => {
    if (leaveTimer !== null) leaveTimer()
    leaveTimer = ctx.timer.timeout(() => {
      const snap = state.getSnapshot()
      if (snap.popover !== null && snap.popover.open) actions.setPopover(null)
    }, 260)
  }

  const engine: EngineFace = { addFromPending, scrollTo: scrollToAnnotation, hoverEnter, hoverLeave }
  const face = (): { state: typeof state; actions: typeof actions; engine: EngineFace } => ({
    state,
    actions,
    engine,
  })

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset['plugin'] = PLUGIN_ID
    style.textContent = STYLE_TEXT
    document.head.appendChild(style)
    const offs: Array<() => void> = []
    offs.push(state.subscribe(onStateChange))
    offs.push(ctx.sessions.list.subscribe(onSessionsChange))

    document.addEventListener('mouseup', onMouseUp)
    offs.push(() => document.removeEventListener('mouseup', onMouseUp))
    document.addEventListener('pointerdown', onPointerDown, true)
    offs.push(() => document.removeEventListener('pointerdown', onPointerDown, true))
    document.addEventListener('keydown', onKeyDown, true)
    offs.push(() => document.removeEventListener('keydown', onKeyDown, true))
    document.addEventListener('selectionchange', onSelectionChange)
    offs.push(() => document.removeEventListener('selectionchange', onSelectionChange))
    document.addEventListener('scroll', onScrollCapture, true)
    offs.push(() => document.removeEventListener('scroll', onScrollCapture, true))

    const observer = new MutationObserver((records) => {
      if (applying) return
      const sid = currentSessionId()
      const anns = sid === undefined ? [] : (state.getSnapshot().bySession[sid] ?? [])
      if (anns.length === 0) return
      const keys = new Set(anns.map(a => a.flowKey))
      const touched = (el: Node): boolean => {
        if (!(el instanceof Element)) return false
        const item = el.closest<HTMLElement>(FLOW_SEL)
        if (item === null) return false
        const key = item.dataset.chatAnchorKey
        return key !== undefined && keys.has(key)
      }
      let need = false
      for (const rec of records) {
        if (touched(rec.target)) { need = true; break }
        if (rec.type === 'childList') {
          for (const added of rec.addedNodes) {
            if (touched(added)) { need = true; break }
          }
          if (need) break
        }
      }
      if (need) scheduleSync()
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    offs.push(() => observer.disconnect())

    lastCurrent = currentSessionId()
    syncMarks()
    if (lastCurrent !== undefined) ensurePatch(lastCurrent)

    return () => {
      style.remove()
      for (const off of offs) off()
      if (leaveTimer !== null) leaveTimer()
      if (rafId !== null) cancelAnimationFrame(rafId)
      for (const m of Array.from(document.querySelectorAll(`[${MARK_ATTR}]`))) {
        m.replaceWith(...m.childNodes)
      }
      for (const [session, original] of originalPrompts) {
        session.prompt = original
      }
      originalPrompts.clear()
    }
  }, 'dsh-annotations: engine')

  ctx.effect(() => {
    const disposers = [
      ctx.slots.inject('shell.overlay', () => ctx.slots.register(
        { name: 'shell.overlay', id: 'dsh-annotations', order: 300, locale: NS, inject: () => face() },
        OverlayView,
      )),
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register(
        { name: 'conversation.input.left', id: 'dsh-annotations', order: 100, locale: NS, inject: () => face() },
        ChipView,
      )),
    ]
    return () => { for (const d of disposers) d() }
  }, 'dsh-annotations: slots')
}
