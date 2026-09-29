import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { forbidden } from '../lib/http'
import type { AppBindings, Env } from '../types'

type Jwk = JsonWebKey & { kid: string }

type JwksCache = { keys: Jwk[]; fetchedAt: number }

const JWKS_TTL_MS = 60 * 60 * 1000
let jwksCache: JwksCache | null = null

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const decodeJson = <T>(segment: string): T =>
  JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T

async function getJwks(env: Env): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys

  let keys: Jwk[] | undefined
  try {
    const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)
    if (!response.ok) forbidden('unable to fetch Access signing keys')
    keys = ((await response.json()) as { keys?: Jwk[] }).keys
  } catch (error) {
    // A network failure must deny the request, never fall through to the
    // handler, and never surface as an opaque 500.
    if (error instanceof HTTPException) throw error
    forbidden('unable to reach the Access signing keys')
  }
  if (!keys?.length) forbidden('Access signing keys missing')
  jwksCache = { keys, fetchedAt: Date.now() }
  return keys
}

/** Test seam: lets the suite install keys without reaching the network. */
export function __setJwksCacheForTests(keys: Jwk[] | null): void {
  jwksCache = keys ? { keys, fetchedAt: Date.now() } : null
}

type AccessClaims = {
  aud?: string | string[]
  email?: string
  exp?: number
  iss?: string
}

/**
 * Validate the JWT that Cloudflare Access stamps on every request it lets
 * through. Access already blocks unauthenticated traffic at the edge, but a
 * Worker is also reachable at its *.workers.dev hostname, where no Access
 * policy applies — so the token is verified here rather than trusted.
 */
export async function verifyAccessJwt(env: Env, token: string): Promise<string> {
  const [headerSegment, payloadSegment, signatureSegment] = token.split('.')
  if (!headerSegment || !payloadSegment || !signatureSegment) forbidden('malformed Access token')

  const header = decodeJson<{ kid?: string; alg?: string }>(headerSegment)
  if (header.alg !== 'RS256') forbidden('unexpected Access token algorithm')

  const jwk = (await getJwks(env)).find((key) => key.kid === header.kid)
  if (!jwk) forbidden('unknown Access signing key')

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const signed = new TextEncoder().encode(`${headerSegment}.${payloadSegment}`)
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    base64UrlToBytes(signatureSegment),
    signed,
  )
  if (!valid) forbidden('Access token signature invalid')

  const claims = decodeJson<AccessClaims>(payloadSegment)
  const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []
  if (!env.ACCESS_AUD || !audiences.includes(env.ACCESS_AUD))
    forbidden('Access token audience mismatch')
  if (claims.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) forbidden('Access token issuer mismatch')
  if (!claims.exp || claims.exp * 1000 <= Date.now()) forbidden('Access token expired')
  if (!claims.email) forbidden('Access token carries no identity')

  return claims.email.toLowerCase()
}

export function adminEmails(env: Env): string[] {
  return env.ADMIN_EMAILS.split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Gate for every /api/admin route. In `dev` only, DEV_ADMIN_EMAIL stands in for
 * a real Access session so the admin UI is usable with `wrangler dev`.
 */
export const requireAdmin = createMiddleware<AppBindings>(async (c, next) => {
  const env = c.env

  if (env.ENVIRONMENT === 'dev' && env.DEV_ADMIN_EMAIL) {
    c.set('adminEmail', env.DEV_ADMIN_EMAIL.toLowerCase())
    return next()
  }

  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c.req.header('Cookie'), 'CF_Authorization')
  if (!token) forbidden('Cloudflare Access session required')

  const email = await verifyAccessJwt(env, token)
  const allowlist = adminEmails(env)
  if (allowlist.length > 0 && !allowlist.includes(email)) forbidden(`${email} is not an admin`)

  c.set('adminEmail', email)
  return next()
})

function getCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}
