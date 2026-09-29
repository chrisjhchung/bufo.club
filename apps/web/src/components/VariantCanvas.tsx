import type { ComposeLayers, ManifestTemplate, SubjectTransform } from '@bufo/gen'
import { drawComposite } from '@bufo/gen'
import { useEffect, useRef } from 'react'

type Props = {
  template: ManifestTemplate
  layers: ComposeLayers | null
  transform: SubjectTransform
  /** Rendered size in CSS pixels; the canvas itself stays at template size. */
  size: number
  /** Allow dragging the subject around the slot. */
  onDrag?: (delta: { dx: number; dy: number }) => void
}

/**
 * One composited preview. The canvas is always the template's native pixel
 * size so what you see is exactly what downloads; CSS scales it up for editing.
 */
export function VariantCanvas({ template, layers, transform, size, onDrag }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragging = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layers) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawComposite(ctx, template, layers, transform)
  }, [template, layers, transform])

  return (
    <canvas
      ref={canvasRef}
      width={template.canvas.w}
      height={template.canvas.h}
      style={{ width: size, height: size, touchAction: onDrag ? 'none' : undefined }}
      className={`checker rounded-lg ${onDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      aria-label={template.name}
      onPointerDown={(event) => {
        if (!onDrag) return
        dragging.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = dragging.current
        if (!onDrag || !start) return
        // Translate CSS pixels back into template pixels.
        const ratio = template.canvas.w / size
        onDrag({ dx: (event.clientX - start.x) * ratio, dy: (event.clientY - start.y) * ratio })
        dragging.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={() => {
        dragging.current = null
      }}
      onPointerCancel={() => {
        dragging.current = null
      }}
    />
  )
}
