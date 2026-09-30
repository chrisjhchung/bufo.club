import type { ComposeLayers, ManifestTemplate, SubjectTransform } from '@bufo/gen'
import { drawComposite, squareFrame } from '@bufo/gen'
import { useEffect, useRef } from 'react'

type Props = {
  template: ManifestTemplate
  layers: ComposeLayers | null
  transform: SubjectTransform
  /** Allow dragging the subject around the slot. */
  onDrag?: (delta: { dx: number; dy: number }) => void
}

/**
 * One composited preview. The canvas keeps the template's native pixel size, so
 * what you see is exactly what downloads, while CSS scales it to whatever width
 * the layout gives it.
 */
export function VariantCanvas({ template, layers, transform, onDrag }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const dragging = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layers) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawComposite(ctx, template, layers, transform)
  }, [template, layers, transform])

  const { size } = squareFrame(template.canvas)

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ touchAction: onDrag ? 'none' : undefined }}
      className={`checker aspect-square w-full rounded-lg ${onDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
      aria-label={template.name}
      onPointerDown={(event) => {
        if (!onDrag) return
        dragging.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const start = dragging.current
        if (!onDrag || !start) return
        // Translate CSS pixels back into template pixels; the canvas is fluid,
        // so the ratio comes from how wide it actually rendered.
        const ratio = size / event.currentTarget.getBoundingClientRect().width
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
