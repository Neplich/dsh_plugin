/** Browser-native DOCX/XLSX/PPTX preview backed by the OOXML WASM renderers. */
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DocxScrollViewer } from '@silurus/ooxml/docx'
import type { PptxScrollViewer } from '@silurus/ooxml/pptx'
import type { XlsxViewer } from '@silurus/ooxml/xlsx'
import { ooxmlKindOf, ROUTES, type OoxmlKind } from '../shared/protocol.ts'
import { rawUrl } from './api.ts'
import { IconFitWidth, IconMinus, IconPlus, IconRefresh } from './icons.tsx'

type T = PropsLocale<'workPanel'>['t']
type Viewer = DocxScrollViewer | PptxScrollViewer | XlsxViewer

type PreviewState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' }
  | { readonly status: 'error' }

/** The public ESM entries are served lazily by the plugin host, like PDF.js. */
async function loadModule(kind: OoxmlKind): Promise<unknown> {
  return await import(/* @vite-ignore */ `${ROUTES.ooxml}/${kind}.mjs`)
}

function wasmUrl(kind: OoxmlKind): string {
  return `${ROUTES.ooxml}/${kind}_parser_bg.wasm`
}

function positionLabel(kind: OoxmlKind, current: number, total: number, t: T): string {
  const key = kind === 'docx'
    ? 'files.preview.officePage'
    : kind === 'pptx'
      ? 'files.preview.officeSlide'
      : 'files.preview.officeSheet'
  return t(key, { current, total })
}

/** One self-contained Office preview surface. */
export function OfficePreview({ sessionId, path, t }: {
  readonly sessionId: string
  readonly path: string
  readonly t: T
}): ReactElement {
  const kind = ooxmlKindOf(path)!
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  const [position, setPosition] = useState({ current: 1, total: 0 })
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    let disposed = false
    let viewer: Viewer | null = null
    container.replaceChildren()
    setState({ status: 'loading' })
    setPosition({ current: 1, total: 0 })

    const onScaleChange = (value: number): void => {
      if (!disposed) setScale(value)
    }
    const onPositionChange = (index: number, total: number): void => {
      if (!disposed) setPosition({ current: index + 1, total })
    }

    void (async () => {
      const module = await loadModule(kind)
      if (disposed) return
      if (kind === 'docx') {
        const { DocxScrollViewer: Constructor } = module as typeof import('@silurus/ooxml/docx')
        viewer = new Constructor(container, {
          wasmUrl: wasmUrl(kind),
          mode: 'main',
          enableTextSelection: true,
          enableHyperlinks: false,
          background: 'transparent',
          gap: 16,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 16,
          paddingRight: 16,
          pageShadow: '0 1px 4px var(--dsw-alias-border-l2)',
          onVisiblePageChange: onPositionChange,
          onScaleChange,
        })
      } else if (kind === 'pptx') {
        const { PptxScrollViewer: Constructor } = module as typeof import('@silurus/ooxml/pptx')
        viewer = new Constructor(container, {
          wasmUrl: wasmUrl(kind),
          mode: 'main',
          enableTextSelection: true,
          enableHyperlinks: false,
          background: 'transparent',
          gap: 16,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 16,
          paddingRight: 16,
          pageShadow: '0 1px 4px var(--dsw-alias-border-l2)',
          onVisibleSlideChange: onPositionChange,
          onScaleChange,
        })
      } else {
        const { XlsxViewer: Constructor } = module as typeof import('@silurus/ooxml/xlsx')
        viewer = new Constructor(container, {
          wasmUrl: wasmUrl(kind),
          mode: 'main',
          resizable: false,
          showScrollbars: true,
          showZoomSlider: false,
          enableHyperlinks: false,
          onSheetChange: onPositionChange,
          onScaleChange,
        })
      }
      viewerRef.current = viewer
      await viewer.load(rawUrl(sessionId, path))
      if (disposed) return
      setScale(viewer.getScale())
      if (kind === 'docx') {
        const documentViewer = viewer as DocxScrollViewer
        setPosition({ current: documentViewer.topVisiblePage + 1, total: documentViewer.pageCount })
      } else if (kind === 'pptx') {
        const presentationViewer = viewer as PptxScrollViewer
        setPosition({ current: presentationViewer.topVisibleSlide + 1, total: presentationViewer.slideCount })
      } else {
        const workbookViewer = viewer as XlsxViewer
        setPosition({ current: workbookViewer.sheetIndex + 1, total: workbookViewer.sheetCount })
      }
      setState({ status: 'ready' })
    })().catch(() => {
      if (!disposed) setState({ status: 'error' })
    })

    return () => {
      disposed = true
      viewerRef.current = null
      viewer?.destroy()
      container.replaceChildren()
    }
  }, [attempt, kind, path, sessionId])

  const run = (action: (viewer: Viewer) => void): void => {
    const viewer = viewerRef.current
    if (viewer !== null) action(viewer)
  }

  return (
    <div className="dshwp-officeRoot">
      <div className="dshwp-pdfToolbar dshwp-officeToolbar" role="toolbar" aria-label={t('files.preview')}>
        <span className="dshwp-officePosition" aria-live="polite">
          {positionLabel(kind, position.current, position.total, t)}
        </span>
        <div className="dshwp-pdfControlGroup dshwp-pdfControlGroupEnd">
          <Tooltip label={t('files.preview.officeZoomOut')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.officeZoomOut')} disabled={state.status !== 'ready'} onClick={() => { run(viewer => viewer.zoomOut()) }}><IconMinus size={14} /></button>
          </Tooltip>
          <span className="dshwp-pdfScale" aria-live="polite">{Math.round(scale * 100)}%</span>
          <Tooltip label={t('files.preview.officeZoomIn')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.officeZoomIn')} disabled={state.status !== 'ready'} onClick={() => { run(viewer => viewer.zoomIn()) }}><IconPlus size={14} /></button>
          </Tooltip>
          <Tooltip label={t('files.preview.officeFitWidth')} side="bottom">
            <button type="button" className="dshwp-pdfButton" aria-label={t('files.preview.officeFitWidth')} disabled={state.status !== 'ready'} onClick={() => { run(viewer => viewer.fitWidth()) }}><IconFitWidth size={14} /></button>
          </Tooltip>
        </div>
      </div>
      <div className="dshwp-officeStage">
        <div ref={containerRef} className="dshwp-officeContainer" aria-label={path} />
        {state.status === 'loading' && <div className="dshwp-pdfStatus" role="status">{t('files.preview.officeLoading')}</div>}
        {state.status === 'error' && (
          <div className="dshwp-pdfStatus" role="alert">
            <span>{t('files.preview.officeError')}</span>
            <button type="button" className="dshwp-fileTextButton" onClick={() => { setAttempt(value => value + 1) }}><IconRefresh size={13} />{t('files.preview.officeRetry')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
