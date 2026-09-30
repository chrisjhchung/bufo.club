/**
 * Tell search engines the site exists, via IndexNow.
 *
 * A new domain with no inbound links has no way to be discovered: crawlers
 * arrive by following a link or by being told. IndexNow is the "being told"
 * half for Bing, Yandex, Seznam and Naver — one POST, no account, and it feeds
 * the indexes behind several AI answer engines. Google does not participate;
 * that still needs Search Console, which only the domain owner can do.
 *
 *   npx tsx scripts/submit-indexnow.ts            # all sitemap URLs
 *   npx tsx scripts/submit-indexnow.ts --limit 50
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const HOST = process.env.BUFO_HOST ?? 'bufo.club'
const ORIGIN = `https://${HOST}`
const PUBLIC_DIR = join(import.meta.dirname, '../apps/web/public')

/** The key is proved by serving it at `/<key>.txt`; that file is the source of truth. */
function findKey(): string {
  const file = readdirSync(PUBLIC_DIR).find((name) => /^[0-9a-f]{32}\.txt$/.test(name))
  if (!file) throw new Error(`no IndexNow key file in ${PUBLIC_DIR}`)
  return file.replace('.txt', '')
}

async function sitemapUrls(): Promise<string[]> {
  const response = await fetch(`${ORIGIN}/sitemap.xml`)
  if (!response.ok) throw new Error(`sitemap fetch failed: ${response.status}`)
  const xml = await response.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!)
}

async function main() {
  const key = findKey()
  const limitFlag = process.argv.indexOf('--limit')
  const limit = limitFlag > -1 ? Number(process.argv[limitFlag + 1]) : Number.POSITIVE_INFINITY

  // Confirm the key is actually reachable before claiming ownership with it.
  const keyCheck = await fetch(`${ORIGIN}/${key}.txt`)
  if (!keyCheck.ok || (await keyCheck.text()).trim() !== key) {
    throw new Error(`key file is not being served at ${ORIGIN}/${key}.txt — deploy first`)
  }

  const urls = (await sitemapUrls()).slice(0, limit)
  console.log(`submitting ${urls.length} URLs as ${key}`)

  const response = await fetch('https://api.indexnow.org/IndexNow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key,
      keyLocation: `${ORIGIN}/${key}.txt`,
      urlList: urls,
    }),
  })

  // 200 accepted, 202 accepted but key still being validated.
  console.log(`IndexNow responded ${response.status} ${response.statusText}`)
  const body = await response.text()
  if (body) console.log(body.slice(0, 400))
  if (!response.ok && response.status !== 202) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
