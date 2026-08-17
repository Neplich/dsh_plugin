/**
 * Mermaid fence renderer, browser half: upgrades every settled ```mermaid
 * markdown fence into a rendered SVG diagram card, with a source toggle and
 * a click-to-open full-screen pan/zoom viewer.
 *
 * Pure DOM strategy over the shipped chat flow (the markdown pipeline has no
 * fence extension slot): a MutationObserver scans `.md-code-block` surfaces,
 * the fence language comes from the banner's infostring cell, and the source
 * text from the block's <pre>. The mermaid engine is the UMD build served by
 * the host half (MERMAID_SCRIPT_PATH), injected as one script tag on first
 * use; diagrams render with securityLevel 'strict' and follow the GUI theme
 * (default/dark) through the `theme/change` event.
 *
 * The zoom math helpers are exported pure functions (unit-tested); `apply`
 * only maps the live DOM onto them.
 *
 * @module @neplich/dsh-mermaid/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.theme service plus the typed `theme/change` event.
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { MERMAID_SCRIPT_PATH } from '../shared.ts'
import { en, NS, zh } from './locales.ts'

/** The mermaid UMD global's API surface (the default export's instance type). */
type MermaidApi = (typeof import('mermaid'))['default']

/** One pan/zoom transform: scale plus translate in stage pixels. */
export interface ViewTransform {
  scale: number
  tx: number
  ty: number
}

/** Zoom bounds shared by the wheel handler and the toolbar buttons. */
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 12

/**
 * Normalize a fence info string to its language id, mirroring the markdown
 * pipeline's own truncation at the first non-word character.
 * @param raw - the banner infostring text.
 * @returns the lowercase language id, or undefined when absent.
 */
export function normalizeFenceLang(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const match = /^[\w-]+/.exec(raw.trim().toLowerCase())
  return match === null ? undefined : match[0]
}

/**
 * Initial viewer transform: centered, scaled to fit the viewport with a cap
 * so small diagrams still open enlarged but not grotesquely so.
 * @param naturalWidth - diagram width in px (viewBox).
 * @param naturalHeight - diagram height in px (viewBox).
 * @param viewWidth - stage width in px.
 * @param viewHeight - stage height in px.
 * @returns the fit transform (tx/ty zero).
 */
export function computeFitTransform(
  naturalWidth: number,
  naturalHeight: number,
  viewWidth: number,
  viewHeight: number,
): ViewTransform {
  const scale = Math.min(2, Math.min(viewWidth * 0.9 / naturalWidth, viewHeight * 0.9 / naturalHeight))
  return { scale, tx: 0, ty: 0 }
}

/**
 * Zoom around one stage point: the point stays fixed on screen. The stage's
 * coordinate origin is its center (the diagram is flex-centered).
 * @param current - the transform before the zoom.
 * @param px - point x relative to the stage center.
 * @param py - point y relative to the stage center.
 * @param factor - multiplicative zoom factor (> 1 zooms in).
 * @returns the next transform, clamped to [MIN_ZOOM, MAX_ZOOM].
 */
export function zoomAtPoint(current: ViewTransform, px: number, py: number, factor: number): ViewTransform {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor))
  const k = scale / current.scale
  return { scale, tx: px - (px - current.tx) * k, ty: py - (py - current.ty) * k }
}

/** GUI-native fullscreen icon (ui-primitives IconFullscreenOutline16 paths). */
const ICON_EXPAND = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M2.58875 12.3407L6.59167 8.33777L7.66296 9.40808L3.66003 13.411H7.99988V14.8065H3.05457C2.02633 14.8065 1.19324 13.9734 1.19324 12.9452V7.99988H2.58875V12.3407Z" fill="currentColor"/>'
  + '<path d="M12.9452 1.19324C13.9734 1.19324 14.8065 2.02633 14.8065 3.05457V7.99988H13.411V3.66003L9.40808 7.66296L8.33777 6.59167L12.3407 2.58875H7.99988V1.19324H12.9452Z" fill="currentColor"/>'
  + '</svg>'

/** GUI-native close icon (ui-primitives IconCloseOutline16 paths). */
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
  + '<path d="M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z" fill="currentColor"/>'
  + '<path d="M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z" fill="currentColor"/>'
  + '</svg>'

/** Magnifier-plus icon (no GUI-native equivalent; same 16px outline style). */
const ICON_ZOOM_IN = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
  + '<circle cx="7" cy="7" r="4.7" stroke="currentColor" stroke-width="1.3"/>'
  + '<path d="M10.4 10.4L13.8 13.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  + '<path d="M7 5V9M5 7H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  + '</svg>'

/** Magnifier-minus icon. */
const ICON_ZOOM_OUT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'
  + '<circle cx="7" cy="7" r="4.7" stroke="currentColor" stroke-width="1.3"/>'
  + '<path d="M10.4 10.4L13.8 13.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  + '<path d="M5 7H9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
  + '</svg>'

/** Card and viewer stylesheet: theme tokens with neutral fallbacks. */
export const STYLE_TEXT = [
  '.dsh-mmd{margin:8px 0;border:1px solid var(--dsw-alias-border-l1,#d0d0d0);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-base,transparent)}',
  '.dsh-mmd-bar{display:flex;justify-content:space-between;align-items:center;padding:4px 12px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary,#888);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));border-bottom:1px solid var(--dsw-alias-border-l1,#d0d0d0)}',
  '.dsh-mmd-bar-actions{display:flex;gap:4px;align-items:center}',
  '.dsh-mmd-bar button{font-size:12px;line-height:18px;cursor:pointer;border:none;background:transparent;color:var(--dsw-alias-brand-primary,#4c8dff);padding:1px 6px;border-radius:4px}',
  '.dsh-mmd-bar button:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12))}',
  // shared icon button; tooltip opens downward by default, upward with .dsh-mmd-tip-up
  '.dsh-mmd-icon-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary,#888);cursor:pointer;border-radius:4px}',
  '.dsh-mmd-icon-btn:hover{background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,#222)}',
  '.dsh-mmd-icon-btn::after{content:attr(data-tip);position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);background:rgba(30,30,30,.92);color:#fff;font-size:12px;line-height:18px;padding:3px 8px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;z-index:20}',
  '.dsh-mmd-icon-btn.dsh-mmd-tip-up::after{top:auto;bottom:calc(100% + 6px)}',
  '.dsh-mmd-icon-btn:hover::after{opacity:1}',
  '.dsh-mmd-diagram{padding:12px;overflow-x:auto;text-align:center}',
  '.dsh-mmd-diagram svg{max-width:100%;height:auto;cursor:zoom-in}',
  '.dsh-mmd-error{color:var(--dsw-alias-state-error-primary,#d64545);font-size:12px;text-align:left;white-space:pre-wrap}',
  // viewer overlay
  '.dsh-mmd-viewer{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:rgba(0,0,0,.55);user-select:none;-webkit-user-select:none}',
  '.dsh-mmd-viewer-bar{display:flex;gap:8px;justify-content:center;align-items:center;padding:8px 12px;background:var(--dsw-alias-bg-overlay,#fff);border-bottom:1px solid var(--dsw-alias-border-l1,#d0d0d0)}',
  '.dsh-mmd-viewer-stage{flex:1;overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:grab;touch-action:none}',
  '.dsh-mmd-viewer-stage.dsh-mmd-dragging{cursor:grabbing}',
  '.dsh-mmd-viewer-inner{background:var(--dsw-alias-bg-base,#fff);border-radius:8px;padding:16px;box-shadow:0 8px 40px rgba(0,0,0,.35)}',
  '.dsh-mmd-viewer-inner svg{display:block}',
].join('\n')

/** One upgraded fence: the code block, its card, and the last rendered code. */
interface Entry {
  code: string | null
  block: HTMLElement
  wrapper: HTMLDivElement
  diagram: HTMLDivElement
  sourceBtn: HTMLButtonElement
}

/** One open viewer overlay. */
interface Viewer {
  root: HTMLDivElement
  entry: Entry
  onKey: (e: KeyboardEvent) => void
  prevOverflow: string
}

/** Required services (cordis fiber inject). */
export const inject = ['locale', 'theme']

/**
 * Client plugin body: upgrade mermaid fences and keep them rendered.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mermaid: dictionaries')
  const t = ctx.locale.bind(NS)

  const style = document.createElement('style')
  style.dataset.plugin = 'mermaid'
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)

  const entries = new Map<HTMLElement, Entry>()
  let disposed = false
  let counter = 0
  let scriptTag: HTMLScriptElement | null = null
  let loadPromise: Promise<MermaidApi> | null = null
  let viewer: Viewer | null = null

  /** The mermaid global once the UMD script executed. */
  function mermaidGlobal(): MermaidApi | undefined {
    return (globalThis as { mermaid?: MermaidApi }).mermaid
  }

  /** The active GUI color scheme as a mermaid theme name. */
  function mermaidThemeName(): string {
    return ctx.theme.getTheme().active.colorScheme === 'dark' ? 'dark' : 'default'
  }

  /** Mermaid initialize config for one theme name. */
  function mermaidConfig(theme: string): Parameters<MermaidApi['initialize']>[0] {
    return { startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: theme as 'default' | 'dark' }
  }

  /** Load the mermaid engine once through the host-served script tag. */
  function loadMermaid(): Promise<MermaidApi> {
    const existing = mermaidGlobal()
    if (existing !== undefined) return Promise.resolve(existing)
    loadPromise ??= new Promise<MermaidApi>((resolvePromise, rejectPromise) => {
      scriptTag = document.createElement('script')
      scriptTag.src = MERMAID_SCRIPT_PATH
      scriptTag.addEventListener('load', () => {
        const engine = mermaidGlobal()
        if (engine === undefined) {
          rejectPromise(new Error('mermaid global missing after script load'))
          return
        }
        engine.initialize(mermaidConfig(mermaidThemeName()))
        resolvePromise(engine)
      })
      scriptTag.addEventListener('error', () => {
        rejectPromise(new Error(`mermaid script failed to load from ${MERMAID_SCRIPT_PATH}`))
      })
      document.head.append(scriptTag)
    })
    loadPromise.catch(() => { loadPromise = null })
    return loadPromise
  }

  /** One ghost icon button with a CSS tooltip. */
  function mkIconBtn(icon: string, tip: string, onClick: () => void, tipUp = false): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'dsh-mmd-icon-btn' + (tipUp ? ' dsh-mmd-tip-up' : '')
    button.innerHTML = icon
    button.setAttribute('aria-label', tip)
    button.dataset.tip = tip
    button.addEventListener('click', onClick)
    return button
  }

  /** Close the viewer (idempotent) and restore page scrolling. */
  function closeViewer(): void {
    if (viewer === null) return
    viewer.root.remove()
    document.removeEventListener('keydown', viewer.onKey, true)
    document.body.style.overflow = viewer.prevOverflow
    viewer = null
  }

  /** Open the full-screen pan/zoom viewer for one rendered entry. */
  function openViewer(entry: Entry): void {
    const svg = entry.diagram.querySelector('svg')
    if (svg === null) return
    closeViewer()

    const root = document.createElement('div')
    root.className = 'dsh-mmd-viewer'
    const bar = document.createElement('div')
    bar.className = 'dsh-mmd-viewer-bar'
    const stage = document.createElement('div')
    stage.className = 'dsh-mmd-viewer-stage'
    const inner = document.createElement('div')
    inner.className = 'dsh-mmd-viewer-inner'
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.style.maxWidth = 'none'
    clone.style.cursor = 'inherit'

    // Natural size from the viewBox so zoom ratios are real.
    let naturalWidth = 800
    let naturalHeight = 600
    const viewBox = clone.viewBox.baseVal
    if (viewBox.width > 0 && viewBox.height > 0) {
      naturalWidth = viewBox.width
      naturalHeight = viewBox.height
    }
    clone.setAttribute('width', String(naturalWidth))
    clone.setAttribute('height', String(naturalHeight))
    inner.append(clone)
    stage.append(inner)

    let transform: ViewTransform = { scale: 1, tx: 0, ty: 0 }
    const applyTransform = (): void => {
      inner.style.transform = `translate(${transform.tx}px,${transform.ty}px) scale(${transform.scale})`
    }
    const fit = (): void => {
      transform = computeFitTransform(naturalWidth, naturalHeight, window.innerWidth, window.innerHeight - 60)
      applyTransform()
    }

    bar.append(
      mkIconBtn(ICON_ZOOM_IN, t('viewer.zoomIn'), () => { transform = zoomAtPoint(transform, 0, 0, 1.25); applyTransform() }),
      mkIconBtn(ICON_ZOOM_OUT, t('viewer.zoomOut'), () => { transform = zoomAtPoint(transform, 0, 0, 1 / 1.25); applyTransform() }),
      mkIconBtn(ICON_EXPAND, t('viewer.fit'), fit),
      mkIconBtn(ICON_CLOSE, t('viewer.close'), closeViewer),
    )
    root.append(bar, stage)

    stage.addEventListener('wheel', (e) => {
      e.preventDefault()
      const rect = stage.getBoundingClientRect()
      transform = zoomAtPoint(
        transform,
        e.clientX - rect.left - rect.width / 2,
        e.clientY - rect.top - rect.height / 2,
        e.deltaY < 0 ? 1.15 : 1 / 1.15,
      )
      applyTransform()
    }, { passive: false })

    let drag: { x: number, y: number } | null = null
    let moved = false
    stage.addEventListener('pointerdown', (e) => {
      // Suppress the browser's drag-to-select gesture: panning must never
      // highlight diagram text.
      e.preventDefault()
      drag = { x: e.clientX, y: e.clientY }
      moved = false
      stage.setPointerCapture(e.pointerId)
      stage.classList.add('dsh-mmd-dragging')
    })
    stage.addEventListener('pointermove', (e) => {
      if (drag === null) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
      transform = { scale: transform.scale, tx: transform.tx + dx, ty: transform.ty + dy }
      drag = { x: e.clientX, y: e.clientY }
      applyTransform()
    })
    const endDrag = (e?: PointerEvent): void => {
      stage.classList.remove('dsh-mmd-dragging')
      drag = null
      // A plain click on the backdrop (not the diagram) closes the viewer.
      if (!moved && e !== undefined && e.target === stage) closeViewer()
    }
    stage.addEventListener('pointerup', endDrag)
    stage.addEventListener('pointercancel', () => { endDrag() })

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeViewer()
      }
    }
    document.addEventListener('keydown', onKey, true)

    viewer = { root, entry, onKey, prevOverflow: document.body.style.overflow }
    document.body.style.overflow = 'hidden'
    document.body.append(root)
    fit()
  }

  /**
   * The fence language from the code block's banner: the infostring cell is
   * the first div of the banner row (class names are CSS-module hashed, so
   * the structure is the selector).
   */
  function langOf(block: HTMLElement): string | undefined {
    const wrap = block.firstElementChild
    const banner = wrap?.firstElementChild
    const info = banner?.firstElementChild
    if (info == null || info.nextElementSibling === null) return undefined
    return normalizeFenceLang(info.textContent ?? undefined)
  }

  /** The fence source text (the plain or shiki <pre>). */
  function codeOf(block: HTMLElement): string {
    return block.querySelector('pre')?.textContent ?? ''
  }

  /** Render (or re-render) one entry's diagram; errors keep the source visible. */
  async function renderEntry(entry: Entry, code: string): Promise<void> {
    entry.code = code
    entry.diagram.classList.remove('dsh-mmd-error')
    entry.diagram.textContent = t('card.loading')
    const id = `dsh-mmd-${++counter}`
    try {
      const mermaid = await loadMermaid()
      if (disposed || entry.code !== code) return
      const out = await mermaid.render(id, code)
      if (disposed || entry.code !== code) return
      entry.diagram.innerHTML = out.svg
    } catch (error) {
      if (disposed || entry.code !== code) return
      entry.diagram.classList.add('dsh-mmd-error')
      const message = String(error instanceof Error ? error.message : error).slice(0, 300)
      entry.diagram.textContent = t('card.renderFailed', { message })
      // Keep the source visible when the diagram cannot render.
      entry.block.style.display = ''
      entry.sourceBtn.textContent = t('card.hideSource')
      document.getElementById(`d${id}`)?.remove()
    }
    // A re-rendered diagram invalidates an open viewer showing the old svg.
    if (viewer !== null && viewer.entry === entry) closeViewer()
  }

  /** Upgrade one mermaid code block into a diagram card. */
  function attach(block: HTMLElement): void {
    const code = codeOf(block)
    if (code.trim() === '') return
    const wrapper = document.createElement('div')
    wrapper.className = 'dsh-mmd'
    const bar = document.createElement('div')
    bar.className = 'dsh-mmd-bar'
    const label = document.createElement('span')
    label.textContent = 'Mermaid'
    const actions = document.createElement('div')
    actions.className = 'dsh-mmd-bar-actions'
    const diagram = document.createElement('div')
    diagram.className = 'dsh-mmd-diagram'
    const sourceBtn = document.createElement('button')
    sourceBtn.type = 'button'
    sourceBtn.textContent = t('card.viewSource')
    const entry: Entry = { code: null, block, wrapper, diagram, sourceBtn }
    actions.append(mkIconBtn(ICON_EXPAND, t('viewer.enlarge'), () => { openViewer(entry) }, true), sourceBtn)
    bar.append(label, actions)
    wrapper.append(bar, diagram)
    block.after(wrapper)
    block.style.display = 'none'
    sourceBtn.addEventListener('click', () => {
      const hidden = block.style.display === 'none'
      block.style.display = hidden ? '' : 'none'
      sourceBtn.textContent = hidden ? t('card.hideSource') : t('card.viewSource')
    })
    // The zoom-in cursor promises it: a plain click on the diagram opens the viewer.
    diagram.addEventListener('click', () => { openViewer(entry) })
    entries.set(block, entry)
    void renderEntry(entry, code)
  }

  /** One pass over the page: attach new mermaid fences, refresh changed ones, prune detached cards. */
  function scan(): void {
    if (disposed) return
    for (const block of document.querySelectorAll<HTMLElement>('.md-code-block')) {
      const entry = entries.get(block)
      if (entry !== undefined) {
        const code = codeOf(block)
        if (code.trim() !== '' && code !== entry.code) void renderEntry(entry, code)
        continue
      }
      if (langOf(block) !== 'mermaid') continue
      attach(block)
    }
    for (const [block, entry] of entries) {
      if (!block.isConnected) {
        entry.wrapper.remove()
        entries.delete(block)
      }
    }
  }

  let scanScheduled = false
  function scheduleScan(): void {
    if (scanScheduled) return
    scanScheduled = true
    void Promise.resolve().then(() => {
      scanScheduled = false
      scan()
    })
  }

  const observer = new MutationObserver(scheduleScan)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })

  // Theme switch: re-initialize mermaid with the matching theme and re-render.
  let themeName = mermaidThemeName()
  ctx.on('theme/change', () => {
    const next = mermaidThemeName()
    if (next === themeName) return
    themeName = next
    mermaidGlobal()?.initialize(mermaidConfig(next))
    for (const entry of entries.values()) {
      if (entry.code !== null) void renderEntry(entry, entry.code)
    }
  })

  // Language switch: refresh button copy (tooltips included) in place.
  ctx.effect(() => ctx.locale.subscribe(() => {
    for (const entry of entries.values()) {
      const hidden = entry.block.style.display === 'none'
      entry.sourceBtn.textContent = hidden ? t('card.viewSource') : t('card.hideSource')
      const iconBtn = entry.wrapper.querySelector<HTMLButtonElement>('.dsh-mmd-icon-btn')
      if (iconBtn !== null) {
        const tip = t('viewer.enlarge')
        iconBtn.setAttribute('aria-label', tip)
        iconBtn.dataset.tip = tip
      }
    }
  }), 'mermaid: locale refresh')

  ctx.effect(() => {
    scan()
    return () => {
      disposed = true
      observer.disconnect()
      closeViewer()
      for (const [block, entry] of entries) {
        entry.wrapper.remove()
        block.style.display = ''
      }
      entries.clear()
      if (scriptTag !== null) {
        scriptTag.remove()
        scriptTag = null
      }
      try {
        delete (globalThis as { mermaid?: MermaidApi }).mermaid
      } catch {
        // A non-configurable global cannot be removed; leaving it is harmless.
      }
    }
  }, 'mermaid: observer + styles')
}
