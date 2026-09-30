import { MOSAIC_TILE_SIZE, type MosaicGrid } from '@bufo/shared'
import { canvasToBlob, createCanvas } from './canvas'

type Sized = { width: number; height: number }

/**
 * Lay a picture across a grid and cut it into square tiles.
 *
 * The picture is fitted into the whole grid first, then sliced, so the pieces
 * line up when pasted back together. Tiles are always square because that is
 * how chat clients render custom emoji — a non-square tile would be letterboxed
 * on upload and the seams would not meet.
 */
export function composeMosaicSheet(image: CanvasImageSource & Sized, grid: MosaicGrid) {
  const width = grid.cols * MOSAIC_TILE_SIZE
  const height = grid.rows * MOSAIC_TILE_SIZE
  const sheet = createCanvas(width, height)
  const ctx = sheet.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('2d canvas unavailable')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Contain, so nothing is cropped away; the spare space stays transparent.
  const scale = Math.min(width / image.width, height / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)

  return sheet
}

export type MosaicTile = { row: number; col: number; blob: Blob }

export async function sliceMosaic(
  image: CanvasImageSource & Sized,
  grid: MosaicGrid,
): Promise<MosaicTile[]> {
  const sheet = composeMosaicSheet(image, grid)
  const tiles: MosaicTile[] = []

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const tile = createCanvas(MOSAIC_TILE_SIZE, MOSAIC_TILE_SIZE)
      const ctx = tile.getContext('2d') as CanvasRenderingContext2D | null
      if (!ctx) throw new Error('2d canvas unavailable')
      ctx.drawImage(
        sheet as CanvasImageSource,
        col * MOSAIC_TILE_SIZE,
        row * MOSAIC_TILE_SIZE,
        MOSAIC_TILE_SIZE,
        MOSAIC_TILE_SIZE,
        0,
        0,
        MOSAIC_TILE_SIZE,
        MOSAIC_TILE_SIZE,
      )
      tiles.push({ row, col, blob: await canvasToBlob(tile) })
    }
  }

  return tiles
}
