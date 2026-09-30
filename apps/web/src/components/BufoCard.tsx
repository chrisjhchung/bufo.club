import type { Bufo } from '@bufo/shared'
import { bufoUrl } from '@bufo/shared'
import { Link } from 'react-router'
import { CDN_BASE } from '../lib/env'

export function BufoCard({ bufo, index = 0 }: { bufo: Bufo; index?: number }) {
  return (
    <Link
      to={`/b/${bufo.slug}`}
      title={bufo.title}
      className="lift rise group flex flex-col items-center gap-2 rounded-2xl p-3 hover:bg-raise hover:shadow-[var(--shadow-lift)]"
      // A short stagger across the first rows only; later rows land together.
      style={{ animationDelay: `${Math.min(index, 23) * 18}ms` }}
    >
      <div className="grid size-16 place-items-center">
        <img
          src={bufoUrl(CDN_BASE, bufo)}
          alt={bufo.title}
          loading="lazy"
          decoding="async"
          width={64}
          height={64}
          // One retry with a cache-buster: an image that failed for a transient
          // reason should not leave a broken icon on the page forever.
          onError={(event) => {
            const img = event.currentTarget
            if (img.dataset.retried) return
            img.dataset.retried = '1'
            img.src = `${bufoUrl(CDN_BASE, bufo)}?retry=1`
          }}
          className="max-h-16 max-w-16 object-contain transition-transform duration-300 ease-[var(--ease-settle)] group-hover:scale-110"
        />
      </div>
      <span className="line-clamp-2 w-full text-center text-[11px] leading-tight text-ink-faint transition-colors duration-200 ease-[var(--ease-gentle)] group-hover:text-ink-soft">
        {bufo.slug}
      </span>
    </Link>
  )
}
