import type { BufoExt } from './constants'
import type { Mosaic } from './mosaic'
import { titleFromSlug } from './slug'

/**
 * Wire format for the public search index. Keys are terse on purpose: the
 * manifest is one ~2000-entry document every visitor downloads, and short keys
 * cut roughly a third off the payload. Decode it with `decodeManifest` and work
 * with `Bufo` everywhere else.
 */
export type ManifestBufoRow = {
  /** slug */ s: string
  /** title, omitted when it is just the prettified slug */ t?: string
  /** extension */ e: BufoExt
  /** width */ w: number
  /** height */ h: number
  /** animated */ a?: 1
  /** tags */ g?: string[]
  /** credit */ c?: string
  /** created at, epoch seconds */ d: number
}

export type SlotFit = 'contain' | 'cover'

export type TemplateSlot = {
  x: number
  y: number
  w: number
  h: number
  /** degrees, clockwise */
  rotate: number
  fit: SlotFit
  /**
   * Draw the subject underneath the plate instead of on top of it. What bufo
   * prays to belongs behind him; what he offers belongs in front.
   */
  behind?: boolean
}

export type ManifestTemplate = {
  slug: string
  name: string
  /** e.g. ':bufo-offers-{subject}:' */
  namePattern: string
  baseKey: string
  overlayKey?: string
  canvas: { w: number; h: number }
  slot: TemplateSlot
}

export type Manifest = {
  version: 1
  generatedAt: number
  count: number
  bufos: ManifestBufoRow[]
  templates: ManifestTemplate[]
  /** Complete tile grids, with the orientation needed to assemble them. */
  mosaics?: Mosaic[]
}

/** The fields the manifest needs about one approved bufo. */
export type ManifestBufoInput = {
  slug: string
  title: string
  ext: BufoExt
  width: number
  height: number
  isAnimated: boolean
  tags: string[]
  credit?: string | null
  createdAt: number
}

/**
 * Encode one row for the wire. Shared by the Worker and the seed script so the
 * two cannot drift into producing different manifests.
 */
export function encodeBufoRow(input: ManifestBufoInput): ManifestBufoRow {
  const row: ManifestBufoRow = {
    s: input.slug,
    e: input.ext,
    w: input.width,
    h: input.height,
    d: input.createdAt,
  }
  // Most titles are just the prettified slug; only ship the ones that differ.
  if (input.title && input.title !== titleFromSlug(input.slug)) row.t = input.title
  if (input.isAnimated) row.a = 1
  if (input.tags.length > 0) row.g = input.tags
  if (input.credit) row.c = input.credit
  return row
}

export function buildManifestDocument(
  bufos: ManifestBufoInput[],
  templates: ManifestTemplate[],
  generatedAt = Math.floor(Date.now() / 1000),
  mosaics: Mosaic[] = [],
): Manifest {
  const rows = bufos.map(encodeBufoRow)
  return { version: 1, generatedAt, count: rows.length, bufos: rows, templates, mosaics }
}

/** Decoded, comfortable shape used by the UI. */
export type Bufo = {
  slug: string
  title: string
  ext: BufoExt
  width: number
  height: number
  isAnimated: boolean
  tags: string[]
  credit?: string
  createdAt: number
  /** Lowercased 'slug title tags' haystack, precomputed once for search. */
  haystack: string
}

export function decodeBufo(row: ManifestBufoRow): Bufo {
  const title = row.t ?? titleFromSlug(row.s)
  const tags = row.g ?? []
  return {
    slug: row.s,
    title,
    ext: row.e,
    width: row.w,
    height: row.h,
    isAnimated: row.a === 1,
    tags,
    credit: row.c,
    createdAt: row.d,
    haystack: `${row.s} ${title} ${tags.join(' ')}`.toLowerCase(),
  }
}

export function decodeManifest(manifest: Manifest): {
  bufos: Bufo[]
  templates: ManifestTemplate[]
  mosaics: Mosaic[]
  generatedAt: number
} {
  return {
    bufos: manifest.bufos.map(decodeBufo),
    templates: manifest.templates,
    mosaics: manifest.mosaics ?? [],
    generatedAt: manifest.generatedAt,
  }
}

/** Public CDN URL for a bufo image. */
export function bufoUrl(cdnBase: string, bufo: Pick<Bufo, 'slug' | 'ext'>): string {
  return `${cdnBase.replace(/\/$/, '')}/b/${bufo.slug}.${bufo.ext}`
}

export function cdnUrl(cdnBase: string, key: string): string {
  return `${cdnBase.replace(/\/$/, '')}/${key.replace(/^\//, '')}`
}
