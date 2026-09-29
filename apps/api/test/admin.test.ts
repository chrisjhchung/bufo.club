import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test'
import type { Manifest } from '@bufo/shared'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { pngBytes, stubAccessCerts, stubTurnstile, submissionForm } from './helpers'

async function submit(title: string, salt: string) {
  stubTurnstile()
  const response = await SELF.fetch('https://bufo.club/api/submissions', {
    method: 'POST',
    body: submissionForm({ title, tags: 'frog, cute' }, new Blob([pngBytes(128, 128, salt)])),
    headers: { 'CF-Connecting-IP': `10.1.${salt.length}.${salt.charCodeAt(0) % 200}` },
  })
  expect(response.status).toBe(201)
  return (await response.json<{ id: string }>()).id
}

const adminFetch = (path: string, init?: RequestInit) =>
  SELF.fetch(`https://bufo.club/api/admin${path}`, init)

async function readManifest(): Promise<Manifest> {
  const object = await env.ASSETS_BUCKET.get('manifest/latest.json')
  expect(object).not.toBeNull()
  return JSON.parse(await object!.text()) as Manifest
}

/**
 * Hit the Worker with the dev bypass switched off, the way it runs in
 * production: the only way in is a valid Cloudflare Access token.
 */
async function fetchAsProduction(path: string, init?: RequestInit) {
  const ctx = createExecutionContext()
  const response = await app.fetch(
    new Request(`https://bufo.club/api/admin${path}`, init),
    { ...env, ENVIRONMENT: 'production', DEV_ADMIN_EMAIL: '' },
    ctx,
  )
  await waitOnExecutionContext(ctx)
  return response
}

describe('admin gate', () => {
  it('refuses requests with no Access token outside dev', async () => {
    const response = await fetchAsProduction('/queue')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'Cloudflare Access session required' })
  })

  it('refuses a token that is not a JWT', async () => {
    const response = await fetchAsProduction('/queue', {
      headers: { 'Cf-Access-Jwt-Assertion': 'not-a-jwt' },
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'malformed Access token' })
  })

  it('refuses a syntactically valid token signed by nobody', async () => {
    stubAccessCerts([{ kid: 'real-key', kty: 'RSA', alg: 'RS256', n: 'x', e: 'AQAB' }])
    const fake = [
      btoa(JSON.stringify({ alg: 'RS256', kid: 'unknown' })),
      btoa(JSON.stringify({ aud: 'test-aud', email: 'attacker@example.com' })),
      'c2lnbmF0dXJl',
    ].join('.')
    const response = await fetchAsProduction('/queue', {
      headers: { 'Cf-Access-Jwt-Assertion': fake },
    })
    expect(response.status).toBe(403)
  })

  it('identifies the reviewer in dev', async () => {
    expect(await (await adminFetch('/me')).json()).toEqual({ email: 'admin@bufo.club' })
  })
})

describe('review queue', () => {
  it('lists pending submissions and serves their private previews', async () => {
    const id = await submit('Bufo reviews', 'queue')
    const queue = await (await adminFetch('/queue')).json<{
      counts: Record<string, number>
      pending: { id: string; previewUrl: string }[]
    }>()

    const entry = queue.pending.find((row) => row.id === id)
    expect(entry).toBeDefined()
    expect(queue.counts.pending).toBeGreaterThan(0)

    const preview = await SELF.fetch(`https://bufo.club/api${entry!.previewUrl.slice(4)}`)
    expect(preview.status).toBe(200)
    expect(preview.headers.get('content-type')).toBe('image/png')
    expect(preview.headers.get('cache-control')).toBe('private, max-age=60')
  })
})

describe('approval', () => {
  it('publishes the image, tags it and rebuilds the manifest', async () => {
    const id = await submit('Bufo approves', 'approve')

    const response = await adminFetch(`/bufos/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        slug: 'Bufo Approves!',
        title: 'Bufo approves',
        tags: ['yes', 'thumbs-up'],
        credit: 'someone nice',
      }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
    const body = await response.json<{ slug: string; url: string }>()
    expect(body.slug).toBe('bufo-approves')
    expect(body.url).toBe('https://cdn.test/b/bufo-approves.png')

    // Image moved from the private bucket to the public one.
    expect(await env.PENDING_BUCKET.get(`pending/${id}.png`)).toBeNull()
    const published = await env.ASSETS_BUCKET.get('b/bufo-approves.png')
    expect(published).not.toBeNull()
    expect(published!.httpMetadata?.cacheControl).toBe('public, max-age=31536000, immutable')

    // Manifest carries the new bufo with its admin-set tags.
    const manifest = await readManifest()
    const entry = manifest.bufos.find((row) => row.s === 'bufo-approves')
    expect(entry).toMatchObject({ e: 'png', w: 128, h: 128, c: 'someone nice' })
    expect(entry?.g?.sort()).toEqual(['thumbs-up', 'yes'])
    // 'Bufo approves' is exactly the prettified slug, so no title is shipped.
    expect(entry?.t).toBeUndefined()

    // Public detail endpoint now resolves.
    const detail = await SELF.fetch('https://bufo.club/api/bufos/bufo-approves')
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({ slug: 'bufo-approves', credit: 'someone nice' })

    const audit = await env.DB.prepare(
      "SELECT action, actor_email FROM audit_log WHERE target_id = ?1 AND action = 'bufo.approve'",
    )
      .bind(id)
      .first()
    expect(audit).toMatchObject({ actor_email: 'admin@bufo.club' })
  })

  it('never lets two bufos share a slug', async () => {
    const first = await submit('Bufo twin', 'twin-a')
    const second = await submit('Bufo twin', 'twin-b')
    const approve = (id: string) =>
      adminFetch(`/bufos/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ slug: 'bufo-twin', title: 'Bufo twin', tags: [] }),
        headers: { 'content-type': 'application/json' },
      })

    expect((await (await approve(first)).json<{ slug: string }>()).slug).toBe('bufo-twin')
    expect((await (await approve(second)).json<{ slug: string }>()).slug).toBe('bufo-twin-2')
  })

  it('refuses to approve twice', async () => {
    const id = await submit('Bufo once', 'once')
    const payload = {
      method: 'POST',
      body: JSON.stringify({ slug: 'bufo-once', title: 'Bufo once', tags: [] }),
      headers: { 'content-type': 'application/json' },
    }
    expect((await adminFetch(`/bufos/${id}/approve`, payload)).status).toBe(200)
    expect((await adminFetch(`/bufos/${id}/approve`, payload)).status).toBe(409)
  })

  it('rejects an invalid slug', async () => {
    const id = await submit('Bufo bad slug', 'badslug')
    const response = await adminFetch(`/bufos/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ slug: '!!!', title: 'x', tags: [] }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(400)
  })
})

describe('rejection and deletion', () => {
  it('drops the pending object and records the reason', async () => {
    const id = await submit('Bufo rejected', 'reject')
    const response = await adminFetch(`/bufos/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'not a bufo' }),
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
    expect(await env.PENDING_BUCKET.get(`pending/${id}.png`)).toBeNull()
    expect(
      await env.DB.prepare('SELECT status, reject_reason FROM bufos WHERE id = ?1')
        .bind(id)
        .first(),
    ).toMatchObject({ status: 'rejected', reject_reason: 'not a bufo' })
  })

  it('removes an approved bufo from storage and the manifest', async () => {
    const id = await submit('Bufo doomed', 'doomed')
    await adminFetch(`/bufos/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ slug: 'bufo-doomed', title: 'Bufo doomed', tags: [] }),
      headers: { 'content-type': 'application/json' },
    })
    expect((await readManifest()).bufos.some((row) => row.s === 'bufo-doomed')).toBe(true)

    const response = await adminFetch(`/bufos/${id}`, { method: 'DELETE' })
    expect(response.status).toBe(200)
    expect(await env.ASSETS_BUCKET.get('b/bufo-doomed.png')).toBeNull()
    expect((await readManifest()).bufos.some((row) => row.s === 'bufo-doomed')).toBe(false)
    expect(await env.DB.prepare('SELECT id FROM bufos WHERE id = ?1').bind(id).first()).toBeNull()
  })
})

describe('reports', () => {
  it('accepts a takedown request and lists it for the admin', async () => {
    const id = await submit('Bufo reported', 'report')
    await adminFetch(`/bufos/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ slug: 'bufo-reported', title: 'Bufo reported', tags: [] }),
      headers: { 'content-type': 'application/json' },
    })

    stubTurnstile()
    const response = await SELF.fetch('https://bufo.club/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '10.5.5.5' },
      body: JSON.stringify({
        slug: 'bufo-reported',
        reason: 'copyright',
        note: 'this is my frog',
        turnstileToken: 'token-ok',
      }),
    })
    expect(response.status).toBe(201)

    const reports = await (await adminFetch('/reports')).json<{ reports: { slug: string }[] }>()
    expect(reports.reports.some((row) => row.slug === 'bufo-reported')).toBe(true)
  })
})
