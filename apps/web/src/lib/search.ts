import type { Bufo } from '@bufo/shared'

export type SortMode = 'relevance' | 'az' | 'newest' | 'random'

/**
 * Score one bufo against already-lowercased query tokens. Every token has to
 * match something (AND), which is what people expect from "bufo sad party".
 * Returns 0 when the bufo is not a match at all.
 */
export function scoreBufo(bufo: Bufo, tokens: string[]): number {
  if (tokens.length === 0) return 1

  let total = 0
  for (const token of tokens) {
    let best = 0
    if (bufo.slug === token) best = 1000
    else if (bufo.slug.startsWith(token)) best = 400
    else if (bufo.slug.includes(`-${token}`)) best = 300
    else if (bufo.slug.includes(token)) best = 150

    for (const tag of bufo.tags) {
      if (tag === token) best = Math.max(best, 350)
      else if (tag.startsWith(token)) best = Math.max(best, 200)
    }

    if (best === 0 && bufo.haystack.includes(token)) best = 60
    if (best === 0) return 0
    total += best
  }

  // Shorter names are usually the canonical bufo for a concept.
  return total + Math.max(0, 40 - bufo.slug.length)
}

/** Loose subsequence test, used only when a strict search finds nothing. */
export function subsequenceMatch(haystack: string, needle: string): boolean {
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) index++
    if (index === needle.length) return true
  }
  return needle.length === 0
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,:]+/)
    .map((token) => token.replace(/[^a-z0-9-]/g, ''))
    .filter(Boolean)
}

export type SearchOptions = {
  query: string
  tags?: string[]
  sort?: SortMode
  animatedOnly?: boolean
  /** Stable seed so 'random' does not reshuffle on every keystroke. */
  randomSeed?: number
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) % 4294967296
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export function searchBufos(all: Bufo[], options: SearchOptions): Bufo[] {
  const tokens = tokenize(options.query)
  const tagFilter = options.tags ?? []

  let matches = all.filter((bufo) => {
    if (options.animatedOnly && !bufo.isAnimated) return false
    for (const tag of tagFilter) if (!bufo.tags.includes(tag)) return false
    return true
  })

  if (tokens.length > 0) {
    const scored = matches
      .map((bufo) => ({ bufo, score: scoreBufo(bufo, tokens) }))
      .filter((entry) => entry.score > 0)

    if (scored.length === 0) {
      // Typo fallback: treat the whole query as a subsequence of the slug.
      const needle = tokens.join('')
      matches = matches.filter((bufo) => subsequenceMatch(bufo.slug.replace(/-/g, ''), needle))
    } else if (options.sort === 'relevance' || !options.sort) {
      return scored
        .sort((a, b) => b.score - a.score || a.bufo.slug.localeCompare(b.bufo.slug))
        .map((entry) => entry.bufo)
    } else {
      matches = scored.map((entry) => entry.bufo)
    }
  }

  switch (options.sort) {
    case 'newest':
      return [...matches].sort((a, b) => b.createdAt - a.createdAt || a.slug.localeCompare(b.slug))
    case 'random':
      return seededShuffle(matches, options.randomSeed ?? 1)
    default:
      return [...matches].sort((a, b) => a.slug.localeCompare(b.slug))
  }
}

/** Most common tags across a set of bufos, for the filter chips. */
export function topTags(bufos: Bufo[], limit = 24): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const bufo of bufos) {
    for (const tag of bufo.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit)
}
