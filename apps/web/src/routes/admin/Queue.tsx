import { parseTags, slugify, titleFromSlug } from '@bufo/shared'
import { useEffect, useState } from 'react'
import { useToast } from '../../components/Toast'
import { ApiError, admin, type QueueEntry } from '../../lib/api'
import { formatBytes } from '../../lib/files'

type Draft = { slug: string; title: string; tags: string }

export function Queue() {
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { show } = useToast()

  async function refresh() {
    setLoading(true)
    try {
      const data = await admin.queue()
      setEntries(data.pending)
      setCounts(data.counts)
      setDrafts(
        Object.fromEntries(
          data.pending.map((entry) => [
            entry.id,
            { slug: slugify(entry.title), title: entry.title, tags: '' },
          ]),
        ),
      )
      setCursor(0)
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'could not load the queue', 'error')
    } finally {
      setLoading(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the queue refreshes explicitly after mount
  useEffect(() => {
    void refresh()
  }, [])

  const draftFor = (entry: QueueEntry) =>
    drafts[entry.id] ?? { slug: slugify(entry.title), title: entry.title, tags: '' }

  async function approve(entry: QueueEntry) {
    const draft = draftFor(entry)
    setBusy(entry.id)
    try {
      const result = await admin.approve(entry.id, {
        slug: draft.slug,
        title: draft.title || titleFromSlug(draft.slug),
        tags: parseTags(draft.tags),
      })
      show(`approved as :${result.slug}:`)
      setEntries((current) => current.filter((item) => item.id !== entry.id))
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'approval failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function reject(entry: QueueEntry) {
    const reason = window.prompt(`Why is "${entry.title}" rejected?`, 'not a bufo')
    if (!reason) return
    setBusy(entry.id)
    try {
      await admin.reject(entry.id, reason)
      show('rejected')
      setEntries((current) => current.filter((item) => item.id !== entry.id))
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'rejection failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Moderation is a volume job: j/k move, a approves, r rejects.
  // biome-ignore lint/correctness/useExhaustiveDependencies: approve/reject close over exactly these three
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      const entry = entries[cursor]
      if (event.key === 'j') setCursor((index) => Math.min(index + 1, entries.length - 1))
      else if (event.key === 'k') setCursor((index) => Math.max(index - 1, 0))
      else if (event.key === 'a' && entry) void approve(entry)
      else if (event.key === 'r' && entry) void reject(entry)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // `approve` and `reject` close over exactly these three.
  }, [entries, cursor, drafts])

  if (loading) return <p className="py-8 text-sm text-ink-soft">loading the queue…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{entries.length} waiting</span>
        <span className="text-ink-soft">
          {counts.approved ?? 0} approved · {counts.rejected ?? 0} rejected
        </span>
        <button type="button" onClick={() => void refresh()} className="underline">
          Refresh
        </button>
        <button
          type="button"
          onClick={async () => {
            const result = await admin.rebuildManifest()
            show(`manifest rebuilt: ${result.count} bufos`)
          }}
          className="underline"
        >
          Rebuild manifest
        </button>
        <span className="ml-auto text-xs text-ink-soft">
          j/k to move · a to approve · r to reject
        </span>
      </div>

      {entries.length === 0 && (
        <p className="py-12 text-center text-ink-soft">Queue is empty. The pond is calm. 🐸</p>
      )}

      <div className="space-y-3">
        {entries.map((entry, index) => {
          const draft = draftFor(entry)
          const update = (changes: Partial<Draft>) =>
            setDrafts((current) => ({ ...current, [entry.id]: { ...draft, ...changes } }))

          return (
            <article
              key={entry.id}
              className={`flex flex-wrap items-start gap-4 rounded-xl border p-4 ${
                index === cursor ? 'border-accent bg-paper' : 'border-line'
              }`}
              onMouseEnter={() => setCursor(index)}
            >
              <div className="checker flex size-24 shrink-0 items-center justify-center rounded-lg">
                <img
                  src={entry.previewUrl}
                  alt={entry.title}
                  className="max-h-20 max-w-20 object-contain"
                />
              </div>

              <div className="min-w-56 flex-1 space-y-2 text-sm">
                <input
                  value={draft.title}
                  onChange={(event) => update({ title: event.target.value })}
                  className="w-full rounded border border-line bg-transparent px-2 py-1"
                  placeholder="title"
                />
                <input
                  value={draft.slug}
                  onChange={(event) => update({ slug: slugify(event.target.value) })}
                  className="w-full rounded border border-line bg-transparent px-2 py-1 font-mono text-xs"
                  placeholder="slug"
                />
                <input
                  value={draft.tags}
                  onChange={(event) => update({ tags: event.target.value })}
                  className="w-full rounded border border-line bg-transparent px-2 py-1 text-xs"
                  placeholder="tags, comma separated"
                />
                <p className="text-xs text-ink-soft">
                  {entry.width}×{entry.height} · {formatBytes(entry.bytes)} · {entry.source}
                  {entry.isAnimated ? ' · animated' : ''}
                  {entry.credit ? ` · credit: ${entry.credit}` : ''}
                </p>
                {entry.note && <p className="rounded bg-sunk p-2 text-xs">{entry.note}</p>}
                {entry.contact && <p className="text-xs text-ink-soft">contact: {entry.contact}</p>}
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  disabled={busy === entry.id}
                  onClick={() => void approve(entry)}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy === entry.id}
                  onClick={() => void reject(entry)}
                  className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
