import { describe, expect, it } from 'vitest'
import { filterMatches, fitChipLabel, rankFiles, toDisplayRows } from '../src/shared/rank.ts'

const files = [
  { path: 'README.md', name: 'README.md', dir: '' },
  { path: 'src/client/MenuView.tsx', name: 'MenuView.tsx', dir: 'src/client' },
  { path: 'src/client/index.ts', name: 'index.ts', dir: 'src/client' },
  { path: 'src/index.ts', name: 'index.ts', dir: 'src' },
]

describe('rankFiles', () => {
  it('answers the leading slice on an empty query', () => {
    expect(rankFiles(files, '', 2).map(file => file.path)).toEqual(['README.md', 'src/client/MenuView.tsx'])
  })

  it('ranks basename prefix over path containment', () => {
    expect(rankFiles(files, 'index', 10).map(file => file.path)).toEqual(['src/index.ts', 'src/client/index.ts'])
  })

  it('matches directory segments through the full path', () => {
    expect(rankFiles(files, 'client', 10).map(file => file.path)).toEqual([
      'src/client/index.ts', 'src/client/MenuView.tsx',
    ])
  })

  it('drops everything without a verbatim substring match (no fuzzy tier)', () => {
    expect(rankFiles(files, 'mvtsx', 10)).toEqual([])
    expect(rankFiles(files, 'zzz', 10)).toEqual([])
  })
})

describe('filterMatches', () => {
  it('is uncapped and case-insensitive', () => {
    expect(filterMatches(files, 'INDEX')).toHaveLength(2)
    expect(filterMatches(files, '')).toHaveLength(4)
  })
})

describe('toDisplayRows', () => {
  it('displays basenames and disambiguates collisions within the list', () => {
    const rows = toDisplayRows(rankFiles(files, 'index', 10))
    expect(rows.map(row => row.name)).toEqual(['index.ts (src)', 'index.ts (src/client)'])
    expect(rows.map(row => row.dir)).toEqual(['src', 'src/client'])
    expect(rows.map(row => row.path)).toEqual(['src/index.ts', 'src/client/index.ts'])
  })

  it('keeps unique basenames bare and root files dir-less', () => {
    const rows = toDisplayRows([files[0]!, files[1]!])
    expect(rows[0]).toEqual({ path: 'README.md', name: 'README.md', dir: '' })
    expect(rows[1]).toEqual({ path: 'src/client/MenuView.tsx', name: 'MenuView.tsx', dir: 'src/client' })
  })
})

describe('fitChipLabel', () => {
  /** Fake probe: 10px per code unit. */
  const measure = (text: string) => text.length * 10

  it('returns the whole label when it fits', () => {
    expect(fitChipLabel('⎘ ', 'a.ts', 100, measure)).toBe('⎘ a.ts')
  })

  it('tail-elides the name, keeping the marker and as many leading chars as fit', () => {
    // '⎘ composition.md' = 16 units > 10 fit; keep=7 gives '⎘ composi…' = 10 exactly.
    expect(fitChipLabel('⎘ ', 'composition.md', 100, measure)).toBe('⎘ composi…')
  })

  it('falls back to marker + ellipsis when nothing fits', () => {
    expect(fitChipLabel('⎘ ', 'x', 20, measure)).toBe('⎘ …')
  })
})
