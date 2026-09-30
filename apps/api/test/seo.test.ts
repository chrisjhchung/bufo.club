import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { bufoPageMeta, crawlerContent, metaTags } from '../src/lib/seo'
import { buildSitemap } from '../src/routes/pages'
import { pngBytes, stubTurnstile, submissionForm } from './helpers'

async function publish(title: string, slug: string, salt: string, tags: string[] = []) {
  stubTurnstile()
  const submission = await SELF.fetch('https://bufo.club/api/submissions', {
    method: 'POST',
    body: submissionForm({ title }, new Blob([pngBytes(128, 128, salt)])),
    headers: { 'CF-Connecting-IP': `10.7.0.${salt.charCodeAt(0) % 200}` },
  })
  const { id } = await submission.json<{ id: string }>()
  await SELF.fetch(`https://bufo.club/api/admin/bufos/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, title, tags }),
  })
  return id
}

/**
 * The pool's asset router answers before the Worker, so `run_worker_first` is
 * not exercised by SELF. Going through the app directly tests the handler the
 * deployed Worker runs for these paths.
 */
async function fetchPage(path: string) {
  const ctx = createExecutionContext()
  const response = await app.fetch(new Request(`https://bufo.club${path}`), env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('metaTags', () => {
  it('escapes values so a title cannot break out of the markup', () => {
    const html = metaTags({
      title: 'Bufo "quote" <script>',
      description: 'A & B',
      canonical: 'https://bufo.club/b/x',
    })
    expect(html).toContain('&quot;quote&quot;')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
    expect(html).not.toContain('<script>')
  })

  it('escapes the closing tag inside JSON-LD', () => {
    const html = metaTags({
      title: 't',
      description: 'd',
      canonical: 'https://bufo.club/',
      jsonLd: { name: '</script><script>alert(1)</script>' },
    })
    expect(html).not.toContain('</script><script>alert(1)')
    expect(html).toContain('\\u003c/script')
  })
})

describe('bufoPageMeta', () => {
  it('describes the bufo and points at the real image', () => {
    const meta = bufoPageMeta(
      {
        slug: 'bufo-party',
        title: 'Bufo party',
        ext: 'gif',
        width: 128,
        height: 128,
        isAnimated: true,
        credit: 'knobiknows/all-the-bufo',
        sourceUrl: 'https://github.com/knobiknows/all-the-bufo',
        tags: ['party', 'dance'],
        createdAt: 1700000000,
      },
      'https://bufo.club',
      'https://cdn.bufo.club',
    )
    expect(meta.title).toBe(':bufo-party: — Bufo party | Bufo Club')
    expect(meta.canonical).toBe('https://bufo.club/b/bufo-party')
    expect(meta.image).toBe('https://cdn.bufo.club/b/bufo-party.gif')
    expect(meta.description).toContain('animated GIF')
    expect(meta.description).toContain('party, dance')
  })
})

describe('buildSitemap', () => {
  it('lists the static pages and every bufo', () => {
    const xml = buildSitemap([{ slug: 'bufo-party', createdAt: 1700000000 }], 'https://bufo.club')
    expect(xml).toContain('<loc>https://bufo.club/</loc>')
    expect(xml).toContain('<loc>https://bufo.club/make</loc>')
    expect(xml).toContain('<loc>https://bufo.club/b/bufo-party</loc>')
    expect(xml).toContain('<lastmod>2023-11-14</lastmod>')
    expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9')
  })

  it('escapes slugs into valid URLs', () => {
    expect(buildSitemap([{ slug: 'bufo&co', createdAt: 0 }], 'https://bufo.club')).toContain(
      '/b/bufo%26co',
    )
  })
})

describe('crawlerContent', () => {
  it('is present in the markup but out of the way visually', () => {
    const html = crawlerContent('Heading', 'Body text', ['<a href="/x">link</a>'])
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toContain('clip:rect(0 0 0 0)')
  })
})

describe('crawler routes', () => {
  it('serves robots.txt pointing at the sitemap and welcoming answer engines', async () => {
    const response = await fetchPage('/robots.txt')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('Sitemap:')
    expect(body).toContain('User-agent: ClaudeBot')
    expect(body).toContain('User-agent: GPTBot')
    expect(body).toContain('Disallow: /admin')
  })

  it('serves llms.txt describing the site for agents', async () => {
    const response = await fetchPage('/llms.txt')
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('# Bufo Club')
    expect(body).toContain('manifest/latest.json')
  })

  it('renders a bufo page with its own title, description and JSON-LD', async () => {
    await publish('Bufo seo', 'bufo-seo', 'seo', ['party'])

    const response = await fetchPage('/b/bufo-seo')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')

    // A redirect here would mean the asset shell was served instead of the page.
    expect(response.redirected).toBe(false)
    expect(response.status).not.toBe(307)

    const html = await response.text()
    expect(html).toContain('<title>:bufo-seo: — Bufo seo | Bufo Club</title>')
    expect(html).toContain('<link rel="canonical" href="https://bufo.club/b/bufo-seo" />')
    expect(html).toContain('"@type":"ImageObject"')
    expect(html).toContain('"@type":"BreadcrumbList"')
    // The crawler summary carries the same claim as the rendered page.
    expect(html).toContain('a free bufo emoji for Slack and Discord')
    // Exactly one title survives the rewrite.
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  it('returns 404 for an unknown bufo but still serves the app shell', async () => {
    const response = await fetchPage('/b/not-a-real-bufo')
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('There is no bufo called not-a-real-bufo')
  })

  it('serves a sitemap containing approved bufos', async () => {
    await publish('Bufo mapped', 'bufo-mapped', 'map')
    const response = await fetchPage('/sitemap.xml')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('/b/bufo-mapped')
  })
})
