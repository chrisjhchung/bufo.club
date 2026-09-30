import type { TemplateSlot } from '@bufo/shared'
import { cdnUrl, slugify } from '@bufo/shared'
import { useEffect, useRef, useState } from 'react'
import { useToast } from '../../components/Toast'
import { ApiError, admin } from '../../lib/api'
import { CDN_BASE } from '../../lib/env'

type TemplateRow = Awaited<ReturnType<typeof admin.templates>>['templates'][number]

const BLANK_SLOT: TemplateSlot = { x: 32, y: 32, w: 64, h: 64, rotate: 0, fit: 'contain' }

type Draft = {
  slug: string
  name: string
  namePattern: string
  canvasW: number
  canvasH: number
  slot: TemplateSlot
  status: 'active' | 'hidden'
}

const BLANK: Draft = {
  slug: '',
  name: '',
  namePattern: ':bufo-does-{subject}:',
  canvasW: 128,
  canvasH: 128,
  slot: BLANK_SLOT,
  status: 'active',
}

export function Templates() {
  const [rows, setRows] = useState<TemplateRow[]>([])
  const [draft, setDraft] = useState<Draft>(BLANK)
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [overlayFile, setOverlayFile] = useState<File | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { show } = useToast()

  async function refresh() {
    try {
      const data = await admin.templates()
      setRows(data.templates)
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'could not load templates', 'error')
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: templates refresh explicitly after each save
  useEffect(() => {
    void refresh()
  }, [])

  function edit(row: TemplateRow) {
    setEditing(row.slug)
    setDraft({
      slug: row.slug,
      name: row.name,
      namePattern: row.namePattern,
      canvasW: row.canvas.w,
      canvasH: row.canvas.h,
      slot: row.slot,
      status: row.status,
    })
    setBaseFile(null)
    setOverlayFile(null)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const form = new FormData()
      form.set('meta', JSON.stringify(draft))
      if (baseFile) form.set('base', baseFile)
      if (overlayFile) form.set('overlay', overlayFile)
      await admin.saveTemplate(form)
      show(`saved ${draft.slug}`)
      setDraft(BLANK)
      setEditing(null)
      setBaseFile(null)
      setOverlayFile(null)
      await refresh()
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'save failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const existing = rows.find((row) => row.slug === editing)
  const previewUrl = baseFile
    ? URL.createObjectURL(baseFile)
    : existing
      ? cdnUrl(CDN_BASE, existing.baseKey)
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        {rows.map((row) => (
          <div key={row.slug} className="w-40 space-y-2 rounded-xl border border-line p-3">
            <img
              src={cdnUrl(CDN_BASE, row.baseKey)}
              alt={row.name}
              crossOrigin="anonymous"
              className="checker mx-auto size-24 rounded object-contain"
            />
            <p className="truncate text-sm font-medium">{row.name}</p>
            <p className="truncate font-mono text-xs text-ink-soft">{row.namePattern}</p>
            <p className="text-xs text-ink-soft">
              {row.status} · slot {row.slot.w}×{row.slot.h} · {row.slot.fit}
            </p>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => edit(row)} className="underline">
                Edit
              </button>
              <button
                type="button"
                className="underline"
                onClick={async () => {
                  if (
                    !window.confirm(`Delete template ${row.slug}? This removes its plate art too.`)
                  )
                    return
                  await admin.deleteTemplate(row.slug)
                  show(`deleted ${row.slug}`)
                  await refresh()
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-line p-5">
        <h3 className="font-semibold">{editing ? `Edit ${editing}` : 'New template'}</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">Slug</span>
            <input
              required
              value={draft.slug}
              onChange={(event) => setDraft({ ...draft, slug: slugify(event.target.value) })}
              className="w-full rounded border border-line bg-transparent px-2 py-1 font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">Display name</span>
            <input
              required
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="w-full rounded border border-line bg-transparent px-2 py-1"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-ink-soft">
              Name pattern (must contain {'{subject}'})
            </span>
            <input
              required
              value={draft.namePattern}
              onChange={(event) => setDraft({ ...draft, namePattern: event.target.value })}
              className="w-full rounded border border-line bg-transparent px-2 py-1 font-mono"
            />
          </label>
        </div>

        <SlotEditor
          previewUrl={previewUrl}
          canvas={{ w: draft.canvasW, h: draft.canvasH }}
          slot={draft.slot}
          onChange={(slot) => setDraft({ ...draft, slot })}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">
              Base plate (PNG{editing ? ', leave empty to keep' : ''})
            </span>
            <input
              type="file"
              accept="image/png"
              required={!editing}
              onChange={(event) => setBaseFile(event.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-soft">
              Overlay (PNG, drawn in front — optional)
            </span>
            <input
              type="file"
              accept="image/png"
              onChange={(event) => setOverlayFile(event.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Status
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({ ...draft, status: event.target.value as Draft['status'] })
              }
              className="rounded border border-line bg-transparent px-2 py-1"
            >
              <option value="active">active</option>
              <option value="hidden">hidden</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null)
                setDraft(BLANK)
              }}
              className="underline"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * Drag the slot rectangle over the plate rather than typing coordinates —
 * getting a slot right by hand is otherwise a guessing game.
 */
function SlotEditor({
  previewUrl,
  canvas,
  slot,
  onChange,
}: {
  previewUrl: string | null
  canvas: { w: number; h: number }
  slot: TemplateSlot
  onChange: (slot: TemplateSlot) => void
}) {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; mode: 'move' | 'resize' } | null>(null)
  const display = 256
  const scale = display / canvas.w

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current
    if (!state) return
    const dx = (event.clientX - state.x) / scale
    const dy = (event.clientY - state.y) / scale
    drag.current = { ...state, x: event.clientX, y: event.clientY }

    if (state.mode === 'move') {
      onChange({
        ...slot,
        x: Math.round(Math.max(0, Math.min(canvas.w - slot.w, slot.x + dx))),
        y: Math.round(Math.max(0, Math.min(canvas.h - slot.h, slot.y + dy))),
      })
    } else {
      onChange({
        ...slot,
        w: Math.round(Math.max(8, Math.min(canvas.w - slot.x, slot.w + dx))),
        h: Math.round(Math.max(8, Math.min(canvas.h - slot.y, slot.h + dy))),
      })
    }
  }

  return (
    <div className="flex flex-wrap gap-5">
      <div
        ref={boxRef}
        className="checker relative shrink-0 rounded-lg"
        style={{ width: display, height: display * (canvas.h / canvas.w) }}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null
        }}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt="template plate"
            className="absolute inset-0 size-full object-contain"
          />
        )}
        <div
          className="absolute cursor-move border-2 border-dashed border-accent bg-accent-soft"
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: slot.w * scale,
            height: slot.h * scale,
          }}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, mode: 'move' }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
        >
          <span
            className="absolute -right-1.5 -bottom-1.5 size-3 cursor-se-resize rounded-full bg-paper0"
            onPointerDown={(event) => {
              event.stopPropagation()
              drag.current = { x: event.clientX, y: event.clientY, mode: 'resize' }
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
          />
        </div>
      </div>

      <div className="grid min-w-48 flex-1 grid-cols-2 gap-2 text-sm">
        {(['x', 'y', 'w', 'h'] as const).map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block text-ink-soft">{key}</span>
            <input
              type="number"
              value={slot[key]}
              onChange={(event) => onChange({ ...slot, [key]: Number(event.target.value) })}
              className="w-full rounded border border-line bg-transparent px-2 py-1"
            />
          </label>
        ))}
        <label className="block">
          <span className="mb-1 block text-ink-soft">rotate</span>
          <input
            type="number"
            value={slot.rotate}
            onChange={(event) => onChange({ ...slot, rotate: Number(event.target.value) })}
            className="w-full rounded border border-line bg-transparent px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-ink-soft">fit</span>
          <select
            value={slot.fit}
            onChange={(event) =>
              onChange({ ...slot, fit: event.target.value as TemplateSlot['fit'] })
            }
            className="w-full rounded border border-line bg-transparent px-2 py-1"
          >
            <option value="contain">contain</option>
            <option value="cover">cover</option>
          </select>
        </label>
      </div>
    </div>
  )
}
