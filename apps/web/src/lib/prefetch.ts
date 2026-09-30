import { type Bufo, bufoUrl } from '@bufo/shared'
import { CDN_BASE } from './env'

const requested = new Set<string>()

/**
 * Warm the browser cache for bufos the visitor is about to look at.
 *
 * Thumbnails are a few kB each and served from the CDN with a year-long cache,
 * so fetching a screenful early costs almost nothing and removes the blank
 * moment after a filter changes. Each URL is only ever requested once per page
 * load, and `fetchPriority="low"` keeps it behind anything on screen.
 */
export function prefetchBufos(bufos: Bufo[], limit = 24): void {
  for (const bufo of bufos.slice(0, limit)) {
    const url = bufoUrl(CDN_BASE, bufo)
    if (requested.has(url)) continue
    requested.add(url)

    const image = new Image()
    image.decoding = 'async'
    image.fetchPriority = 'low'
    image.src = url
  }
}
