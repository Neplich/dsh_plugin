import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import type {
  SubprocessOutcome, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import type SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
import { TerminalManager } from '../src/terminal.ts'
import type { TerminalServerFrame } from '../src/shared/protocol.ts'

/** Minimal WebSocket stand-in: records sent frames, EventEmitter for events. */
class FakeSocket extends EventEmitter {
  readonly sent: TerminalServerFrame[] = []
  closed = false
  send(data: string): void {
    this.sent.push(JSON.parse(data) as TerminalServerFrame)
  }
  close(): void {
    this.closed = true
    this.emit('close')
  }
  /** Test-side input. */
  receive(frame: unknown): void {
    this.emit('message', JSON.stringify(frame))
  }
}

/** Minimal PTY stand-in over a PassThrough. */
class FakePty implements SubprocessTerminalHandle {
  readonly pid = 4321
  readonly output = new PassThrough()
  readonly written: string[] = []
  readonly done: Promise<SubprocessOutcome>
  terminated = false
  private resolveDone!: (outcome: SubprocessOutcome) => void
  constructor() {
    this.done = new Promise((resolve) => { this.resolveDone = resolve })
  }
  async write(data: string): Promise<void> {
    this.written.push(data)
  }
  async inspectForeground(): Promise<undefined> {
    return undefined
  }
  async signalForeground(): Promise<number> {
    return this.pid
  }
  async terminate(): Promise<void> {
    this.terminated = true
  }
  /** Test-side process exit. */
  exit(exitCode: number): void {
    this.resolveDone({ exitCode, signal: null })
  }
}

/** Fake subprocess seam: hands out FakePty instances and records spawn specs. */
function fakeSubprocess(): { subprocess: SubprocessRuntime, spawned: FakePty[], specs: SubprocessTerminalSpawnSpec[] } {
  const spawned: FakePty[] = []
  const specs: SubprocessTerminalSpawnSpec[] = []
  const subprocess = {
    async spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
      specs.push(spec)
      const pty = new FakePty()
      spawned.push(pty)
      return pty
    },
  } as unknown as SubprocessRuntime
  return { subprocess, spawned, specs }
}

const OPTIONS = { scrollbackBytes: 1024, graceMs: 10 }
const FACTS = { cwd: '/tmp/work', argv: ['/bin/bash'], cols: 100, rows: 24 }

describe('TerminalManager', () => {
  it('spawns on first attach and answers ready with the negotiated geometry', async () => {
    const { subprocess, specs } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const ws = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, ws as never)
    expect(specs).toHaveLength(1)
    expect(specs[0]).toMatchObject({ cwd: '/tmp/work', cols: 100, rows: 24 })
    expect(ws.sent[0]).toMatchObject({ type: 'ready', pid: 4321, exited: false })
    await manager.dispose()
  })

  it('streams output to attached sockets and replays it to late attachers', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const first = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, first as never)
    spawned[0]!.output.write('$ echo hi\n')
    expect(first.sent.some(f => f.type === 'data' && f.data === '$ echo hi\n')).toBe(true)

    const second = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, second as never)
    const replay = second.sent.find(f => f.type === 'replay')
    expect(replay).toMatchObject({ type: 'replay', data: '$ echo hi\n' })
    await manager.dispose()
  })

  it('forwards input frames to the live PTY only', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const ws = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, ws as never)
    ws.receive({ type: 'input', data: 'ls\n' })
    expect(spawned[0]!.written).toEqual(['ls\n'])
    spawned[0]!.exit(0)
    await new Promise(resolve => setImmediate(resolve))
    ws.receive({ type: 'input', data: 'ignored' })
    expect(spawned[0]!.written).toEqual(['ls\n'])
    await manager.dispose()
  })

  it('announces exit to every attached socket', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const ws = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, ws as never)
    spawned[0]!.exit(3)
    await new Promise(resolve => setImmediate(resolve))
    expect(ws.sent.some(f => f.type === 'exit' && f.exitCode === 3)).toBe(true)
    // A late attacher learns the terminal is exited through ready.
    const late = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, late as never)
    expect(late.sent[0]).toMatchObject({ type: 'ready', exited: true })
    await manager.dispose()
  })

  it('restart terminates the old PTY, spawns a fresh one, and resets clients', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const ws = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, ws as never)
    spawned[0]!.output.write('old output')
    ws.receive({ type: 'restart', cols: 132, rows: 40 })
    await new Promise(resolve => setImmediate(resolve))
    expect(spawned[0]!.terminated).toBe(true)
    expect(spawned).toHaveLength(2)
    const resetAt = ws.sent.findIndex(f => f.type === 'reset')
    const readyAfter = ws.sent.findIndex((f, i) => i > resetAt && f.type === 'ready' && f.cols === 132)
    expect(resetAt).toBeGreaterThanOrEqual(0)
    expect(readyAfter).toBeGreaterThan(resetAt)
    // The fresh terminal's replay must not resurrect the old output.
    const late = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, late as never)
    expect(late.sent.some(f => f.type === 'replay' && f.data.includes('old output'))).toBe(false)
    const framesBeforeOldExit = ws.sent.length
    spawned[0]!.exit(0)
    await new Promise(resolve => setImmediate(resolve))
    expect(ws.sent.slice(framesBeforeOldExit).some(f => f.type === 'exit')).toBe(false)
    await manager.dispose()
  })

  it('close terminates the PTY and drops the session', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const ws = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, ws as never)
    ws.receive({ type: 'close' })
    await new Promise(resolve => setImmediate(resolve))
    expect(spawned[0]!.terminated).toBe(true)
    expect(manager.has('s1', 'terminal-1')).toBe(false)
    await manager.dispose()
  })

  it('dispose terminates every session', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    await manager.attach('s1', 'terminal-1', FACTS, new FakeSocket() as never)
    await manager.attach('s2', 'terminal-1', FACTS, new FakeSocket() as never)
    await manager.dispose()
    expect(spawned.every(pty => pty.terminated)).toBe(true)
  })

  it('keeps terminal tabs isolated and closes all PTYs for one GUI session', async () => {
    const { subprocess, spawned } = fakeSubprocess()
    const manager = new TerminalManager(subprocess, OPTIONS)
    const first = new FakeSocket()
    const second = new FakeSocket()
    const otherSession = new FakeSocket()
    await manager.attach('s1', 'terminal-1', FACTS, first as never)
    await manager.attach('s1', 'terminal-2', FACTS, second as never)
    await manager.attach('s2', 'terminal-1', FACTS, otherSession as never)

    first.receive({ type: 'input', data: 'first\n' })
    second.receive({ type: 'input', data: 'second\n' })
    expect(spawned[0]!.written).toEqual(['first\n'])
    expect(spawned[1]!.written).toEqual(['second\n'])

    await manager.closeSession('s1')
    expect(spawned[0]!.terminated).toBe(true)
    expect(spawned[1]!.terminated).toBe(true)
    expect(spawned[2]!.terminated).toBe(false)
    expect(manager.has('s2', 'terminal-1')).toBe(true)
    await manager.dispose()
  })
})
