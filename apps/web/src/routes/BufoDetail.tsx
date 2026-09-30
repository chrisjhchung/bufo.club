import {
  bufoUrl,
  DOWNLOAD_SIZES,
  detectMosaics,
  emojiCode,
  mosaicPasteText,
  mosaicTileSlugs,
  parseTileSlug,
  tilePosition,
} from '@bufo/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ReportDialog } from '../components/ReportDialog'
import { useToast } from '../components/Toast'
import { CDN_BASE } from '../lib/env'
import { copyImage, copyText, downloadBlob, fetchBlob, resizeToSquare } from '../lib/files'
import { useDocumentMeta } from '../lib/hooks'
import { useBufo, useManifest } from '../lib/manifest'

export function BufoDetailRoute() {
  const { slug } = useParams<{ slug: string }>()
  const { loading, bufos, mosaics: manifestMosaics } = useManifest()
  const bufo = useBufo(slug)
  const { show } = useToast()
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)

  useDocumentMeta(
    bufo ? `:${bufo.slug}: — ${bufo.title} | Bufo Club` : 'Bufo Club',
    bufo ? `Download :${bufo.slug}:, a free bufo emoji for Slack and Discord.` : undefined,
  )

  if (loading) return <p className="eyebrow py-24 text-center">loading</p>
  if (!bufo) {
    return (
      <div className="py-24 text-center">
        <p className="display text-3xl">No bufo called “{slug}”.</p>
        <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to the pond
        </Link>
      </div>
    )
  }

  const url = bufoUrl(CDN_BASE, bufo)

  // A tile on its own is a fragment of a picture; the useful thing to hand
  // someone who lands here is the block that reassembles the whole grid.
  const tile = parseTileSlug(bufo.slug)
  const allMosaics =
    manifestMosaics.length > 0 ? manifestMosaics : detectMosaics(bufos.map((entry) => entry.slug))
  const mosaic = tile ? allMosaics.find((entry) => entry.base === tile.base) : undefined
  const position = mosaic ? tilePosition(mosaic, bufo.slug) : null

  async function withBusy(label: string, action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      show(error instanceof Error ? error.message : label, 'error')
    } finally {
      setBusy(false)
    }
  }

  const download = (size?: number) =>
    withBusy('download failed', async () => {
      const blob = await fetchBlob(url)
      if (!size || bufo.isAnimated) {
        // Resizing an animated GIF in a canvas would flatten it to one frame.
        downloadBlob(blob, `${bufo.slug}.${bufo.ext}`)
        if (size && bufo.isAnimated) show('animated bufos download at full size')
        return
      }
      downloadBlob(await resizeToSquare(blob, size), `${bufo.slug}-${size}.png`)
    })

  const pill =
    'lift rounded-full border border-line px-4 py-2 text-sm hover:border-line-strong hover:bg-raise disabled:opacity-40'

  return (
    <article className="fade-in mx-auto max-w-xl">
      <Link
        to="/"
        className="eyebrow inline-block transition-colors duration-200 ease-[var(--ease-gentle)] hover:text-ink"
      >
        ← all bufos
      </Link>

      <div className="mt-8 flex flex-col items-center">
        <div className="grid size-44 place-items-center rounded-3xl bg-raise shadow-[var(--shadow-soft)]">
          <img src={url} alt={bufo.title} className="max-h-32 max-w-32 object-contain" />
        </div>

        <h1 className="display mt-7 text-balance text-center text-4xl">{bufo.title}</h1>

        <button
          type="button"
          onClick={() =>
            withBusy('copy failed', async () => {
              await copyText(emojiCode(bufo.slug))
              show('emoji name copied')
            })
          }
          className="mt-3 font-mono text-sm text-ink-soft transition-colors duration-200 ease-[var(--ease-gentle)] hover:text-ink"
          title="Copy the emoji name"
        >
          {emojiCode(bufo.slug)}
        </button>

        <p className="eyebrow mt-2 tabular-nums">
          {bufo.width}×{bufo.height} · {bufo.ext}
          {bufo.isAnimated ? ' · animated' : ''}
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => download()}
            className="lift rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
          >
            Download
          </button>
          {DOWNLOAD_SIZES.filter((size) => size !== 128 || bufo.width !== 128).map((size) => (
            <button
              key={size}
              type="button"
              disabled={busy}
              onClick={() => download(size)}
              className={pill}
            >
              {size}px
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              withBusy('copy failed', async () => {
                await copyText(url)
                show('image URL copied')
              })
            }
            className={pill}
          >
            Copy URL
          </button>
          {!bufo.isAnimated && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                withBusy('copy failed', async () => {
                  await copyImage(await fetchBlob(url))
                  show('image copied')
                })
              }
              className={pill}
            >
              Copy image
            </button>
          )}
          {!bufo.isAnimated && !mosaic && (
            <Link to={`/mosaic?from=${encodeURIComponent(bufo.slug)}`} className={pill}>
              Make a mosaic
            </Link>
          )}
        </div>

        {bufo.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-1.5">
            {bufo.tags.map((tag) => (
              <Link
                key={tag}
                to={`/?tag=${encodeURIComponent(tag)}`}
                className="rounded-full border border-line px-3 py-1 text-xs text-ink-soft transition-colors duration-200 ease-[var(--ease-gentle)] hover:border-line-strong hover:text-ink"
              >
                {tag}
              </Link>
            ))}
          </div>
        )}

        {mosaic && (
          <section className="mt-10 w-full space-y-2 rounded-2xl border border-line p-5">
            <p className="eyebrow">
              tile {position?.row},{position?.col} of a {mosaic.rows}×{mosaic.cols} mosaic
            </p>
            <div
              className="grid w-fit gap-0.5 rounded-lg bg-sunk p-1"
              style={{ gridTemplateColumns: `repeat(${mosaic.cols}, minmax(0, 1fr))` }}
            >
              {mosaicTileSlugs(mosaic).map((tileName) => {
                const piece = bufos.find((entry) => entry.slug === tileName)
                return piece ? (
                  <Link key={tileName} to={`/b/${tileName}`} title={tileName}>
                    <img
                      src={bufoUrl(CDN_BASE, piece)}
                      alt={tileName}
                      className="checker size-10 rounded-sm object-contain"
                    />
                  </Link>
                ) : (
                  <div key={tileName} className="checker size-10 rounded-sm" />
                )
              })}
            </div>
            <pre className="overflow-x-auto rounded-lg border border-line bg-raise p-3 font-mono text-[11px] leading-relaxed">
              {mosaicPasteText(mosaic)}
            </pre>
            <button
              type="button"
              onClick={() =>
                withBusy('copy failed', async () => {
                  await copyText(mosaicPasteText(mosaic))
                  show('paste block copied')
                })
              }
              className={pill}
            >
              Copy the whole mosaic
            </button>
          </section>
        )}

        {bufo.credit && <p className="eyebrow mt-8">credit · {bufo.credit}</p>}

        {reporting ? (
          <div className="w-full">
            <ReportDialog slug={bufo.slug} onClose={() => setReporting(false)} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="mt-10 text-xs text-ink-faint underline-offset-4 transition-colors duration-200 ease-[var(--ease-gentle)] hover:text-ink-soft hover:underline"
          >
            Report this bufo
          </button>
        )}
      </div>
    </article>
  )
}
