import path from 'node:path'
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, '../../db/migrations'))

  return {
    test: {
      setupFiles: ['./test/setup.ts'],
      poolOptions: {
        workers: {
          singleWorker: true,
          // R2 + isolated storage trips an assertion in the pool; tests keep
          // themselves independent by using distinct image bytes instead.
          isolatedStorage: false,
          wrangler: { configPath: './wrangler.jsonc' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              ENVIRONMENT: 'dev',
              CDN_BASE: 'https://cdn.test',
              SITE_ORIGIN: 'https://bufo.club',
              ACCESS_TEAM_DOMAIN: 'bufo.cloudflareaccess.com',
              ACCESS_AUD: 'test-aud',
              ADMIN_EMAILS: 'admin@bufo.club',
              DEV_ADMIN_EMAIL: 'admin@bufo.club',
              TURNSTILE_SECRET: 'test-secret',
            },
          },
        },
      },
    },
  }
})
