/**
 * Delete template plate objects that nothing references any more.
 *
 * Plate keys are content-hashed, so re-tuning a template leaves the previous
 * art orphaned in R2 under its old key. Harmless but untidy, and it grows every
 * time a template changes.
 *
 * Safety: the live manifest is the source of truth for what is in use. Anything
 * it names is kept, whatever its key looks like. Dry run by default.
 *
 *   npx tsx scripts/prune-template-plates.ts            # list what would go
 *   npx tsx scripts/prune-template-plates.ts --delete   # actually delete
 */
import { R2_KEYS, type Manifest } from '@bufo/shared'
import { AwsClient } from 'aws4fetch'

const BUCKET = process.env.BUFO_BUCKET ?? 'bufo-assets'
const CDN = process.env.BUFO_CDN ?? 'https://cdn.bufo.club'

function client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY')
  }
  return {
    aws: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}`,
  }
}

async function listKeys(prefix: string): Promise<string[]> {
  const { aws, endpoint } = client()
  const keys: string[] = []
  let token: string | undefined

  do {
    const url = new URL(endpoint)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', prefix)
    if (token) url.searchParams.set('continuation-token', token)

    const response = await aws.fetch(url.toString())
    if (!response.ok) throw new Error(`list failed: ${response.status} ${await response.text()}`)
    const xml = await response.text()

    for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(match[1]!)
    const next = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)
    token = next?.[1]
  } while (token)

  return keys
}

async function main() {
  const doDelete = process.argv.includes('--delete')

  const manifest = (await (await fetch(`${CDN}/${R2_KEYS.manifest}?t=${Date.now()}`)).json()) as Manifest
  const inUse = new Set<string>()
  for (const template of manifest.templates) {
    inUse.add(template.baseKey)
    if (template.overlayKey) inUse.add(template.overlayKey)
  }

  const keys = await listKeys('templates/')
  const orphans = keys.filter((key) => !inUse.has(key))

  console.log(`${keys.length} plate objects, ${inUse.size} referenced by the manifest`)
  if (orphans.length === 0) {
    console.log('nothing to prune')
    return
  }

  for (const key of orphans) console.log(`  orphan: ${key}`)

  if (!doDelete) {
    console.log('\ndry run — pass --delete to remove them')
    return
  }

  const { aws, endpoint } = client()
  for (const key of orphans) {
    const response = await aws.fetch(`${endpoint}/${key}`, { method: 'DELETE' })
    if (!response.ok) throw new Error(`delete of ${key} failed: ${response.status}`)
    console.log(`  deleted ${key}`)
  }
  console.log(`\nremoved ${orphans.length} orphaned plate objects`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
