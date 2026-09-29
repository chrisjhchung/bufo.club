import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { pngBytes, stubTurnstile, stubTurnstileAlways, submissionForm } from './helpers'

const post = (form: FormData) =>
  SELF.fetch('https://bufo.club/api/submissions', {
    method: 'POST',
    body: form,
    headers: { 'CF-Connecting-IP': `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
  })

describe('POST /api/submissions', () => {
  it('accepts a PNG and parks it in the pending bucket', async () => {
    stubTurnstile()
    const response = await post(submissionForm({ title: 'Bufo waves' }))
    expect(response.status).toBe(201)

    const body = await response.json<{ id: string; status: string; tags: string[] }>()
    expect(body.status).toBe('pending')
    expect(body.tags).toEqual(['test', 'party'])

    const row = await env.DB.prepare('SELECT * FROM bufos WHERE id = ?1').bind(body.id).first()
    expect(row).toMatchObject({
      status: 'pending',
      ext: 'png',
      width: 128,
      height: 128,
      slug: null,
      source: 'submission',
      title: 'Bufo waves',
    })

    const object = await env.PENDING_BUCKET.get(`pending/${body.id}.png`)
    expect(object).not.toBeNull()

    // A pending bufo is invisible to the public: no slug, nothing in the
    // assets bucket, nothing an approval has not put there.
    expect(await env.ASSETS_BUCKET.list({ prefix: 'pending/' })).toMatchObject({ objects: [] })
  })

  it('rejects a second copy of identical bytes', async () => {
    stubTurnstile()
    const first = await post(
      submissionForm({ title: 'Bufo dupe' }, new Blob([pngBytes(64, 64, 'dupe')])),
    )
    expect(first.status).toBe(201)

    stubTurnstile()
    const second = await post(
      submissionForm({ title: 'Bufo dupe again' }, new Blob([pngBytes(64, 64, 'dupe')])),
    )
    expect(second.status).toBe(409)
    expect(await second.json()).toMatchObject({ details: { status: 'pending' } })
  })

  it('rejects text renamed to .png before spending a Turnstile call', async () => {
    stubTurnstile()
    const response = await post(
      submissionForm({}, new Blob([new TextEncoder().encode('totally a png, trust me')])),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'not a PNG, GIF or WebP image' })
  })

  it('rejects an oversized file', async () => {
    const huge = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)])
    const response = await post(submissionForm({}, huge))
    expect(response.status).toBe(413)
  })

  it('requires a captcha token', async () => {
    const response = await post(submissionForm({ turnstileToken: undefined }))
    expect(response.status).toBe(400)
    const body = await response.json<{ details: { path: string }[] }>()
    expect(body.details.some((issue) => issue.path === 'turnstileToken')).toBe(true)
  })

  it('refuses when Turnstile says no', async () => {
    stubTurnstile(false)
    const response = await post(submissionForm({}, new Blob([pngBytes(32, 32, 'nope')])))
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining('captcha rejected'),
    })
  })

  it('requires a file', async () => {
    const response = await post(submissionForm({}, null))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'no file attached' })
  })

  it('rate limits a single address', async () => {
    stubTurnstileAlways()
    const ip = '10.9.9.9'
    const statuses: number[] = []
    for (const salt of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const response = await SELF.fetch('https://bufo.club/api/submissions', {
        method: 'POST',
        body: submissionForm({}, new Blob([pngBytes(48, 48, `rl-${salt}`)])),
        headers: { 'CF-Connecting-IP': ip },
      })
      statuses.push(response.status)
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201])
    expect(statuses).toContain(429)
  })
})
