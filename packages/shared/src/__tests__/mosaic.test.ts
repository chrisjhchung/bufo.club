import { describe, expect, it } from 'vitest'
import {
  detectMosaics,
  isValidGrid,
  mosaicPasteText,
  mosaicTileSlugs,
  parseTileSlug,
  tilePosition,
  tileSlug,
  tileSlugAt,
} from '../mosaic'

describe('tile slugs', () => {
  it('names tiles row first, like bigbufo', () => {
    expect(tileSlug('bigbufo', 2, 3)).toBe('bigbufo-2-3')
  })

  it('round-trips', () => {
    expect(parseTileSlug('bigbufo-2-3')).toEqual({ base: 'bigbufo', row: 2, col: 3 })
  })

  it('handles a base name that itself contains numbers', () => {
    expect(parseTileSlug('bufo-10-4-1-2')).toEqual({ base: 'bufo-10-4', row: 1, col: 2 })
  })

  it('rejects ordinary slugs', () => {
    expect(parseTileSlug('bufo-party')).toBeNull()
    expect(parseTileSlug('bufo-10')).toBeNull()
  })
})

describe('mosaicPasteText', () => {
  it('is one line per row, ready to paste', () => {
    expect(mosaicPasteText({ base: 'b', rows: 2, cols: 2 })).toBe(':b-0-0::b-0-1:\n:b-1-0::b-1-1:')
  })
})

describe('mosaicTileSlugs', () => {
  it('lists tiles in reading order', () => {
    expect(mosaicTileSlugs({ base: 'b', rows: 2, cols: 2 })).toEqual([
      'b-0-0',
      'b-0-1',
      'b-1-0',
      'b-1-1',
    ])
  })
})

describe('isValidGrid', () => {
  it('accepts 2..5 and rejects the rest', () => {
    expect(isValidGrid({ rows: 4, cols: 4 })).toBe(true)
    expect(isValidGrid({ rows: 1, cols: 4 })).toBe(false)
    expect(isValidGrid({ rows: 4, cols: 6 })).toBe(false)
    expect(isValidGrid({ rows: 2.5, cols: 3 })).toBe(false)
  })
})

describe('detectMosaics', () => {
  it('finds a complete grid', () => {
    const slugs = ['b-0-0', 'b-0-1', 'b-1-0', 'b-1-1', 'bufo-party']
    expect(detectMosaics(slugs)).toEqual([{ base: 'b', rows: 2, cols: 2, orientation: 'row-col' }])
  })

  it('ignores an incomplete grid', () => {
    expect(detectMosaics(['b-0-0', 'b-0-1', 'b-1-0'])).toEqual([])
  })

  it('ignores a lone numbered bufo', () => {
    expect(detectMosaics(['bufo-10-4'])).toEqual([])
  })

  it('requires indices to start at zero', () => {
    expect(detectMosaics(['b-1-1', 'b-1-2', 'b-2-1', 'b-2-2'])).toEqual([])
  })

  it('recognises a 4x4 the way bigbufo is laid out', () => {
    const slugs: string[] = []
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) slugs.push(`bigbufo-${r}-${c}`)
    expect(detectMosaics(slugs)).toEqual([
      { base: 'bigbufo', rows: 4, cols: 4, orientation: 'row-col' },
    ])
  })
})

describe('orientation', () => {
  const colRow = { base: 'b', rows: 2, cols: 2, orientation: 'col-row' as const }

  it('reads a col-row mosaic column first', () => {
    // Grid position (row 1, col 0) is stored as x=0, y=1 -> b-0-1.
    expect(tileSlugAt(colRow, 1, 0)).toBe('b-0-1')
    expect(tileSlugAt({ base: 'b', rows: 2, cols: 2 }, 1, 0)).toBe('b-1-0')
  })

  it('pastes a col-row mosaic in display order', () => {
    expect(mosaicPasteText(colRow)).toBe(':b-0-0::b-1-0:\n:b-0-1::b-1-1:')
  })

  it('locates a tile within its mosaic', () => {
    expect(tilePosition(colRow, 'b-0-1')).toEqual({ row: 1, col: 0 })
    expect(tilePosition({ base: 'b', rows: 2, cols: 2 }, 'b-0-1')).toEqual({ row: 0, col: 1 })
  })

  it('swaps the extents of a non-square col-row mosaic', () => {
    const slugs: string[] = []
    for (let x = 0; x < 3; x++) for (let y = 0; y < 2; y++) slugs.push(`b-${x}-${y}`)
    // Named x 0..2 by y 0..1, so it displays as 2 rows of 3 columns.
    expect(detectMosaics(slugs, { b: 'col-row' })).toEqual([
      { base: 'b', rows: 2, cols: 3, orientation: 'col-row' },
    ])
  })
})
