import { decodeBufo, type ManifestBufoRow } from '@bufo/shared'
import { describe, expect, it } from 'vitest'
import { scoreBufo, searchBufos, tokenize, topTags } from '../lib/search'

const bufo = (slug: string, extra: Partial<ManifestBufoRow> = {}) =>
  decodeBufo({ s: slug, e: 'png', w: 128, h: 128, d: 1700000000, ...extra })

const library = [
  bufo('bufo-party', { g: ['party', 'dance'], d: 1700000003 }),
  bufo('bufo-sad-party-hat', { g: ['party', 'sad'], d: 1700000002 }),
  bufo('old-bufo-yells-at-cloud', { g: ['angry', 'old'], d: 1700000001, a: 1 }),
  bufo('bufo-offers-a-flower', { g: ['offers', 'flower'], d: 1700000004 }),
]

describe('tokenize', () => {
  it('splits on whitespace, commas and colons', () => {
    expect(tokenize(':bufo-party: sad,  ANGRY')).toEqual(['bufo-party', 'sad', 'angry'])
  })
})

describe('scoreBufo', () => {
  it('ranks an exact slug above a partial one', () => {
    const exact = scoreBufo(bufo('party'), ['party'])
    const partial = scoreBufo(bufo('bufo-party-time'), ['party'])
    expect(exact).toBeGreaterThan(partial)
  })

  it('requires every token to match', () => {
    expect(scoreBufo(bufo('bufo-party', { g: ['party'] }), ['party', 'nope'])).toBe(0)
    expect(scoreBufo(bufo('bufo-party', { g: ['party'] }), ['bufo', 'party'])).toBeGreaterThan(0)
  })

  it('matches tags', () => {
    expect(scoreBufo(bufo('froge', { g: ['sad'] }), ['sad'])).toBeGreaterThan(0)
  })
})

describe('searchBufos', () => {
  it('returns everything, alphabetically, for an empty query', () => {
    const results = searchBufos(library, { query: '', sort: 'az' })
    expect(results.map((item) => item.slug)).toEqual([
      'bufo-offers-a-flower',
      'bufo-party',
      'bufo-sad-party-hat',
      'old-bufo-yells-at-cloud',
    ])
  })

  it('puts the best match first', () => {
    const results = searchBufos(library, { query: 'party' })
    expect(results[0]?.slug).toBe('bufo-party')
    expect(results).toHaveLength(2)
  })

  it('narrows by tag', () => {
    const results = searchBufos(library, { query: '', tags: ['sad'] })
    expect(results.map((item) => item.slug)).toEqual(['bufo-sad-party-hat'])
  })

  it('filters to animated bufos', () => {
    const results = searchBufos(library, { query: '', animatedOnly: true })
    expect(results.map((item) => item.slug)).toEqual(['old-bufo-yells-at-cloud'])
  })

  it('sorts by newest when asked', () => {
    const results = searchBufos(library, { query: '', sort: 'newest' })
    expect(results[0]?.slug).toBe('bufo-offers-a-flower')
  })

  it('falls back to a loose match when nothing scores', () => {
    const results = searchBufos(library, { query: 'bufoprty' })
    expect(results.map((item) => item.slug)).toContain('bufo-party')
  })

  it('shuffles deterministically for a given seed', () => {
    const first = searchBufos(library, { query: '', sort: 'random', randomSeed: 7 })
    const second = searchBufos(library, { query: '', sort: 'random', randomSeed: 7 })
    expect(first.map((b) => b.slug)).toEqual(second.map((b) => b.slug))
  })
})

describe('topTags', () => {
  it('counts and orders tags', () => {
    expect(topTags(library, 2)).toEqual([
      { tag: 'party', count: 2 },
      { tag: 'angry', count: 1 },
    ])
  })
})
