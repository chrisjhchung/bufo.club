import { applyD1Migrations, env, fetchMock } from 'cloudflare:test'
import { afterEach, beforeAll } from 'vitest'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

beforeAll(() => {
  // Nothing in these tests should reach the real internet; Turnstile is stubbed
  // per-test with fetchMock instead.
  fetchMock.activate()
  fetchMock.disableNetConnect()
})

afterEach(() => {
  fetchMock.assertNoPendingInterceptors()
})
