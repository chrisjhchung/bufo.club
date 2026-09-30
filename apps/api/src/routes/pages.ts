import { cdnUrl, R2_KEYS } from '@bufo/shared'
import { Hono } from 'hono'
import { getApprovedBufoBySlug, listApprovedForManifest } from '../lib/db'
import {
  type BufoSeoInput,
  bufoPageMeta,
  crawlerContent,
  LLMS_TXT,
  metaTags,
  ROBOTS_TXT,
  SITE_NAME,
} from '../lib/seo'
import type { AppBindings, Env } from '../types'

export const pageRoutes = new Hono<AppBindings>()

const siteOrigin = (env: Env, url: string) => env.SITE_ORIGIN || new URL(url).origin

/**
 * Serve the SPA shell with this page's own metadata written into the head.
 * The markup the crawler reads and the page a person sees describe the same
 * thing; only the head and a visually hidden summary are added here.
 */
async function renderShell(
  env: Env,
  request: Request,
  meta: Parameters<typeof metaTags>[0],
  crawler: string,
  status = 200,
): Promise<Response> {
  // Ask for '/' rather than '/index.html': the asset server normalises the
  // latter with a 307 back to the root, which would be served as the page.
  const shell = await env.ASSETS.fetch(new URL('/', request.url).toString())
  if (!shell.ok) return shell

  const rewritten = new HTMLRewriter()
    // Drop the static defaults so they cannot compete with the real values.
    .on('title', {
      element: (element) => {
        element.remove()
      },
    })
    .on('meta[name="description"]', {
      element: (element) => {
        element.remove()
      },
    })
    .on('meta[property^="og:"]', {
      element: (element) => {
        element.remove()
      },
    })
    .on('link[rel="canonical"]', {
      element: (element) => {
        element.remove()
      },
    })
    .on('head', {
      element: (element) => {
        element.append(`\n    ${metaTags(meta)}\n  `, { html: true })
      },
    })
    .on('body', {
      element: (element) => {
        element.prepend(crawler, { html: true })
      },
    })
    .transform(shell)

  const headers = new Headers(rewritten.headers)
  headers.set('content-type', 'text/html; charset=utf-8')
  // Long enough that crawlers and repeat visits are cheap, short enough that an
  // approval shows up the same day.
  headers.set('cache-control', 'public, max-age=0, s-maxage=600')
  return new Response(rewritten.body, { status, headers })
}

pageRoutes.get('/b/:slug', async (c) => {
  const slug = c.req.param('slug')
  const origin = siteOrigin(c.env, c.req.url)
  const bufo = await getApprovedBufoBySlug(c.env.DB, slug)

  if (!bufo || !bufo.slug) {
    return renderShell(
      c.env,
      c.req.raw,
      {
        title: `Not found | ${SITE_NAME}`,
        description: 'That bufo is not in the pond.',
        canonical: `${origin}/b/${slug}`,
      },
      crawlerContent('Bufo not found', `There is no bufo called ${slug}.`),
      404,
    )
  }

  const { results } = await c.env.DB.prepare(
    `SELECT t.name AS name FROM bufo_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.bufo_id = ?1`,
  )
    .bind(bufo.id)
    .all<{ name: string }>()

  const seo: BufoSeoInput = {
    slug: bufo.slug,
    title: bufo.title,
    ext: bufo.ext,
    width: bufo.width,
    height: bufo.height,
    isAnimated: bufo.is_animated === 1,
    credit: bufo.credit,
    sourceUrl: bufo.source_url,
    tags: results.map((row) => row.name),
    createdAt: bufo.created_at,
  }

  const meta = bufoPageMeta(seo, origin, c.env.CDN_BASE)
  const crawler = crawlerContent(
    `:${seo.slug}: — ${seo.title}`,
    `${seo.title} is a free bufo emoji for Slack and Discord, ${seo.width} by ${seo.height} pixels` +
      `${seo.isAnimated ? ', animated' : ''}. Download it at 128, 64 or 32 pixels.` +
      `${seo.credit ? ` Credit: ${seo.credit}.` : ''}`,
    [
      `<a href="${cdnUrl(c.env.CDN_BASE, `b/${seo.slug}.${seo.ext}`)}">Download :${seo.slug}:</a>`,
      `<a href="${origin}/">Browse every bufo</a>`,
      ...seo.tags.map(
        (tag) => `<a href="${origin}/?tag=${encodeURIComponent(tag)}">${tag} bufos</a>`,
      ),
    ],
  )

  return renderShell(c.env, c.req.raw, meta, crawler)
})

pageRoutes.get('/robots.txt', (c) =>
  c.text(ROBOTS_TXT(siteOrigin(c.env, c.req.url)), 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  }),
)

pageRoutes.get('/llms.txt', async (c) => {
  const origin = siteOrigin(c.env, c.req.url)
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM bufos WHERE status = 'approved'",
  ).first<{ n: number }>()
  return c.text(LLMS_TXT(origin, count?.n ?? 0), 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  })
})

pageRoutes.get('/sitemap.xml', async (c) => {
  // Written to R2 whenever the index is rebuilt; generated on demand if missing.
  const stored = await c.env.ASSETS_BUCKET.get(R2_KEYS.sitemap)
  if (stored) {
    return new Response(stored.body, {
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
      },
    })
  }

  const { bufos } = await listApprovedForManifest(c.env.DB)
  const xml = buildSitemap(
    bufos.map((bufo) => ({ slug: bufo.slug!, createdAt: bufo.created_at })),
    siteOrigin(c.env, c.req.url),
  )
  return c.text(xml, 200, {
    'content-type': 'application/xml; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  })
})

export function buildSitemap(bufos: { slug: string; createdAt: number }[], origin: string): string {
  const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10)
  const urls = [
    `<url><loc>${origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${origin}/make</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`,
    `<url><loc>${origin}/upload</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    `<url><loc>${origin}/about</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...bufos.map(
      (bufo) =>
        `<url><loc>${origin}/b/${encodeURIComponent(bufo.slug)}</loc>` +
        `<lastmod>${day(bufo.createdAt)}</lastmod>` +
        `<changefreq>yearly</changefreq><priority>0.6</priority></url>`,
    ),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}
