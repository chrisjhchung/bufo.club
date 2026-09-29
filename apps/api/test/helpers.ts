import { fetchMock } from 'cloudflare:test'

/** Minimal valid PNG header + IHDR + IDAT, with a tweakable pixel payload. */
export function pngBytes(width = 128, height = 128, salt = 'a'): Uint8Array {
  const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const be32 = (value: number) => [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]
  const chunk = (type: string, body: number[]) => {
    bytes.push(...be32(body.length))
    for (const char of type) bytes.push(char.charCodeAt(0))
    bytes.push(...body)
    bytes.push(0, 0, 0, 0)
  }
  chunk('IHDR', [...be32(width), ...be32(height), 8, 6, 0, 0, 0])
  chunk(
    'IDAT',
    [...salt].map((char) => char.charCodeAt(0)),
  )
  return new Uint8Array(bytes)
}

export function submissionForm(
  overrides: Partial<Record<string, string>> = {},
  file?: Blob | null,
  filename = 'bufo.png',
): FormData {
  const form = new FormData()
  form.set('title', 'Bufo test')
  form.set('tags', 'test, party')
  form.set('turnstileToken', 'token-ok')
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) form.delete(key)
    else form.set(key, value)
  }
  if (file !== null) {
    form.set('file', file ?? new Blob([pngBytes()], { type: 'image/png' }), filename)
  }
  return form
}

/** Always-pass Turnstile stub, for tests that fire many requests. */
export function stubTurnstileAlways(): void {
  fetchMock
    .get('https://challenges.cloudflare.com')
    .intercept({ path: '/turnstile/v0/siteverify', method: 'POST' })
    .reply(200, { success: true })
    .persist()
}

/** Queue one Turnstile siteverify response. */
export function stubTurnstile(success = true): void {
  fetchMock
    .get('https://challenges.cloudflare.com')
    .intercept({ path: '/turnstile/v0/siteverify', method: 'POST' })
    .reply(200, { success, 'error-codes': success ? [] : ['invalid-input-response'] })
}

/** Stub the Access JWKS endpoint with a key set that signs nothing useful. */
export function stubAccessCerts(keys: unknown[] = []): void {
  fetchMock
    .get('https://bufo.cloudflareaccess.com')
    .intercept({ path: '/cdn-cgi/access/certs', method: 'GET' })
    .reply(200, { keys })
    .persist()
}
