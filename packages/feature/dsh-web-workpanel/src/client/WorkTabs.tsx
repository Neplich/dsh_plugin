/** Top-level web-workpanel tabs. Each tab is either an independent file browser
 * or an independent terminal bound to its own host-side PTY. */
import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { closeTerminal } from './api.ts'
import { EntryGrid } from './EntryGrid.tsx'
import { FilesPane } from './FilesPane.tsx'
import { IconClose, IconFile, IconPlus, IconTerminal } from './icons.tsx'
import type { createWorkPanelStore, PanelTabState } from './store.ts'
import { TerminalPane } from './TerminalPane.tsx'

type Store = PropsStore<ReturnType<typeof createWorkPanelStore>>

export interface WorkTabsProps {
  readonly sessionId: string
  readonly cwd: string | undefined
  readonly useStore: Store['useStore']
  readonly actions: Store['actions']
  readonly t: PropsLocale<'workPanel'>['t']
  readonly controls: ReactNode
}

function baseName(path: string): string {
  return path.split('/').at(-1) ?? path
}

/** Mixed file/terminal tab workspace for one GUI session. */
export function WorkTabs({ sessionId, cwd, useStore, actions, t, controls }: WorkTabsProps): ReactElement {
  const state = useStore(s => s.panels[sessionId])
  const files = useStore(s => s.files[sessionId] ?? {})
  const tabs = state?.tabs ?? []
  const active = state?.active ?? null
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const closing = useRef(new Set<string>())

  const labelOf = (tab: PanelTabState): string => {
    const preview = tab.kind === 'files' ? files[tab.id]?.preview : null
    if (preview != null) return baseName(preview)
    return tab.kind === 'files'
      ? t('files.tab', { index: tab.index })
      : t('terminal.tab', { index: tab.index })
  }

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number, delta: number): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    if (tabs.length === 0) return
    const next = tabs[(index + delta + tabs.length) % tabs.length]
    if (next === undefined) return
    actions.selectTab(sessionId, next.id)
    refs.current.get(next.id)?.focus()
  }

  const close = (tab: PanelTabState): void => {
    if (closing.current.has(tab.id)) return
    if (tab.kind === 'files') {
      actions.removeTab(sessionId, tab.id)
      return
    }
    closing.current.add(tab.id)
    actions.removeTab(sessionId, tab.id)
    void closeTerminal(sessionId, tab.id)
      .catch(() => {})
      .finally(() => { closing.current.delete(tab.id) })
  }

  return (
    <div className="dshwp-workTabs">
      <div className="dshwp-header">
        {tabs.length === 0
          ? <div className="dshwp-title">{t('panel.title')}</div>
          : (
            <div className="dshwp-tabbar" role="tablist" aria-label={t('panel.tabs')}>
              <div className="dshwp-tabscroll">
                {tabs.map((tab, index) => {
                  const selected = tab.id === active
                  const label = labelOf(tab)
                  const accessibleLabel = tab.kind === 'files' && files[tab.id]?.preview == null
                    ? t('files.tabA11y', { index: tab.index })
                    : label
                  return (
                    <div key={tab.id} className="dshwp-tabcell" data-selected={selected || undefined}>
                      <button
                        ref={(element) => {
                          if (element === null) refs.current.delete(tab.id)
                          else refs.current.set(tab.id, element)
                        }}
                        type="button"
                        className="dshwp-tab"
                        role="tab"
                        id={`dshwp-tab-${tab.id}`}
                        aria-controls={`dshwp-panel-${tab.id}`}
                        aria-selected={selected}
                        aria-label={accessibleLabel}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => { actions.selectTab(sessionId, tab.id) }}
                        onKeyDown={(event) => { move(event, index, event.key === 'ArrowLeft' ? -1 : 1) }}
                      >
                        <span className="dshwp-tabIcon">
                          {tab.kind === 'files' ? <IconFile size={12} /> : <IconTerminal size={12} />}
                        </span>
                        <span className="dshwp-tabLabel">{label}</span>
                      </button>
                      <Tooltip label={t('panel.closeTab', { label: accessibleLabel })} side="bottom">
                        <button
                          type="button"
                          className="dshwp-tabClose"
                          aria-label={t('panel.closeTab', { label: accessibleLabel })}
                          onClick={() => { close(tab) }}
                        >
                          <IconClose size={11} />
                        </button>
                      </Tooltip>
                    </div>
                  )
                })}
              </div>
              <Tooltip label={t('panel.newTab')} side="bottom">
                <button
                  type="button"
                  className="dshwp-tabAdd"
                  aria-label={t('panel.newTab')}
                  onClick={() => { actions.showEntries(sessionId) }}
                >
                  <IconPlus size={13} />
                </button>
              </Tooltip>
            </div>
          )}
        {controls}
      </div>
      <div className="dshwp-tabpanels">
        {active === null && (
          <EntryGrid onPick={(kind) => { actions.addTab(sessionId, kind) }} t={t} />
        )}
        {tabs.map(tab => {
          const hidden = active !== tab.id
          if (cwd === undefined) {
            return hidden ? null : (
              <div key={tab.id} className="dshwp-note" role="tabpanel" id={`dshwp-panel-${tab.id}`} aria-labelledby={`dshwp-tab-${tab.id}`}>
                {tab.kind === 'files' ? t('files.unavailable') : t('terminal.unavailable')}
              </div>
            )
          }
          return tab.kind === 'files'
            ? (
                <FilesPane
                  key={tab.id}
                  hidden={hidden}
                  sessionId={sessionId}
                  tabId={tab.id}
                  labelledBy={`dshwp-tab-${tab.id}`}
                  panelId={`dshwp-panel-${tab.id}`}
                  cwd={cwd}
                  useStore={useStore}
                  actions={actions}
                  t={t}
                />
              )
            : (
                <TerminalPane
                  key={tab.id}
                  hidden={hidden}
                  sessionId={sessionId}
                  terminalId={tab.id}
                  labelledBy={`dshwp-tab-${tab.id}`}
                  panelId={`dshwp-panel-${tab.id}`}
                  t={t}
                />
              )
        })}
      </div>
    </div>
  )
}
