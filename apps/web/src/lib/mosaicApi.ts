import type { MosaicTile } from '@bufo/gen'
import type { MosaicGrid } from '@bufo/shared'
import { ApiError } from './api'

export type MosaicSubmission = {
  base: string
  title: string
  grid: MosaicGrid
  tiles: MosaicTile[]
  tags?: string
  note?: string
  credit?: string
  turnstileToken: string
}

export type MosaicResult = { mosaicId: string; tiles: number; base: string }

/**
 * Submit every tile in one request. Uploading them one at a time would trip the
 * per-address rate limit partway through a 4x4 and leave the grid incomplete.
 */
export async function submitMosaic(submission: MosaicSubmission): Promise<MosaicResult> {
  const form = new FormData()
  form.set('base', submission.base)
  form.set('title', submission.title)
  form.set('rows', String(submission.grid.rows))
  form.set('cols', String(submission.grid.cols))
  form.set('turnstileToken', submission.turnstileToken)
  if (submission.tags) form.set('tags', submission.tags)
  if (submission.note) form.set('note', submission.note)
  if (submission.credit) form.set('credit', submission.credit)

  for (const tile of submission.tiles) {
    form.set(`tile-${tile.row}-${tile.col}`, tile.blob, `tile-${tile.row}-${tile.col}.png`)
  }

  const response = await fetch('/api/mosaics', { method: 'POST', body: form })
  const text = await response.text()
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : null

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (body?.error as string) ?? `request failed (${response.status})`,
      body?.details,
    )
  }
  return body as unknown as MosaicResult
}
