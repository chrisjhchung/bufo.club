import { bufoUrl, DOWNLOAD_SIZES, emojiCode } from '@bufo/shared'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ReportDialog } from '../components/ReportDialog'
import { useToast } from '../components/Toast'
import { CDN_BASE } from '../lib/env'
import { copyImage, copyText, downloadBlob, fetchBlob, resizeToSquare } from '../lib/files'
import { useBufo, useManifest } from '../lib/manifest'

export function BufoDetailRoute() {
  const { slug } = useParams<{ slug: string }>()
  const { loading } = useManifest()
  const bufo = useBufo(slug)
  const { show } = useToast()
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)

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
