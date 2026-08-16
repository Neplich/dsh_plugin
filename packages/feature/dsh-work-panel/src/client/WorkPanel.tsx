/**
 * The work panel root: a right-docked surface inside the shell workbench
 * column. It owns the panel controls, drag-resize handle, narrow-viewport
 * auto-collapse, and the mutual exclusion with
 * the shell's tool-details column — opening this panel closes the details
 * column through ctx.layout, and a later details opening (a tool-call click
 * in the conversation) closes this panel, so the two never overlap.
 *
 * The entry renders null while closed; file-browser view state survives in
 * the panel store, and the terminal's process and output survive host-side
 * in the PTY pool (replayed on reopen).
 */
import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactElement, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  AUTO_COLLAPSE_VIEWPORT, WIDTH_MAX, WIDTH_MIN, type createWorkPanelStore,
} from './store.ts'
import { WorkTabs } from './WorkTabs.tsx'
import { IconClose, IconMaximize, IconRestore } from './icons.tsx'

/** Verbs the registration's inject face hands the panel. */
export interface WorkPanelInjected {
  /** Close the shell's tool-details column. */
  readonly closeDetails: () => void
}

/** Full props composed from the four shares. */
export type WorkPanelProps =
  & PropsRuntime<'shell.workbench'>
  & PropsStore<ReturnType<typeof createWorkPanelStore>>
  & WorkPanelInjected
  & PropsLocale<'workPanel'>

type Store = PropsStore<ReturnType<typeof createWorkPanelStore>>

/** The left-edge drag strip: pointer capture, rAF-throttled width reports. */
function DragHandle({ width, actions, t }: {
  readonly width: number
  readonly actions: Store['actions']
  readonly t: PropsLocale<'workPanel'>['t']
}): ReactElement {
  const origin = useRef(0)
  const base = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)

  const flush = (): void => {
    frame.current = null
    actions.setWidth(base.current + (origin.current - latest.current))
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    base.current = width
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(flush)
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    actions.setWidth(base.current + (origin.current - latest.current))
  }
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      actions.setWidth(Math.min(width + 16, WIDTH_MAX))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      actions.setWidth(Math.max(width - 16, WIDTH_MIN))
    }
  }
  return (
    <div
      className="dshwp-drag"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panel.resize')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}

/** The panel surface. */
export function WorkPanel(props: WorkPanelProps): ReactElement | null {
  const { useStore, useSessions, actions, closeDetails, t } = props
  const open = useStore(s => s.open)
  const width = useStore(s => s.width)
  const maximized = useStore(s => s.maximized)
  const sessionId = useSessions(s => s.current)
  const cwd = useSessions(s => (s.current === undefined ? undefined : s.byId[s.current]?.cwd))
  const rootRef = useRef<HTMLElement | null>(null)

  // This panel and the tool-details column share the right edge: opening one
  // closes the other. closeDetails runs on open; the observer yields the
  // edge when the conversation opens the details column afterwards.
  useEffect(() => {
    if (open) closeDetails()
  }, [open, closeDetails])
  useEffect(() => {
    if (!open) return
    const frame = rootRef.current?.closest('[data-shell-frame]')
    if (frame == null) return
    const observer = new MutationObserver(() => {
      if (!frame.hasAttribute('data-details-collapsed')) actions.closePanel()
    })
    observer.observe(frame, { attributes: true, attributeFilter: ['data-details-collapsed'] })
    return () => { observer.disconnect() }
  }, [open, actions])

  // Narrow viewports reserve the space for the conversation: the panel
  // collapses (its state survives) instead of squeezing the center column.
  useEffect(() => {
    if (!open) return
    const query = window.matchMedia(`(max-width: ${AUTO_COLLAPSE_VIEWPORT - 1}px)`)
    if (query.matches) {
      actions.closePanel()
      return
    }
    const onChange = (event: MediaQueryListEvent): void => {
      if (event.matches) actions.closePanel()
    }
    query.addEventListener('change', onChange)
    return () => { query.removeEventListener('change', onChange) }
  }, [open, actions])

  if (!open || sessionId === undefined) return null

  return (
    <aside ref={rootRef} className="dshwp-root" style={{ width }} aria-label={t('panel.title')}>
      <DragHandle width={width} actions={actions} t={t} />
      <div className="dshwp-body">
        <WorkTabs
          sessionId={sessionId}
          cwd={cwd}
          useStore={useStore}
          actions={actions}
          t={t}
          controls={(
            <div className="dshwp-actions">
              <Tooltip label={maximized ? t('panel.restore') : t('panel.maximize')} side="bottom">
                <button
                  type="button"
                  className="dshwp-iconbtn"
                  aria-label={maximized ? t('panel.restore') : t('panel.maximize')}
                  aria-pressed={maximized}
                  onClick={() => { actions.toggleMaximize(window.innerWidth) }}
                >
                  {maximized ? <IconRestore size={14} /> : <IconMaximize size={14} />}
                </button>
              </Tooltip>
              <Tooltip label={t('panel.close')} side="bottom">
                <button
                  type="button"
                  className="dshwp-iconbtn"
                  aria-label={t('panel.close')}
                  onClick={() => { actions.closePanel() }}
                >
                  <IconClose size={14} />
                </button>
              </Tooltip>
            </div>
          )}
        />
      </div>
    </aside>
  )
}
