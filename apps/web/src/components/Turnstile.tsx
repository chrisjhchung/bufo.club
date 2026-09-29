import { useEffect, useRef } from 'react'
import { TURNSTILE_SITEKEY } from '../lib/env'

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string
          theme?: 'auto' | 'light' | 'dark'
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_URL
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('could not load Turnstile'))
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/**
 * Turnstile widget. Uploads are anonymous, so this plus the Worker's rate limit
 * is what keeps the moderation queue from filling up with junk.
 */
export function Turnstile({
  onToken,
  onExpire,
}: {
  onToken: (token: string) => void
  onExpire?: () => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const widgetId = useRef<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-rendering the widget would reset a solved challenge
  useEffect(() => {
    let cancelled = false
    if (!TURNSTILE_SITEKEY) return

    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(container.current, {
          sitekey: TURNSTILE_SITEKEY,
          theme: 'auto',
          callback: onToken,
          'expired-callback': () => onExpire?.(),
          'error-callback': () => onExpire?.(),
        })
      })
      .catch(() => {
        // Leave the placeholder text visible; submitting will fail loudly.
      })

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
    }
  }, [])

  if (!TURNSTILE_SITEKEY) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        VITE_TURNSTILE_SITEKEY is not set, so uploads will be rejected.
      </p>
    )
  }

  return <div ref={container} className="min-h-[65px]" />
}
