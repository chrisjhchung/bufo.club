import { describe, expect, it } from 'vitest'
import { emojiCode, parseTags, slugify, tagsFromSlug, titleFromSlug } from '../slug'

describe('slugify', () => {
  it('normalizes filenames into bufo slugs', () => {
    expect(slugify('Bufo Offers A Flower.png')).toBe('bufo-offers-a-flower')
    expect(slugify('old-bufo__yells  at.gif')).toBe('old-bufo-yells-at')
    expect(slugify('café-bufo.webp')).toBe('cafe-bufo')
    expect(slugify('---bufo!!!---')).toBe('bufo')
  })

  it('caps length', () => {
    expect(slugify('a'.repeat(200)).length).toBe(96)
  })
})

describe('titleFromSlug', () => {
  it('prettifies', () => {
    expect(titleFromSlug('bufo-thinks-about-it')).toBe('Bufo thinks about it')
    expect(titleFromSlug('')).toBe('bufo')
  })
})

describe('parseTags', () => {
  it('splits, normalizes and dedupes', () => {
    expect(parseTags('Party, dance  party  x')).toEqual(['party', 'dance'])
    expect(parseTags(null)).toEqual([])
  })

  it('respects the limit', () => {
    expect(parseTags('a1 b2 c3 d4', 2)).toHaveLength(2)
  })
})

describe('tagsFromSlug', () => {
  it('drops stopwords, short words and the word bufo', () => {
    expect(tagsFromSlug('bufo-offers-a-flower')).toEqual(['offers', 'flower'])
  })

  it('refuses to tag sentence-length slugs', () => {
    expect(
      tagsFromSlug('according-to-all-known-laws-of-aviation-there-is-no-way-a-bufo-should-fly'),
    ).toEqual([])
  })

  it('caps the number of tags', () => {
    expect(tagsFromSlug('bufo-dances-wildly-around-fire')).toHaveLength(4)
  })
})

describe('emojiCode', () => {
  it('wraps in colons', () => {
    expect(emojiCode('bufo-party')).toBe(':bufo-party:')
  })
})
