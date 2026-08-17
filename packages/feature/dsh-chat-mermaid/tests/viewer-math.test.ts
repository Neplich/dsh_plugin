/**
 * Pure-helper tests: fence-language normalization and the viewer's zoom math.
 * The DOM upgrade path (apply) is exercised through the assembled Web GUI.
 */
import { describe, expect, it } from 'vitest'
import {
  computeFitTransform, MAX_ZOOM, MIN_ZOOM, normalizeFenceLang, zoomAtPoint,
} from '../src/client/index.ts'

describe('normalizeFenceLang', () => {
  it('returns undefined for absent or empty infostrings', () => {
    expect(normalizeFenceLang(undefined)).toBeUndefined()
    expect(normalizeFenceLang('')).toBeUndefined()
    expect(normalizeFenceLang('   ')).toBeUndefined()
  })

  it('lowercases and trims the language id', () => {
    expect(normalizeFenceLang(' Mermaid ')).toBe('mermaid')
    expect(normalizeFenceLang('TS')).toBe('ts')
  })

  it('truncates at the first non-word character like the markdown pipeline', () => {
    expect(normalizeFenceLang('mermaid {theme:dark}')).toBe('mermaid')
  })
})

describe('computeFitTransform', () => {
  it('scales down diagrams larger than the viewport', () => {
    const t = computeFitTransform(2000, 1000, 1000, 800)
    expect(t.scale).toBeCloseTo(0.45)
    expect(t.tx).toBe(0)
    expect(t.ty).toBe(0)
  })

  it('enlarges small diagrams but caps the initial zoom', () => {
    expect(computeFitTransform(100, 100, 1000, 800).scale).toBe(2)
  })
})

describe('zoomAtPoint', () => {
  it('keeps the zoom point fixed on screen', () => {
    const before = { scale: 1, tx: 10, ty: -20 }
    const after = zoomAtPoint(before, 100, 50, 2)
    // The stage point (100,50) maps to the same diagram point before and after.
    expect((100 - before.tx) / before.scale).toBeCloseTo((100 - after.tx) / after.scale)
    expect((50 - before.ty) / before.scale).toBeCloseTo((50 - after.ty) / after.scale)
    expect(after.scale).toBe(2)
  })

  it('zooms around the center without moving the diagram', () => {
    const before = { scale: 1, tx: 30, ty: 40 }
    const after = zoomAtPoint(before, 0, 0, 1.25)
    expect(after.tx).toBeCloseTo(37.5)
    expect(after.ty).toBeCloseTo(50)
  })

  it('clamps to the zoom bounds', () => {
    expect(zoomAtPoint({ scale: MAX_ZOOM, tx: 0, ty: 0 }, 0, 0, 2).scale).toBe(MAX_ZOOM)
    expect(zoomAtPoint({ scale: MIN_ZOOM, tx: 0, ty: 0 }, 0, 0, 0.5).scale).toBe(MIN_ZOOM)
  })
})
