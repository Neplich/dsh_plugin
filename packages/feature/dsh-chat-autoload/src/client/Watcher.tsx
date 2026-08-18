/**
 * Current-session watcher: a null-rendering shell.overlay entry that starts
 * the autoload driver whenever a session becomes current. This is the
 * plugin's automatic trigger; consumers may additionally call the service's
 * ensureLoaded() themselves (the driver dedupes).
 */
import { useEffect } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** Verbs the registration's inject face hands the watcher. */
export interface AutoloadWatcherInjected {
  /** Start (or re-arm) full-history paging for a session. */
  readonly ensureLoaded: (id: SessionId) => void
}

/** Full props: framework runtime share plus the injected verbs. */
export type AutoloadWatcherProps = PropsRuntime<'shell.overlay'> & AutoloadWatcherInjected

/**
 * Null-rendering watcher entry.
 * @param props - slot props.
 * @returns always null.
 */
export function AutoloadWatcher({ useSessions, ensureLoaded }: AutoloadWatcherProps): null {
  const current = useSessions(s => s.current)
  useEffect(() => {
    if (current !== undefined) ensureLoaded(current)
  }, [current, ensureLoaded])
  return null
}
