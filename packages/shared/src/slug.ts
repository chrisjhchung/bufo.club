/**
 * Filename or free text -> bufo slug. Mirrors the all-the-bufo naming style:
 * lowercase, hyphen separated, ascii only.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.(png|gif|webp|jpe?g)$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 96)
}

/** 'bufo-offers-a-flower' -> 'Bufo offers a flower' */
export function titleFromSlug(slug: string): string {
  const words = slug.split('-').filter(Boolean)
  if (words.length === 0) return 'bufo'
  const [first, ...rest] = words
  return [first!.charAt(0).toUpperCase() + first!.slice(1), ...rest].join(' ')
}

/** What a user pastes into Slack: ':bufo-party:' */
export function emojiCode(slug: string): string {
  return `:${slug}:`
}

export function normalizeTag(raw: string): string {
  return slugify(raw).slice(0, 32)
}

/** Free-form tag input ('party, dance  sad') -> deduped slug tags. */
export function parseTags(raw: string | null | undefined, limit = 12): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const piece of raw.split(/[,\s]+/)) {
    const tag = normalizeTag(piece)
    if (tag.length >= 2) seen.add(tag)
    if (seen.size >= limit) break
  }
  return [...seen]
}

/**
 * Tags implied by a bufo's own name, so seeded bufos are searchable by concept
 * without anyone hand-tagging 2000 files. Stopwords keep the tag table sane.
 */
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'is',
  'it',
  'at',
  'on',
  'and',
  'or',
  'for',
  'with',
  'this',
  'that',
  'his',
  'her',
  'its',
  'you',
  'your',
  'be',
  'so',
  'as',
  'by',
  'but',
  'not',
  'bufo',
  'im',
  'i',
])

export function tagsFromSlug(slug: string, limit = 4): string[] {
  const words = slug.split('-')
  // Long slugs are sentence-length jokes ("according-to-all-known-laws-of-
  // aviation-..."); auto-tagging those just fills the tag list with noise.
  if (words.length > 8) return []

  const out: string[] = []
  for (const word of words) {
    if (word.length < 4 || STOPWORDS.has(word)) continue
    if (!out.includes(word)) out.push(word)
    if (out.length >= limit) break
  }
  return out
}
