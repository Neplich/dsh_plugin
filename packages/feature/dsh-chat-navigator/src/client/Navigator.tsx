/**
 * The conversation rail: a slim fixed strip at the left edge of the center
 * column (flush against the sidebar), vertically centered, one short dash per
 * user round. The dash for the round at the current reading position stays
 * highlighted and follows scrolling; hovering or focusing a dash magnifies it
 * fisheye-style and opens a preview card (request + response summaries,
 * status); clicking a dash or the card scrolls the chat to that round's user
 * message and briefly flashes the row. All data derives from the live session
 * snapshot — no model call, no session writes, no persistence.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { MouseEvent as ReactMouseEvent, FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ConversationSnapshot, SessionBinding, SessionId,
} from '@deepseek-ai/dsh-client-runtime/client'
import { buildRounds, type Round } from './rounds.ts'

/** Verbs the registration's inject face hands the rail. */
export interface NavigatorInjected {
  /** Resolve one session's binding (object layer). */
  readonly getBinding: (id: SessionId) => SessionBinding | undefined
  /** Re-arm full-history paging for a session (chatAutoload service). */
  readonly ensureLoaded: (id: SessionId) => void
}

/** Full props: framework runtime share, injected verbs, locale seat. */
export type NavigatorProps =
  & PropsRuntime<'shell.overlay'>
  & NavigatorInjected
  & PropsLocale<'chat-navigator'>

/** Rail geometry in viewport coordinates. */
interface RailGeo {
  readonly left: number
  readonly top: number
  readonly height: number
}

/** One hovered marker: its round plus the card anchor height. */
interface HoverState {
  readonly round: Round
  readonly top: number
}

/** The chat flow column rendered by the conversation view. */
function findFlow(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-chat-flow]')
}

/** The conversation scrollport (center-column host, or the view-local scroller). */
function findScrollport(flow: HTMLElement | null): HTMLElement | null {
  if (flow === null) return null
  return flow.closest<HTMLElement>('[data-conversation-scroll]') ?? flow.parentElement
}

/** One rendered chat row by its stable anchor key. */
function anchorRow(key: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(key) : key
  return document.querySelector<HTMLElement>('[data-chat-anchor-key="' + escaped + '"]')
}

/**
 * The rail entry. Renders null unless a session with at least two rounds is
 * current, so short conversations stay visually quiet.
 * @param props - slot props.
 * @returns the rail overlay, or null.
 */
export function Navigator({ useSessions, getBinding, ensureLoaded, t }: NavigatorProps): ReactElement | null {
  const current = useSessions(s => s.current)
  const [geo, setGeo] = useState<RailGeo | null>(null)
  const [curKey, setCurKey] = useState<string | null>(null)
  const [hovered, setHovered] = useState<HoverState | null>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const binding = current === undefined ? undefined : getBinding(current)
  const session = binding?.session
  const snapshot = useSyncExternalStore(
    session === undefined ? () => () => {} : (fn: () => void) => session.subscribe(fn),
    (): ConversationSnapshot | null => session === undefined ? null : session.getSnapshot(),
  )

  // Session switch: reset per-session viewing state and re-arm full-history
  // paging (the chatAutoload service dedupes its own watcher).
  useEffect(() => {
    setHovered(null)
    setHoverIdx(null)
    setCurKey(null)
    if (current !== undefined) ensureLoaded(current)
  }, [current, ensureLoaded])

  const rounds = snapshot === null ? [] : buildRounds(snapshot)
  const hasMore = snapshot?.hasMore === true

  function measure(): void {
    const flow = findFlow()
    const port = findScrollport(flow)
    if (flow === null || port === null) {
      setGeo(null)
      return
    }
    const portRect = port.getBoundingClientRect()
    const composer = port.querySelector<HTMLElement>('[data-composer-seat]')
    const bottom = composer !== null ? composer.getBoundingClientRect().top : portRect.bottom
    // X: directly under the session header's first view tab (对话/Chat); the
    // rail's dashes start at geo.left - 11, so anchor centers on tab.left + 11.
    // Fallback (no tab bar): the scrollport's left edge.
    const firstTab = document.querySelector<HTMLElement>('[role="tablist"] [role="tab"]')
    const left = firstTab !== null ? firstTab.getBoundingClientRect().left + 11 : portRect.left + 14
    const avail = Math.max(160, bottom - portRect.top - 64)
    const height = Math.min(Math.max(60, rounds.length * 15 + 10), avail)
    const top = portRect.top + (bottom - portRect.top - height) / 2
    setGeo(prev => (prev !== null
      && Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5)
      ? prev
      : { left, top, height })
    // Pinning policy: the newest round whose user row has entered the
    // visible area is current — scrolling to the bottom always marks the
    // latest round, even when its row never reaches a top reading line.
    let next: string | null = null
    for (const round of rounds) {
      const row = anchorRow(round.anchorKey)
      if (row !== null && row.getBoundingClientRect().top <= bottom - 8) next = round.anchorKey
    }
    if (next === null && rounds.length > 0) next = rounds[0]!.anchorKey
    setCurKey(prev => (prev === next ? prev : next))
  }

  // Re-measure after every commit (snapshot growth, stream height changes).
  useEffect(() => { measure() })
  // Scroll / resize / layout changes: rAF-throttled re-measure.
  useEffect(() => {
    const flow = findFlow()
    const port = findScrollport(flow)
    if (port === null) return
    let raf = 0
    const onScroll = (): void => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => { raf = 0; measure() })
    }
    port.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null
    if (observer !== null) {
      observer.observe(port)
      if (flow !== null) observer.observe(flow)
    }
    return () => {
      port.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      observer?.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [current, snapshot?.chat.order.length])

  if (current === undefined || rounds.length < 2 || geo === null) return null

  /** Scroll one round's user message into view and flash the row briefly. */
  function jump(round: Round): void {
    const row = anchorRow(round.anchorKey)
    if (row !== null) {
      const reduce = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      row.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      row.classList.remove('dshn-flash')
      void row.offsetWidth
      row.classList.add('dshn-flash')
      setTimeout(() => { row.classList.remove('dshn-flash') }, 1700)
    }
    setHovered(null)
  }

  /** Fisheye width: hovered dash doubles, neighbors decay by distance. */
  function markerWidth(i: number, round: Round): number {
    const base = curKey === round.anchorKey ? 22 : 14
    if (hoverIdx === null) return base
    const distance = Math.abs(i - hoverIdx)
    const fish = distance === 0 ? 28 : distance === 1 ? 20 : distance === 2 ? 16 : 14
    return Math.max(base, fish)
  }

  function hoverFrom(event: ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>, i: number, round: Round): void {
    setHoverIdx(i)
    const rect = event.currentTarget.getBoundingClientRect()
    setHovered({ round, top: rect.top + rect.height / 2 })
  }

  function unhover(round: Round): void {
    setHoverIdx(null)
    setHovered(h => (h !== null && h.round.anchorKey === round.anchorKey ? null : h))
  }

  const markers = rounds.map((round, i) => (
    <button
      key={round.anchorKey}
      type="button"
      className="dshn-marker"
      style={{ '--dshn-w': markerWidth(i, round) + 'px' } as Record<string, string>}
      data-current={curKey === round.anchorKey ? '1' : undefined}
      data-status={round.status === 'done' ? undefined : round.status}
      aria-label={t('round.title', { n: round.index }) + ' · ' + round.title}
      onClick={() => { jump(round) }}
      onMouseEnter={e => { hoverFrom(e, i, round) }}
      onFocus={e => { hoverFrom(e, i, round) }}
      onMouseLeave={() => { unhover(round) }}
      onBlur={() => { unhover(round) }}
    />
  ))

  function onCardKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, round: Round): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      jump(round)
    } else if (event.key === 'Escape') {
      setHovered(null)
    }
  }

  return (
    <>
      <nav
        className="dshn-rail"
        aria-label={t('rail.label')}
        style={{ left: geo.left - 11, top: geo.top, height: geo.height }}
      >
        {hasMore && (
          <div className="dshn-hint" role="img" aria-label={t('history.loading')}>
            <span /><span /><span />
          </div>
        )}
        <div className="dshn-markers">{markers}</div>
      </nav>
      {hovered !== null && (
        <div
          className="dshn-card"
          role="button"
          tabIndex={0}
          style={{ left: geo.left + 18, top: Math.max(56, Math.min(hovered.top - 12, window.innerHeight - 210)) }}
          onClick={() => { jump(hovered.round) }}
          onKeyDown={e => { onCardKeyDown(e, hovered.round) }}
          onMouseLeave={() => { setHovered(null) }}
        >
          <div className="dshn-row">{hovered.round.userSummary || '…'}</div>
          <div className="dshn-row-a">
            {hovered.round.status === 'processing'
              ? <>{hovered.round.assistantSummary === '' ? '' : hovered.round.assistantSummary + ' '}<span className="dshn-shimmer">{t('status.running')}</span></>
              : hovered.round.assistantSummary || '—'}
          </div>
        </div>
      )}
    </>
  )
}
