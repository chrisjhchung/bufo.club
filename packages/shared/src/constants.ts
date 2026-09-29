/** Hard cap on a single submitted image. Keeps R2 + Worker CPU cheap. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

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
  template: (slug: string, layer: 'base' | 'overlay') => `templates/${slug}.${layer}.png`,
  manifest: 'manifest/latest.json',
} as const

/** Emoji render sizes offered on the detail page. */
export const DOWNLOAD_SIZES = [128, 64, 32] as const

export const SUBMISSION_RATE_LIMIT_PER_HOUR = 5
