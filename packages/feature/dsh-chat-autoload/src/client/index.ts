/**
 * History autoload plugin, browser half. Provides the 'chatAutoload' service
 * other plugins hard-depend on (e.g. dsh-chat-navigator waits on it), and
 * mounts a null-rendering shell.overlay watcher that pages the current
 * session's full history into the client automatically on every session
 * switch. Paging goes through the session's own loadOlder(): existing session
 * data stays the single source, no model request, no persistence.
 *
 * @module @neplich/dsh-chat-autoload/client
 */
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the 'shell.overlay' SlotMap entry.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { SessionAutoload } from './driver.ts'
import { AutoloadWatcher } from './Watcher.tsx'

/**
 * The chatAutoload service face: full-history paging for sessions, shared
 * with consumer plugins through the cordis service store.
 */
export interface ChatAutoload {
  /**
   * Page the session's complete history into the client (idempotent;
   * re-arms after a reconnect resync truncates the window).
   * @param id - session to drain; unknown sessions are ignored (the binding
   * simply does not exist yet).
   */
  ensureLoaded(id: SessionId): void
  /**
   * Whether the session's full history is currently paged in.
   * @param id - session to query.
   * @returns false for sessions never ensured.
   */
  isComplete(id: SessionId): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** History autoload service, provided by dsh-chat-autoload. */
    chatAutoload: ChatAutoload
  }
}

export { SessionAutoload } from './driver.ts'
export type { AutoloadSession, AutoloadSnapshot } from './driver.ts'

/** Service implementation: one driver per ensured session. */
class AutoloadService implements ChatAutoload {
  private readonly controllers = new Map<string, SessionAutoload>()

  /**
   * @param ctx - owning plugin context (bindings resolve through ctx.sessions).
   */
  constructor(private readonly ctx: ClientContext) {}

  ensureLoaded(id: SessionId): void {
    const key = String(id)
    const existing = this.controllers.get(key)
    if (existing !== undefined) {
      void existing.tick()
      return
    }
    const binding = this.ctx.sessions.binding(id)
    if (binding === undefined) return
    this.controllers.set(key, new SessionAutoload(binding.session))
  }

  isComplete(id: SessionId): boolean {
    return this.controllers.get(String(id))?.complete ?? false
  }

  /** Dispose every driver; called when the plugin fiber unloads. */
  dispose(): void {
    for (const controller of this.controllers.values()) controller.dispose()
    this.controllers.clear()
  }
}

/** Required services: slot composition plus session bindings. */
export const inject = ['slots', 'sessions']

/**
 * Client plugin body.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const service = new AutoloadService(ctx)
  ctx.provide('chatAutoload', service)
  ctx.effect(() => () => { service.dispose() }, 'chat-autoload: drivers')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'chat-autoload',
    order: 1,
    inject: () => ({ ensureLoaded: (id: SessionId) => { service.ensureLoaded(id) } }),
  }, AutoloadWatcher))
}
