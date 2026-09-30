import {
  approveSchema,
  cdnUrl,
  MAX_UPLOAD_BYTES,
  mosaicApproveSchema,
  R2_KEYS,
  readImageInfo,
  rejectSchema,
  sha256Hex,
  templateUpsertSchema,
  tileSlug,
} from '@bufo/shared'
import { Hono } from 'hono'
import {
  countByStatus,
  deleteBufo,
  deleteTemplate,
  getBufoById,
  listAudit,
  listMosaicTiles,
  listOpenReports,
  listPendingBufos,
  listTemplates,
  markApproved,
  markRejected,
  resolveReport,
  setTags,
  uniqueSlug,
  upsertTemplate,
  writeAudit,
} from '../lib/db'
import { formFile, formText } from '../lib/form'
import { badRequest, conflict, notFound, payloadTooLarge } from '../lib/http'
import { rebuildManifest, templateRowToManifest } from '../lib/manifest'
import { IMMUTABLE_CACHE, moveObject, objectResponse, putImage } from '../lib/r2'
import { requireAdmin } from '../middleware/access'
import type { AppBindings } from '../types'

export const adminRoutes = new Hono<AppBindings>()

adminRoutes.use('*', requireAdmin)

adminRoutes.get('/me', (c) => c.json({ email: c.get('adminEmail') }))

adminRoutes.get('/queue', async (c) => {
  const [pending, counts] = await Promise.all([listPendingBufos(c.env.DB), countByStatus(c.env.DB)])
  const mosaics = new Map<
    string,
    {
      mosaicId: string
      rows: number
      cols: number
      title: string
      tiles: number
      createdAt: number
    }
  >()
  for (const bufo of pending) {
    if (!bufo.mosaic_id) continue
    const existing = mosaics.get(bufo.mosaic_id)
    if (existing) existing.tiles++
    else
      mosaics.set(bufo.mosaic_id, {
        mosaicId: bufo.mosaic_id,
        rows: bufo.mosaic_rows ?? 0,
        cols: bufo.mosaic_cols ?? 0,
        // Tile titles carry a "(row,col)" suffix; the set's name is the stem.
        title: bufo.title.replace(/\s*\(\d+,\d+\)$/, ''),
        tiles: 1,
        createdAt: bufo.created_at,
      })
  }

  return c.json({
    counts,
    mosaics: [...mosaics.values()],
    pending: pending.map((bufo) => ({
      id: bufo.id,
      title: bufo.title,
      ext: bufo.ext,
      width: bufo.width,
      height: bufo.height,
      bytes: bufo.bytes,
      isAnimated: bufo.is_animated === 1,
      source: bufo.source,
      credit: bufo.credit,
      note: bufo.submitter_note,
      contact: bufo.submitter_contact,
      createdAt: bufo.created_at,
      previewUrl: `/api/admin/pending/${bufo.id}`,
      mosaicId: bufo.mosaic_id ?? null,
      mosaicRow: bufo.mosaic_row ?? null,
      mosaicCol: bufo.mosaic_col ?? null,
    })),
  })
})

/** Private bucket proxy so the reviewer can see what they are approving. */
adminRoutes.get('/pending/:id', async (c) => {
  const bufo = await getBufoById(c.env.DB, c.req.param('id'))
  if (!bufo) notFound('no such submission')
  const object = await c.env.PENDING_BUCKET.get(bufo.r2_key)
  if (!object) notFound('submission image is missing from storage')
  return objectResponse(object, 'private, max-age=60')
})

adminRoutes.post('/bufos/:id/approve', async (c) => {
  const bufo = await getBufoById(c.env.DB, c.req.param('id'))
  if (!bufo) notFound('no such submission')
  if (bufo.status === 'approved') conflict('already approved', { slug: bufo.slug })

  const parsed = approveSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    badRequest(
      'invalid approval',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  const slug = await uniqueSlug(c.env.DB, parsed.data.slug, bufo.id)
  const targetKey = R2_KEYS.bufo(slug, bufo.ext)

  const moved = await moveObject(
    c.env.PENDING_BUCKET,
    bufo.r2_key,
    c.env.ASSETS_BUCKET,
    targetKey,
    {
      ...(await pendingMetadata(c.env.PENDING_BUCKET, bufo.r2_key)),
      cacheControl: IMMUTABLE_CACHE,
    },
  )
  if (!moved) notFound('submission image is missing from storage')

  await markApproved(c.env.DB, {
    id: bufo.id,
    slug,
    title: parsed.data.title,
    r2Key: targetKey,
    credit: parsed.data.credit ?? bufo.credit,
    reviewer: c.get('adminEmail'),
  })
  await setTags(c.env.DB, bufo.id, parsed.data.tags)
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'bufo.approve',
    targetId: bufo.id,
    meta: { slug, tags: parsed.data.tags },
  })

  const manifest = await rebuildManifest(c.env)
  return c.json({
    slug,
    url: cdnUrl(c.env.CDN_BASE, targetKey),
    manifestCount: manifest.count,
  })
})

adminRoutes.post('/bufos/:id/reject', async (c) => {
  const bufo = await getBufoById(c.env.DB, c.req.param('id'))
  if (!bufo) notFound('no such submission')

  const parsed = rejectSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) badRequest('a rejection reason is required')

  if (bufo.status === 'pending') await c.env.PENDING_BUCKET.delete(bufo.r2_key)
  await markRejected(c.env.DB, {
    id: bufo.id,
    reason: parsed.data.reason,
    reviewer: c.get('adminEmail'),
  })
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'bufo.reject',
    targetId: bufo.id,
    meta: { reason: parsed.data.reason },
  })
  // A previously approved bufo that gets rejected must leave the index.
  if (bufo.status === 'approved') {
    await c.env.ASSETS_BUCKET.delete(bufo.r2_key)
    await rebuildManifest(c.env)
  }
  return c.json({ ok: true })
})

adminRoutes.delete('/bufos/:id', async (c) => {
  const bufo = await getBufoById(c.env.DB, c.req.param('id'))
  if (!bufo) notFound('no such bufo')

  const bucket = bufo.status === 'approved' ? c.env.ASSETS_BUCKET : c.env.PENDING_BUCKET
  await bucket.delete(bufo.r2_key)
  await deleteBufo(c.env.DB, bufo.id)
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'bufo.delete',
    targetId: bufo.id,
    meta: { slug: bufo.slug, key: bufo.r2_key },
  })
  if (bufo.status === 'approved') await rebuildManifest(c.env)
  return c.json({ ok: true })
})

/**
 * Approve a mosaic as one unit.
 *
 * Tiles are meaningless alone — approving fifteen of sixteen leaves a hole that
 * only shows up when someone pastes the grid — so the slugs are assigned from
 * the stored row/column rather than typed, and the manifest is rebuilt once at
 * the end instead of per tile.
 */
adminRoutes.post('/mosaics/:mosaicId/approve', async (c) => {
  const mosaicId = c.req.param('mosaicId')
  const tiles = await listMosaicTiles(c.env.DB, mosaicId)
  if (tiles.length === 0) notFound('no such mosaic')

  const parsed = mosaicApproveSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    badRequest(
      'invalid approval',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  const { base, title, tags } = parsed.data

  // Check every slug is free before moving a single object.
  for (const tile of tiles) {
    const slug = tileSlug(base, tile.mosaic_row ?? 0, tile.mosaic_col ?? 0)
    const clash = await c.env.DB.prepare('SELECT id FROM bufos WHERE slug = ?1 AND id IS NOT ?2')
      .bind(slug, tile.id)
      .first<{ id: string }>()
    if (clash) conflict(`:${slug}: is taken`)
  }

  const approved: string[] = []
  for (const tile of tiles) {
    if (tile.status === 'approved') continue
    const row = tile.mosaic_row ?? 0
    const col = tile.mosaic_col ?? 0
    const slug = tileSlug(base, row, col)
    const targetKey = R2_KEYS.bufo(slug, tile.ext)

    const moved = await moveObject(
      c.env.PENDING_BUCKET,
      tile.r2_key,
      c.env.ASSETS_BUCKET,
      targetKey,
      {
        ...(await pendingMetadata(c.env.PENDING_BUCKET, tile.r2_key)),
        cacheControl: IMMUTABLE_CACHE,
      },
    )
    if (!moved) notFound(`tile ${row}-${col} is missing from storage`)

    await markApproved(c.env.DB, {
      id: tile.id,
      slug,
      title: `${title} (${row},${col})`,
      r2Key: targetKey,
      credit: tile.credit,
      reviewer: c.get('adminEmail'),
    })
    await setTags(c.env.DB, tile.id, [...tags, 'mosaic'])
    approved.push(slug)
  }

  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'mosaic.approve',
    targetId: mosaicId,
    meta: { base, tiles: approved.length },
  })

  const manifest = await rebuildManifest(c.env)
  return c.json({ base, tiles: approved.length, manifestCount: manifest.count })
})

adminRoutes.post('/rebuild-manifest', async (c) => {
  const manifest = await rebuildManifest(c.env)
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'manifest.rebuild',
    meta: { count: manifest.count },
  })
  return c.json({ count: manifest.count, generatedAt: manifest.generatedAt })
})

adminRoutes.get('/templates', async (c) => {
  const templates = await listTemplates(c.env.DB, true)
  return c.json({
    templates: templates.map((row) => ({
      ...templateRowToManifest(row),
      status: row.status,
      sortOrder: row.sort_order,
    })),
  })
})

/**
 * Create or update a generator template: the base plate, an optional overlay
 * that sits in front of the subject, and the slot rectangle. Both layers are
 * PNG so the transparency survives.
 */
adminRoutes.post('/templates', async (c) => {
  const form = await c.req.formData().catch(() => null)
  if (!form) badRequest('expected a multipart form upload')

  const rawMeta = formText(form, 'meta')
  if (rawMeta === undefined) badRequest('missing meta field')
  let metaJson: unknown
  try {
    metaJson = JSON.parse(rawMeta)
  } catch {
    badRequest('meta is not valid JSON')
  }
  const parsed = templateUpsertSchema.safeParse(metaJson)
  if (!parsed.success) {
    badRequest(
      'invalid template',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  const existing = (await listTemplates(c.env.DB, true)).find(
    (row) => row.slug === parsed.data.slug,
  )

  const baseKey = await storeLayer(c, form, 'base', parsed.data.slug, existing?.base_key)
  if (!baseKey) badRequest('a base image is required for a new template')
  const overlayKey = await storeLayer(c, form, 'overlay', parsed.data.slug, existing?.overlay_key)

  await upsertTemplate(c.env.DB, {
    slug: parsed.data.slug,
    name: parsed.data.name,
    namePattern: parsed.data.namePattern,
    baseKey,
    overlayKey: overlayKey ?? null,
    canvasW: parsed.data.canvasW,
    canvasH: parsed.data.canvasH,
    slot: parsed.data.slot,
    status: parsed.data.status,
  })
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'template.upsert',
    targetId: parsed.data.slug,
    meta: parsed.data,
  })
  await rebuildManifest(c.env)
  return c.json({ slug: parsed.data.slug, baseKey, overlayKey })
})

adminRoutes.delete('/templates/:slug', async (c) => {
  const slug = c.req.param('slug')
  // Plate keys are content-hashed, so the row is the only record of them.
  const existing = (await listTemplates(c.env.DB, true)).find((row) => row.slug === slug)
  await deleteTemplate(c.env.DB, slug)
  if (existing?.base_key) await c.env.ASSETS_BUCKET.delete(existing.base_key)
  if (existing?.overlay_key) await c.env.ASSETS_BUCKET.delete(existing.overlay_key)
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'template.delete',
    targetId: slug,
  })
  await rebuildManifest(c.env)
  return c.json({ ok: true })
})

adminRoutes.get('/reports', async (c) => c.json({ reports: await listOpenReports(c.env.DB) }))

adminRoutes.post('/reports/:id/resolve', async (c) => {
  await resolveReport(c.env.DB, c.req.param('id'), c.get('adminEmail'))
  await writeAudit(c.env.DB, {
    actor: c.get('adminEmail'),
    action: 'report.resolve',
    targetId: c.req.param('id'),
  })
  return c.json({ ok: true })
})

adminRoutes.get('/audit', async (c) => c.json({ entries: await listAudit(c.env.DB) }))

async function pendingMetadata(bucket: R2Bucket, key: string): Promise<R2HTTPMetadata> {
  const head = await bucket.head(key)
  return head?.httpMetadata ?? {}
}

type LayerName = 'base' | 'overlay'

/** Upload one template layer to the assets bucket, keeping the existing key if untouched. */
async function storeLayer(
  c: { env: AppBindings['Bindings'] },
  form: FormData,
  layer: LayerName,
  slug: string,
  existingKey?: string | null,
): Promise<string | undefined> {
  const file = formFile(form, layer)
  if (!file || file.size === 0) return existingKey ?? undefined
  if (file.size > MAX_UPLOAD_BYTES) payloadTooLarge(`${layer} image is too large`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = readImageInfo(bytes)
  if (info?.ext !== 'png') badRequest(`${layer} layer must be a PNG`)

  // Hash the bytes into the key so re-tuned art lands on a fresh URL; the old
  // object stays cached under its own key and is simply no longer referenced.
  const version = (await sha256Hex(bytes)).slice(0, 8)
  const key = R2_KEYS.template(slug, layer, version)
  await putImage(c.env.ASSETS_BUCKET, key, bytes.buffer as ArrayBuffer, 'png', {
    cacheControl: 'public, max-age=31536000, immutable',
  })
  return key
}
