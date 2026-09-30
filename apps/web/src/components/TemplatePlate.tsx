import { type ManifestTemplate, squareFrame } from '@bufo/gen'
import { cdnUrl } from '@bufo/shared'
import { CDN_BASE } from '../lib/env'

/**
 * A template with nothing dropped into it yet: the base plate, plus the slot
 * drawn as a dashed box so it is obvious where your picture will land.
 *
 * Everything is sized in percentages of the plate, because plates are not all
 * the same size or aspect ratio.
 */
export function TemplatePlate({ template }: { template: ManifestTemplate }) {
  const { canvas, slot } = template
  // Match the square the compositor renders, with the plate centred in it.
  const { size, offsetX, offsetY } = squareFrame(canvas)
  const percent = (value: number) => `${(value / size) * 100}%`

  return (
    <div className="checker relative aspect-square w-full rounded-lg">
      <img
        src={cdnUrl(CDN_BASE, template.baseKey)}
        alt={template.name}
        crossOrigin="anonymous"
        className="absolute inset-0 size-full object-contain"
        loading="lazy"
      />
      <div
        className="absolute flex items-center justify-center rounded border-2 border-dashed border-accent bg-accent-soft"
        style={{
          left: percent(slot.x + offsetX),
          top: percent(slot.y + offsetY),
          width: percent(slot.w),
          height: percent(slot.h),
        }}
      >
        <span className="text-xl leading-none opacity-60" aria-hidden>
          +
        </span>
      </div>
    </div>
  )
}
