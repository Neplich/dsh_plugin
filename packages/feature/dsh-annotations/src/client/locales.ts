/**
 * Annotation plugin dictionaries. The chip, popover, floating button, and the
 * composer copy resolve through the locale namespace below; the sent-message
 * annotation text itself is verbatim content (no wrapper copy), so nothing
 * model-visible depends on the active language.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Annotation plugin copy. */
    'dsh-annotations': DshAnnotationsKey
  }
}

/** Simplified Chinese copy. */
export const zh = {
  'add.title': '添加到会话',
  'chip.one': '{count} 条注释',
  'chip.many': '{count} 条注释',
  'chip.clear': '清除全部注释',
  'popover.remove': '删除这条注释',
} satisfies Record<string, string>

/** English copy. */
export const en = {
  'add.title': 'Add to session',
  'chip.one': '{count} annotation',
  'chip.many': '{count} annotations',
  'chip.clear': 'Clear all annotations',
  'popover.remove': 'Remove this annotation',
} satisfies Record<string, string>

/** Annotation plugin namespace. */
export const NS = 'dsh-annotations'

/** Key union of the dictionary (the namespace's LocaleNamespaceMap entry). */
export type DshAnnotationsKey = keyof typeof zh
