/**
 * Conversation navigator dictionaries. The rail component is a slot-registered
 * React entry, so copy arrives through the locale seat (t prop) after the
 * plugin registers this namespace.
 */

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Conversation rail and preview-card copy. */
    'chat-navigator': NavigatorKey
  }
}

/** Simplified Chinese navigator messages. */
export const zh = {
  'rail.label': '对话导航',
  'round.title': '第 {n} 轮',
  'status.running': '运行中…',
  'history.loading': '正在加载完整历史…',
} satisfies Record<string, string>

/** English navigator messages. */
export const en = {
  'rail.label': 'Conversation navigator',
  'round.title': 'Round {n}',
  'status.running': 'Running…',
  'history.loading': 'Loading full history…',
} satisfies Record<string, string>

/** Navigator dictionary namespace. */
export const NS = 'chat-navigator'

/** Key union of the navigator dictionary (the LocaleNamespaceMap entry). */
export type NavigatorKey = keyof typeof zh
