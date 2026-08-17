/**
 * Annotation state: the per-session pending annotation lists plus the shared
 * interaction state (floating-button selection, popover, hover/flash marks).
 * A plain observable (getSnapshot/subscribe) with a baked action set — the
 * browser components read it and the DOM engine subscribes to it; there is no
 * harness store seat because the overlay entry (root scope) and the composer
 * chip entry (session scope) cannot share one framework store handle.
 */

/** Viewport-space selection rectangle (getBoundingClientRect projection). */
export interface Rect {
  readonly top: number
  readonly left: number
  readonly bottom: number
  readonly right: number
  readonly width: number
  readonly height: number
}

/** One pending annotation: the selected text plus its DOM anchor paths. */
export interface Annotation {
  readonly id: string
  readonly sessionId: string
  /** `data-chat-anchor-key` of the assistant flow item the text was taken from. */
  readonly flowKey: string
  readonly text: string
  /** Child-index path (skipping annotation marks) from the flow item to the range start text node. */
  readonly startPath: readonly number[]
  readonly startOffset: number
  /** Child-index path (skipping annotation marks) to the range end text node. */
  readonly endPath: readonly number[]
  readonly endOffset: number
}

/** A validated in-flight selection waiting for the user to click add. */
export interface PendingSelection {
  readonly id: string
  readonly sessionId: string
  readonly flowKey: string
  readonly text: string
  readonly startPath: readonly number[]
  readonly startOffset: number
  readonly endPath: readonly number[]
  readonly endOffset: number
  readonly rect: Rect
}

/** Popover open state, addressed to one session. */
export interface PopoverState {
  readonly sessionId: string
  readonly open: boolean
}

/** One undoable clear-all snapshot (kept for the toast window). */
export interface UndoSnapshot {
  readonly sessionId: string
  readonly items: readonly Annotation[]
  readonly key: number
}

/** Full observable state. */
export interface AnnotationState {
  readonly bySession: Readonly<Record<string, readonly Annotation[]>>
  readonly pending: PendingSelection | null
  readonly popover: PopoverState | null
  /** Annotation id whose marks get the stronger highlight (popover hover). */
  readonly activeId: string | null
  /** Annotation id whose marks flash (scroll-into-view feedback). */
  readonly flashId: string | null
  /** Bumped on every annotation-set mutation; the DOM engine re-syncs on change. */
  readonly marksRev: number
}

/** The state's complete write set (the audit face for components and the engine). */
export interface AnnotationActions {
  addAnnotation(ann: Annotation): void
  removeAnnotation(sessionId: string, id: string): void
  clearAll(sessionId: string): void
  /** Clear the session's annotations after a successful send. */
  clearSend(sessionId: string): void
  setPending(p: PendingSelection | null): void
  setPopover(p: PopoverState | null): void
  setActive(id: string | null): void
  setFlash(id: string | null): void
}

/** The observable handle shared by the components and the DOM engine. */
export interface AnnotationStateHandle {
  getSnapshot(): AnnotationState
  subscribe(fn: () => void): () => void
  actions: AnnotationActions
}

/** Create one annotation state instance (per plugin fiber). */
export function createAnnotationState(): AnnotationStateHandle {
  let state: AnnotationState = {
    bySession: {},
    pending: null,
    popover: null,
    activeId: null,
    flashId: null,
    marksRev: 0,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<AnnotationState>): void => {
    state = { ...state, ...patch }
    for (const fn of Array.from(listeners)) fn()
  }
  const actions: AnnotationActions = {
    addAnnotation(ann) {
      const list = state.bySession[ann.sessionId] ?? []
      if (list.some(a => a.id === ann.id)) return
      set({ bySession: { ...state.bySession, [ann.sessionId]: [...list, ann] }, pending: null, marksRev: state.marksRev + 1 })
    },
    removeAnnotation(sessionId, id) {
      const list = (state.bySession[sessionId] ?? []).filter(a => a.id !== id)
      set({
        bySession: { ...state.bySession, [sessionId]: list },
        activeId: state.activeId === id ? null : state.activeId,
        marksRev: state.marksRev + 1,
      })
    },
    clearAll(sessionId) {
      const list = state.bySession[sessionId] ?? []
      if (list.length === 0) return
      set({
        bySession: { ...state.bySession, [sessionId]: [] },
        popover: state.popover !== null && state.popover.sessionId === sessionId ? null : state.popover,
        activeId: null,
        marksRev: state.marksRev + 1,
      })
    },
    clearSend(sessionId) {
      if (!(state.bySession[sessionId] ?? []).length) return
      set({
        bySession: { ...state.bySession, [sessionId]: [] },
        pending: state.pending !== null && state.pending.sessionId === sessionId ? null : state.pending,
        popover: state.popover !== null && state.popover.sessionId === sessionId ? null : state.popover,
        activeId: null,
        marksRev: state.marksRev + 1,
      })
    },
    setPending(p) { set({ pending: p, activeId: null }) },
    setPopover(p) { set({ popover: p, activeId: null }) },
    setActive(id) { if (state.activeId !== id) set({ activeId: id }) },
    setFlash(id) { if (state.flashId !== id) set({ flashId: id }) },
  }
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    actions,
  }
}
