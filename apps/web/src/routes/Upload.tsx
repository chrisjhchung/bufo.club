import { MAX_UPLOAD_BYTES, readImageInfo } from '@bufo/shared'
import { useState } from 'react'
import { Link } from 'react-router'
import { useToast } from '../components/Toast'
import { Turnstile } from '../components/Turnstile'
import { ApiError, submitBufo } from '../lib/api'
import { formatBytes } from '../lib/files'

type Preview = { url: string; file: File; width: number; height: number; animated: boolean }

export function Upload() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')
  const [credit, setCredit] = useState('')
  const [contact, setContact] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const { show } = useToast()

  async function accept(file: File | null | undefined) {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      show(`too big — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}`, 'error')
      return
    }
    // Same header check the Worker does, so a bad file is caught before upload.
    const info = readImageInfo(new Uint8Array(await file.arrayBuffer()))
    if (!info) {
      show('that is not a PNG, GIF or WebP', 'error')
      return
    }
    setPreview({
      url: URL.createObjectURL(file),
      file,
      width: info.width,
      height: info.height,
      animated: info.isAnimated,
    })
    if (!title) setTitle(file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '))
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!preview) return show('pick an image first', 'error')
    if (!token) return show('complete the captcha first', 'error')

    setBusy(true)
    try {
      const form = new FormData()
      form.set('file', preview.file)
      form.set('title', title)
      form.set('tags', tags)
      if (note) form.set('note', note)
      if (credit) form.set('credit', credit)
      if (contact) form.set('contact', contact)
      form.set('turnstileToken', token)
      await submitBufo(form)
      setDone(true)
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'upload failed', 'error')
      setToken('')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-4xl">🐸</p>
        <h1 className="mt-3 text-xl font-bold">In the queue</h1>
        <p className="mt-2 text-ink-soft">
          An admin reviews every submission before it shows up in the gallery. Thanks for feeding
          the pond.
        </p>
        <div className="mt-6 flex justify-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => {
              setDone(false)
              setPreview(null)
              setTitle('')
              setTags('')
              setNote('')
              setToken('')
            }}
            className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink"
          >
            Upload another
          </button>
          <Link to="/" className="rounded-full border border-line px-4 py-2">
            Back to browsing
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="display text-4xl">Upload a bufo</h1>
        <p className="mt-1 text-sm text-ink-soft">
          PNG, GIF or WebP up to {formatBytes(MAX_UPLOAD_BYTES)}. Uploads are anonymous and go
          through review before they appear. Keep it safe for work.
        </p>
      </header>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: the file input below is the accessible control */}
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          void accept(event.dataTransfer.files[0])
        }}
        className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line p-6"
      >
        {preview ? (
          <>
            <div className="checker flex size-32 items-center justify-center rounded-xl">
              <img src={preview.url} alt="preview" className="max-h-28 max-w-28 object-contain" />
            </div>
            <p className="text-xs text-ink-soft">
              {preview.width}×{preview.height} · {formatBytes(preview.file.size)}
              {preview.animated ? ' · animated' : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-soft">drag an image here</p>
        )}
        <label className="cursor-pointer text-sm">
          <input
            type="file"
            accept="image/png,image/gif,image/webp"
            className="sr-only"
            onChange={(event) => void accept(event.target.files?.[0])}
          />
          <span className="rounded-full border border-line px-4 py-2">
            {preview ? 'Choose a different image' : 'Choose an image'}
          </span>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm text-ink-soft">Name *</span>
        <input
          required
          value={title}
          maxLength={120}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="bufo does a little dance"
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-ink-soft">Tags</span>
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          placeholder="dance, happy, party"
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-ink-soft">Credit (who made it?)</span>
        <input
          value={credit}
          onChange={(event) => setCredit(event.target.value)}
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
        />
      </label>

      <details className="text-sm">
        <summary className="cursor-pointer text-ink-soft">Anything for the reviewer?</summary>
        <div className="mt-2 space-y-3">
          <textarea
            value={note}
            rows={3}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="context, source, why the pond needs it"
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
          />
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="contact (optional, only seen by admins)"
            className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
          />
        </div>
      </details>

      <Turnstile onToken={setToken} onExpire={() => setToken('')} />

      <button
        type="submit"
        disabled={busy || !preview}
        className="w-full rounded-full bg-accent px-4 py-3 font-medium text-accent-ink disabled:opacity-50"
      >
        {busy ? 'Uploading…' : 'Submit for review'}
      </button>
    </form>
  )
}
