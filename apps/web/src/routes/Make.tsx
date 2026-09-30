import {
  composeToBlob,
  IDENTITY_TRANSFORM,
  loadSubject,
  type SubjectTransform,
  variantSlug,
} from '@bufo/gen'
import { MAX_UPLOAD_BYTES } from '@bufo/shared'
import { zipSync } from 'fflate'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TemplatePlate } from '../components/TemplatePlate'
import { useToast } from '../components/Toast'
import { Turnstile } from '../components/Turnstile'
import { VariantCanvas } from '../components/VariantCanvas'
import { ApiError, submitBufo } from '../lib/api'
import { downloadBlob } from '../lib/files'
import { useDocumentMeta } from '../lib/hooks'
import { useManifest } from '../lib/manifest'
import { layersFor, useTemplateArt } from '../lib/templates'

export function Make() {
  const { templates, loading } = useManifest()
  const { art, error: artError } = useTemplateArt(templates)
  const { show } = useToast()

  useDocumentMeta(
    'Make a bufo — Bufo Club',
    'Turn any picture into bufo emoji variants in your browser. Nothing is uploaded unless you submit it.',
  )

  const [subject, setSubject] = useState<ImageBitmap | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [transforms, setTransforms] = useState<Record<string, SubjectTransform>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  const transformFor = useCallback(
    (slug: string) => transforms[slug] ?? IDENTITY_TRANSFORM,
    [transforms],
  )

  const patch = (slug: string, changes: Partial<SubjectTransform>) =>
    setTransforms((current) => ({
      ...current,
      [slug]: { ...(current[slug] ?? IDENTITY_TRANSFORM), ...changes },
    }))

  const acceptFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      if (file.size > MAX_UPLOAD_BYTES * 8) {
        show('that image is enormous — try something smaller', 'error')
        return
      }
      try {
        setSubject(await loadSubject(file))
        setTransforms({})
        if (!subjectName) setSubjectName(file.name.replace(/\.[a-z0-9]+$/i, ''))
      } catch {
        show('could not read that image', 'error')
      }
    },
    [show, subjectName],
  )

  // Pasting a screenshot is the fastest path into the generator.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith('image/'))
        ?.getAsFile()
      if (file) void acceptFile(file)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptFile])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.slug === selected) ?? null,
    [templates, selected],
  )

  async function downloadOne(slug: string) {
    const template = templates.find((item) => item.slug === slug)
    const layers = template && layersFor(art, template, subject)
    if (!template || !layers) return
    const blob = await composeToBlob(template, layers, transformFor(slug))
    downloadBlob(blob, `${variantSlug(template, subjectName)}.png`)
  }

  async function downloadAll() {
    if (!subject) return
    setBusy(true)
    try {
      const files: Record<string, Uint8Array> = {}
      for (const template of templates) {
        const layers = layersFor(art, template, subject)
        if (!layers) continue
        const blob = await composeToBlob(template, layers, transformFor(template.slug))
        files[`${variantSlug(template, subjectName)}.png`] = new Uint8Array(
          await blob.arrayBuffer(),
        )
      }
      // Zipping in the browser keeps bulk downloads off the Worker entirely.
      const zipped = zipSync(files, { level: 0 })
      downloadBlob(
        new Blob([zipped], { type: 'application/zip' }),
        `${subjectName || 'bufo'}-pack.zip`,
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitToGallery(slug: string) {
    const template = templates.find((item) => item.slug === slug)
    const layers = template && layersFor(art, template, subject)
    if (!template || !layers) return
    if (!token) {
      show('complete the captcha first', 'error')
      return
    }

    setSubmitting(slug)
    try {
      const blob = await composeToBlob(template, layers, transformFor(slug))
      const name = variantSlug(template, subjectName)
      const form = new FormData()
      form.set('file', blob, `${name}.png`)
      form.set('title', name.replace(/-/g, ' '))
      form.set('tags', `${template.slug} generated`)
      form.set('source', 'generator')
      form.set('turnstileToken', token)
      await submitBufo(form)
      show('sent for review — thanks!')
      setToken('')
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'submission failed', 'error')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-4xl">Make a bufo</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Drop in a picture — ideally a transparent PNG — and it lands in every template at once.
          Everything happens in your browser; nothing is uploaded unless you submit it.
        </p>
      </header>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: the file input below is the accessible control */}
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void acceptFile(event.dataTransfer.files[0])
        }}
        className="rounded-2xl border-2 border-dashed border-line p-6 text-center"
      >
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/png,image/gif,image/webp,image/jpeg"
            className="sr-only"
            onChange={(event) => void acceptFile(event.target.files?.[0])}
          />
          <span className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink">
            Choose an image
          </span>
        </label>
        <p className="mt-2 text-sm text-ink-soft">…or drag one here, or paste one</p>
      </div>

      {subject && (
        <label className="block max-w-sm">
          <span className="mb-1 block text-sm text-ink-soft">
            What is it? (used to name the variants)
          </span>
          <input
            value={subjectName}
            onChange={(event) => setSubjectName(event.target.value)}
            placeholder="a flower"
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
          />
        </label>
      )}

      {artError && <p className="text-sm text-red-500">Template art failed to load: {artError}</p>}
      {loading && <p className="text-sm text-ink-soft">loading templates…</p>}
      {!loading && templates.length === 0 && (
        <p className="text-sm text-ink-soft">
          No templates yet — an admin can add them from the admin page.
        </p>
      )}

      {templates.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {templates.map((template) => {
              const layers = layersFor(art, template, subject)
              const name = subject
                ? `:${variantSlug(template, subjectName)}:`
                : template.namePattern
              const isSelected = selected === template.slug
              return (
                <button
                  key={template.slug}
                  type="button"
                  disabled={!subject}
                  // The names are long; the full one is always one hover away.
                  title={name}
                  onClick={() => setSelected(template.slug)}
                  className={`flex flex-col items-center justify-between gap-2 rounded-xl border p-3 transition ${
                    selected === template.slug ? 'border-accent bg-sunk' : 'border-line'
                  } ${subject ? 'hover:border-accent' : 'cursor-default'}`}
                >
                  {layers ? (
                    <VariantCanvas
                      template={template}
                      layers={layers}
                      transform={transformFor(template.slug)}
                    />
                  ) : (
                    <TemplatePlate template={template} />
                  )}
                  <span
                    className={`w-full font-mono text-xs break-all ${
                      isSelected ? 'text-ink' : 'truncate text-ink-soft'
                    }`}
                  >
                    {name}
                  </span>
                </button>
              )
            })}
          </div>

          {subject ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void downloadAll()}
                className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-50"
              >
                {busy ? 'Zipping…' : `Download all ${templates.length} as .zip`}
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink-soft">
              Add a picture and it drops into every dashed box at once.
            </p>
          )}
        </>
      )}

      {selectedTemplate && subject && (
        <section className="rounded-2xl border border-line p-5">
          <h2 className="display text-2xl">{selectedTemplate.name}</h2>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(`:${variantSlug(selectedTemplate, subjectName)}:`)
                .then(() => show('emoji name copied'))
                .catch(() => show('could not copy', 'error'))
            }}
            className="mt-1 block font-mono text-sm break-all text-ink-soft transition-colors duration-200 ease-[var(--ease-gentle)] hover:text-ink"
            title="Copy the emoji name"
          >
            {`:${variantSlug(selectedTemplate, subjectName)}:`}
          </button>
          <div className="mt-4 flex flex-wrap gap-6">
            <div className="w-full max-w-64 space-y-2">
              <VariantCanvas
                template={selectedTemplate}
                layers={layersFor(art, selectedTemplate, subject)}
                transform={transformFor(selectedTemplate.slug)}
                onDrag={({ dx, dy }) => {
                  const current = transformFor(selectedTemplate.slug)
                  patch(selectedTemplate.slug, { dx: current.dx + dx, dy: current.dy + dy })
                }}
              />
              <p className="text-center text-xs text-ink-soft">drag to reposition</p>
            </div>

            <div className="min-w-56 flex-1 space-y-3 text-sm">
              <label className="block">
                <span className="text-ink-soft">
                  Size {Math.round(transformFor(selectedTemplate.slug).scale * 100)}%
                </span>
                <input
                  type="range"
                  min={20}
                  max={300}
                  value={transformFor(selectedTemplate.slug).scale * 100}
                  onChange={(event) =>
                    patch(selectedTemplate.slug, { scale: Number(event.target.value) / 100 })
                  }
                  className="w-full"
                />
              </label>

              <label className="block">
                <span className="text-ink-soft">
                  Rotation {Math.round(transformFor(selectedTemplate.slug).rotate)}°
                </span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={transformFor(selectedTemplate.slug).rotate}
                  onChange={(event) =>
                    patch(selectedTemplate.slug, { rotate: Number(event.target.value) })
                  }
                  className="w-full"
                />
              </label>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={transformFor(selectedTemplate.slug).flipX}
                    onChange={(event) =>
                      patch(selectedTemplate.slug, { flipX: event.target.checked })
                    }
                  />
                  Flip
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={transformFor(selectedTemplate.slug).clip}
                    onChange={(event) =>
                      patch(selectedTemplate.slug, { clip: event.target.checked })
                    }
                  />
                  Keep inside the slot
                </label>
                <button
                  type="button"
                  onClick={() => patch(selectedTemplate.slug, IDENTITY_TRANSFORM)}
                  className="underline"
                >
                  Reset
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void downloadOne(selectedTemplate.slug)}
                  className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  disabled={submitting === selectedTemplate.slug}
                  onClick={() => void submitToGallery(selectedTemplate.slug)}
                  className="rounded-full border border-line px-4 py-2 disabled:opacity-50"
                >
                  {submitting === selectedTemplate.slug ? 'Sending…' : 'Submit to the gallery'}
                </button>
              </div>

              <div className="pt-2">
                <Turnstile onToken={setToken} onExpire={() => setToken('')} />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
