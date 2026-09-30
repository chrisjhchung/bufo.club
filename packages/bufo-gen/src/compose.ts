import type {
  ComposeLayers,
  ManifestTemplate,
  Sized,
  SubjectTransform,
  TemplateSlot,
} from './types'
import { IDENTITY_TRANSFORM } from './types'

const DEG = Math.PI / 180

/**
 * Emoji are square; plates are whatever shape the art happened to be. The
 * output is the longest edge of the plate, with the plate centred inside it,
 * so slot coordinates stay in plate space and nothing has to be re-measured.
 */
export function squareFrame(canvas: { w: number; h: number }) {
  const size = Math.max(canvas.w, canvas.h)
  return { size, offsetX: (size - canvas.w) / 2, offsetY: (size - canvas.h) / 2 }
}

/**
 * Size the subject so it fills the slot per the slot's fit mode, before the
 * user's own scale multiplier is applied.
 */
export function fitSubject(slot: TemplateSlot, subject: Sized): Sized {
  const ratio = subject.width / subject.height
  const slotRatio = slot.w / slot.h
  const fillsWidth = slot.fit === 'contain' ? ratio > slotRatio : ratio < slotRatio
  return fillsWidth
    ? { width: slot.w, height: slot.w / ratio }
    : { width: slot.h * ratio, height: slot.h }
}

/**
 * Where the subject lands on the canvas, ignoring rotation. Exposed so the
 * editor can draw handles without re-deriving the maths.
 */
export function subjectRect(
  slot: TemplateSlot,
  subject: Sized,
  transform: SubjectTransform = IDENTITY_TRANSFORM,
) {
  const fitted = fitSubject(slot, subject)
  const width = fitted.width * transform.scale
  const height = fitted.height * transform.scale
  const cx = slot.x + slot.w / 2 + transform.dx
  const cy = slot.y + slot.h / 2 + transform.dy
  return { x: cx - width / 2, y: cy - height / 2, width, height, cx, cy }
}

/**
 * Paint one composite: template base, then the subject inside the slot, then
 * the optional overlay that puts bufo's hands back in front of the object.
 * Synchronous and context-only so it can be unit tested against a fake 2D
 * context, and so callers choose their own canvas (OffscreenCanvas in the
 * worker-ish path, a DOM canvas for previews).
 */
export function drawComposite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  template: Pick<ManifestTemplate, 'canvas' | 'slot'>,
  layers: ComposeLayers,
  transform: SubjectTransform = IDENTITY_TRANSFORM,
): void {
  const { canvas, slot } = template
  const frame = squareFrame(canvas)
  ctx.clearRect(0, 0, frame.size, frame.size)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Everything below works in plate coordinates; this centres them in the square.
  ctx.save()
  ctx.translate(frame.offsetX, frame.offsetY)

  const drawBase = () => ctx.drawImage(layers.base, 0, 0, canvas.w, canvas.h)

  const drawSubject = () => {
    const rect = subjectRect(slot, layers.subject, transform)
    ctx.save()
    if (transform.clip) {
      ctx.beginPath()
      ctx.rect(slot.x, slot.y, slot.w, slot.h)
      ctx.clip()
    }
    ctx.translate(rect.cx, rect.cy)
    ctx.rotate((slot.rotate + transform.rotate) * DEG)
    if (transform.flipX) ctx.scale(-1, 1)
    ctx.drawImage(layers.subject, -rect.width / 2, -rect.height / 2, rect.width, rect.height)
    ctx.restore()
  }

  // A `behind` slot puts the subject under the plate, so bufo occludes it.
  if (slot.behind) {
    drawSubject()
    drawBase()
  } else {
    drawBase()
    drawSubject()
  }

  if (layers.overlay) ctx.drawImage(layers.overlay, 0, 0, canvas.w, canvas.h)

  ctx.restore()
}
