import {
  approveSchema,
  cdnUrl,
  MAX_UPLOAD_BYTES,
  R2_KEYS,
  readImageInfo,
  rejectSchema,
  templateUpsertSchema,
} from '@bufo/shared'
import { Hono } from 'hono'
import {
  countByStatus,
  deleteBufo,
  deleteTemplate,
  getBufoById,
  listAudit,
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
  return c.json({
    counts,
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
  await deleteTemplate(c.env.DB, slug)
  await c.env.ASSETS_BUCKET.delete(R2_KEYS.template(slug, 'base'))
  await c.env.ASSETS_BUCKET.delete(R2_KEYS.template(slug, 'overlay'))
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

  const key = R2_KEYS.template(slug, layer)
  await putImage(c.env.ASSETS_BUCKET, key, bytes.buffer as ArrayBuffer, 'png', {
    // Template art is replaced in place, so it cannot be immutable.
    cacheControl: 'public, max-age=300',
  })
  return key
}
