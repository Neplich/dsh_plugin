/**
 * Right-side work panel, browser half: registers the panel surface into the
 * shell's frame-wide overlay, the open/close toggle into the session
 * header's right utility row, the bilingual dictionaries, the panel stylesheet, and the
 * global Option+J / Alt+J toggle. The panel itself (WorkPanel) owns the mutual
 * exclusion with the shell's tool-details column; terminal process state
 * lives host-side.
 *
 * @module @neplich/dsh-work-panel/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: ctx.locale merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: ctx.layout merge plus the 'shell.overlay' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the 'conversation.session.header.utilities' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import xtermCss from '@xterm/xterm/css/xterm.css'
import pdfViewerCss from 'pdfjs-dist/web/pdf_viewer.css'
import { ROUTES } from '../shared/protocol.ts'
import { WorkPanel } from './WorkPanel.tsx'
import { WorkPanelButton } from './HeaderButton.tsx'
import { createWorkPanelStore } from './store.ts'
import { WORK_PANEL_CSS } from './styles.ts'
import { en, zh } from './locales.ts'
import type { WorkPanelKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The work panel's copy. */
    workPanel: WorkPanelKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'workPanel'

/** Plugin id stamped onto the injected style tag (the loader sweeps these on unload). */
const PLUGIN_ID = '@neplich/dsh-work-panel'

/** Scope upstream PDF.js rules to this preview and point CSS assets at the host route. */
function scopedPdfViewerCss(): string {
  const rewritten = pdfViewerCss
    .replaceAll(':root{', '&{')
    .replace(/url\((?:"|')?images\/([^\)"']+)(?:"|')?\)/g, `url("${ROUTES.pdfJs}/web/images/$1")`)
  return `.dshwp-pdfRoot {\n${rewritten}\n}`
}

/** The panel toggle shortcut avoids Chrome's reserved Cmd/Ctrl+J downloads shortcut. */
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
}

/** The displayed shortcut label, matching the live keydown binding. */
export function shortcutText(): string {
  return isMac() ? '⌥J' : 'Alt+J'
}

/** Required services: slot composition, dictionaries, the details-column face, session facts. */
export const inject = ['slots', 'locale', 'layout', 'sessions']

/**
 * Client plugin body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'work-panel: dictionaries')

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset['plugin'] = PLUGIN_ID
    tag.textContent = `${WORK_PANEL_CSS}\n${xtermCss}\n${scopedPdfViewerCss()}`
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'work-panel: styles')

  const panelStore = createWorkPanelStore()
  // Bound actions arrive with the overlay entry's mount; the header button
  // and the keydown binding read them lazily at gesture time.
  let panelActions: { togglePanel: () => void } | undefined

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'work-panel',
    order: 100,
    locale: NS,
    store: panelStore,
    inject: (actions: { togglePanel: () => void }) => {
      panelActions = actions
      return { closeDetails: () => { ctx.layout.closeDetails() } }
    },
  }, WorkPanel))

  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'work-panel',
    order: 100,
    locale: NS,
    inject: () => ({
      togglePanel: () => { panelActions?.togglePanel() },
      shortcut: shortcutText(),
    }),
  }, WorkPanelButton))

  ctx.effect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (e.key.toLowerCase() !== 'j') return
      e.preventDefault()
      panelActions?.togglePanel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, 'work-panel: toggle shortcut')
}
