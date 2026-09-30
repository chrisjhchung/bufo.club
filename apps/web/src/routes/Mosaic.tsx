import { loadSubject, type MosaicTile, sliceMosaic } from '@bufo/gen'
import {
  bufoUrl,
  MOSAIC_PRESETS,
  MOSAIC_TILE_SIZE,
  mosaicPasteText,
  slugify,
  tileSlug,
} from '@bufo/shared'
import { zipSync } from 'fflate'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useToast } from '../components/Toast'
import { Turnstile } from '../components/Turnstile'
import { ApiError } from '../lib/api'
import { CDN_BASE } from '../lib/env'
import { copyText, downloadBlob, fetchBlob } from '../lib/files'
import { useDebounced, useDocumentMeta } from '../lib/hooks'
import { useManifest } from '../lib/manifest'
import { submitMosaic } from '../lib/mosaicApi'
import { searchBufos } from '../lib/search'

export function Mosaic() {
  const { bufos } = useManifest()
  const { show } = useToast()

  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [size, setSize] = useState(4)
  const [tiles, setTiles] = useState<MosaicTile[]>([])
  const [urls, setUrls] = useState<string[]>([])
  const [pickerQuery, setPickerQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()

  useDocumentMeta(
    'Make a mosaic — Bufo Club',
    'Slice any bufo into a grid of emoji that reassemble when you paste them together.',
  )

  const grid = useMemo(() => ({ rows: size, cols: size }), [size])

  // Arriving from a bufo's page: load it straight away so the visitor lands on
  // a sliced grid rather than an empty picker.
  const fromSlug = params.get('from')
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per incoming slug
  useEffect(() => {
    if (!fromSlug || image) return
    const bufo = bufos.find((entry) => entry.slug === fromSlug)
    if (!bufo) return
    void fetchBlob(bufoUrl(CDN_BASE, bufo))
      .then((blob) => accept(blob, bufo.slug))
      .catch(() => show('could not load that bufo', 'error'))
  }, [fromSlug, bufos])
  const base = slugify(sourceName) || 'big-bufo'
  const pasteText = mosaicPasteText({ base, rows: grid.rows, cols: grid.cols })

  const debouncedQuery = useDebounced(pickerQuery, 120)
  const [browseSeed] = useState(() => Date.now() % 100000)
  // Once a picture is chosen the shelf has done its job; it collapses to a
  // single line and only comes back if you ask to change picture.
  const [picking, setPicking] = useState(false)
  const choosing = !image || picking

  // With no query this is a shelf to browse — nobody remembers bufo names.
  // Animated bufos are left out: a mosaic tile is a still frame.
  const picks = useMemo(() => {
    const stills = bufos.filter((bufo) => !bufo.isAnimated)
    return debouncedQuery
      ? searchBufos(stills, { query: debouncedQuery }).slice(0, 30)
      : searchBufos(stills, { query: '', sort: 'random', randomSeed: browseSeed }).slice(0, 30)
  }, [bufos, debouncedQuery, browseSeed])

  const accept = useCallback(
    async (blob: Blob, name: string) => {
      try {
        setImage(await loadSubject(blob))
        if (!sourceName) setSourceName(name)
      } catch {
        show('could not read that image', 'error')
      }
    },
    [show, sourceName],
  )

  // Re-slice whenever the picture or the grid changes.
  useEffect(() => {
    if (!image) return
    let cancelled = false
    sliceMosaic(image, grid)
      .then((result) => {
        if (cancelled) return
        setTiles(result)
        setUrls((previous) => {
          for (const url of previous) URL.revokeObjectURL(url)
          return result.map((tile) => URL.createObjectURL(tile.blob))
        })
      })
      .catch(() => show('could not slice that image', 'error'))
    return () => {
      cancelled = true
    }
  }, [image, grid, show])

  async function downloadZip() {
    setBusy(true)
    try {
      const files: Record<string, Uint8Array> = {}
      for (const tile of tiles) {
        files[`${tileSlug(base, tile.row, tile.col)}.png`] = new Uint8Array(
          await tile.blob.arrayBuffer(),
        )
      }
      files['paste-me.txt'] = new TextEncoder().encode(pasteText)
      downloadBlob(
        new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }),
        `${base}.zip`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!token) return show('complete the captcha first', 'error')
    setBusy(true)
    try {
      const result = await submitMosaic({
        base,
        title: sourceName || base,
        grid,
        tiles,
        tags: 'mosaic',
        turnstileToken: token,
      })
      setSubmitted(result.base)
      setToken('')
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'submission failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="display text-3xl">In the queue</p>
        <p className="mt-3 text-sm text-ink-soft">
          All {tiles.length} tiles of <code className="font-mono">{submitted}</code> were sent for
          review together. They appear as a set once an admin approves them.
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setSubmitted(null)
              setImage(null)
              setTiles([])
              setSourceName('')
            }}
            className="lift rounded-full bg-accent px-4 py-2 font-medium text-accent-ink"
          >
            Make another
          </button>
          <Link to="/" className="rounded-full border border-line px-4 py-2">
            Back to browsing
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="display text-4xl">Make a mosaic</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Slice a picture into a grid of emoji that reassemble when pasted together — the way{' '}
          <Link to="/b/bigbufo-0-0" className="underline underline-offset-4">
            bigbufo
          </Link>{' '}
          does. Everything happens in your browser.
        </p>
      </header>

      {choosing ? (
        <section className="space-y-3">
          <p className="eyebrow">{image ? 'change the picture' : '1 · Pick a picture'}</p>
          <div className="flex flex-wrap gap-3">
            <label className="lift cursor-pointer rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
              <input
                type="file"
                accept="image/png,image/gif,image/webp,image/jpeg"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void accept(file, file.name.replace(/\.[a-z0-9]+$/i, '')).then(() =>
                      setPicking(false),
                    )
                  }
                }}
              />
              Upload one
            </label>
            <input
              type="search"
              value={pickerQuery}
              placeholder="…or search 1,600+ bufos"
              onChange={(event) => setPickerQuery(event.target.value)}
              className="min-w-56 flex-1 rounded-full border border-line bg-raise px-4 py-2 text-sm outline-none focus:border-line-strong"
            />
            {image && (
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="rounded-full px-3 py-2 text-sm text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
            )}
          </div>

          {!debouncedQuery && (
            <p className="text-xs text-ink-faint">
              A few to start with — search above, or{' '}
              <Link to="/" className="underline underline-offset-4">
                browse everything
              </Link>
              .
            </p>
          )}

          {picks.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1">
              {picks.map((bufo) => (
                <button
                  key={bufo.slug}
                  type="button"
                  title={bufo.slug}
                  onClick={() =>
                    void fetchBlob(bufoUrl(CDN_BASE, bufo))
                      .then((blob) => accept(blob, bufo.slug))
                      .then(() => {
                        setPickerQuery('')
                        setPicking(false)
                        if (fromSlug) setParams(new URLSearchParams(), { replace: true })
                      })
                      .catch(() => show('could not load that bufo', 'error'))
                  }
                  className="lift grid aspect-square place-items-center rounded-xl p-2 hover:bg-raise"
                >
                  <img
                    src={bufoUrl(CDN_BASE, bufo)}
                    alt={bufo.title}
                    loading="lazy"
                    className="max-h-12 max-w-12 object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3">
          {urls[0] && (
            <img src={urls[0]} alt="" className="checker size-10 rounded-lg object-contain" />
          )}
          <span className="text-sm">
            Slicing <span className="font-mono text-ink-soft">{sourceName || 'your picture'}</span>
          </span>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="ml-auto rounded-full border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-line-strong hover:text-ink"
          >
            Change picture
          </button>
        </div>
      )}

      {image && (
        <>
          <section className="space-y-3">
            <p className="eyebrow">1 · Choose a grid</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {MOSAIC_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setSize(preset)}
                  className={`rounded-full px-3 py-1 transition-colors duration-200 ease-[var(--ease-gentle)] ${
                    size === preset ? 'bg-accent-soft text-ink' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {preset}×{preset}
                </button>
              ))}
              <span className="eyebrow ml-2">
                {grid.rows * grid.cols} tiles · {MOSAIC_TILE_SIZE}px each
              </span>
            </div>

            <label className="block max-w-sm">
              <span className="mb-1 block text-sm text-ink-soft">Name</span>
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                className="w-full rounded-lg border border-line bg-raise px-3 py-2"
              />
              <span className="mt-1 block font-mono text-xs text-ink-faint">
                :{tileSlug(base, 0, 0)}: … :{tileSlug(base, grid.rows - 1, grid.cols - 1)}:
              </span>
            </label>
          </section>

          <section className="space-y-3">
            <p className="eyebrow">2 · The grid</p>
            <div
              className="grid w-fit gap-0.5 rounded-xl bg-sunk p-1"
              style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
            >
              {urls.map((url, index) => (
                <img
                  // biome-ignore lint/suspicious/noArrayIndexKey: tiles are positional
                  key={index}
                  src={url}
                  alt=""
                  className="checker size-16 rounded-sm object-contain sm:size-20"
                />
              ))}
            </div>

            <div className="max-w-md space-y-2">
              <p className="eyebrow">Paste this into Slack</p>
              <pre className="overflow-x-auto rounded-xl border border-line bg-raise p-3 font-mono text-xs leading-relaxed">
                {pasteText}
              </pre>
              <button
                type="button"
                onClick={() =>
                  void copyText(pasteText)
                    .then(() => show('paste block copied'))
                    .catch(() => show('could not copy', 'error'))
                }
                className="lift rounded-full border border-line px-4 py-2 text-sm hover:bg-raise"
              >
                Copy paste block
              </button>
            </div>
          </section>

          <section className="space-y-3">
            <p className="eyebrow">3 · Take it away</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || tiles.length === 0}
                onClick={() => void downloadZip()}
                className="lift rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
              >
                {busy ? 'Working…' : `Download ${tiles.length} tiles as .zip`}
              </button>
              <button
                type="button"
                disabled={busy || tiles.length === 0}
                onClick={() => void submit()}
                className="lift rounded-full border border-line px-4 py-2 text-sm disabled:opacity-40 hover:bg-raise"
              >
                Submit to the gallery
              </button>
            </div>
            <p className="max-w-md text-xs text-ink-faint">
              Submitting sends all {tiles.length} tiles for review as one set, so the grid is never
              approved with holes in it.
            </p>
            <Turnstile onToken={setToken} onExpire={() => setToken('')} />
          </section>
        </>
      )}
    </div>
  )
}
