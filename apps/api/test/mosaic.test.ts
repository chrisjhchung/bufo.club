import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { pngBytes, stubTurnstile } from './helpers'

function mosaicForm(
  rows: number,
  cols: number,
  overrides: Record<string, string> = {},
  tileSalt: (row: number, col: number) => string = (r, c) => `${r}-${c}`,
) {
  const form = new FormData()
  form.set('rows', String(rows))
  form.set('cols', String(cols))
  form.set('base', 'big-test-bufo')
  form.set('title', 'Big test bufo')
  form.set('tags', 'test')
  form.set('turnstileToken', 'token-ok')
  for (const [key, value] of Object.entries(overrides)) form.set(key, value)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      form.set(
        `tile-${row}-${col}`,
        new Blob([pngBytes(128, 128, tileSalt(row, col))]),
        `tile-${row}-${col}.png`,
      )
    }
  }
  return form
}

const post = (form: FormData, ip = '10.20.0.1') =>
  SELF.fetch('https://bufo.club/api/mosaics', {
    method: 'POST',
    body: form,
    headers: { 'CF-Connecting-IP': ip },
  })

describe('POST /api/mosaics', () => {
  it('accepts a 4x4 grid as a single submission', async () => {
    stubTurnstile()
    const response = await post(mosaicForm(4, 4), '10.20.0.2')
    expect(response.status).toBe(201)

    const body = await response.json<{ mosaicId: string; tiles: number }>()
    expect(body.tiles).toBe(16)

    const rows = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM bufos WHERE mosaic_id = ?1 AND status = ?2',
    )
      .bind(body.mosaicId, 'pending')
      .first<{ n: number }>()
    expect(rows?.n).toBe(16)
  })

  it('accepts repeated tiles, which a mosaic legitimately has', async () => {
    // Blank corners of a picture are byte-identical; a global de-dup rule would
    // drop them and leave holes in the grid.
    stubTurnstile()
    const response = await post(
      mosaicForm(2, 2, { base: 'repeat-test' }, () => 'identical'),
      '10.20.0.3',
    )
    expect(response.status).toBe(201)
    expect((await response.json<{ tiles: number }>()).tiles).toBe(4)
  })

  it('rejects a grid with a missing tile', async () => {
    // No Turnstile stub: the grid is checked before the captcha is spent.
    const form = mosaicForm(2, 2, { base: 'gap-test' })
    form.delete('tile-1-1')
    const response = await post(form, '10.20.0.4')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'missing tile 1-1' })
  })

  it('rejects an out-of-range grid', async () => {
    const response = await post(mosaicForm(2, 2, { rows: '9' }), '10.20.0.5')
    expect(response.status).toBe(400)
  })

  it('refuses a base name whose tiles already exist', async () => {
    stubTurnstile()
    const first = await post(mosaicForm(2, 2, { base: 'taken-name' }), '10.20.0.6')
    const { mosaicId } = await first.json<{ mosaicId: string }>()
    await SELF.fetch(`https://bufo.club/api/admin/mosaics/${mosaicId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base: 'taken-name', title: 'Taken', tags: [] }),
    })

    stubTurnstile()
    const second = await post(
      mosaicForm(2, 2, { base: 'taken-name' }, (r, c) => `second-${r}${c}`),
      '10.20.0.7',
    )
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ error: expect.stringContaining('already exists') })
  })
})

describe('admin mosaic approval', () => {
  it('approves every tile at once and names them by position', async () => {
    stubTurnstile()
    const submission = await post(mosaicForm(2, 3, { base: 'grid-name' }), '10.20.0.8')
    const { mosaicId } = await submission.json<{ mosaicId: string }>()

    const response = await SELF.fetch(`https://bufo.club/api/admin/mosaics/${mosaicId}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base: 'grid-name', title: 'Grid name', tags: ['big'] }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ base: 'grid-name', tiles: 6 })

    const { results } = await env.DB.prepare(
      "SELECT slug FROM bufos WHERE mosaic_id = ?1 AND status = 'approved' ORDER BY slug",
    )
      .bind(mosaicId)
      .all<{ slug: string }>()
    expect(results.map((row) => row.slug)).toEqual([
      'grid-name-0-0',
      'grid-name-0-1',
      'grid-name-0-2',
      'grid-name-1-0',
      'grid-name-1-1',
      'grid-name-1-2',
    ])

    // Every tile is published and reachable.
    for (const row of results) {
      expect(await env.ASSETS_BUCKET.get(`b/${row.slug}.png`)).not.toBeNull()
    }
  })

  it('groups pending tiles into one queue entry', async () => {
    stubTurnstile()
    const submission = await post(mosaicForm(2, 2, { base: 'queue-group' }), '10.20.0.9')
    const { mosaicId } = await submission.json<{ mosaicId: string }>()

    const queue = await (await SELF.fetch('https://bufo.club/api/admin/queue')).json<{
      mosaics: { mosaicId: string; tiles: number; rows: number; cols: number; title: string }[]
    }>()
    const entry = queue.mosaics.find((m) => m.mosaicId === mosaicId)
    expect(entry).toMatchObject({ tiles: 4, rows: 2, cols: 2, title: 'Big test bufo' })
  })
})
