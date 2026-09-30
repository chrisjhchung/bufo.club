import type { Bufo, Mosaic } from '@bufo/shared'
import { bufoUrl, mosaicPasteText, mosaicTileSlugs, tileSlug } from '@bufo/shared'
import { Link } from 'react-router'
import { CDN_BASE } from '../lib/env'
import { copyText } from '../lib/files'
import { useToast } from './Toast'

/**
 * A mosaic shown as the picture it is, rather than as the tiles it is made of.
 * The tiles are drawn edge to edge in their grid, which is what they look like
 * once pasted into a chat.
 */
export function MosaicCard({
  mosaic,
  bySlug,
  index = 0,
}: {
  mosaic: Mosaic
  bySlug: Map<string, Bufo>
  index?: number
}) {
  const { show } = useToast()
  const slugs = mosaicTileSlugs(mosaic)

  return (
    <div
      className="lift rise group flex flex-col gap-3 rounded-2xl p-3 hover:bg-raise hover:shadow-[var(--shadow-lift)]"
      style={{ animationDelay: `${Math.min(index, 11) * 26}ms` }}
    >
      <Link to={`/b/${tileSlug(mosaic.base, 0, 0)}`} title={mosaic.base} className="block">
        <div
          className="grid overflow-hidden rounded-lg"
          style={{ gridTemplateColumns: `repeat(${mosaic.cols}, minmax(0, 1fr))` }}
        >
          {slugs.map((slug) => {
            const tile = bySlug.get(slug)
            return tile ? (
              <img
                key={slug}
                src={bufoUrl(CDN_BASE, tile)}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div key={slug} className="aspect-square w-full bg-sunk" />
            )
          })}
        </div>
      </Link>

      <div className="flex items-baseline gap-2">
        <Link
          to={`/b/${tileSlug(mosaic.base, 0, 0)}`}
          className="truncate font-mono text-xs text-ink-soft transition-colors duration-200 ease-[var(--ease-gentle)] group-hover:text-ink"
        >
          {mosaic.base}
        </Link>
        <span className="eyebrow ml-auto shrink-0">
          {mosaic.rows}×{mosaic.cols}
        </span>
      </div>

      <button
        type="button"
        onClick={() =>
          void copyText(mosaicPasteText(mosaic))
            .then(() => show('paste block copied'))
            .catch(() => show('could not copy', 'error'))
        }
        className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft transition-colors duration-200 ease-[var(--ease-gentle)] hover:border-line-strong hover:text-ink"
      >
        Copy paste block
      </button>
    </div>
  )
}
