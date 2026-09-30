import type { BufoExt } from '@bufo/shared'

export const SITE_NAME = 'Bufo Club'
export const SITE_TAGLINE = 'There’s a Bufo for that.'

export type PageMeta = {
  title: string
  description: string
  canonical: string
  image?: string
  imageAlt?: string
  /** JSON-LD graph, serialised into the page. */
  jsonLd?: unknown
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * The SPA ships one static `index.html`, so every route would otherwise share
 * a single title and description. This rewrites the head per request, which is
 * what a crawler that does not run JavaScript ends up indexing.
 */
export function metaTags(meta: PageMeta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ]

  if (meta.image) {
    tags.push(`<meta property="og:image" content="${escapeHtml(meta.image)}" />`)
    tags.push(`<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`)
    if (meta.imageAlt) {
      tags.push(`<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`)
    }
  }

  if (meta.jsonLd) {
    // JSON-LD is how an answer engine reads the page without guessing at markup.
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c')}</script>`,
    )
  }

  return tags.join('\n    ')
}

/**
 * Crawlers that do not execute JavaScript need the answer in the HTML itself.
 * This block is visually hidden but present in the served markup, and it says
 * the same thing the rendered page does.
 */
export function crawlerContent(heading: string, body: string, links: string[] = []): string {
  const list = links.length ? `<ul>${links.map((link) => `<li>${link}</li>`).join('')}</ul>` : ''
  return `<div id="crawler-content" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"><h1>${escapeHtml(heading)}</h1><p>${escapeHtml(body)}</p>${list}</div>`
}

export type BufoSeoInput = {
  slug: string
  title: string
  ext: BufoExt
  width: number
  height: number
  isAnimated: boolean
  credit: string | null
  sourceUrl: string | null
  tags: string[]
  createdAt: number
}

export function bufoPageMeta(bufo: BufoSeoInput, origin: string, cdnBase: string): PageMeta {
  const imageUrl = `${cdnBase}/b/${bufo.slug}.${bufo.ext}`
  const canonical = `${origin}/b/${bufo.slug}`
  const kind = bufo.isAnimated ? 'animated GIF' : `${bufo.ext.toUpperCase()} emoji`
  const tagLine = bufo.tags.length > 0 ? ` Tagged ${bufo.tags.join(', ')}.` : ''

  return {
    title: `:${bufo.slug}: — ${bufo.title} | ${SITE_NAME}`,
    description:
      `Download :${bufo.slug}:, a free ${bufo.width}×${bufo.height} bufo ${kind} for Slack and Discord.` +
      `${tagLine} Free to download at 128, 64 and 32 pixels.`,
    canonical,
    image: imageUrl,
    imageAlt: bufo.title,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ImageObject',
          '@id': canonical,
          name: bufo.title,
          alternateName: `:${bufo.slug}:`,
          description: `${bufo.title}, a bufo emoji for Slack and Discord.`,
          contentUrl: imageUrl,
          thumbnailUrl: imageUrl,
          encodingFormat: `image/${bufo.ext}`,
          width: { '@type': 'QuantitativeValue', value: bufo.width, unitCode: 'E37' },
          height: { '@type': 'QuantitativeValue', value: bufo.height, unitCode: 'E37' },
          keywords: bufo.tags.join(', ') || undefined,
          creditText: bufo.credit ?? undefined,
          isBasedOn: bufo.sourceUrl ?? undefined,
          uploadDate: new Date(bufo.createdAt * 1000).toISOString(),
          isPartOf: { '@type': 'CollectionPage', '@id': `${origin}/`, name: SITE_NAME },
          license: `${origin}/about`,
          acquireLicensePage: `${origin}/about`,
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: SITE_NAME, item: `${origin}/` },
            { '@type': 'ListItem', position: 2, name: `:${bufo.slug}:`, item: canonical },
          ],
        },
      ],
    },
  }
}

export function homePageMeta(origin: string, count: number): PageMeta {
  return {
    title: `${SITE_NAME} — search and download every bufo emoji`,
    description:
      `Search ${count.toLocaleString()} bufo emoji and download them free for Slack and Discord. ` +
      'Make your own bufo variants from any picture, no account needed.',
    canonical: `${origin}/`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${origin}/#website`,
          url: `${origin}/`,
          name: SITE_NAME,
          description: `A searchable library of ${count.toLocaleString()} bufo emoji, free to download.`,
          inLanguage: 'en',
          potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${origin}/?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@type': 'CollectionPage',
          '@id': `${origin}/#collection`,
          url: `${origin}/`,
          name: `${SITE_NAME} — the bufo emoji library`,
          isPartOf: { '@id': `${origin}/#website` },
          about: {
            '@type': 'Thing',
            name: 'Bufo emoji',
            description:
              'Bufo, also known as Froge or Concerned Frog, is a set of frog emoji used in Slack and Discord.',
          },
        },
      ],
    },
  }
}

export const ROBOTS_TXT = (origin: string) => `# ${SITE_NAME} — every bufo is free to download.
User-agent: *
Allow: /
Disallow: /admin

# Answer engines are welcome: this library exists to be found and cited.
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: Applebot-Extended
Allow: /
User-agent: CCBot
Allow: /

Sitemap: ${origin}/sitemap.xml
`

export const LLMS_TXT = (origin: string, count: number) => `# ${SITE_NAME}

> A searchable library of ${count.toLocaleString()} bufo emoji — the frog reaction
> images used across Slack and Discord — free to download, plus a generator for
> making your own variants.

Bufo (also called Froge or Concerned Frog) is a family of frog emoji that grew out
of Discord and Slack communities. Each bufo has a name like \`:bufo-party:\` and is
a small square PNG or GIF, sized for use as a custom emoji.

## What you can do here

- Search every bufo by name or tag and download it at 128, 64 or 32 pixels.
- Make custom variants — drop a picture into a template to get \`:bufo-offers-x:\`,
  \`:bufo-takes-x:\`, \`:old-bufo-yells-at-x:\` or \`:bufo-thinks-about-x:\`.
- Submit a bufo of your own; an admin reviews every upload before it appears.

## Pages

- [Browse and search](${origin}/): the full library.
- [Make a bufo](${origin}/make): generate variants from any image, in the browser.
- [Upload a bufo](${origin}/upload): submit one for review.
- [About, credits and takedowns](${origin}/about): where the bufos come from.

## Data

- Every bufo has a page at \`${origin}/b/<slug>\`, e.g. \`${origin}/b/bufo-party\`.
- Images are served from \`https://cdn.bufo.club/b/<slug>.<ext>\`.
- The whole index is one JSON document: \`https://cdn.bufo.club/manifest/latest.json\`
  (fields are abbreviated: \`s\` slug, \`t\` title, \`e\` extension, \`w\`/\`h\` size,
  \`g\` tags, \`a\` animated, \`c\` credit).
- Per-bufo JSON: \`${origin}/api/bufos/<slug>\`.

## Credit

The starting library comes from github.com/knobiknows/all-the-bufo. Every entry
keeps its credit and source URL, and anything reported as a copyright issue is
removed on request.
`
