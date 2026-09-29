import type { Env } from '../types'
import { forbidden } from './http'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verify a Turnstile token. Anonymous uploads are the whole point of the site,
 * so this plus the rate limiter is the only thing standing between the queue
 * and a bot, and a failure here must never fall open.
 */
export async function assertHuman(env: Env, token: string, ip: string | undefined): Promise<void> {
  const body = new FormData()
  body.append('secret', env.TURNSTILE_SECRET)
  body.append('response', token)
  if (ip) body.append('remoteip', ip)

  let outcome: { success?: boolean; 'error-codes'?: string[] }
  try {
    const response = await fetch(VERIFY_URL, { method: 'POST', body })
    outcome = await response.json()
  } catch {
    forbidden('captcha verification unavailable, please retry')
  }

  if (!outcome.success) {
    forbidden(`captcha rejected: ${(outcome['error-codes'] ?? ['unknown']).join(', ')}`)
  }
}
