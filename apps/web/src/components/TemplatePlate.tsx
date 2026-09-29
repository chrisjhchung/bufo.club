import type { ManifestTemplate } from '@bufo/gen'
import { cdnUrl } from '@bufo/shared'
import { CDN_BASE } from '../lib/env'

/**
 * A template with nothing dropped into it yet: the base plate, plus the slot
 * drawn as a dashed box so it is obvious where your picture will land.
 */
export function TemplatePlate({
  template,
  size = 128,
}: {
  template: ManifestTemplate
  size?: number
}) {
  const scale = size / template.canvas.w

  return (
    <div
      className="checker relative rounded-lg"
      style={{ width: size, height: size * (template.canvas.h / template.canvas.w) }}
    >
      <img
        src={cdnUrl(CDN_BASE, template.baseKey)}
        alt={template.name}
        className="absolute inset-0 size-full object-contain"
        loading="lazy"
      />
      <div
        className="absolute flex items-center justify-center rounded border-2 border-dashed border-accent bg-accent-soft"
        style={{
          left: template.slot.x * scale,
          top: template.slot.y * scale,
          width: template.slot.w * scale,
          height: template.slot.h * scale,
        }}
      >
        <span className="text-2xl leading-none opacity-70" aria-hidden>
          +
        </span>
      </div>
    </div>
  )
}
