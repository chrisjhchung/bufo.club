/**
 * Mosaics: one picture sliced into a grid of square emoji that reassemble when
 * pasted together. The convention comes from `bigbufo` in the all-the-bufo
 * collection — a 4×4 grid named `bigbufo_0_0` … `bigbufo_3_3`, which our
 * slugifier renders as `bigbufo-0-0`. Row first, column second, zero indexed.
 */

/** Every tile is a square emoji, whatever shape the source picture was. */
export const MOSAIC_TILE_SIZE = 128

export const MOSAIC_MIN = 2
export const MOSAIC_MAX = 5

/** Grid presets offered in the UI; 4×4 is what bigbufo uses. */
export const MOSAIC_PRESETS = [2, 3, 4, 5] as const

export type MosaicGrid = { rows: number; cols: number }

/**
 * Which number in `name-a-b` comes first.
 *
 * There is no single convention in the wild: `bigbufo` is named row-then-column,
 * while `bufo-blank-stare` is column-then-row (x-y). Assembling with the wrong
 * one transposes the picture, so it is stored per mosaic rather than assumed.
 */
export type MosaicOrientation = 'row-col' | 'col-row'

export type Mosaic = {
  /** Slug prefix shared by every tile, e.g. 'bigbufo'. */
  base: string
  rows: number
  cols: number
  orientation?: MosaicOrientation
}

export function tileSlug(base: string, row: number, col: number): string {
  return `${base}-${row}-${col}`
}

/** The tile that belongs at grid position (row, col) for this mosaic. */
export function tileSlugAt(mosaic: Mosaic, row: number, col: number): string {
  return mosaic.orientation === 'col-row'
    ? tileSlug(mosaic.base, col, row)
    : tileSlug(mosaic.base, row, col)
}

const TILE_PATTERN = /^(.*)-(\d+)-(\d+)$/

/** Split `bigbufo-2-3` into its parts; null when the slug is not a tile. */
export function parseTileSlug(slug: string): { base: string; row: number; col: number } | null {
  const match = TILE_PATTERN.exec(slug)
  if (!match) return null
  const [, base, row, col] = match
  if (!base) return null
  return { base, row: Number(row), col: Number(col) }
}

/**
 * What you paste into Slack or Discord: one line per row, tiles in order, no
 * separators. The client renders each `:name:` and the grid reassembles.
 */
export function mosaicPasteText(mosaic: Mosaic): string {
  const lines: string[] = []
  for (let row = 0; row < mosaic.rows; row++) {
    let line = ''
    for (let col = 0; col < mosaic.cols; col++) {
      line += `:${tileSlugAt(mosaic, row, col)}:`
    }
    lines.push(line)
  }
  return lines.join('\n')
}

/** Tiles in reading order: left to right, top to bottom, as displayed. */
export function mosaicTileSlugs(mosaic: Mosaic): string[] {
  const slugs: string[] = []
  for (let row = 0; row < mosaic.rows; row++) {
    for (let col = 0; col < mosaic.cols; col++) slugs.push(tileSlugAt(mosaic, row, col))
  }
  return slugs
}

/** Where a given tile sits once the mosaic's orientation is taken into account. */
export function tilePosition(mosaic: Mosaic, slug: string): { row: number; col: number } | null {
  const tile = parseTileSlug(slug)
  if (!tile || tile.base !== mosaic.base) return null
  return mosaic.orientation === 'col-row'
    ? { row: tile.col, col: tile.row }
    : { row: tile.row, col: tile.col }
}

export function isValidGrid(grid: MosaicGrid): boolean {
  const withinRange = (value: number) =>
    Number.isInteger(value) && value >= MOSAIC_MIN && value <= MOSAIC_MAX
  return withinRange(grid.rows) && withinRange(grid.cols)
}

/**
 * Group approved slugs into complete mosaics.
 *
 * Membership is derived from the slugs rather than stored, so the mosaics that
 * were already in the collection before this feature existed (bigbufo) are
 * recognised too. A group only counts once every tile of the rectangle is
 * present — a stray `bufo-10-4` is just a bufo with numbers in its name.
 */
export function detectMosaics(
  slugs: Iterable<string>,
  orientations: Record<string, MosaicOrientation> = {},
): Mosaic[] {
  const groups = new Map<string, { rows: Set<number>; cols: Set<number>; tiles: Set<string> }>()

  for (const slug of slugs) {
    const tile = parseTileSlug(slug)
    if (!tile) continue
    const group = groups.get(tile.base) ?? { rows: new Set(), cols: new Set(), tiles: new Set() }
    group.rows.add(tile.row)
    group.cols.add(tile.col)
    group.tiles.add(`${tile.row}-${tile.col}`)
    groups.set(tile.base, group)
  }

  const mosaics: Mosaic[] = []
  for (const [base, group] of groups) {
    const rows = Math.max(...group.rows) + 1
    const cols = Math.max(...group.cols) + 1
    if (rows < MOSAIC_MIN || cols < MOSAIC_MIN) continue
    // Indices must start at zero and the rectangle must be fully populated.
    if (group.rows.size !== rows || group.cols.size !== cols) continue
    if (group.tiles.size !== rows * cols) continue
    const orientation = orientations[base] ?? 'row-col'
    // For a col-row mosaic the first index is x, so the extents swap.
    mosaics.push(
      orientation === 'col-row'
        ? { base, rows: cols, cols: rows, orientation }
        : { base, rows, cols, orientation },
    )
  }
  return mosaics.sort((a, b) => a.base.localeCompare(b.base))
}
