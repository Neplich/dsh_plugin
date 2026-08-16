/**
 * The files tool: a lazy-loaded workspace tree plus an in-panel file preview.
 * Expanded directories and the previewed path live in the panel store
 * (per session and work tab, surviving tab switches and panel close/reopen); directory
 * payloads ride a module-level cache keyed by session and path, so a remount
 * never refetches what a previous view already listed.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import type { PropsLocale, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { MarkdownText, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirEntry } from '../shared/protocol.ts'
import { isImagePath, isPdfPath, languageOf, ooxmlKindOf } from '../shared/protocol.ts'
import { listDir, rawUrl, readFile } from './api.ts'
import type { createWorkPanelStore } from './store.ts'
import { IconChevronDown, IconChevronRight, IconFile, IconFolder, IconFolders, IconRefresh, IconSearch } from './icons.tsx'
import { PdfPreview } from './PdfPreview.tsx'
import { OfficePreview } from './OfficePreview.tsx'

type Store = PropsStore<ReturnType<typeof createWorkPanelStore>>

/** Files-pane props, threaded from the panel root. */
export interface FilesPaneProps {
  readonly hidden: boolean
  readonly sessionId: string
  readonly tabId: string
  readonly labelledBy: string
  readonly panelId: string
  readonly cwd: string
  readonly useStore: Store['useStore']
  readonly actions: Store['actions']
  readonly t: PropsLocale<'workPanel'>['t']
}

type DirState =
  | { readonly status: 'ready', readonly entries: readonly DirEntry[], readonly truncated: boolean }
  | { readonly status: 'error' }

// Directory payload cache: `${sessionId}${path}` → the settled listing.
// Survives pane remounts; the refresh button clears one session's entries.
const dirCache = new Map<string, DirState>()
const dirPending = new Set<string>()

/** Cache key for one session's directory. */
function cacheKey(sessionId: string, path: string): string {
  return `${sessionId}￨${path}`
}

/** Join a directory path and a child name into a workspace-relative posix path. */
function joinPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`
}

/** Basename of one workspace path, for the root row label. */
function baseName(cwd: string): string {
  const trimmed = cwd.replace(/[/\\]+$/, '')
  const slash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return slash < 0 ? trimmed : trimmed.slice(slash + 1)
}

/** The tree view. */
export function FilesPane({ hidden, sessionId, tabId, labelledBy, panelId, cwd, useStore, actions, t }: FilesPaneProps): ReactElement {
  const filesState = useStore(s => s.files[sessionId]?.[tabId])
  const expanded = filesState?.expanded ?? []
  const preview = filesState?.preview ?? null
  const filter = filesState?.filter ?? ''
  const treeVisible = filesState?.treeVisible ?? true
  const source = filesState?.source ?? false
  const [version, setVersion] = useState(0)
  const [activePath, setActivePath] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // Fetch the root and every expanded directory missing from the cache.
  useEffect(() => {
    const wanted = ['', ...expanded]
    for (const path of wanted) {
      const key = cacheKey(sessionId, path)
      if (dirCache.has(key) || dirPending.has(key)) continue
      dirPending.add(key)
      const controller = new AbortController()
      void listDir(sessionId, path, controller.signal).then(
        (listing) => {
          dirCache.set(key, { status: 'ready', entries: listing.entries, truncated: listing.truncated })
        },
        () => {
          dirCache.set(key, { status: 'error' })
        },
      ).finally(() => {
        dirPending.delete(key)
        if (alive.current) setVersion(v => v + 1)
      })
    }
  }, [expanded, sessionId, version])

  const refresh = (): void => {
    const prefix = `${sessionId}￨`
    for (const key of [...dirCache.keys()]) {
      if (key.startsWith(prefix)) dirCache.delete(key)
    }
    setVersion(v => v + 1)
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const tree = e.currentTarget
    const rows = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    const index = rows.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)
      rows[next]?.focus()
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      ;(e.key === 'Home' ? rows[0] : rows.at(-1))?.focus()
      return
    }
    if (index < 0) return
    const row = rows[index]!
    const path = row.dataset['path']
    const kind = row.dataset['kind']
    if (path === undefined) return
    if (e.key === 'ArrowRight' && kind === 'dir') {
      e.preventDefault()
      if (!expanded.includes(path)) actions.toggleDir(sessionId, tabId, path)
    } else if (e.key === 'ArrowLeft' && kind === 'dir') {
      e.preventDefault()
      if (expanded.includes(path)) actions.toggleDir(sessionId, tabId, path)
    }
  }

  const rows: ReactElement[] = []
  const query = filter.trim().toLocaleLowerCase()
  let firstVisiblePath: string | undefined
  const renderDir = (dir: string, level: number): void => {
    const state = dirCache.get(cacheKey(sessionId, dir))
    if (state === undefined) {
      if (dir === '') rows.push(<div key="pending" className="dshwp-note">…</div>)
      return
    }
    if (state.status === 'error') {
      rows.push(
        <div key={`${dir}￨error`} className="dshwp-noteRow">
          <span>{t('files.error')}</span>
          <button type="button" className="dshwp-termbarBtn" onClick={refresh}>{t('files.retry')}</button>
        </div>,
      )
      return
    }
    if (state.entries.length === 0) {
      if (dir === '') rows.push(<div key="empty" className="dshwp-note">{t('files.empty')}</div>)
      return
    }
    for (const entry of state.entries) {
      if (query !== '' && entry.kind !== 'dir' && !entry.name.toLocaleLowerCase().includes(query)) continue
      const path = joinPath(dir, entry.name)
      firstVisiblePath ??= path
      const isDir = entry.kind === 'dir'
      const isExpanded = isDir && expanded.includes(path)
      rows.push(
        <div
          key={path}
          role="treeitem"
          className="dshwp-row"
          style={{ paddingLeft: 8 + (level - 1) * 14 }}
          tabIndex={activePath === path || (activePath === null && firstVisiblePath === path) ? 0 : -1}
          aria-level={level}
          aria-expanded={isDir ? isExpanded : undefined}
          aria-selected={preview === path}
          data-selected={preview === path || undefined}
          data-path={path}
          data-kind={entry.kind}
          onFocus={() => { setActivePath(path) }}
          onClick={() => {
            if (isDir) actions.toggleDir(sessionId, tabId, path)
            else if (entry.kind === 'file') actions.setPreview(sessionId, tabId, path)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (isDir) actions.toggleDir(sessionId, tabId, path)
              else if (entry.kind === 'file') actions.setPreview(sessionId, tabId, path)
            }
          }}
        >
          <span className="dshwp-chevron">
            {isDir && (isExpanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />)}
          </span>
          <span className="dshwp-rowIcon">{isDir ? <IconFolder size={14} /> : <IconFile size={14} />}</span>
          <span className="dshwp-rowName">{entry.name}</span>
        </div>,
      )
      if (isExpanded) renderDir(path, level + 1)
    }
    if (state.truncated) {
      rows.push(<div key={`${dir}￨truncated`} className="dshwp-note">{t('files.truncated')}</div>)
    }
  }
  renderDir('', 1)

  const previewParts = preview?.split('/') ?? []
  const markdown = preview !== null && languageOf(preview) === 'markdown'

  return (
    <div
      className={hidden ? 'dshwp-hidden' : 'dshwp-pane'}
      role="tabpanel"
      id={panelId}
      aria-labelledby={labelledBy}
      hidden={hidden}
    >
      <div className="dshwp-fileToolbar">
        <div className="dshwp-breadcrumb" title={preview === null ? cwd : `${cwd}/${preview}`}>
          {preview === null
            ? <span>/</span>
            : (
                <>
                  <span>{baseName(cwd)}</span>
                  {previewParts.map((part, index) => (
                    <span key={`${part}-${index}`} className="dshwp-breadcrumbPart">
                      <IconChevronRight size={12} />
                      <span>{part}</span>
                    </span>
                  ))}
                </>
              )}
        </div>
        <div className="dshwp-fileActions">
          {markdown && (
            <button
              type="button"
              className="dshwp-fileTextButton"
              onClick={() => { actions.toggleFileSource(sessionId, tabId) }}
            >
              {source ? t('files.viewPreview') : t('files.viewSource')}
            </button>
          )}
          <Tooltip label={treeVisible ? t('files.hideTree') : t('files.showTree')} side="bottom">
            <button
              type="button"
              className="dshwp-iconbtn dshwp-fileTreeToggle"
              data-active={treeVisible || undefined}
              aria-label={treeVisible ? t('files.hideTree') : t('files.showTree')}
              aria-pressed={treeVisible}
              onClick={() => { actions.toggleFileTree(sessionId, tabId) }}
            >
              <IconFolders size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="dshwp-fileWorkspace">
        <div className="dshwp-fileCanvas" aria-label={t('files.preview')}>
          {preview === null
            ? (
                <div className="dshwp-fileEmpty">
                  <span className="dshwp-fileEmptyIcon"><IconFolders size={44} /></span>
                  <strong>{t('files.open')}</strong>
                  <span>{t('files.openHint')}</span>
                </div>
              )
            : <FilePreview sessionId={sessionId} path={preview} source={source} t={t} />}
        </div>
        {treeVisible && (
          <aside className="dshwp-fileTreePane" aria-label={t('files.tree')}>
            <div className="dshwp-fileFilter">
              <label className="dshwp-srOnly" htmlFor={`dshwp-filter-${tabId}`}>{t('files.filter')}</label>
              <IconSearch size={16} />
              <input
                id={`dshwp-filter-${tabId}`}
                type="search"
                value={filter}
                placeholder={t('files.filterPlaceholder')}
                onChange={(event) => { actions.setFileFilter(sessionId, tabId, event.currentTarget.value) }}
              />
              <Tooltip label={t('files.refresh')} side="bottom">
                <button type="button" className="dshwp-fileFilterAction" aria-label={t('files.refresh')} onClick={refresh}>
                  <IconRefresh size={13} />
                </button>
              </Tooltip>
            </div>
            <div className="dshwp-tree" role="tree" aria-label={t('files.tree')} onKeyDown={onKeyDown}>
              {rows}
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

/** The in-panel file preview. */
function FilePreview({ sessionId, path, source, t }: {
  readonly sessionId: string
  readonly path: string
  readonly source: boolean
  readonly t: PropsLocale<'workPanel'>['t']
}): ReactElement {
  const [state, setState] = useState<
    { readonly status: 'loading' } | { readonly status: 'ready', readonly content: string } | { readonly status: 'error', readonly statusCode: number | undefined }
  >({ status: 'loading' })

  useEffect(() => {
    if (isImagePath(path) || isPdfPath(path) || ooxmlKindOf(path) !== undefined) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    void readFile(sessionId, path, controller.signal).then(
      (data) => { setState({ status: 'ready', content: data.content }) },
      (error: unknown) => {
        if (controller.signal.aborted) return
        const statusCode = typeof error === 'object' && error !== null && 'status' in error
          ? (error as { status?: number }).status
          : undefined
        setState({ status: 'error', statusCode })
      },
    )
    return () => { controller.abort() }
  }, [sessionId, path])

  return (
    <div className="dshwp-preview">
      <div className={isPdfPath(path) || ooxmlKindOf(path) !== undefined ? 'dshwp-previewBody dshwp-previewBodyMedia' : 'dshwp-previewBody'}>
        {isImagePath(path)
          ? <img className="dshwp-previewImage" src={rawUrl(sessionId, path)} alt={path} />
          : isPdfPath(path)
            ? <PdfPreview sessionId={sessionId} path={path} t={t} />
          : ooxmlKindOf(path) !== undefined
            ? <OfficePreview sessionId={sessionId} path={path} t={t} />
          : state.status === 'loading'
            ? <div className="dshwp-note">{t('files.preview.loading')}</div>
            : state.status === 'error'
              ? (
                <div className="dshwp-note">
                  {state.statusCode === 413
                    ? t('files.preview.tooLarge')
                    : state.statusCode === 415
                      ? t('files.preview.binary')
                      : t('files.preview.error')}
                </div>
              )
              : languageOf(path) === 'markdown' && !source
                ? (
                    <MarkdownText
                      text={state.content}
                      codeLabels={{ copyLabel: t('copy'), copiedLabel: t('copied') }}
                    />
                  )
                : <pre className="dshwp-sourceText"><code>{state.content}</code></pre>}
      </div>
    </div>
  )
}
