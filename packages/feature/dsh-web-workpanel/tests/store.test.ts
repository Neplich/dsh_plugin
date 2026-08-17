// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

// The published client-runtime `/client` artifact is the module-loader
// closure factory (it evaluates against window.__ModuleLoader__), so unit
// tests substitute a minimal JSON-draft defineStore with the same surface.
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => ({
  defineStore: (decl: {
    init: () => unknown
    actions: Record<string, (draft: never, ...args: never[]) => void>
  }) => ({
    create: () => {
      let state = decl.init()
      const listeners = new Set<() => void>()
      const actions: Record<string, (...args: unknown[]) => void> = {}
      for (const [key, fn] of Object.entries(decl.actions)) {
        actions[key] = (...args: unknown[]) => {
          const draft = JSON.parse(JSON.stringify(state)) as never
          ;(fn as (d: never, ...a: unknown[]) => void)(draft, ...args)
          state = draft
          for (const listener of listeners) listener()
        }
      }
      return {
        getSnapshot: () => state,
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        actions,
      }
    },
  }),
}))

import { createWorkPanelStore, maximizedWidth, WIDTH_DEFAULT, WIDTH_MAX, WIDTH_MIN } from '../src/client/store.ts'

/** One fresh store instance (the sanctioned test path: handles create per test). */
function freshStore() {
  return createWorkPanelStore().create()
}

describe('work panel store', () => {
  it('opens, closes, and toggles', () => {
    const store = freshStore()
    expect(store.getSnapshot().open).toBe(false)
    store.actions.togglePanel()
    expect(store.getSnapshot().open).toBe(true)
    store.actions.closePanel()
    expect(store.getSnapshot().open).toBe(false)
  })

  it('clamps drag widths into the geometry contract', () => {
    const store = freshStore()
    store.actions.setWidth(10)
    expect(store.getSnapshot().width).toBe(WIDTH_MIN)
    store.actions.setWidth(100000)
    expect(store.getSnapshot().width).toBe(WIDTH_MAX)
    store.actions.setWidth(420)
    expect(store.getSnapshot().width).toBe(420)
  })

  it('maximize remembers and restores the previous width', () => {
    const store = freshStore()
    store.actions.setWidth(400)
    store.actions.toggleMaximize(1600)
    expect(store.getSnapshot().maximized).toBe(true)
    expect(store.getSnapshot().width).toBe(maximizedWidth(1600))
    store.actions.toggleMaximize(1600)
    expect(store.getSnapshot().maximized).toBe(false)
    expect(store.getSnapshot().width).toBe(400)
  })

  it('a manual drag leaves the maximized state', () => {
    const store = freshStore()
    store.actions.toggleMaximize(1600)
    store.actions.setWidth(500)
    expect(store.getSnapshot().maximized).toBe(false)
  })

  it('adds mixed work tabs and returns to the entry chooser without removing them', () => {
    const store = freshStore()
    store.actions.addTab('s1', 'files')
    store.actions.addTab('s1', 'terminal')
    store.actions.showEntries('s1')
    expect(store.getSnapshot().panels['s1']).toEqual({
      tabs: [
        { id: 'work-1', kind: 'files', index: 1 },
        { id: 'work-2', kind: 'terminal', index: 1 },
      ],
      active: null,
      next: 3,
      nextFiles: 2,
      nextTerminals: 2,
    })
  })

  it('keeps file view state per session and work tab', () => {
    const store = freshStore()
    store.actions.toggleDir('s1', 'work-1', 'src')
    store.actions.setPreview('s1', 'work-1', 'src/index.ts')
    store.actions.setFileFilter('s1', 'work-1', 'index')
    store.actions.toggleFileTree('s1', 'work-1')
    store.actions.toggleFileSource('s1', 'work-1')
    store.actions.toggleDir('s1', 'work-2', 'docs')
    store.actions.toggleDir('s2', 'work-1', 'other')
    expect(store.getSnapshot().files['s1']?.['work-1']).toEqual({
      expanded: ['src'],
      preview: 'src/index.ts',
      filter: 'index',
      treeVisible: false,
      source: true,
    })
    expect(store.getSnapshot().files['s1']?.['work-2']).toEqual({
      expanded: ['docs'], preview: null, filter: '', treeVisible: true, source: false,
    })
    expect(store.getSnapshot().files['s2']?.['work-1']).toEqual({
      expanded: ['other'], preview: null, filter: '', treeVisible: true, source: false,
    })
    store.actions.toggleDir('s1', 'work-1', 'src')
    expect(store.getSnapshot().files['s1']?.['work-1']?.expanded).toEqual([])
    store.actions.setPreview('s1', 'work-1', 'README.md')
    expect(store.getSnapshot().files['s1']?.['work-1']?.source).toBe(false)
  })

  it('numbers file and terminal tabs independently inside each session', () => {
    const store = freshStore()
    store.actions.addTab('s1', 'files')
    store.actions.addTab('s1', 'terminal')
    store.actions.addTab('s1', 'files')
    store.actions.addTab('s2', 'terminal')
    expect(store.getSnapshot().panels['s1']?.tabs).toEqual([
      { id: 'work-1', kind: 'files', index: 1 },
      { id: 'work-2', kind: 'terminal', index: 1 },
      { id: 'work-3', kind: 'files', index: 2 },
    ])
    expect(store.getSnapshot().panels['s2']?.tabs).toEqual([
      { id: 'work-1', kind: 'terminal', index: 1 },
    ])
  })

  it('selects and removes mixed tabs with a stable adjacent fallback', () => {
    const store = freshStore()
    store.actions.addTab('s1', 'files')
    store.actions.addTab('s1', 'terminal')
    store.actions.addTab('s1', 'files')
    store.actions.selectTab('s1', 'work-2')
    store.actions.removeTab('s1', 'work-2')
    expect(store.getSnapshot().panels['s1']?.active).toBe('work-3')
    store.actions.removeTab('s1', 'work-3')
    expect(store.getSnapshot().panels['s1']?.active).toBe('work-1')
  })

  it('starts closed at the default width with no work tabs', () => {
    const store = freshStore()
    const state = store.getSnapshot()
    expect(state.open).toBe(false)
    expect(state.width).toBe(WIDTH_DEFAULT)
    expect(state.panels).toEqual({})
  })
})
