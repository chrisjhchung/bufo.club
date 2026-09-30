import { drawComposite, squareFrame } from './compose'
import type { ComposeLayers, ManifestTemplate, SubjectTransform } from './types'

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: AnyCanvas) {
  const ctx = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d canvas context unavailable')
  return ctx
}

/** Compose at the template's native size and hand back a canvas to draw or export. */
export function composeToCanvas(
  template: ManifestTemplate,
  layers: ComposeLayers,
  transform?: SubjectTransform,
): AnyCanvas {
  const { size } = squareFrame(template.canvas)
  const canvas = createCanvas(size, size)
  drawComposite(context2d(canvas), template, layers, transform)
  return canvas
}

/** Downscale (or upscale) an already-composed canvas, e.g. 128 -> 64 -> 32. */
export function resizeCanvas(source: AnyCanvas, size: number): AnyCanvas {
  const target = createCanvas(size, size)
  const ctx = context2d(target)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source as CanvasImageSource, 0, 0, size, size)
  return target
}

export async function canvasToBlob(canvas: AnyCanvas): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    )
  })
}

export async function composeToBlob(
  template: ManifestTemplate,
  layers: ComposeLayers,
  transform?: SubjectTransform,
  size?: number,
): Promise<Blob> {
  const composed = composeToCanvas(template, layers, transform)
  const native = squareFrame(template.canvas).size
  const output = size && size !== native ? resizeCanvas(composed, size) : composed
  return canvasToBlob(output)
}

/** Decode a File/Blob into something drawable, with its intrinsic size attached. */
export async function loadSubject(
  source: Blob,
): Promise<ImageBitmap & { width: number; height: number }> {
  return (await createImageBitmap(source)) as ImageBitmap & { width: number; height: number }
}

export async function loadImageFromUrl(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) throw new Error(`failed to load ${url}: ${response.status}`)
  return createImageBitmap(await response.blob())
}
