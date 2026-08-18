/**
 * Per-session history autoload driver. Watches one session's snapshot and
 * pages the full history into the client by repeatedly calling the session's
 * own loadOlder() until the window reaches the log head. Re-arms itself when
 * a later snapshot reports older history again (reconnect resync resets the
 * window to the tail page). A stall guard stops the loop when the host keeps
 * answering without progress (loadOlder failure keeps the window unchanged).
 *
 * The driver is DOM-free and session-face-structural, so unit tests drive it
 * with fakes; the plugin body only wires real sessions to it.
 *
 * @module @neplich/dsh-chat-autoload/client/driver
 */

/** Structural subset of the client SessionFace the driver relies on. */
export interface AutoloadSession {
  getSnapshot(): AutoloadSnapshot
  subscribe(fn: () => void): () => void
  loadOlder(): Promise<void>
}

/** Structural subset of the conversation snapshot the driver reads. */
export interface AutoloadSnapshot {
  readonly openState: string
  readonly hasMore: boolean
  readonly loadingOlder: boolean
  readonly chat: { readonly order: readonly string[] }
}

/** Default backoff while another page request is in flight. */
function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * One session's autoload state machine. 'complete' is true only while the
 * snapshot says the window is open and no older history remains; it flips
 * back to false the moment older history reappears (resync), and the driver
 * pages again on the next tick.
 */
export class SessionAutoload {
  /** Whether the full history is currently paged in. */
  complete = false
  private inFlight: Promise<void> | null = null
  private cancelled = false
  private readonly unsubscribe: () => void

  /**
   * @param session - session face to drain (binding-owned; the driver never outlives the plugin fiber).
   * @param sleep - backoff clock (injectable for tests).
   * @param maxStalled - consecutive no-progress page requests tolerated before giving up.
   */
  constructor(
    private readonly session: AutoloadSession,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
    private readonly maxStalled = 3,
  ) {
    this.unsubscribe = session.subscribe(() => { void this.tick() })
    void this.tick()
  }

  /**
   * Re-evaluate the snapshot; starts a drain loop when older history exists.
   * Reentrant calls join the in-flight drain instead of stacking loops.
   */
  async tick(): Promise<void> {
    if (this.cancelled) return
    if (this.inFlight !== null) return this.inFlight
    const snapshot = this.session.getSnapshot()
    if (snapshot.openState !== 'open') return
    if (!snapshot.hasMore) {
      this.complete = true
      return
    }
    this.complete = false
    this.inFlight = this.drain()
    try {
      await this.inFlight
    } finally {
      this.inFlight = null
    }
  }

  /** Page older history until the log head, a stall, cancellation, or close. */
  private async drain(): Promise<void> {
    let stalled = 0
    while (!this.cancelled) {
      const current = this.session.getSnapshot()
      if (current.openState !== 'open' || !current.hasMore) break
      if (current.loadingOlder) {
        await this.sleep(200)
        continue
      }
      const head = current.chat.order[0]
      await this.session.loadOlder()
      const next = this.session.getSnapshot()
      if (next.hasMore && next.chat.order[0] === head) {
        stalled += 1
        if (stalled >= this.maxStalled) break
      } else {
        stalled = 0
      }
    }
    if (!this.cancelled) {
      const end = this.session.getSnapshot()
      this.complete = end.openState === 'open' && !end.hasMore
    }
  }

  /** Stop driving and unsubscribe; idempotent. */
  dispose(): void {
    this.cancelled = true
    this.unsubscribe()
  }
}
