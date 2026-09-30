import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { adminRoutes } from './routes/admin'
import { pageRoutes } from './routes/pages'
import { publicRoutes } from './routes/public'
import type { AppBindings } from './types'

const app = new Hono<AppBindings>()

/**
 * Only /api/* reaches this Worker — wrangler's `run_worker_first` sends
 * everything else straight to the static asset store, so browsing the gallery
 * costs no Worker invocations.
 */
app.route('/api/admin', adminRoutes)
app.route('/api', publicRoutes)

// Crawler-facing routes: per-bufo pages rendered with real metadata, plus
// robots.txt, sitemap.xml and llms.txt. Everything else is a static asset.
app.route('/', pageRoutes)

app.notFound((c) => c.json({ error: `no route for ${c.req.method} ${c.req.path}` }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  console.error('unhandled error', error)
  return c.json({ error: 'internal error' }, 500)
})

export default app
