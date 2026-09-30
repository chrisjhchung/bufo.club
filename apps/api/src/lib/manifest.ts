import {
  buildManifestDocument,
  detectMosaics,
  type Manifest,
  type ManifestTemplate,
  type MosaicOrientation,
  R2_KEYS,
  type TemplateSlot,
} from '@bufo/shared'
import { buildSitemap } from '../routes/pages'
import type { Env } from '../types'
import { listApprovedForManifest, listTemplates } from './db'
import { nowSeconds } from './ids'

export function templateRowToManifest(row: {
  slug: string
  name: string
  name_pattern: string
  base_key: string
  overlay_key: string | null
  canvas_w: number
  canvas_h: number
  slot_json: string
}): ManifestTemplate {
  return {
    slug: row.slug,
    name: row.name,
    namePattern: row.name_pattern,
    baseKey: row.base_key,
    overlayKey: row.overlay_key ?? undefined,
    canvas: { w: row.canvas_w, h: row.canvas_h },
    slot: JSON.parse(row.slot_json) as TemplateSlot,
  }
}

export async function buildManifest(db: D1Database): Promise<Manifest> {
  const [{ bufos, tagsByBufo }, templates, layouts] = await Promise.all([
    listApprovedForManifest(db),
    listTemplates(db),
    db.prepare('SELECT base, orientation FROM mosaic_layouts').all<{
      base: string
      orientation: MosaicOrientation
    }>(),
  ])

  const orientations = Object.fromEntries(layouts.results.map((row) => [row.base, row.orientation]))
  const mosaics = detectMosaics(
    bufos.map((bufo) => bufo.slug!),
    orientations,
  )

  return buildManifestDocument(
    bufos.map((bufo) => ({
      slug: bufo.slug!,
      title: bufo.title,
      ext: bufo.ext,
      width: bufo.width,
      height: bufo.height,
      isAnimated: bufo.is_animated === 1,
      tags: tagsByBufo.get(bufo.id) ?? [],
      credit: bufo.credit,
      createdAt: bufo.created_at,
    })),
    templates.map(templateRowToManifest),
    nowSeconds(),
    mosaics,
  )
}

/**
 * Regenerate the public search index and park it in the assets bucket, where
 * the CDN serves it for free. Called after anything that changes what the
 * gallery should show.
 */
export async function rebuildManifest(env: Env): Promise<Manifest> {
  const manifest = await buildManifest(env.DB)

  // The sitemap is derived from the same set, so it is rewritten here rather
  // than drifting behind the index.
  const sitemap = buildSitemap(
    manifest.bufos.map((bufo) => ({ slug: bufo.s, createdAt: bufo.d })),
    env.SITE_ORIGIN,
  )
  await env.ASSETS_BUCKET.put(R2_KEYS.sitemap, sitemap, {
    httpMetadata: {
      contentType: 'application/xml; charset=utf-8',
      cacheControl: 'public, max-age=3600',
    },
  })

  await env.ASSETS_BUCKET.put(R2_KEYS.manifest, JSON.stringify(manifest), {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      // Short TTL: an approval should show up quickly, and the document is small.
      cacheControl: 'public, max-age=60, s-maxage=60',
    },
  })
  return manifest
}
