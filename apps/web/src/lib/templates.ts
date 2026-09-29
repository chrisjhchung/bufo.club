import type { ComposeLayers, ManifestTemplate } from '@bufo/gen'
import { loadImageFromUrl } from '@bufo/gen'
import { cdnUrl } from '@bufo/shared'
import { useEffect, useState } from 'react'
import { CDN_BASE } from './env'

export type TemplateArt = { base: ImageBitmap; overlay?: ImageBitmap }

/**
 * Fetch every template's plate art once. They are small PNGs on the CDN and
 * immutable for the life of a template, so the browser cache does the rest.
 */
export function useTemplateArt(templates: ManifestTemplate[]) {
  const [art, setArt] = useState<Map<string, TemplateArt>>(new Map())
  const [error, setError] = useState<string | null>(null)

  const keys = templates.map((template) => template.slug).join(',')

  // biome-ignore lint/correctness/useExhaustiveDependencies: `keys` stands in for the array identity
  useEffect(() => {
    let cancelled = false
    if (templates.length === 0) return

    Promise.all(
      templates.map(async (template) => {
        const base = await loadImageFromUrl(cdnUrl(CDN_BASE, template.baseKey))
        const overlay = template.overlayKey
          ? await loadImageFromUrl(cdnUrl(CDN_BASE, template.overlayKey))
          : undefined
        return [template.slug, { base, overlay }] as const
      }),
    )
      .then((entries) => {
        if (!cancelled) setArt(new Map(entries))
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })

    return () => {
      cancelled = true
    }
    // `keys` captures the identity of the template set.
  }, [keys])

  return { art, error }
}

export function layersFor(
  art: Map<string, TemplateArt>,
  template: ManifestTemplate,
  subject: ImageBitmap | null,
): ComposeLayers | null {
  const plates = art.get(template.slug)
  if (!plates || !subject) return null
  return { base: plates.base, overlay: plates.overlay, subject }
}
