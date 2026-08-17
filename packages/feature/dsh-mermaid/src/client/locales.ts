/**
 * Mermaid plugin dictionaries. The diagram card and viewer are pure DOM (not
 * React slots), so copy resolves through ctx.locale.bind plus a revision
 * subscription instead of the React t seat.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Mermaid diagram card and viewer copy. */
    'mermaid': MermaidKey
  }
}

/** Simplified Chinese messages (source of truth for the key set). */
export const zh = {
  'card.viewSource': '查看源码',
  'card.hideSource': '隐藏源码',
  'card.loading': '图表渲染中…',
  'card.renderFailed': 'Mermaid 渲染失败：{message}',
  'viewer.enlarge': '放大查看',
  'viewer.zoomIn': '放大',
  'viewer.zoomOut': '缩小',
  'viewer.fit': '适应窗口',
  'viewer.close': '关闭',
} satisfies Record<string, string>

/** English messages. */
export const en = {
  'card.viewSource': 'View source',
  'card.hideSource': 'Hide source',
  'card.loading': 'Rendering diagram…',
  'card.renderFailed': 'Mermaid render failed: {message}',
  'viewer.enlarge': 'Enlarge',
  'viewer.zoomIn': 'Zoom in',
  'viewer.zoomOut': 'Zoom out',
  'viewer.fit': 'Fit to window',
  'viewer.close': 'Close',
} satisfies Record<keyof typeof zh, string>

/** Mermaid locale namespace. */
export const NS = 'mermaid'

/** Key union of the mermaid dictionary (the namespace's LocaleNamespaceMap entry). */
export type MermaidKey = keyof typeof zh
