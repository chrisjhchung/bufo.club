import { useState } from 'react'
import { ApiError, reportBufo } from '../lib/api'
import { useToast } from './Toast'
import { Turnstile } from './Turnstile'

const REASONS = [
  { value: 'copyright', label: 'It is my artwork / copyright' },
  { value: 'nsfw', label: 'Not safe for work' },
  { value: 'duplicate', label: 'Duplicate of another bufo' },
  { value: 'broken', label: 'Broken or corrupt image' },
  { value: 'other', label: 'Something else' },
]

export function ReportDialog({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [reason, setReason] = useState('copyright')
  const [note, setNote] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const { show } = useToast()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!token) {
      show('Please complete the captcha', 'error')
      return
    }
    setBusy(true)
    try {
      await reportBufo({ slug, reason, note: note || undefined, turnstileToken: token })
      show('Report sent — thank you')
      onClose()
    } catch (error) {
      show(error instanceof ApiError ? error.message : 'could not send report', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-line p-4 text-sm">
      <p className="font-semibold">Report {slug}</p>
      <label className="block">
        <span className="mb-1 block text-ink-soft">Reason</span>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
        >
          {REASONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-ink-soft">Anything else? (optional)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-line bg-transparent px-3 py-2"
        />
      </label>
      <Turnstile onToken={setToken} onExpire={() => setToken('')} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" onClick={onClose} className="rounded-full px-4 py-2 hover:underline">
          Cancel
        </button>
      </div>
    </form>
  )
}
