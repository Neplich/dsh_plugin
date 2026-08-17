/**
 * Annotation UI components: the floating "add to session" button and the
 * detail popover render in the shell's frame-wide overlay; the count chip
 * renders inside the composer's tool row. Components are plain React
 * (createElement, no JSX) reading the shared annotation state through a small
 * subscription hook — the overlay (root scope) and the chip (session scope)
 * cannot share one framework store seat, so the observable handle rides the
 * entry inject face instead.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { addButtonPos, popoverPos } from './dom.ts'
import type {
  Annotation, AnnotationActions, AnnotationState, PendingSelection,
} from './state.ts'
import type {} from './locales.ts'

/** Translate seat shape the slots framework synthesizes for the namespace. */
export type Translate = PropsLocale<'dsh-chat-annotations'>['t']

/** Engine callbacks handed to the components (DOM work stays in the engine). */
export interface EngineFace {
  addFromPending(): void
  scrollTo(id: string): void
  hoverEnter(): void
  hoverLeave(): void
}

/** The shared annotation state handle (inject face member). */
export interface AnnotationStateHandleFace {
  getSnapshot(): AnnotationState
  subscribe(fn: () => void): () => void
}

/** Subscribe a component to the annotation state. */
export function useAnnotState(handle: AnnotationStateHandleFace): AnnotationState {
  const [snap, setSnap] = useState<AnnotationState>(() => handle.getSnapshot())
  useEffect(() => handle.subscribe(() => setSnap(handle.getSnapshot())), [handle])
  return snap
}

/** Floating "add to session" pill next to a validated selection. */
export function AddButton({
  pending, engine, t,
}: {
  pending: PendingSelection
  engine: EngineFace
  t: Translate
}): ReactElement {
  const [pos, setPos] = useState(() => addButtonPos(pending.rect))
  useEffect(() => { setPos(addButtonPos(pending.rect)) }, [pending.rect])
  return (
    <button
      type="button"
      className="dsh-annot-add"
      data-dsh-annot-add=""
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => { e.preventDefault() }}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); engine.addFromPending() }}
    >
      {t('add.title')}
    </button>
  )
}

/** Detail popover: numbered annotations, each with the text and a delete button. */
export function PopoverView({
  sessionId, anns, activeId, actions, engine, t,
}: {
  sessionId: string
  anns: readonly Annotation[]
  activeId: string | null
  actions: AnnotationActions
  engine: EngineFace
  t: Translate
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState(() => popoverPos(120))
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const update = (): void => { setPos(popoverPos(el.offsetHeight)) }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anns.length])
  const items: ReactNode[] = []
  for (let i = 0; i < anns.length; i++) {
    const a = anns[i]
    if (a === undefined) continue
    items.push(
      <div
        key={a.id}
        className={`dsh-annot-item${a.id === activeId ? ' dsh-annot-item-active' : ''}`}
      >
        <span className="dsh-annot-index">{`${i + 1}.`}</span>
        <div
          className="dsh-annot-text"
          role="button"
          tabIndex={0}
          aria-label={a.text}
          onMouseEnter={() => actions.setActive(a.id)}
          onMouseLeave={() => actions.setActive(null)}
          onClick={() => engine.scrollTo(a.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); engine.scrollTo(a.id) }
          }}
        >
          {a.text}
        </div>
        <button
          type="button"
          className="dsh-annot-itemdel"
          aria-label={t('popover.remove')}
          title={t('popover.remove')}
          onClick={() => actions.removeAnnotation(sessionId, a.id)}
        >
          ×
        </button>
      </div>,
    )
  }
  return (
    <div
      ref={ref}
      className="dsh-annot-popover"
      data-dsh-annot-popover=""
      role="group"
      aria-label={t('chip.many', { count: anns.length })}
      style={{ top: pos.top, left: pos.left, maxWidth: pos.maxWidth }}
      onMouseEnter={engine.hoverEnter}
      onMouseLeave={engine.hoverLeave}
      onFocus={engine.hoverEnter}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Element) || !e.currentTarget.contains(e.relatedTarget)) engine.hoverLeave()
      }}
    >
      {items}
    </div>
  )
}

/** Overlay entry: renders the floating button, the popover, and auto-closes the popover when its session empties. */
export function OverlayView({
  state, actions, engine, t,
}: {
  state: AnnotationStateHandleFace
  actions: AnnotationActions
  engine: EngineFace
  t: Translate
}): ReactElement {
  const snap = useAnnotState(state)
  useEffect(() => {
    if (snap.popover !== null && snap.popover.open) {
      const anns = snap.bySession[snap.popover.sessionId] ?? []
      if (anns.length === 0) actions.setPopover(null)
    }
  }, [snap, actions])
  const popAnn = snap.popover !== null && snap.popover.open
    ? (snap.bySession[snap.popover.sessionId] ?? [])
    : []
  return (
    <>
      {snap.pending !== null
        ? <AddButton key={snap.pending.id} pending={snap.pending} engine={engine} t={t} />
        : null}
      {snap.popover !== null && snap.popover.open && popAnn.length > 0
        ? <PopoverView
          key={snap.popover.sessionId}
          sessionId={snap.popover.sessionId}
          anns={popAnn}
          activeId={snap.activeId}
          actions={actions}
          engine={engine}
          t={t}
        />
        : null}
    </>
  )
}

/** Composer chip: the "N annotations" pill with its in-capsule clear button. */
export function ChipView({
  sessionId, state, actions, engine, t,
}: {
  sessionId: string
  state: AnnotationStateHandleFace
  actions: AnnotationActions
  engine: EngineFace
  t: Translate
}): ReactElement | null {
  const snap = useAnnotState(state)
  const anns = snap.bySession[sessionId] ?? []
  const count = anns.length
  if (count === 0) return null
  const label = count === 1 ? t('chip.one', { count }) : t('chip.many', { count })
  const open = snap.popover !== null && snap.popover.sessionId === sessionId && snap.popover.open
  const openPopover = (): void => { engine.hoverEnter(); actions.setPopover({ sessionId, open: true }) }
  return (
    <div className="dsh-annot-chipwrap" data-dsh-annot-chip="">
      <div
        className="dsh-annot-chip"
        onMouseEnter={openPopover}
        onMouseLeave={engine.hoverLeave}
      >
        <button
          type="button"
          className="dsh-annot-chiptoggle"
          data-dsh-annot-chip-btn=""
          aria-label={label}
          aria-expanded={open ? 'true' : 'false'}
          onFocus={openPopover}
          onBlur={(e) => {
            if (!(e.relatedTarget instanceof Element) || !e.currentTarget.contains(e.relatedTarget)) engine.hoverLeave()
          }}
          onClick={() => actions.setPopover({ sessionId, open: !open })}
        >
          <span>💬</span>
          <span>{label}</span>
        </button>
        <button
          type="button"
          className="dsh-annot-chipclear"
          aria-label={t('chip.clear')}
          title={t('chip.clear')}
          onClick={() => actions.clearAll(sessionId)}
        >
          ×
        </button>
      </div>
    </div>
  )
}
