import { useEffect, useState } from 'react'
import { ApiError, admin } from '../lib/api'
import { Queue } from './admin/Queue'
import { Templates } from './admin/Templates'

const TABS = ['queue', 'templates', 'reports', 'audit'] as const
type Tab = (typeof TABS)[number]

export function Admin() {
  const [email, setEmail] = useState<string | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('queue')

  // biome-ignore lint/correctness/useExhaustiveDependencies: one Access check per mount
  useEffect(() => {
    admin
      .me()
      .then((data) => setEmail(data.email))
      .catch((error: unknown) =>
        setDenied(error instanceof ApiError ? error.message : 'could not reach the admin API'),
      )
  }, [])

  if (denied) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="mt-2 text-sm text-ink-soft">{denied}</p>
        <p className="mt-4 text-sm text-ink-soft">
          This page sits behind Cloudflare Access. Open it from a browser signed in with an
          allow-listed email, or run the Worker locally with <code>DEV_ADMIN_EMAIL</code> set.
        </p>
      </div>
    )
  }

  if (!email)
    return <p className="py-16 text-center text-ink-soft">checking your Access session…</p>

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Pond control</h1>
        <span className="text-sm text-ink-soft">{email}</span>
      </header>

      <nav className="flex flex-wrap gap-1 text-sm">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className={`rounded-full px-3 py-1.5 capitalize ${
              tab === name ? 'bg-accent-soft text-ink' : 'hover:bg-sunk'
            }`}
          >
            {name}
          </button>
        ))}
      </nav>

      {tab === 'queue' && <Queue />}
      {tab === 'templates' && <Templates />}
      {tab === 'reports' && <Reports />}
      {tab === 'audit' && <Audit />}
    </div>
  )
}

function Reports() {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof admin.reports>>['reports']>([])

  const refresh = () => admin.reports().then((data) => setReports(data.reports))

  // biome-ignore lint/correctness/useExhaustiveDependencies: reports load once and refresh after each resolve
  useEffect(() => {
    void refresh()
  }, [])

  if (reports.length === 0) return <p className="py-8 text-sm text-ink-soft">No open reports.</p>

  return (
    <ul className="space-y-2 text-sm">
      {reports.map((report) => (
        <li
          key={report.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"
        >
          <span className="font-mono">{report.slug}</span>
          <span className="rounded-full bg-sunk px-2 py-0.5 text-xs">{report.reason}</span>
          {report.note && <span className="text-ink-soft">{report.note}</span>}
          <button
            type="button"
            className="ml-auto underline"
            onClick={async () => {
              await admin.resolveReport(report.id)
              await refresh()
            }}
          >
            Resolve
          </button>
        </li>
      ))}
    </ul>
  )
}

function Audit() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof admin.audit>>['entries']>([])

  useEffect(() => {
    admin.audit().then((data) => setEntries(data.entries))
  }, [])

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-ink-soft">
        <tr>
          <th className="py-2">when</th>
          <th>who</th>
          <th>action</th>
          <th>target</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id} className="border-t border-line">
            <td className="py-1.5">{new Date(entry.created_at * 1000).toLocaleString()}</td>
            <td>{entry.actor_email}</td>
            <td className="font-mono text-xs">{entry.action}</td>
            <td className="font-mono text-xs text-ink-soft">{entry.target_id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
