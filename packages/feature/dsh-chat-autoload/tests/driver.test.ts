import { describe, expect, it } from 'vitest'
import { SessionAutoload, type AutoloadSession, type AutoloadSnapshot } from '../src/client/driver.ts'

/** Fake session paging two-message pages from a fixed backlog. */
function fakeSession(pages: string[][]): AutoloadSession & { notify(): void; state: AutoloadSnapshot } {
  const remaining = [...pages]
  const loaded: string[] = []
  const listeners = new Set<() => void>()
  const state: AutoloadSnapshot = {
    openState: 'open',
    hasMore: remaining.length > 0,
    loadingOlder: false,
    chat: { order: loaded },
  }
  return {
    state,
    getSnapshot: () => state,
    subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn) } },
    notify: () => { for (const fn of [...listeners]) fn() },
    loadOlder: () => {
      const page = remaining.shift()
      if (page !== undefined) loaded.unshift(...page)
      state.hasMore = remaining.length > 0
      return Promise.resolve()
    },
  }
}

const noSleep = (): Promise<void> => Promise.resolve()

describe('SessionAutoload', () => {
  it('pages the full history until hasMore is false', async () => {
    const session = fakeSession([['a', 'b'], ['c'], ['d']])
    const driver = new SessionAutoload(session, noSleep)
    await driver.tick()
    expect(session.state.chat.order).toEqual(['d', 'c', 'a', 'b'])
    expect(driver.complete).toBe(true)
  })

  it('is complete immediately when nothing older exists', async () => {
    const session = fakeSession([])
    const driver = new SessionAutoload(session, noSleep)
    await driver.tick()
    expect(driver.complete).toBe(true)
  })

  it('stops after maxStalled no-progress requests', async () => {
    const session = fakeSession([['x']])
    // Host keeps reporting hasMore without ever prepending: loadOlder no-ops.
    session.loadOlder = () => Promise.resolve()
    const driver = new SessionAutoload(session, noSleep, 3)
    await driver.tick()
    expect(driver.complete).toBe(false)
  })

  it('re-arms after a resync reports older history again', async () => {
    const session = fakeSession([['a']])
    const driver = new SessionAutoload(session, noSleep)
    await driver.tick()
    expect(driver.complete).toBe(true)
    // Resync: window resets to the tail; one older page reappears.
    session.state.hasMore = true
    session.loadOlder = () => {
      session.state.chat.order.unshift('older')
      session.state.hasMore = false
      return Promise.resolve()
    }
    session.notify()
    await driver.tick()
    expect(session.state.chat.order[0]).toBe('older')
    expect(driver.complete).toBe(true)
  })

  it('stays incomplete while the session is not open', async () => {
    const session = fakeSession([['a']])
    session.state.openState = 'loading'
    const driver = new SessionAutoload(session, noSleep)
    await driver.tick()
    expect(driver.complete).toBe(false)
    expect(session.state.chat.order).toEqual([])
  })

  it('dispose stops further driving', async () => {
    const session = fakeSession([['a'], ['b']])
    const driver = new SessionAutoload(session, noSleep)
    // The constructor's eager tick has already started the first page; disposal
    // must prevent every later page.
    driver.dispose()
    await driver.tick()
    expect(session.state.chat.order).toEqual(['a'])
    expect(driver.complete).toBe(false)
  })
})
