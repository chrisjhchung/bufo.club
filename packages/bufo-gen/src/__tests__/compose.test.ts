import { describe, expect, it, vi } from 'vitest'
import { drawComposite, fitSubject, subjectRect } from '../compose'
import { renderTemplateName, variantSlug } from '../naming'
import type { ManifestTemplate } from '../types'
import { IDENTITY_TRANSFORM } from '../types'

const template: ManifestTemplate = {
  slug: 'bufo-offers',
  name: 'Bufo offers …',
  namePattern: ':bufo-offers-{subject}:',
  baseKey: 'templates/bufo-offers.base.png',
  overlayKey: 'templates/bufo-offers.overlay.png',
  canvas: { w: 128, h: 128 },
  slot: { x: 24, y: 16, w: 80, h: 60, rotate: 0, fit: 'contain' },
}

function fakeCtx() {
  return {
    calls: [] as string[],
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
  }
}

const layers = (w = 200, h = 100) => ({
  base: {} as CanvasImageSource,
  overlay: {} as CanvasImageSource,
  subject: { width: w, height: h } as CanvasImageSource & { width: number; height: number },
})

describe('fitSubject', () => {
  it('contains a wide subject by matching the slot width', () => {
    expect(fitSubject(template.slot, { width: 200, height: 100 })).toEqual({
      width: 80,
      height: 40,
    })
  })

  it('contains a tall subject by matching the slot height', () => {
    expect(fitSubject(template.slot, { width: 50, height: 200 })).toEqual({ width: 15, height: 60 })
  })

  it('covers by overflowing the other axis', () => {
    const slot = { ...template.slot, fit: 'cover' as const }
    expect(fitSubject(slot, { width: 50, height: 200 })).toEqual({ width: 80, height: 320 })
  })
})

describe('subjectRect', () => {
  it('centres the fitted subject in the slot', () => {
    const rect = subjectRect(template.slot, { width: 200, height: 100 })
    expect(rect).toMatchObject({ cx: 64, cy: 46, width: 80, height: 40, x: 24, y: 26 })
  })

  it('applies scale and offset', () => {
    const rect = subjectRect(
      template.slot,
      { width: 200, height: 100 },
      {
        ...IDENTITY_TRANSFORM,
        scale: 2,
        dx: 10,
        dy: -5,
      },
    )
    expect(rect).toMatchObject({ width: 160, height: 80, cx: 74, cy: 41 })
  })
})

describe('drawComposite', () => {
  it('paints base, clipped subject, then overlay in order', () => {
    const ctx = fakeCtx()
    drawComposite(ctx as unknown as CanvasRenderingContext2D, template, layers())
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 128, 128)
    expect(ctx.drawImage).toHaveBeenCalledTimes(3)
    expect(ctx.drawImage.mock.calls[0]).toEqual([layers().base, 0, 0, 128, 128])
    expect(ctx.clip).toHaveBeenCalledOnce()
    expect(ctx.rect).toHaveBeenCalledWith(24, 16, 80, 60)
    expect(ctx.translate).toHaveBeenCalledWith(64, 46)
    expect(ctx.drawImage.mock.calls[1]?.slice(1)).toEqual([-40, -20, 80, 40])
    expect(ctx.imageSmoothingQuality).toBe('high')
  })

  it('skips the clip when the user turns it off and flips on request', () => {
    const ctx = fakeCtx()
    drawComposite(ctx as unknown as CanvasRenderingContext2D, template, layers(), {
      ...IDENTITY_TRANSFORM,
      clip: false,
      flipX: true,
      rotate: 15,
    })
    expect(ctx.clip).not.toHaveBeenCalled()
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)
    expect(ctx.rotate).toHaveBeenCalledWith((15 * Math.PI) / 180)
  })

  it('omits the overlay layer when the template has none', () => {
    const ctx = fakeCtx()
    const { base, subject } = layers()
    drawComposite(ctx as unknown as CanvasRenderingContext2D, template, { base, subject })
    expect(ctx.drawImage).toHaveBeenCalledTimes(2)
  })
})

describe('naming', () => {
  it('fills the subject into the pattern', () => {
    expect(renderTemplateName(template, 'A Flower')).toBe(':bufo-offers-a-flower:')
    expect(renderTemplateName(template, '!!!')).toBe(':bufo-offers-thing:')
    expect(variantSlug(template, 'A Flower')).toBe('bufo-offers-a-flower')
  })
})
