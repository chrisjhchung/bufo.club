import { z } from 'zod'
import { BUFO_EXTENSIONS } from './constants'
import { normalizeTag, slugify } from './slug'

export const bufoStatuses = ['pending', 'approved', 'rejected'] as const
export type BufoStatus = (typeof bufoStatuses)[number]

export const bufoSources = ['all-the-bufo', 'submission', 'generator'] as const
export type BufoSource = (typeof bufoSources)[number]

export const slugSchema = z
  .string()
  .min(2)
  .max(96)
  .transform(slugify)
  .refine((value) => value.length >= 2, { message: 'slug must contain letters or digits' })

export const tagsSchema = z
  .array(z.string())
  .max(12)
  .transform((tags) => [...new Set(tags.map(normalizeTag).filter((tag) => tag.length >= 2))])

/** Fields accompanying a public upload (the file itself is validated separately). */
export const submissionMetaSchema = z.object({
  title: z.string().trim().min(2).max(120),
  tags: z.string().max(240).optional(),
  note: z.string().trim().max(500).optional(),
  contact: z.string().trim().max(120).optional(),
  credit: z.string().trim().max(120).optional(),
  source: z.enum(['submission', 'generator']).default('submission'),
  turnstileToken: z.string().min(1, 'captcha required').max(2048),
})
export type SubmissionMeta = z.infer<typeof submissionMetaSchema>

export const approveSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(2).max(120),
  tags: tagsSchema.default([]),
  credit: z.string().trim().max(120).optional(),
})

export const rejectSchema = z.object({
  reason: z.string().trim().min(2).max(300),
})

export const reportSchema = z.object({
  slug: slugSchema,
  reason: z.enum(['copyright', 'nsfw', 'duplicate', 'broken', 'other']),
  note: z.string().trim().max(1000).optional(),
  turnstileToken: z.string().min(1).max(2048),
})

export const slotSchema = z.object({
  x: z.number().int().min(0).max(4096),
  y: z.number().int().min(0).max(4096),
  w: z.number().int().min(1).max(4096),
  h: z.number().int().min(1).max(4096),
  rotate: z.number().min(-180).max(180).default(0),
  fit: z.enum(['contain', 'cover']).default('contain'),
})

export const templateUpsertSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(120),
  namePattern: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .refine((value) => value.includes('{subject}'), {
      message: 'namePattern must contain {subject}',
    }),
  canvasW: z.number().int().min(16).max(1024).default(128),
  canvasH: z.number().int().min(16).max(1024).default(128),
  slot: slotSchema,
  status: z.enum(['active', 'hidden']).default('active'),
})
export type TemplateUpsert = z.infer<typeof templateUpsertSchema>

export const extSchema = z.enum(BUFO_EXTENSIONS)
