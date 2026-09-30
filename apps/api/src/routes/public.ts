import {
  cdnUrl,
  MAX_IMAGE_DIMENSION,
  MAX_MOSAIC_BYTES,
  MAX_TILE_BYTES,
  MAX_UPLOAD_BYTES,
  mosaicSubmissionSchema,
  parseTags,
  R2_KEYS,
  readImageInfo,
  reportSchema,
  sha256Hex,
  submissionMetaSchema,
  tileSlug,
} from '@bufo/shared'
import { Hono } from 'hono'
import {
  findBufoBySha,
  getApprovedBufoBySlug,
  insertBufo,
  insertReport,
  listTemplates,
  type MosaicPlacement,
  setTags,
} from '../lib/db'
import { formFile, formText } from '../lib/form'
import { badRequest, conflict, notFound, payloadTooLarge, tooManyRequests } from '../lib/http'
import { newId } from '../lib/ids'
import { templateRowToManifest } from '../lib/manifest'
import { objectResponse, putImage } from '../lib/r2'
import { assertHuman } from '../lib/turnstile'
import type { AppBindings } from '../types'

export const publicRoutes = new Hono<AppBindings>()

const clientIp = (header: string | undefined) => header?.split(',')[0]?.trim()

publicRoutes.get('/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }))

/** Where the client should fetch the search index from. */
publicRoutes.get('/manifest-url', (c) => c.json({ url: cdnUrl(c.env.CDN_BASE, R2_KEYS.manifest) }))

publicRoutes.get('/bufos/:slug', async (c) => {
  const bufo = await getApprovedBufoBySlug(c.env.DB, c.req.param('slug'))
  if (!bufo) notFound('no such bufo')
  return c.json({
    slug: bufo.slug,
    title: bufo.title,
    ext: bufo.ext,
    width: bufo.width,
    height: bufo.height,
    isAnimated: bufo.is_animated === 1,
    credit: bufo.credit,
    sourceUrl: bufo.source_url,
    createdAt: bufo.created_at,
    url: cdnUrl(c.env.CDN_BASE, `b/${bufo.slug}.${bufo.ext}`),
  })
})

publicRoutes.get('/templates', async (c) => {
  const templates = await listTemplates(c.env.DB)
  return c.json({ templates: templates.map(templateRowToManifest) })
})

/**
 * Anonymous upload. Nothing here trusts the client: the rate limiter and
 * Turnstile gate the endpoint, and the file type comes from the bytes rather
 * than the filename or Content-Type.
 */
publicRoutes.post('/submissions', async (c) => {
  const ip = clientIp(c.req.header('CF-Connecting-IP')) ?? 'unknown'
  const { success } = await c.env.SUBMIT_LIMITER.limit({ key: `submit:${ip}` })
  if (!success) tooManyRequests('too many uploads from this address, try again shortly')

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    badRequest('expected a multipart form upload')
  }

  const meta = submissionMetaSchema.safeParse({
    title: formText(form, 'title'),
    tags: formText(form, 'tags'),
    note: formText(form, 'note'),
    contact: formText(form, 'contact'),
    credit: formText(form, 'credit'),
    source: formText(form, 'source'),
    turnstileToken: formText(form, 'turnstileToken'),
  })
  if (!meta.success) {
    badRequest(
      'invalid submission',
      meta.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  const file = formFile(form, 'file')
  if (!file) badRequest('no file attached')
  if (file.size === 0) badRequest('file is empty')
  if (file.size > MAX_UPLOAD_BYTES) {
    payloadTooLarge(`file is larger than ${Math.floor(MAX_UPLOAD_BYTES / 1024)}KB`)
  }

  await assertHuman(c.env, meta.data.turnstileToken, ip)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = readImageInfo(bytes)
  if (!info) badRequest('not a PNG, GIF or WebP image')
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
    badRequest(`image is larger than ${MAX_IMAGE_DIMENSION}px on a side`)
  }
  if (info.width === 0 || info.height === 0) badRequest('image has no dimensions')

  const sha256 = await sha256Hex(bytes)
  const existing = await findBufoBySha(c.env.DB, sha256)
  if (existing) {
    conflict('this exact image is already here', {
      status: existing.status,
      slug: existing.slug,
    })
  }

  const id = newId()
  const key = R2_KEYS.pending(id, info.ext)
  await putImage(c.env.PENDING_BUCKET, key, bytes.buffer as ArrayBuffer, info.ext, {
    cacheControl: 'no-store',
    sha256,
  })

  await insertBufo(c.env.DB, {
    id,
    title: meta.data.title,
    ext: info.ext,
    r2Key: key,
    width: info.width,
    height: info.height,
    bytes: file.size,
    sha256,
    isAnimated: info.isAnimated,
    status: 'pending',
    source: meta.data.source,
    credit: meta.data.credit ?? null,
    note: meta.data.note ?? null,
    contact: meta.data.contact ?? null,
  })

  const tags = parseTags(meta.data.tags)
  if (tags.length > 0) await setTags(c.env.DB, id, tags)

  return c.json({ id, status: 'pending' as const, tags }, 201)
})

publicRoutes.post('/reports', async (c) => {
  const ip = clientIp(c.req.header('CF-Connecting-IP')) ?? 'unknown'
  const { success } = await c.env.REPORT_LIMITER.limit({ key: `report:${ip}` })
  if (!success) tooManyRequests('too many reports from this address')

  const parsed = reportSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    badRequest(
      'invalid report',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  await assertHuman(c.env, parsed.data.turnstileToken, ip)

  const bufo = await getApprovedBufoBySlug(c.env.DB, parsed.data.slug)
  const id = await insertReport(c.env.DB, {
    slug: parsed.data.slug,
    bufoId: bufo?.id ?? null,
    reason: parsed.data.reason,
    note: parsed.data.note,
  })
  return c.json({ id, received: true }, 201)
})

/**
 * Local stand-in for the R2 custom domain. In production cdn.bufo.club is bound
 * straight to the bucket and this route is never reached.
 */
publicRoutes.get('/cdn/*', async (c) => {
  if (c.env.ENVIRONMENT !== 'dev' && c.env.ENVIRONMENT !== 'test') notFound()
  // The router is mounted at /api, so the key starts after /api/cdn/.
  const key = c.req.path.replace(/^.*?\/cdn\//, '')
  const object = await c.env.ASSETS_BUCKET.get(key)
  if (!object) notFound(`no object at ${key}`)
  return objectResponse(object, 'no-store')
})

/**
 * Submit a whole mosaic in one request.
 *
 * Tiles arrive together rather than as N separate uploads: a 4x4 grid would
 * otherwise trip the per-address rate limit three tiles in, and half an
 * uploaded mosaic is worse than none. One captcha, one rate-limit slot, all
 * tiles stored as a set that an admin approves in a single action.
 */
publicRoutes.post('/mosaics', async (c) => {
  const ip = clientIp(c.req.header('CF-Connecting-IP')) ?? 'unknown'
  const { success } = await c.env.SUBMIT_LIMITER.limit({ key: `submit:${ip}` })
  if (!success) tooManyRequests('too many uploads from this address, try again shortly')

  let form: FormData
  try {
    form = await c.req.formData()
  } catch {
    badRequest('expected a multipart form upload')
  }

  const meta = mosaicSubmissionSchema.safeParse({
    rows: formText(form, 'rows'),
    cols: formText(form, 'cols'),
    base: formText(form, 'base'),
    title: formText(form, 'title'),
    tags: formText(form, 'tags'),
    note: formText(form, 'note'),
    contact: formText(form, 'contact'),
    credit: formText(form, 'credit'),
    turnstileToken: formText(form, 'turnstileToken'),
  })
  if (!meta.success) {
    badRequest(
      'invalid mosaic',
      meta.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    )
  }

  const { rows, cols, base } = meta.data

  // Collect every tile before touching storage: a partial mosaic is useless.
  const tiles: { row: number; col: number; file: File }[] = []
  let total = 0
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const file = formFile(form, `tile-${row}-${col}`)
      if (!file) badRequest(`missing tile ${row}-${col}`)
      if (file.size === 0) badRequest(`tile ${row}-${col} is empty`)
      if (file.size > MAX_TILE_BYTES) {
        payloadTooLarge(`tile ${row}-${col} is larger than ${Math.floor(MAX_TILE_BYTES / 1024)}KB`)
      }
      total += file.size
      if (total > MAX_MOSAIC_BYTES) payloadTooLarge('the whole mosaic is too large')
      tiles.push({ row, col, file })
    }
  }

  await assertHuman(c.env, meta.data.turnstileToken, ip)

  // Reject up front if any tile slug is taken; approving into a half-used grid
  // would silently renumber the mosaic.
  for (const { row, col } of tiles) {
    const slug = tileSlug(base, row, col)
    const clash = await c.env.DB.prepare(
      "SELECT id FROM bufos WHERE slug = ?1 AND status = 'approved'",
    )
      .bind(slug)
      .first<{ id: string }>()
    if (clash) conflict(`:${slug}: already exists — pick another name`)
  }

  const mosaicId = newId()
  const tags = parseTags(meta.data.tags)
  const stored: string[] = []

  for (const { row, col, file } of tiles) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const info = readImageInfo(bytes)
    if (!info) badRequest(`tile ${row}-${col} is not a PNG, GIF or WebP`)
    if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION) {
      badRequest(`tile ${row}-${col} is too large in pixels`)
    }

    const id = newId()
    const key = R2_KEYS.pending(id, info.ext)
    await putImage(c.env.PENDING_BUCKET, key, bytes.buffer as ArrayBuffer, info.ext, {
      cacheControl: 'no-store',
    })

    const placement: MosaicPlacement = { mosaicId, rows, cols, row, col }
    await insertBufo(c.env.DB, {
      id,
      title: `${meta.data.title} (${row},${col})`,
      ext: info.ext,
      r2Key: key,
      width: info.width,
      height: info.height,
      bytes: file.size,
      sha256: await sha256Hex(bytes),
      isAnimated: info.isAnimated,
      status: 'pending',
      source: 'generator',
      credit: meta.data.credit ?? null,
      note: meta.data.note ?? null,
      contact: meta.data.contact ?? null,
      mosaic: placement,
    })
    if (tags.length > 0) await setTags(c.env.DB, id, tags)
    stored.push(id)
  }

  return c.json(
    { mosaicId, tiles: stored.length, rows, cols, base, status: 'pending' as const },
    201,
  )
})
