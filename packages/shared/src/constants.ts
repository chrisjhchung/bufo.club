/** Hard cap on a single submitted image. Keeps R2 + Worker CPU cheap. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** One mosaic tile. Smaller than a standalone bufo: a 5x5 grid is 25 of them. */
export const MAX_TILE_BYTES = 512 * 1024

/** Whole-mosaic ceiling, so one request cannot be enormous. */
export const MAX_MOSAIC_BYTES = 8 * 1024 * 1024

/** Bufos are small square emoji; anything wildly bigger is a mistake. */
export const MAX_IMAGE_DIMENSION = 2048

export const BUFO_EXTENSIONS = ['png', 'gif', 'webp'] as const
export type BufoExt = (typeof BUFO_EXTENSIONS)[number]

export const MIME_BY_EXT: Record<BufoExt, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
}

/** Object key layout inside the two R2 buckets. */
export const R2_KEYS = {
  bufo: (slug: string, ext: BufoExt) => `b/${slug}.${ext}`,
  pending: (id: string, ext: BufoExt) => `pending/${id}.${ext}`,
  /**
   * Template art is replaced in place as templates are tuned, so the key
   * carries a short content hash: new art means a new URL, which no browser or
   * edge cache can serve stale.
   */
  template: (slug: string, layer: 'base' | 'overlay', version = '') =>
    `templates/${slug}.${layer}${version ? `.${version}` : ''}.png`,
  manifest: 'manifest/latest.json',
  sitemap: 'sitemap.xml',
} as const

/** Emoji render sizes offered on the detail page. */
export const DOWNLOAD_SIZES = [128, 64, 32] as const

export const SUBMISSION_RATE_LIMIT_PER_HOUR = 5
