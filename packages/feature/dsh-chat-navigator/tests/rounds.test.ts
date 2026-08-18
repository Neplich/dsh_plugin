import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { buildRounds, clip, collapse } from '../src/client/rounds.ts'

interface FakeNode {
  key: string
  kind: string
  data: unknown
}

/** Minimal snapshot fixture: only the fields buildRounds reads. */
function snap(nodes: FakeNode[], running = false): ConversationSnapshot {
  return {
    running,
    chat: {
      order: nodes.map(n => n.key),
      nodes: new Map(nodes.map(n => [n.key, n])),
    },
  } as unknown as ConversationSnapshot
}

const user = (key: string, text: string): FakeNode => ({
  key, kind: 'user', data: { content: [{ type: 'text', text }] },
})
const assistant = (key: string, text: string, status = 'settled'): FakeNode => ({
  key, kind: 'assistant-step', data: { status, blocks: [{ kind: 'text', text }] },
})

describe('buildRounds', () => {
  it('indexes eight rounds in conversation order', () => {
    const nodes: FakeNode[] = []
    for (let i = 1; i <= 8; i++) {
      nodes.push(user('u' + i, 'request ' + i), assistant('a' + i, 'answer ' + i))
    }
    const rounds = buildRounds(snap(nodes))
    expect(rounds).toHaveLength(8)
    expect(rounds.map(r => r.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(rounds.map(r => r.anchorKey)).toEqual(nodes.filter(n => n.kind === 'user').map(n => n.key))
    expect(rounds[2]!.title).toBe('request 3')
    expect(rounds[2]!.assistantSummary).toBe('answer 3')
    expect(rounds.every(r => r.status === 'done')).toBe(true)
  })

  it('gives steering and tool nodes no rounds of their own', () => {
    const rounds = buildRounds(snap([
      user('u1', 'first'),
      { key: 's1', kind: 'steering', data: {} },
      { key: 'tc1', kind: 'tool-call', data: {} },
      assistant('a1', 'reply'),
      user('u2', 'second'),
    ]))
    expect(rounds).toHaveLength(2)
    expect(rounds[0]!.assistantSummary).toBe('reply')
  })

  it('marks a round with a running assistant step as processing', () => {
    const rounds = buildRounds(snap([
      user('u1', 'q1'), assistant('a1', 'done text'),
      user('u2', 'q2'), assistant('a2', 'partial', 'running'),
    ]))
    expect(rounds[1]!.status).toBe('processing')
    expect(rounds[1]!.assistantSummary).toBe('partial')
  })

  it('marks the last round processing while the session streams', () => {
    const rounds = buildRounds(snap([user('u1', 'q1'), user('u2', 'q2')], true))
    expect(rounds[0]!.status).toBe('done')
    expect(rounds[1]!.status).toBe('processing')
  })

  it('treats interrupted and platform-ended turns as done, never failed', () => {
    const rounds = buildRounds(snap([
      user('u1', 'q1'), { key: 'e1', kind: 'turn-error', data: {} },
      user('u2', 'q2'), assistant('a2', 'stopped', 'interrupted'),
    ]))
    expect(rounds[0]!.status).toBe('done')
    expect(rounds[1]!.status).toBe('done')
    expect(rounds[1]!.assistantSummary).toBe('stopped')
  })

  it('clips long paths, code and multiline markdown deterministically', () => {
    const long = '/very/long/path/'.repeat(30) + '\n' + 'tail '.repeat(60)
    const rounds = buildRounds(snap([user('u1', long), assistant('a1', 'ok'), user('u2', 'next')]))
    expect(rounds[0]!.userSummary.length).toBeLessThanOrEqual(140)
    expect(rounds[0]!.userSummary.endsWith('…')).toBe(true)
    expect(rounds[0]!.userSummary).not.toContain('\n')
    expect(rounds[0]!.title.length).toBeLessThanOrEqual(60)
  })

  it('rebuilding after a new message appends without duplicating markers', () => {
    const base = [user('u1', 'q1'), assistant('a1', 'a1'), user('u2', 'q2'), assistant('a2', 'a2')]
    const before = buildRounds(snap(base))
    const after = buildRounds(snap([...base, user('u3', 'q3')], true))
    expect(after).toHaveLength(3)
    expect(after.slice(0, 2).map(r => r.anchorKey)).toEqual(before.map(r => r.anchorKey))
    expect(after[2]!.anchorKey).toBe('u3')
    expect(after[2]!.status).toBe('processing')
  })
})

describe('clip / collapse', () => {
  it('collapses whitespace runs', () => {
    expect(collapse('a\n\n b\t c')).toBe('a b c')
  })

  it('clips above the budget with an ellipsis', () => {
    const out = clip('x'.repeat(200), 140)
    expect(out).toHaveLength(140)
    expect(out.endsWith('…')).toBe(true)
  })

  it('keeps short text intact', () => {
    expect(clip('short', 140)).toBe('short')
  })
})
