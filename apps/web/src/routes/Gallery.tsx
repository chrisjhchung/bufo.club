import { detectMosaics, mosaicTileSlugs } from '@bufo/shared'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BufoGrid } from '../components/BufoGrid'
import { MosaicCard } from '../components/MosaicCard'
import { useDebounced, useDocumentMeta } from '../lib/hooks'
import { useManifest } from '../lib/manifest'
import { prefetchBufos } from '../lib/prefetch'
import { type SortMode, searchBufos, topTags } from '../lib/search'

const SORTS: { value: SortMode; label: string }[] = [
  { value: 'relevance', label: 'Best match' },
  { value: 'az', label: 'A–Z' },
  { value: 'newest', label: 'Newest' },
  { value: 'random', label: 'Random' },
]

export function Gallery() {
  const { bufos, bySlug, mosaics: manifestMosaics, loading, error, reload } = useManifest()
  const [params, setParams] = useSearchParams()
  const [randomSeed, setRandomSeed] = useState(() => Date.now() % 100000)

  const query = params.get('q') ?? ''
  const activeTags = params.getAll('tag')
  const sort = (params.get('sort') as SortMode | null) ?? 'relevance'
  const animatedOnly = params.get('animated') === '1'
  const debouncedQuery = useDebounced(query, 100)
  const mosaicMode = params.get('mosaic') ?? 'all'

  const update = (changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key)
      if (Array.isArray(value)) for (const item of value) next.append(key, item)
      else if (value) next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  // Mosaic membership is derived from the slugs, so the sets that predate the
  // feature (bigbufo) are recognised without any backfill.
  const allMosaics = useMemo(
    () =>
      manifestMosaics.length > 0 ? manifestMosaics : detectMosaics(bufos.map((bufo) => bufo.slug)),
    [manifestMosaics, bufos],
  )

  const tileSlugs = useMemo(() => {
    const all = new Set<string>()
    for (const mosaic of allMosaics) {
      for (const slug of mosaicTileSlugs(mosaic)) all.add(slug)
    }
    return all
  }, [allMosaics])

  const scoped = useMemo(() => {
    if (mosaicMode === 'only') return bufos.filter((bufo) => tileSlugs.has(bufo.slug))
    if (mosaicMode === 'hide') return bufos.filter((bufo) => !tileSlugs.has(bufo.slug))
    return bufos
  }, [bufos, tileSlugs, mosaicMode])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the joined tag list stands in for array identity
  const results = useMemo(
    () =>
      searchBufos(scoped, {
        query: debouncedQuery,
        tags: activeTags,
        sort,
        animatedOnly,
        randomSeed,
      }),
    [scoped, debouncedQuery, activeTags.join(','), sort, animatedOnly, randomSeed],
  )

  const mosaics = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase()
    return needle ? allMosaics.filter((mosaic) => mosaic.base.includes(needle)) : allMosaics
  }, [allMosaics, debouncedQuery])

  const showingMosaics = mosaicMode === 'only'
  const shownCount = showingMosaics ? mosaics.length : results.length
  const shownNoun = showingMosaics ? 'mosaics' : 'shown'

  useEffect(() => {
    if (results.length > 0) prefetchBufos(results.slice(120), 36)
  }, [results])

  const tags = useMemo(() => topTags(bufos, 16), [bufos])

  useDocumentMeta(
    query ? `${query} bufos — Bufo Club` : 'Bufo Club — search and download every bufo emoji',
  )
  const filtered = Boolean(query || activeTags.length > 0 || animatedOnly)

  const toggleTag = (tag: string) =>
    update({
      tag: activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag],
    })

  return (
    <div className="space-y-10">
      <section className="fade-in mx-auto max-w-2xl pt-6 pb-2 text-center sm:pt-12">
        <p className="eyebrow">The bufo library</p>
        <h1 className="display mt-4 text-balance text-5xl sm:text-6xl">
          There’s a Bufo for <em className="italic">that</em>.
        </h1>

        <label className="group mt-9 block">
          <span className="sr-only">Search bufos</span>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-ink-faint transition-colors duration-200 ease-[var(--ease-gentle)] group-focus-within:text-accent"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Search</title>
              <circle cx="11" cy="11" r="6.5" />
              <path strokeLinecap="round" d="M16 16l4.5 4.5" />
            </svg>
            <input
              type="search"
              value={query}
              // biome-ignore lint/a11y/noAutofocus: searching is the whole page
              autoFocus
              placeholder="party, sad, yells at…"
              onChange={(event) => update({ q: event.target.value || null })}
              className="w-full rounded-full border border-line bg-raise py-3.5 pr-5 pl-12 text-base shadow-[var(--shadow-soft)] outline-none transition-[box-shadow,border-color] duration-300 ease-[var(--ease-settle)] placeholder:text-ink-faint focus:border-line-strong focus:shadow-[var(--shadow-lift)]"
            />
          </div>
        </label>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-4 text-sm">
          <span className="eyebrow tabular-nums">
            {loading ? 'loading' : `${shownCount.toLocaleString()} ${shownNoun}`}
          </span>

          <div className="flex items-center gap-2">
            <span className="eyebrow">show</span>
            <div className="flex items-center gap-1">
              {(
                [
                  ['all', 'Everything'],
                  ['hide', 'No mosaics'],
                  ['only', 'Mosaics only'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ mosaic: value === 'all' ? null : value })}
                  className={`rounded-full px-3 py-1 transition-colors duration-200 ease-[var(--ease-gentle)] ${
                    mosaicMode === value
                      ? 'bg-accent-soft text-ink'
                      : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mosaicMode !== 'only' && (
              <button
                type="button"
                onClick={() => update({ animated: animatedOnly ? null : '1' })}
                className={`rounded-full border px-3 py-1 transition-colors duration-200 ease-[var(--ease-gentle)] ${
                  animatedOnly
                    ? 'border-transparent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
                }`}
              >
                Animated
              </button>
            )}
          </div>

          {mosaicMode !== 'only' && (
            <label className="ml-auto flex items-center gap-2">
              <span className="eyebrow">sort</span>
              <select
                value={sort}
                onChange={(event) => {
                  if (event.target.value === 'random') setRandomSeed(Date.now() % 100000)
                  update({ sort: event.target.value === 'relevance' ? null : event.target.value })
                }}
                className="rounded-full border border-line bg-raise px-3 py-1 text-ink outline-none transition-colors duration-200 ease-[var(--ease-gentle)] hover:border-line-strong"
              >
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(filtered || mosaicMode !== 'all') && (
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className={`text-ink-faint underline-offset-4 transition-colors duration-200 ease-[var(--ease-gentle)] hover:text-ink hover:underline ${
                mosaicMode === 'only' ? 'ml-auto' : ''
              }`}
            >
              Clear
            </button>
          )}
        </div>

        {tags.length > 0 && !showingMosaics && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map(({ tag }) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                onMouseEnter={() => prefetchBufos(searchBufos(scoped, { query: '', tags: [tag] }))}
                onFocus={() => prefetchBufos(searchBufos(scoped, { query: '', tags: [tag] }))}
                className={`rounded-full border px-3 py-1 text-xs transition-all duration-200 ease-[var(--ease-gentle)] ${
                  activeTags.includes(tag)
                    ? 'border-transparent bg-accent text-accent-ink'
                    : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-2xl border border-line bg-raise p-5 text-sm">
          <p className="font-medium">The bufo index would not load.</p>
          <p className="mt-1 text-ink-soft">{error}</p>
          <button type="button" onClick={reload} className="mt-3 underline underline-offset-4">
            Try again
          </button>
        </div>
      )}

      {loading && !error && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1">
          {Array.from({ length: 36 }, (_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholders with no identity
            <div
              key={index}
              className="fade-in m-3 size-16 rounded-full bg-sunk"
              style={{ animationDelay: `${index * 14}ms` }}
            />
          ))}
        </div>
      )}

      {!loading && !error && shownCount === 0 && (
        <div className="py-20 text-center">
          <p className="display text-3xl">No bufo for that.</p>
          <p className="mt-3 text-sm text-ink-soft">
            <Link to="/make" className="underline underline-offset-4">
              Make one
            </Link>{' '}
            or{' '}
            <Link to="/upload" className="underline underline-offset-4">
              upload it
            </Link>
            .
          </p>
        </div>
      )}

      {showingMosaics
        ? mosaics.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
              {mosaics.map((mosaic, index) => (
                <MosaicCard key={mosaic.base} mosaic={mosaic} bySlug={bySlug} index={index} />
              ))}
            </div>
          )
        : results.length > 0 && <BufoGrid bufos={results} />}
    </div>
  )
}
