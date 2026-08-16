/**
 * The work panel's root-scoped view store: open flag, width preference, the
 * per-session work tabs, and each file tab's browser state. Terminal process
 * and output state lives host-side (the PTY pool); this store keeps only what
 * makes the UI return to where the user left it.
 *
 * @module @neplich/dsh-work-panel/client/store
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Work-tab kinds. */
export type PanelTool = 'files' | 'terminal'

/** One top-level work-panel tab. */
export interface PanelTabState {
  readonly id: string
  readonly kind: PanelTool
  readonly index: number
}

/** Per-session work-panel tab strip. */
export interface PanelTabsState {
  readonly tabs: readonly PanelTabState[]
  readonly active: string | null
  readonly next: number
  readonly nextFiles: number
  readonly nextTerminals: number
}

/** Per-session file-browser view state. */
export interface FilesViewState {
  /** Expanded directory paths (workspace-relative posix; '' is the root and always expanded). */
  readonly expanded: readonly string[]
  /** The previewed file path (workspace-relative posix), or null for the empty preview. */
  readonly preview: string | null
  /** Current client-side directory-tree name filter. */
  readonly filter: string
  /** Whether the directory tree column is visible. */
  readonly treeVisible: boolean
  /** Whether a Markdown preview shows source instead of rendered Markdown. */
  readonly source: boolean
}

/** Panel geometry contract (px). */
export const WIDTH_DEFAULT = 480
export const WIDTH_MIN = 300
export const WIDTH_MAX = 960
/** Expanded width as a viewport fraction, clamped into the geometry contract. */
export const WIDTH_MAXIMIZED_RATIO = 0.5
/** Below this viewport width the panel auto-collapses (mirrors the shell's own breakpoint). */
export const AUTO_COLLAPSE_VIEWPORT = 1024

export interface WorkPanelState {
  open: boolean
  width: number
  /** Width to restore when leaving the maximized state. */
  restoreWidth: number
  maximized: boolean
  panels: Record<string, PanelTabsState>
  files: Record<string, Record<string, FilesViewState>>
}

/** Clamp one width into the panel contract. */
export function clampWidth(px: number): number {
  return Math.min(Math.max(Math.round(px), WIDTH_MIN), WIDTH_MAX)
}

/** The maximized width for one viewport width. */
export function maximizedWidth(viewport: number): number {
  return clampWidth(Math.max(viewport * WIDTH_MAXIMIZED_RATIO, 480))
}

const EMPTY_FILES: FilesViewState = {
  expanded: [], preview: null, filter: '', treeVisible: true, source: false,
}
const EMPTY_TABS: PanelTabsState = {
  tabs: [], active: null, next: 1, nextFiles: 1, nextTerminals: 1,
}

/**
 * Create the panel store handle. Module level exports the factory only — a
 * module-level handle would pin identity in the module cache across plugin
 * reloads; the framework instantiates per entry.
 * @returns the store handle.
 */
export function createWorkPanelStore() {
  return defineStore({
    init: (): WorkPanelState => ({
      open: false,
      width: WIDTH_DEFAULT,
      restoreWidth: WIDTH_DEFAULT,
      maximized: false,
      panels: {},
      files: {},
    }),
    actions: {
      openPanel: (d) => { d.open = true },
      closePanel: (d) => { d.open = false },
      togglePanel: (d) => { d.open = !d.open },
      setWidth: (d, px: number) => {
        d.width = clampWidth(px)
        d.maximized = false
      },
      toggleMaximize: (d, viewport: number) => {
        if (d.maximized) {
          d.width = clampWidth(d.restoreWidth)
          d.maximized = false
        } else {
          d.restoreWidth = d.width
          d.width = maximizedWidth(viewport)
          d.maximized = true
        }
      },
      showEntries: (d, sessionId: string) => {
        const current = d.panels[sessionId] ?? EMPTY_TABS
        d.panels[sessionId] = { ...current, active: null }
      },
      addTab: (d, sessionId: string, kind: PanelTool) => {
        const current = d.panels[sessionId] ?? EMPTY_TABS
        const index = kind === 'files' ? current.nextFiles : current.nextTerminals
        const tab = { id: `work-${current.next}`, kind, index }
        d.panels[sessionId] = {
          tabs: [...current.tabs, tab],
          active: tab.id,
          next: current.next + 1,
          nextFiles: current.nextFiles + (kind === 'files' ? 1 : 0),
          nextTerminals: current.nextTerminals + (kind === 'terminal' ? 1 : 0),
        }
      },
      selectTab: (d, sessionId: string, tabId: string) => {
        const current = d.panels[sessionId]
        if (current === undefined || !current.tabs.some(tab => tab.id === tabId)) return
        d.panels[sessionId] = { ...current, active: tabId }
      },
      removeTab: (d, sessionId: string, tabId: string) => {
        const current = d.panels[sessionId]
        if (current === undefined) return
        const removedAt = current.tabs.findIndex(tab => tab.id === tabId)
        if (removedAt < 0) return
        const tabs = current.tabs.filter(tab => tab.id !== tabId)
        const active = current.active === tabId
          ? tabs[Math.min(removedAt, tabs.length - 1)]?.id ?? null
          : current.active
        d.panels[sessionId] = { ...current, tabs, active }
        if (d.files[sessionId] !== undefined) delete d.files[sessionId]![tabId]
      },
      toggleDir: (d, sessionId: string, tabId: string, path: string) => {
        const session = d.files[sessionId] ?? {}
        const current = session[tabId] ?? EMPTY_FILES
        const expanded = current.expanded.includes(path)
          ? current.expanded.filter((entry) => entry !== path)
          : [...current.expanded, path]
        d.files[sessionId] = { ...session, [tabId]: { ...current, expanded } }
      },
      setPreview: (d, sessionId: string, tabId: string, path: string | null) => {
        const session = d.files[sessionId] ?? {}
        const current = session[tabId] ?? EMPTY_FILES
        d.files[sessionId] = { ...session, [tabId]: { ...current, preview: path, source: false } }
      },
      setFileFilter: (d, sessionId: string, tabId: string, filter: string) => {
        const session = d.files[sessionId] ?? {}
        const current = session[tabId] ?? EMPTY_FILES
        d.files[sessionId] = { ...session, [tabId]: { ...current, filter } }
      },
      toggleFileTree: (d, sessionId: string, tabId: string) => {
        const session = d.files[sessionId] ?? {}
        const current = session[tabId] ?? EMPTY_FILES
        d.files[sessionId] = { ...session, [tabId]: { ...current, treeVisible: !current.treeVisible } }
      },
      toggleFileSource: (d, sessionId: string, tabId: string) => {
        const session = d.files[sessionId] ?? {}
        const current = session[tabId] ?? EMPTY_FILES
        d.files[sessionId] = { ...session, [tabId]: { ...current, source: !current.source } }
      },
    },
  })
}
