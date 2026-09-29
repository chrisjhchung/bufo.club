export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const text = await response.text()
  const body = text ? (JSON.parse(text) as unknown) : null

  if (!response.ok) {
    const payload = body as { error?: string; details?: unknown } | null
    throw new ApiError(
      response.status,
      payload?.error ?? `request failed (${response.status})`,
      payload?.details,
    )
  }
  return body as T
}

export type SubmissionResult = { id: string; status: 'pending'; tags: string[] }

export function submitBufo(form: FormData): Promise<SubmissionResult> {
  return request<SubmissionResult>('/api/submissions', { method: 'POST', body: form })
}

export function reportBufo(payload: {
  slug: string
  reason: string
  note?: string
  turnstileToken: string
}): Promise<{ id: string }> {
  return request('/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export type QueueEntry = {
  id: string
  title: string
  ext: string
  width: number
  height: number
  bytes: number
  isAnimated: boolean
  source: string
  credit: string | null
  note: string | null
  contact: string | null
  createdAt: number
  previewUrl: string
}

export const admin = {
  me: () => request<{ email: string }>('/api/admin/me'),

  queue: () =>
    request<{ counts: Record<string, number>; pending: QueueEntry[] }>('/api/admin/queue'),

  approve: (
    id: string,
    payload: { slug: string; title: string; tags: string[]; credit?: string },
  ) =>
    request<{ slug: string; url: string; manifestCount: number }>(
      `/api/admin/bufos/${id}/approve`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      },
    ),

  reject: (id: string, reason: string) =>
    request<{ ok: true }>(`/api/admin/bufos/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    }),

  remove: (id: string) => request<{ ok: true }>(`/api/admin/bufos/${id}`, { method: 'DELETE' }),

  rebuildManifest: () =>
    request<{ count: number; generatedAt: number }>('/api/admin/rebuild-manifest', {
      method: 'POST',
    }),

  templates: () =>
    request<{
      templates: {
        slug: string
        name: string
        namePattern: string
        baseKey: string
        overlayKey?: string
        canvas: { w: number; h: number }
        slot: {
          x: number
          y: number
          w: number
          h: number
          rotate: number
          fit: 'contain' | 'cover'
        }
        status: 'active' | 'hidden'
      }[]
    }>('/api/admin/templates'),

  saveTemplate: (form: FormData) =>
    request<{ slug: string }>('/api/admin/templates', { method: 'POST', body: form }),

  deleteTemplate: (slug: string) =>
    request<{ ok: true }>(`/api/admin/templates/${slug}`, { method: 'DELETE' }),

  reports: () =>
    request<{
      reports: {
        id: string
        slug: string
        reason: string
        note: string | null
        created_at: number
      }[]
    }>('/api/admin/reports'),

  resolveReport: (id: string) =>
    request<{ ok: true }>(`/api/admin/reports/${id}/resolve`, { method: 'POST' }),

  audit: () =>
    request<{
      entries: {
        id: string
        actor_email: string
        action: string
        target_id: string | null
        created_at: number
      }[]
    }>('/api/admin/audit'),
}
