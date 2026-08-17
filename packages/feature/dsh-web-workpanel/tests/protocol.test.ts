import { describe, expect, it } from 'vitest'
import { extensionOf, isImagePath, isPdfPath, isTerminalId, languageOf, ooxmlKindOf } from '../src/shared/protocol.ts'

describe('shared protocol helpers', () => {
  it('extracts lowercased extensions', () => {
    expect(extensionOf('src/App.TSX')).toBe('tsx')
    expect(extensionOf('README')).toBe('')
    expect(extensionOf('dir.with.dots/file')).toBe('')
  })

  it('recognizes previewable images', () => {
    expect(isImagePath('assets/logo.png')).toBe(true)
    expect(isImagePath('assets/logo.PNG')).toBe(true)
    expect(isImagePath('src/index.ts')).toBe(false)
  })

  it('recognizes PDF files for the PDF.js viewer', () => {
    expect(isPdfPath('docs/guide.pdf')).toBe(true)
    expect(isPdfPath('docs/GUIDE.PDF')).toBe(true)
    expect(isPdfPath('docs/guide.pdf.txt')).toBe(false)
  })

  it('recognizes modern Office Open XML files only', () => {
    expect(ooxmlKindOf('docs/report.DOCX')).toBe('docx')
    expect(ooxmlKindOf('data/model.xlsx')).toBe('xlsx')
    expect(ooxmlKindOf('slides/demo.pptx')).toBe('pptx')
    expect(ooxmlKindOf('legacy/report.doc')).toBeUndefined()
  })

  it('guesses preview languages by extension', () => {
    expect(languageOf('src/index.ts')).toBe('typescript')
    expect(languageOf('README.md')).toBe('markdown')
    expect(languageOf('data.yaml')).toBe('yaml')
    expect(languageOf('LICENSE')).toBe('text')
  })

  it('accepts only bounded opaque terminal ids', () => {
    expect(isTerminalId('terminal-12')).toBe(true)
    expect(isTerminalId('../terminal')).toBe(false)
    expect(isTerminalId('')).toBe(false)
    expect(isTerminalId('x'.repeat(65))).toBe(false)
  })
})
