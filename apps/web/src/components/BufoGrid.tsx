import type { Bufo } from '@bufo/shared'
import { useEffect, useState } from 'react'
import { useOnVisible } from '../lib/hooks'
import { BufoCard } from './BufoCard'

const PAGE_SIZE = 120

/**
 * Pages through the results as the sentinel scrolls into view. A couple of
 * thousand cards is too many to mount at once, and image lazy-loading alone
 * still pays the DOM cost.
 */
export function BufoGrid({ bufos }: { bufos: Bufo[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new result set must restart paging
  useEffect(() => {
    setVisible(PAGE_SIZE)
  }, [bufos])

  const sentinel = useOnVisible(
    () => setVisible((count) => Math.min(count + PAGE_SIZE, bufos.length)),
    visible < bufos.length,
  )

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1">
        {bufos.slice(0, visible).map((bufo, index) => (
          <BufoCard key={bufo.slug} bufo={bufo} index={index % PAGE_SIZE} />
        ))}
      </div>
      {visible < bufos.length && (
        <div ref={sentinel} className="eyebrow py-10 text-center">
          more bufos
        </div>
      )}
    </>
  )
}
