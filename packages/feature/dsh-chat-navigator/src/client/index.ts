/**
 * Conversation navigator plugin, browser half: registers the bilingual
 * dictionaries, the rail stylesheet, and the rail entry into the shell's
 * frame-wide overlay. Soft-depends on the chatAutoload service (provided by
 * dsh-chat-autoload): with it, the rail's index always covers the complete
 * history; without it, the rail still works and indexes the currently loaded
 * window only (the rail's "…" hint marks that older history exists).
 *
 * @module @neplich/dsh-chat-navigator/client
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.locale service declaration.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the 'shell.overlay' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: the chatAutoload service face (optional dependency edge).
import type { ChatAutoload } from '@neplich/dsh-chat-autoload/client'
import { en, NS, zh } from './locales.ts'
import { STYLE_TEXT } from './styles.ts'
import { Navigator } from './Navigator.tsx'

/** Plugin id stamped onto the injected style tag. */
const PLUGIN_ID = '@neplich/dsh-chat-navigator'

/** Required services: slots, session bindings, dictionaries. chatAutoload stays an optional ctx.get read. */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Client plugin body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const autoload = ctx.get('chatAutoload') as ChatAutoload | undefined
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'chat-navigator: dictionaries')

  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset['plugin'] = PLUGIN_ID
    tag.textContent = STYLE_TEXT
    document.head.appendChild(tag)
    return () => { tag.remove() }
  }, 'chat-navigator: styles')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'chat-navigator',
    order: 90,
    locale: NS,
    inject: () => ({
      getBinding: (id: SessionId) => ctx.sessions.binding(id),
      ensureLoaded: (id: SessionId) => { autoload?.ensureLoaded(id) },
    }),
  }, Navigator))
}