import { useEffect, useRef, useState } from 'react'

export function useDebounced<T>(value: T, delay = 120): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const THEME_KEY = 'bufo-theme'

export function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored) return stored === 'dark'
    } catch {
      // Private browsing can throw on storage access; the default is fine.
    }
    return !window.matchMedia?.('(prefers-color-scheme: light)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      // Ignore: the class on <html> already applied.
    }
  }, [dark])

  return { dark, toggle: () => setDark((value) => !value) }
}

/** Fire `onVisible` when the returned ref scrolls into view. Used for paging. */
export function useOnVisible(onVisible: () => void, enabled = true) {
  const ref = useRef<HTMLDivElement | null>(null)
  const callback = useRef(onVisible)
  callback.current = onVisible

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) callback.current()
      },
      { rootMargin: '600px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  return ref
}

/**
 * Keep the document title and description in step with client-side navigation.
 * The Worker already serves correct metadata on first load for the routes that
 * matter to crawlers; this covers everything after that, so a link shared from
 * a page reached in-app is still described correctly.
 */
export function useDocumentMeta(title: string, description?: string) {
  useEffect(() => {
    document.title = title
    if (!description) return

    const tag = document.querySelector('meta[name="description"]')
    const previous = tag?.getAttribute('content')
    tag?.setAttribute('content', description)

    return () => {
      if (tag && previous) tag.setAttribute('content', previous)
    }
  }, [title, description])
}
