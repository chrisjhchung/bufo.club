import { slugify } from '@bufo/shared'
import type { ManifestTemplate } from './types'

/**
 * ':bufo-offers-{subject}:' + 'A Flower' -> ':bufo-offers-a-flower:'
 * Falls back to 'thing' so the name is never left with an empty hole.
 */
export function renderTemplateName(template: ManifestTemplate, subject: string): string {
  const slug = slugify(subject) || 'thing'
  return template.namePattern.replace('{subject}', slug)
}

/** The slug a generated variant would be stored under. */
export function variantSlug(template: ManifestTemplate, subject: string): string {
  return slugify(renderTemplateName(template, subject).replace(/^:|:$/g, ''))
}
