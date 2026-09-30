import {
  type Bufo,
  cdnUrl,
  decodeManifest,
  type Manifest,
  type ManifestTemplate,
  type Mosaic,
  R2_KEYS,
} from '@bufo/shared'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { CDN_BASE } from './env'

type ManifestState = {
  bufos: Bufo[]
  templates: ManifestTemplate[]
  mosaics: Mosaic[]
  bySlug: Map<string, Bufo>
  generatedAt: number
  loading: boolean
  error: string | null
  reload: () => void
}

const EMPTY: ManifestState = {
  bufos: [],
  templates: [],
  mosaics: [],
  bySlug: new Map(),
  generatedAt: 0,
  loading: true,
  error: null,
  reload: () => {},
}

const ManifestContext = createContext<ManifestState>(EMPTY)

/**
 * The whole library arrives as one static document from the CDN. Nothing else
 * in the gallery talks to the API, which is what keeps browsing free.
 */
export function ManifestProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the only intended refetch trigger
  useEffect(() => {
    let cancelled = false
    setError(null)

    fetch(cdnUrl(CDN_BASE, R2_KEYS.manifest), { mode: 'cors' })
      .then((response) => {
        if (!response.ok) throw new Error(`manifest unavailable (${response.status})`)
        return response.json() as Promise<Manifest>
      })
      .then((data) => {
        if (!cancelled) setManifest(data)
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message)
      })

    return () => {
      cancelled = true
    }
  }, [nonce])

  const value = useMemo<ManifestState>(() => {
    if (!manifest) {
      return { ...EMPTY, loading: !error, error, reload: () => setNonce((n) => n + 1) }
    }
    const decoded = decodeManifest(manifest)
    return {
      ...decoded,
      bySlug: new Map(decoded.bufos.map((bufo) => [bufo.slug, bufo])),
      loading: false,
      error: null,
      reload: () => setNonce((n) => n + 1),
    }
  }, [manifest, error])

  return <ManifestContext.Provider value={value}>{children}</ManifestContext.Provider>
}

export const useManifest = () => useContext(ManifestContext)

export function useBufo(slug: string | undefined): Bufo | undefined {
  const { bySlug } = useManifest()
  return slug ? bySlug.get(slug) : undefined
}
