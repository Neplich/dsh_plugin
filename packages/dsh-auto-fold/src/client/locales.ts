/**
 * Auto-fold expand-bar dictionaries. The bar is pure DOM (not a React slot),
 * so copy resolves through ctx.locale.bind + a revision subscription instead
 * of the React t seat.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Auto-fold expand-bar copy. */
    'auto-fold': AutoFoldKey
  }
}

/** Simplified Chinese expand-bar messages. */
export const zh = {
  'bar.folded': '已折叠 {count} 条思考与工具调用记录 · 点击展开',
  'bar.expanded': '已展开 {count} 条思考与工具调用记录 · 点击收起',
} satisfies Record<string, string>

/** English expand-bar messages. */
export const en = {
  'bar.folded': 'Collapsed {count} thinking and tool-call records · click to expand',
  'bar.expanded': 'Expanded {count} thinking and tool-call records · click to collapse',
} satisfies Record<string, string>

/** Auto-fold expand-bar namespace. */
export const NS = 'auto-fold'

/** Key union of the expand-bar dictionary (the namespace's LocaleNamespaceMap entry). */
export type AutoFoldKey = keyof typeof zh
