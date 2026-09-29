import type { ManifestTemplate, TemplateSlot } from '@bufo/shared'

export type { ManifestTemplate, TemplateSlot }

/** User adjustments applied on top of a template's slot. */
export type SubjectTransform = {
  /** Offset from the slot centre, in canvas pixels. */
  dx: number
  dy: number
  /** Multiplier on the size the slot fitted for us. */
  scale: number
  /** Extra rotation in degrees, added to the slot's own rotation. */
  rotate: number
  flipX: boolean
  /** Keep the subject inside the slot rectangle. */
  clip: boolean
}

export const IDENTITY_TRANSFORM: SubjectTransform = {
  dx: 0,
  dy: 0,
  scale: 1,
  rotate: 0,
  flipX: false,
  clip: true,
}

export type Sized = { width: number; height: number }

export type ComposeLayers = {
  base: CanvasImageSource
  overlay?: CanvasImageSource
  subject: CanvasImageSource & Sized
}
