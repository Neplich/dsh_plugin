/**
 * Host terminal manager: multiple tab-keyed PTYs per GUI session, owned by
 * the plugin fiber.
 * A PTY survives its WebSocket clients — sockets attach and detach freely
 * (panel close, tool switch, page-level reconnect) while the process and its
 * bounded scrollback live on; a fresh socket replays the retained output.
 * Explicit close, restart, and plugin disposal terminate the process tree
 * through the subprocess seam's own quiescence contract.
 *
 * @module @neplich/dsh-web-workpanel/terminal
 */
import type SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
import type {
  SubprocessTerminalHandle,
} from '@deepseek-ai/dsh-subprocess'
import type { WebSocket } from 'ws'
import { TerminalBuffer } from './core.ts'
import type { TerminalClientFrame, TerminalServerFrame } from './shared/protocol.ts'

/** Bounds the manager needs from the plugin config. */
export interface TerminalManagerOptions {
  /** Retained-output cap per terminal, in bytes. */
  readonly scrollbackBytes: number
  /** TERM-to-KILL cleanup grace handed to the subprocess provider. */
  readonly graceMs: number
}

/** Spawn facts one session needs: cwd, shell argv, and geometry. */
export interface PtySpawnFacts {
  readonly cwd: string
  readonly argv: readonly string[]
  readonly cols: number
  readonly rows: number
}

/** One live PTY: the handle, its replay buffer, the attached sockets, and its spawn facts. */
interface PtySession {
  readonly handle: SubprocessTerminalHandle
  readonly buffer: TerminalBuffer
  readonly sockets: Set<WebSocket>
  readonly facts: PtySpawnFacts
  exited: { exitCode: number | null, signal: string | null } | null
}

/** Serialize and send one frame; a closing socket fails soft. */
function send(ws: WebSocket, frame: TerminalServerFrame): void {
  try {
    ws.send(JSON.stringify(frame))
  } catch {
    // A mid-close socket is dropped by its own close handler.
  }
}

/** Geometry guard for client-supplied dimensions. */
function clampGeometry(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 2), 500) : fallback
}

/**
 * Owner-scoped PTY pool. Sockets never own process lifetime; the manager does.
 */
export class TerminalManager {
  private readonly sessions = new Map<string, Map<string, PtySession>>()

  private get(sessionId: string, terminalId: string): PtySession | undefined {
    return this.sessions.get(sessionId)?.get(terminalId)
  }

  private set(sessionId: string, terminalId: string, session: PtySession): void {
    const terminals = this.sessions.get(sessionId) ?? new Map<string, PtySession>()
    terminals.set(terminalId, session)
    this.sessions.set(sessionId, terminals)
  }

  private delete(sessionId: string, terminalId: string): void {
    const terminals = this.sessions.get(sessionId)
    if (terminals === undefined) return
    terminals.delete(terminalId)
    if (terminals.size === 0) this.sessions.delete(sessionId)
  }

  /**
   * @param subprocess - the host subprocess seam (PTY allocation).
   * @param options - scrollback and cleanup bounds.
   */
  constructor(
    private readonly subprocess: SubprocessRuntime,
    private readonly options: TerminalManagerOptions,
  ) {}

  /** True when a live (or exited-but-viewable) terminal exists for the key. */
  has(sessionId: string, terminalId: string): boolean {
    return this.get(sessionId, terminalId) !== undefined
  }

  /**
   * Attach one WebSocket to the session's PTY, spawning it on first use.
   * The ready frame, the scrollback replay, and the live stream follow in
   * order; the replay snapshot and the socket attach happen in one
   * synchronous run so no output can fall between them.
   * @param sessionId - owning GUI session id.
   * @param terminalId - terminal work-tab id inside the GUI session.
   * @param facts - spawn facts used when the PTY does not exist yet.
   * @param ws - the connecting socket.
   */
  async attach(sessionId: string, terminalId: string, facts: PtySpawnFacts, ws: WebSocket): Promise<void> {
    const session = this.get(sessionId, terminalId) ?? await this.spawn(sessionId, terminalId, facts)
    const replay = session.buffer.contents()
    session.sockets.add(ws)
    send(ws, {
      type: 'ready',
      pid: session.handle.pid,
      cols: session.facts.cols,
      rows: session.facts.rows,
      exited: session.exited !== null,
    })
    if (replay.length > 0) send(ws, { type: 'replay', data: replay })
    // Handlers resolve the session by key at event time, so a respawn (which
    // moves the socket into the fresh session's set) needs no re-wiring.
    ws.on('message', (data) => { void this.onMessage(sessionId, terminalId, ws, data) })
    ws.on('close', () => { this.get(sessionId, terminalId)?.sockets.delete(ws) })
    ws.on('error', () => { this.get(sessionId, terminalId)?.sockets.delete(ws) })
  }

  /** Spawn one PTY and tee its output into the replay buffer and live sockets. */
  private async spawn(sessionId: string, terminalId: string, facts: PtySpawnFacts): Promise<PtySession> {
    const handle = await this.subprocess.spawnTerminal({
      argv: facts.argv,
      cwd: facts.cwd,
      cols: clampGeometry(facts.cols, 120),
      rows: clampGeometry(facts.rows, 30),
      graceMs: this.options.graceMs,
    })
    const session: PtySession = {
      handle,
      buffer: new TerminalBuffer(this.options.scrollbackBytes),
      sockets: new Set(),
      facts,
      exited: null,
    }
    handle.output.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      session.buffer.append(text)
      this.broadcast(session, { type: 'data', data: text })
    })
    void handle.done.then((outcome) => {
      session.exited = { exitCode: outcome.exitCode, signal: outcome.signal }
      this.broadcast(session, { type: 'exit', exitCode: outcome.exitCode, signal: outcome.signal })
    })
    this.set(sessionId, terminalId, session)
    return session
  }

  /** Dispatch one client frame. */
  private async onMessage(sessionId: string, terminalId: string, ws: WebSocket, data: unknown): Promise<void> {
    const session = this.get(sessionId, terminalId)
    if (session === undefined) return
    let frame: TerminalClientFrame
    try {
      frame = JSON.parse(String(data)) as TerminalClientFrame
    } catch {
      send(ws, { type: 'error', message: 'malformed frame' })
      return
    }
    try {
      switch (frame.type) {
        case 'input':
          if (session.exited === null) await session.handle.write(frame.data)
          break
        case 'signal':
          await session.handle.signalForeground(frame.signal)
          break
        case 'restart': {
          const facts: PtySpawnFacts = {
            cwd: session.facts.cwd,
            argv: session.facts.argv,
            cols: clampGeometry(frame.cols, session.facts.cols),
            rows: clampGeometry(frame.rows, session.facts.rows),
          }
          await this.respawn(sessionId, terminalId, session, facts)
          break
        }
        case 'close':
          await this.close(sessionId, terminalId)
          break
      }
    } catch (error) {
      send(ws, { type: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Terminate the old PTY and spawn a fresh one in place, re-attaching its sockets. */
  private async respawn(sessionId: string, terminalId: string, session: PtySession, facts: PtySpawnFacts): Promise<void> {
    const sockets = [...session.sockets]
    session.sockets.clear()
    this.delete(sessionId, terminalId)
    await session.handle.terminate().catch(() => {
      // Terminate failures stay with the seam's own diagnostics; the replacement still spawns.
    })
    const fresh = await this.spawn(sessionId, terminalId, facts)
    for (const ws of sockets) {
      fresh.sockets.add(ws)
      send(ws, { type: 'reset' })
      send(ws, { type: 'ready', pid: fresh.handle.pid, cols: facts.cols, rows: facts.rows, exited: false })
    }
  }

  /** Terminate one session's PTY and drop its sockets. */
  async close(sessionId: string, terminalId: string): Promise<void> {
    const session = this.get(sessionId, terminalId)
    if (session === undefined) return
    this.delete(sessionId, terminalId)
    const sockets = [...session.sockets]
    session.sockets.clear()
    for (const ws of sockets) {
      try {
        ws.close()
      } catch {
        // Already closing.
      }
    }
    await session.handle.terminate().catch(() => {
      // The seam logs its own survivors; nothing actionable here.
    })
  }

  /** Terminate every terminal owned by one GUI session. */
  async closeSession(sessionId: string): Promise<void> {
    const ids = [...(this.sessions.get(sessionId)?.keys() ?? [])]
    await Promise.all(ids.map(terminalId => this.close(sessionId, terminalId)))
  }

  /** Terminate every PTY (plugin fiber disposal). */
  async dispose(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map(sessionId => this.closeSession(sessionId)))
  }

  private broadcast(session: PtySession, frame: TerminalServerFrame): void {
    for (const ws of session.sockets) send(ws, frame)
  }
}
