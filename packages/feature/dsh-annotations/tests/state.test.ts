/**
 * State logic tests: annotation list mutations, interaction state, and the
 * marksRev signal the DOM engine re-syncs on.
 */
import { describe, expect, it } from 'vitest'
import { createAnnotationState, type Annotation } from '../src/client/state.ts'

const ann = (id: string, sessionId = 's1'): Annotation => ({
  id,
  sessionId,
  flowKey: 'k1',
  text: `text-${id}`,
  startPath: [0],
  startOffset: 0,
  endPath: [0],
  endOffset: 4,
})

describe('annotation state', () => {
  it('adds annotations per session and bumps marksRev', () => {
    const s = createAnnotationState()
    expect(s.getSnapshot().bySession.s1).toBeUndefined()
    s.actions.addAnnotation(ann('a1'))
    s.actions.addAnnotation(ann('a2'))
    expect(s.getSnapshot().bySession.s1?.map(a => a.id)).toEqual(['a1', 'a2'])
    expect(s.getSnapshot().marksRev).toBe(2)
  })

  it('ignores duplicate ids', () => {
    const s = createAnnotationState()
    s.actions.addAnnotation(ann('a1'))
    const rev = s.getSnapshot().marksRev
    s.actions.addAnnotation(ann('a1'))
    expect(s.getSnapshot().marksRev).toBe(rev)
    expect(s.getSnapshot().bySession.s1).toHaveLength(1)
  })

  it('removes one annotation and its active highlight', () => {
    const s = createAnnotationState()
    s.actions.addAnnotation(ann('a1'))
    s.actions.addAnnotation(ann('a2'))
    s.actions.setActive('a1')
    s.actions.removeAnnotation('s1', 'a1')
    expect(s.getSnapshot().bySession.s1?.map(a => a.id)).toEqual(['a2'])
    expect(s.getSnapshot().activeId).toBeNull()
  })

  it('clearAll empties the session and closes its popover', () => {
    const s = createAnnotationState()
    s.actions.addAnnotation(ann('a1'))
    s.actions.setPopover({ sessionId: 's1', open: true })
    s.actions.clearAll('s1')
    expect(s.getSnapshot().bySession.s1).toEqual([])
    expect(s.getSnapshot().popover).toBeNull()
  })

  it('clearSend clears the session and its pending selection', () => {
    const s = createAnnotationState()
    s.actions.addAnnotation(ann('a1'))
    s.actions.setPending({
      id: 'p1', sessionId: 's1', flowKey: 'k1', text: 't',
      startPath: [0], startOffset: 0, endPath: [0], endOffset: 1,
      rect: { top: 0, left: 0, bottom: 1, right: 1, width: 1, height: 1 },
    })
    s.actions.clearSend('s1')
    expect(s.getSnapshot().bySession.s1).toEqual([])
    expect(s.getSnapshot().pending).toBeNull()
  })

  it('notifies subscribers on every mutation', () => {
    const s = createAnnotationState()
    let calls = 0
    const off = s.subscribe(() => { calls += 1 })
    s.actions.addAnnotation(ann('a1'))
    s.actions.setActive('a1')
    s.actions.setFlash('a1')
    expect(calls).toBe(3)
    off()
    s.actions.setActive(null)
    expect(calls).toBe(3)
  })
})
