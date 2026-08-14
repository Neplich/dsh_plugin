/**
 * computeFolds decision tests: pure row-descriptor → fold-plan mapping.
 * DOM mapping (apply) is exercised through the assembled Web GUI instead.
 */
import { describe, expect, it } from 'vitest'
import { computeFolds, type RowDescriptor } from '../src/client/index.ts'

/** One row descriptor with sensible defaults for an assistant body row. */
function row(overrides: Partial<RowDescriptor> = {}): RowDescriptor {
  return { kind: 'assistant-step', hasThink: false, bodyText: '', ...overrides }
}

const user = (): RowDescriptor => ({ kind: 'user', hasThink: false, bodyText: 'question' })
const toolCall = (): RowDescriptor => ({ kind: 'tool-call', hasThink: false, bodyText: '' })
const think = (): RowDescriptor => ({ kind: 'assistant-step', hasThink: true, bodyText: '' })
const body = (text = 'answer'): RowDescriptor => ({ kind: 'assistant-step', hasThink: false, bodyText: text })
const bodyWithThink = (): RowDescriptor => ({ kind: 'assistant-step', hasThink: true, bodyText: 'answer' })

describe('computeFolds', () => {
  it('returns no plans for an empty flow', () => {
    expect(computeFolds([])).toEqual([])
  })

  it('returns no plans when a body row has nothing foldable before it', () => {
    expect(computeFolds([user(), body()])).toEqual([])
    expect(computeFolds([body()])).toEqual([])
  })

  it('folds tool-call rows before the first body row of the turn', () => {
    const plans = computeFolds([user(), toolCall(), toolCall(), body()])
    expect(plans).toEqual([
      { bodyIndex: 3, targetIndexes: [1, 2], hideBodyThink: false },
    ])
  })

  it('folds think-only assistant rows alongside tool-call rows', () => {
    const plans = computeFolds([user(), think(), toolCall(), think(), body()])
    expect(plans).toEqual([
      { bodyIndex: 4, targetIndexes: [1, 2, 3], hideBodyThink: false },
    ])
  })

  it('hides a Think disclosure inside the body row itself', () => {
    const plans = computeFolds([user(), toolCall(), bodyWithThink()])
    expect(plans).toEqual([
      { bodyIndex: 2, targetIndexes: [1], hideBodyThink: true },
    ])
  })

  it('never folds across a user boundary', () => {
    const plans = computeFolds([
      user(), toolCall(), body(),
      user(), toolCall(), think(), body(),
    ])
    expect(plans).toEqual([
      { bodyIndex: 2, targetIndexes: [1], hideBodyThink: false },
      { bodyIndex: 6, targetIndexes: [4, 5], hideBodyThink: false },
    ])
  })

  it('folds each body row of its own preceding records', () => {
    const plans = computeFolds([user(), toolCall(), body(), toolCall(), body()])
    expect(plans).toEqual([
      { bodyIndex: 2, targetIndexes: [1], hideBodyThink: false },
      { bodyIndex: 4, targetIndexes: [3], hideBodyThink: false },
    ])
  })

  it('ignores rows that are neither user, tool-call, nor assistant-step', () => {
    const plans = computeFolds([user(), row({ kind: 'steering' }), toolCall(), body()])
    expect(plans).toEqual([
      { bodyIndex: 3, targetIndexes: [2], hideBodyThink: false },
    ])
  })

  it('leaves bodiless think rows without a later body unfolded', () => {
    expect(computeFolds([user(), think(), toolCall()])).toEqual([])
  })
})
