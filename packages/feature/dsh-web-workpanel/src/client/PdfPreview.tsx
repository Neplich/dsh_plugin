/** Complete PDF.js viewer surface, adapted to the dsh web-workpanel shell. */
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent, ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PDFDocumentLoadingTask } from 'pdfjs-dist'
import type { EventBus, PDFFindController, PDFLinkService, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import { ROUTES } from '../shared/protocol.ts'
import { rawUrl } from './api.ts'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconDownload,
  IconFitWidth,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconRotate,
  IconSearch,
} from './icons.tsx'

type PdfJsModule = typeof import('pdfjs-dist')
type PdfViewerModule = typeof import('pdfjs-dist/web/pdf_viewer.mjs')

interface PdfRuntime {
  readonly pdfjs: PdfJsModule
  readonly viewer: PdfViewerModule
}

interface ActivePdfViewer {
  readonly eventBus: EventBus
  readonly findController: PDFFindController
  readonly linkService: PDFLinkService
  readonly viewer: PDFViewer
  readonly loadingTask: PDFDocumentLoadingTask
}

interface MatchCount {
  readonly current: number
  readonly total: number
}

let runtimePromise: Promise<PdfRuntime> | undefined

/** Load PDF.js from the host's same-origin asset route only when a PDF opens. */
async function loadPdfRuntime(): Promise<PdfRuntime> {
  runtimePromise ??= (async () => {
    const pdfjsUrl = `${ROUTES.pdfJs}/build/pdf.mjs`
    const viewerUrl = `${ROUTES.pdfJs}/web/pdf_viewer.mjs`
    const pdfjs = await import(/* @vite-ignore */ pdfjsUrl) as PdfJsModule
    pdfjs.GlobalWorkerOptions.workerSrc = `${ROUTES.pdfJs}/build/pdf.worker.min.mjs`
    const viewer = await import(/* @vite-ignore */ viewerUrl) as PdfViewerModule
    return { pdfjs, viewer }
  })().catch(error => {
    runtimePromise = undefined
    throw error
  })
  return runtimePromise
}

/** Keep user-entered page numbers inside the loaded document. */
export function boundedPdfPage(value: string, pages: number, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), Math.max(pages, 1)) : fallback
}

function basename(path: string): string {
  return path.split('/').at(-1) ?? path
}

/** One themed PDF.js preview with pages, search, zoom, rotation and download. */
export function PdfPreview({ sessionId, path, t }: {
  readonly sessionId: string
  readonly path: string
  readonly t: PropsLocale<'workPanel'>['t']
}): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const activeRef = useRef<ActivePdfViewer | null>(null)
  const passwordUpdateRef = useRef<((password: string) => void) | null>(null)
  const controlId = useId()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [pages, setPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<MatchCount>({ current: 0, total: 0 })
  const [noMatches, setNoMatches] = useState(false)
  const [passwordReason, setPasswordReason] = useState<'needed' | 'incorrect' | null>(null)
  const [password, setPassword] = useState('')

  useEffect(() => {
    const container = containerRef.current
    const viewerElement = viewerRef.current
    if (container === null || viewerElement === null) return
    let disposed = false
    const listeners = new AbortController()
    let loadingTask: PDFDocumentLoadingTask | undefined

    setStatus('loading')
    setProgress(0)
    setPage(1)
    setPageInput('1')
    setPages(0)
    setScale(1)
    setQuery('')
    setMatches({ current: 0, total: 0 })
    setNoMatches(false)
    setPasswordReason(null)
    setPassword('')
    passwordUpdateRef.current = null
    viewerElement.replaceChildren()

    void loadPdfRuntime().then(async runtime => {
      if (disposed) return
      const eventBus = new runtime.viewer.EventBus()
      const linkService = new runtime.viewer.PDFLinkService({
        eventBus,
        externalLinkTarget: runtime.viewer.LinkTarget.BLANK,
      })
      const findController = new runtime.viewer.PDFFindController({ eventBus, linkService })
      const pdfViewer = new runtime.viewer.PDFViewer({
        container,
        viewer: viewerElement,
        eventBus,
        linkService,
        findController,
        annotationMode: runtime.pdfjs.AnnotationMode.ENABLE_FORMS,
        imageResourcesPath: `${ROUTES.pdfJs}/web/images/`,
        removePageBorders: true,
      })
      linkService.setViewer(pdfViewer)

      eventBus.on('pagesinit', () => {
        if (disposed) return
        pdfViewer.currentScaleValue = 'page-width'
        setStatus('ready')
      }, { signal: listeners.signal })
      eventBus.on('pagechanging', (event: { pageNumber: number }) => {
        if (disposed) return
        setPage(event.pageNumber)
        setPageInput(String(event.pageNumber))
      }, { signal: listeners.signal })
      eventBus.on('scalechanging', (event: { scale: number }) => {
        if (!disposed) setScale(event.scale)
      }, { signal: listeners.signal })
      eventBus.on('updatefindmatchescount', (event: { matchesCount: MatchCount }) => {
        if (!disposed) setMatches(event.matchesCount)
      }, { signal: listeners.signal })
      eventBus.on('updatefindcontrolstate', (event: { state: number, matchesCount: MatchCount }) => {
        if (disposed) return
        setMatches(event.matchesCount)
        setNoMatches(event.state === runtime.viewer.FindState.NOT_FOUND)
      }, { signal: listeners.signal })

      const task = runtime.pdfjs.getDocument({
        url: rawUrl(sessionId, path),
        cMapUrl: `${ROUTES.pdfJs}/cmaps/`,
        cMapPacked: true,
        iccUrl: `${ROUTES.pdfJs}/iccs/`,
        standardFontDataUrl: `${ROUTES.pdfJs}/standard_fonts/`,
        wasmUrl: `${ROUTES.pdfJs}/wasm/`,
      })
      loadingTask = task
      task.onProgress = ({ loaded, total }: { loaded: number, total: number }) => {
        if (!disposed && total > 0) setProgress(Math.min(loaded / total, 1))
      }
      task.onPassword = (updatePassword: (password: string) => void, reason: number) => {
        if (disposed) return
        passwordUpdateRef.current = updatePassword
        setPasswordReason(reason === runtime.pdfjs.PasswordResponses.INCORRECT_PASSWORD ? 'incorrect' : 'needed')
        setPassword('')
      }
      activeRef.current = { eventBus, findController, linkService, viewer: pdfViewer, loadingTask: task }
      const document = await task.promise
      if (disposed) return
      setPages(document.numPages)
      linkService.setDocument(document)
      pdfViewer.setDocument(document)
    }).catch(() => {
      if (!disposed) setStatus('error')
    })

    const resizeObserver = new ResizeObserver(() => {
      const current = activeRef.current?.viewer
      if (current?.currentScaleValue === 'page-width') current.currentScaleValue = 'page-width'
      else current?.update()
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      listeners.abort()
      resizeObserver.disconnect()
      passwordUpdateRef.current = null
      activeRef.current?.viewer.cleanup()
      activeRef.current = null
      if (loadingTask !== undefined) void loadingTask.destroy()
      viewerElement.replaceChildren()
    }
  }, [attempt, path, sessionId])

  const dispatchFind = (text: string, findPrevious: boolean, type = ''): void => {
    const active = activeRef.current
    if (active === null) return
    if (text === '') {
      active.eventBus.dispatch('findbarclose', { source: active.findController })
      setMatches({ current: 0, total: 0 })
      setNoMatches(false)
      return
    }
    active.eventBus.dispatch('find', {
      source: active.findController,
      type,
      query: text,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious,
      matchDiacritics: false,
    })
  }

  const commitPage = (): void => {
    const active = activeRef.current
    if (active === null) return
    const next = boundedPdfPage(pageInput, pages, page)
    active.viewer.currentPageNumber = next
    setPageInput(String(next))
  }

  const zoom = (direction: 'in' | 'out'): void => {
    const viewer = activeRef.current?.viewer
    if (viewer === undefined) return
    if (direction === 'in') viewer.increaseScale({ steps: 1 })
    else viewer.decreaseScale({ steps: 1 })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return
    const key = event.key.toLowerCase()
    if (key === 'f') {
      event.preventDefault()
      setFindOpen(true)
      requestAnimationFrame(() => { searchRef.current?.focus() })
    } else if (key === '+' || key === '=') {
      event.preventDefault()
      zoom('in')
    } else if (key === '-') {
      event.preventDefault()
      zoom('out')
    } else if (key === '0') {
      event.preventDefault()
      const viewer = activeRef.current?.viewer
      if (viewer !== undefined) viewer.currentScaleValue = 'page-width'
    }
  }

  const submitPassword = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (password === '') return
    const update = passwordUpdateRef.current
    passwordUpdateRef.current = null
    setPasswordReason(null)
    update?.(password)
  }

  const controlsDisabled = status !== 'ready'
  const percent = `${Math.round(scale * 100)}%`

  return (
    <div className="dshwp-pdfRoot" tabIndex={-1} onKeyDown={onKeyDown}>
      <div className="dshwp-pdfToolbar" role="toolbar" aria-label={t('files.preview')}>
        <div className="dshwp-pdfControlGroup">
          <Tooltip label={t('files.preview.pdfPreviousPage')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfPreviousPage')} disabled={controlsDisabled || page <= 1} onClick={() => { activeRef.current?.viewer.previousPage() }}>
              <IconChevronLeft size={14} />
            </button>
          </Tooltip>
          <label className="dshwp-srOnly" htmlFor={`${controlId}-page`}>{t('files.preview.pdfPage')}</label>
          <input
            id={`${controlId}-page`}
            className="dshwp-pdfPageInput"
            inputMode="numeric"
            value={pageInput}
            disabled={controlsDisabled}
            onChange={event => { setPageInput(event.currentTarget.value) }}
            onBlur={commitPage}
            onKeyDown={event => { if (event.key === 'Enter') commitPage() }}
          />
          <span className="dshwp-pdfPages" aria-label={t('files.preview.pdfOfPages', { pages })}>/ {pages || '–'}</span>
          <Tooltip label={t('files.preview.pdfNextPage')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfNextPage')} disabled={controlsDisabled || page >= pages} onClick={() => { activeRef.current?.viewer.nextPage() }}>
              <IconChevronRight size={14} />
            </button>
          </Tooltip>
        </div>

        <div className="dshwp-pdfControlGroup dshwp-pdfControlGroupEnd">
          <Tooltip label={t('files.preview.pdfZoomOut')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfZoomOut')} disabled={controlsDisabled} onClick={() => { zoom('out') }}><IconMinus size={14} /></button>
          </Tooltip>
          <span className="dshwp-pdfScale" aria-live="polite">{percent}</span>
          <Tooltip label={t('files.preview.pdfZoomIn')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfZoomIn')} disabled={controlsDisabled} onClick={() => { zoom('in') }}><IconPlus size={14} /></button>
          </Tooltip>
          <Tooltip label={t('files.preview.pdfFitWidth')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfFitWidth')} disabled={controlsDisabled} onClick={() => { const viewer = activeRef.current?.viewer; if (viewer !== undefined) viewer.currentScaleValue = 'page-width' }}><IconFitWidth size={14} /></button>
          </Tooltip>
          <Tooltip label={t('files.preview.pdfRotate')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfRotate')} disabled={controlsDisabled} onClick={() => { const viewer = activeRef.current?.viewer; if (viewer !== undefined) viewer.pagesRotation = (viewer.pagesRotation + 90) % 360 }}><IconRotate size={14} /></button>
          </Tooltip>
          <Tooltip label={t('files.preview.pdfSearch')} side="bottom">
            <button
              type="button"
              className="dshwp-pdfButton"
              aria-label={t('files.preview.pdfSearch')}
              aria-expanded={findOpen}
              disabled={controlsDisabled}
              data-active={findOpen || undefined}
              onClick={() => {
                setFindOpen(open => !open)
                if (!findOpen) requestAnimationFrame(() => { searchRef.current?.focus() })
              }}
            >
              <IconSearch size={14} />
            </button>
          </Tooltip>
          <Tooltip label={t('files.preview.pdfDownload')} side="bottom">
            <a className="dshwp-pdfButton" href={rawUrl(sessionId, path)} download={basename(path)} aria-label={t('files.preview.pdfDownload')}><IconDownload size={14} /></a>
          </Tooltip>
        </div>

        {findOpen && (
          <div className="dshwp-pdfFind">
            <IconSearch size={14} />
            <label className="dshwp-srOnly" htmlFor={`${controlId}-find`}>{t('files.preview.pdfSearch')}</label>
            <input
              ref={searchRef}
              id={`${controlId}-find`}
              type="search"
              value={query}
              placeholder={t('files.preview.pdfSearchPlaceholder')}
              onChange={event => {
                const text = event.currentTarget.value
                setQuery(text)
                dispatchFind(text, false)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') dispatchFind(query, event.shiftKey, 'again')
                else if (event.key === 'Escape') {
                  setFindOpen(false)
                  dispatchFind('', false)
                }
              }}
            />
            <span className="dshwp-pdfFindCount" aria-live="polite">
              {query === '' ? '' : noMatches ? t('files.preview.pdfNoMatches') : t('files.preview.pdfMatches', { current: matches.current, total: matches.total })}
            </span>
            <Tooltip label={t('files.preview.pdfPreviousMatch')} side="bottom">
              <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfPreviousMatch')} disabled={query === ''} onClick={() => { dispatchFind(query, true, 'again') }}><IconChevronUp size={14} /></button>
            </Tooltip>
            <Tooltip label={t('files.preview.pdfNextMatch')} side="bottom">
              <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.pdfNextMatch')} disabled={query === ''} onClick={() => { dispatchFind(query, false, 'again') }}><IconChevronDown size={14} /></button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="dshwp-pdfStage">
        <div ref={containerRef} className="dshwp-pdfContainer" aria-label={path}>
          <div ref={viewerRef} className="pdfViewer" />
        </div>
        {status === 'loading' && (
          <div className="dshwp-pdfStatus" role="status">
            <span>{t('files.preview.pdfLoading')}</span>
            <span className="dshwp-pdfProgress" aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></span>
          </div>
        )}
        {status === 'error' && (
          <div className="dshwp-pdfStatus" role="alert">
            <span>{t('files.preview.pdfError')}</span>
            <button type="button" className="dshwp-fileTextButton" onClick={() => { setAttempt(value => value + 1) }}><IconRefresh size={13} />{t('files.preview.pdfRetry')}</button>
          </div>
        )}
        {passwordReason !== null && (
          <form className="dshwp-pdfPassword" onSubmit={submitPassword}>
            <strong>{passwordReason === 'incorrect' ? t('files.preview.pdfPasswordIncorrect') : t('files.preview.pdfPassword')}</strong>
            <label htmlFor={`${controlId}-password`}>{t('files.preview.pdfPasswordLabel')}</label>
            <input id={`${controlId}-password`} type="password" value={password} autoFocus onChange={event => { setPassword(event.currentTarget.value) }} />
            <button type="submit" className="dshwp-fileTextButton" disabled={password === ''}>{t('files.preview.pdfPasswordSubmit')}</button>
          </form>
        )}
      </div>
    </div>
  )
}
