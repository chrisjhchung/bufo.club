export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export type Env = {
  DB: D1Database
  /** The static asset store, read so pages can be served with real metadata. */
  ASSETS: Fetcher
  ASSETS_BUCKET: R2Bucket
  PENDING_BUCKET: R2Bucket
  SUBMIT_LIMITER: RateLimiter
  REPORT_LIMITER: RateLimiter

  ENVIRONMENT: 'dev' | 'test' | 'staging' | 'production'
  /** Public origin serving the assets bucket, e.g. https://cdn.bufo.club */
  CDN_BASE: string
  /** Canonical site origin, used for canonical URLs and the sitemap. */
  SITE_ORIGIN: string
  /** <team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN: string
  /** Audience tag of the Access application protecting /admin */
  ACCESS_AUD: string
  /** Comma-separated allowlist, checked in addition to the Access policy */
  ADMIN_EMAILS: string
  /** Local-only escape hatch; ignored outside ENVIRONMENT=dev */
  DEV_ADMIN_EMAIL: string

  TURNSTILE_SECRET: string
}

export type AppBindings = {
  Bindings: Env
  Variables: { adminEmail: string }
}
