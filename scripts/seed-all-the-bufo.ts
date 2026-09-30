/**
 * Seed the library from knobiknows/all-the-bufo.
 *
 *   pnpm seed -- --remote            # production: S3 API uploads + remote D1
 *   pnpm seed -- --local --limit 40  # local dev: a small sample, via wrangler
 *   pnpm seed -- --remote --env staging
 *   pnpm seed -- --remote --force-manifest   # also overwrite the search index
 *   pnpm seed -- --remote --manifest-only    # templates + index only, no images
 *
 * Idempotent: bufos already present (matched on content hash) are skipped, so
 * re-running only adds what is new.
 *
 * The upstream repository has no licence file. Every row records where it came
 * from, /about credits the project, and the report flow is the takedown path.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type BufoExt,
  buildManifestDocument,
  detectMosaics,
  isBufoExt,
  type ManifestBufoInput,
  type ManifestTemplate,
  type MosaicOrientation,
  R2_KEYS,
  readImageInfo,
  slugify,
  tagsFromSlug,
  titleFromSlug,
} from '@bufo/shared'
import { AwsClient } from 'aws4fetch'

const REPO = 'https://github.com/knobiknows/all-the-bufo.git'
const CREDIT = 'knobiknows/all-the-bufo'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, '.seed-cache')

type Options = {
  remote: boolean
  limit: number
  env?: string
  dryRun: boolean
  forceManifest: boolean
  /** Skip the bufo images: only refresh templates and the search index. */
  manifestOnly: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    remote: false,
    limit: Number.POSITIVE_INFINITY,
    dryRun: false,
    forceManifest: false,
    manifestOnly: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--remote') options.remote = true
    else if (arg === '--local') options.remote = false
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--force-manifest') options.forceManifest = true
    else if (arg === '--manifest-only') {
      options.manifestOnly = true
      options.forceManifest = true
    } else if (arg === '--limit') options.limit = Number(argv[++i])
    else if (arg === '--env') options.env = argv[++i]
  }
  if (!options.remote && options.limit === Number.POSITIVE_INFINITY) {
    // Local uploads go one wrangler invocation at a time; a full seed would take
    // the best part of an hour and nobody needs 1700 bufos to develop against.
    options.limit = 40
  }
  return options
}

function run(command: string, args: string[], cwd = ROOT): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
}

/**
 * wrangler lives in apps/api and reads its bindings from the wrangler.jsonc
 * there, so every wrangler call runs from that directory - including the local
 * ones, which then share `wrangler dev`'s .wrangler/state.
 */
const API_DIR = join(ROOT, 'apps/api')

function wrangler(args: string[]): string {
  return run('pnpm', ['exec', 'wrangler', ...args], API_DIR)
}

function ensureCheckout(): string {
  const dir = join(CACHE, 'all-the-bufo')
  mkdirSync(CACHE, { recursive: true })
  if (existsSync(join(dir, '.git'))) {
    console.log('updating existing checkout…')
    run('git', ['-C', dir, 'fetch', '--depth', '1', 'origin', 'HEAD'])
    run('git', ['-C', dir, 'checkout', '-f', 'FETCH_HEAD'])
  } else {
    console.log(`cloning ${REPO}…`)
    run('git', ['clone', '--depth', '1', REPO, dir])
  }
  return join(dir, 'all-the-bufo')
}

type Candidate = ManifestBufoInput & {
  id: string
  sha256: string
  bytes: Uint8Array
  key: string
  size: number
  /** Original filename, so source_url points at a file that actually exists. */
  filename: string
}

function collect(imageDir: string, limit: number): Candidate[] {
  const seenHashes = new Set<string>()
  const seenSlugs = new Set<string>()
  const out: Candidate[] = []

  for (const filename of readdirSync(imageDir).sort()) {
    if (out.length >= limit) break
    const extension = filename.split('.').pop()?.toLowerCase() ?? ''
    if (!isBufoExt(extension)) continue

    const bytes = new Uint8Array(readFileSync(join(imageDir, filename)))
    const info = readImageInfo(bytes)
    if (!info) {
      console.warn(`skipping ${filename}: unreadable image header`)
      continue
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (seenHashes.has(sha256)) continue
    seenHashes.add(sha256)

    let slug = slugify(filename)
    if (!slug) continue
    // Two different files can slugify to the same name; keep both, numbered.
    let suffix = 2
    while (seenSlugs.has(slug)) slug = `${slugify(filename)}-${suffix++}`
    seenSlugs.add(slug)

    out.push({
      id: sha256.slice(0, 24),
      slug,
      title: titleFromSlug(slug),
      ext: info.ext as BufoExt,
      width: info.width,
      height: info.height,
      isAnimated: info.isAnimated,
      tags: tagsFromSlug(slug),
      credit: CREDIT,
      createdAt: Math.floor(Date.now() / 1000),
      sha256,
      bytes,
      size: bytes.byteLength,
      key: R2_KEYS.bufo(slug, info.ext as BufoExt),
      filename,
    })
  }
  return out
}

function sqlString(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`
}

/** One file of INSERTs, applied in a single wrangler call. */
function buildSql(candidates: Candidate[], templates: ManifestTemplate[]): string {
  const lines: string[] = ['PRAGMA foreign_keys = ON;']

  for (const bufo of candidates) {
    lines.push(
      `INSERT OR IGNORE INTO bufos (id, slug, title, ext, r2_key, width, height, bytes, sha256, is_animated, status, source, source_url, credit, created_at) VALUES (` +
        [
          sqlString(bufo.id),
          sqlString(bufo.slug),
          sqlString(bufo.title),
          sqlString(bufo.ext),
          sqlString(bufo.key),
          bufo.width,
          bufo.height,
          bufo.size,
          sqlString(bufo.sha256),
          bufo.isAnimated ? 1 : 0,
          `'approved'`,
          `'all-the-bufo'`,
          sqlString(
            `https://github.com/knobiknows/all-the-bufo/blob/main/all-the-bufo/${encodeURIComponent(bufo.filename)}`,
          ),
          sqlString(CREDIT),
          bufo.createdAt,
        ].join(', ') +
        ');',
    )
    for (const tag of bufo.tags) {
      lines.push(`INSERT OR IGNORE INTO tags (name) VALUES (${sqlString(tag)});`)
      lines.push(
        `INSERT OR IGNORE INTO bufo_tags (bufo_id, tag_id) SELECT ${sqlString(bufo.id)}, id FROM tags WHERE name = ${sqlString(tag)};`,
      )
    }
  }

  const now = Math.floor(Date.now() / 1000)
  if (templates.length > 0) {
    // templates.json is the source of truth: anything not in it has been retired.
    const keep = templates.map((template) => sqlString(template.slug)).join(', ')
    lines.push(`DELETE FROM templates WHERE slug NOT IN (${keep});`)
  }
  for (const [index, template] of templates.entries()) {
    lines.push(
      `INSERT INTO templates (id, slug, name, name_pattern, base_key, overlay_key, canvas_w, canvas_h, slot_json, status, sort_order, created_at, updated_at) VALUES (` +
        [
          sqlString(`tmpl-${template.slug}`),
          sqlString(template.slug),
          sqlString(template.name),
          sqlString(template.namePattern),
          sqlString(template.baseKey),
          template.overlayKey ? sqlString(template.overlayKey) : 'NULL',
          template.canvas.w,
          template.canvas.h,
          sqlString(JSON.stringify(template.slot)),
          `'active'`,
          (index + 1) * 10,
          now,
          now,
        ].join(', ') +
        `) ON CONFLICT (slug) DO UPDATE SET base_key = excluded.base_key, overlay_key = excluded.overlay_key, slot_json = excluded.slot_json, name = excluded.name, name_pattern = excluded.name_pattern, updated_at = excluded.updated_at;`,
    )
  }

  return `${lines.join('\n')}\n`
}

function loadTemplates(): {
  templates: ManifestTemplate[]
  files: { key: string; path: string }[]
} {
  const dir = join(ROOT, 'templates')
  const manifestPath = join(dir, 'templates.json')
  if (!existsSync(manifestPath)) return { templates: [], files: [] }

  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    slug: string
    name: string
    namePattern: string
    base: string
    overlay: string | null
    canvas: { w: number; h: number }
    slot: ManifestTemplate['slot']
  }[]

  const files: { key: string; path: string }[] = []

  // Plate art is tuned repeatedly under the same slug, so the key carries a
  // hash of the bytes. New art lands on a new URL and no cache can serve the
  // previous picture - which is otherwise invisible until someone complains
  // that the template still shows the old object.
  const version = (path: string) =>
    createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)

  const templates = raw.map((entry) => {
    const basePath = join(dir, entry.base)
    const baseKey = R2_KEYS.template(entry.slug, 'base', version(basePath))
    files.push({ key: baseKey, path: basePath })
    let overlayKey: string | undefined
    if (entry.overlay) {
      const overlayPath = join(dir, entry.overlay)
      overlayKey = R2_KEYS.template(entry.slug, 'overlay', version(overlayPath))
      files.push({ key: overlayKey, path: overlayPath })
    }
    return {
      slug: entry.slug,
      name: entry.name,
      namePattern: entry.namePattern,
      baseKey,
      overlayKey,
      canvas: entry.canvas,
      slot: entry.slot,
    }
  })
  return { templates, files }
}

const MIME: Record<string, string> = {
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  json: 'application/json; charset=utf-8',
}

async function uploadRemote(
  uploads: { key: string; body: Uint8Array; contentType: string; cacheControl: string }[],
  bucket: string,
) {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY for --remote')
  }

  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  })
  const endpoint = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}`

  let done = 0
  const concurrency = 8
  const queue = [...uploads]

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const response = await client.fetch(`${endpoint}/${item.key}`, {
          method: 'PUT',
          body: item.body,
          headers: { 'content-type': item.contentType, 'cache-control': item.cacheControl },
        })
        if (!response.ok) {
          throw new Error(
            `upload of ${item.key} failed: ${response.status} ${await response.text()}`,
          )
        }
        done++
        if (done % 100 === 0) console.log(`  uploaded ${done}/${uploads.length}`)
      }
    }),
  )
  console.log(`  uploaded ${done}/${uploads.length}`)
}

function uploadLocal(
  uploads: { key: string; body: Uint8Array; contentType: string }[],
  bucket: string,
  env?: string,
) {
  const staging = join(CACHE, 'upload')
  mkdirSync(staging, { recursive: true })
  uploads.forEach((item, index) => {
    const path = join(staging, item.key.replace(/\//g, '_'))
    writeFileSync(path, item.body)
    const args = [
      'r2',
      'object',
      'put',
      `${bucket}/${item.key}`,
      '--file',
      path,
      '--content-type',
      item.contentType,
      '--local',
    ]
    if (env) args.push('--env', env)
    wrangler(args)
    if ((index + 1) % 10 === 0) console.log(`  uploaded ${index + 1}/${uploads.length}`)
  })
}

/** Is there already a published search index in the target bucket? */
async function manifestExists(
  options: Options,
  bucket: string,
  wranglerEnv: string | undefined,
): Promise<boolean> {
  if (!options.remote) {
    try {
      const args = ['r2', 'object', 'get', `${bucket}/${R2_KEYS.manifest}`, '--local', '--pipe']
      if (wranglerEnv) args.push('--env', wranglerEnv)
      wrangler(args)
      return true
    } catch {
      return false
    }
  }

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return false
  const client = new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  })
  const response = await client.fetch(
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${R2_KEYS.manifest}`,
    { method: 'HEAD' },
  )
  return response.ok
}

/**
 * Tile naming is ambiguous — `name-a-b` is row-column in one mosaic and
 * column-row in another — so the orientation lives in D1 and travels with the
 * manifest. Anything unrecorded is treated as row-column.
 */
function readOrientations(
  wranglerEnv: string | undefined,
  options: Options,
): Record<string, MosaicOrientation> {
  const args = [
    'd1',
    'execute',
    options.env ? `bufo-db-${options.env}` : 'bufo-db',
    '--yes',
    '--json',
  ]
  args.push(options.remote ? '--remote' : '--local')
  if (wranglerEnv) args.push('--env', wranglerEnv)
  args.push('--command', 'SELECT base, orientation FROM mosaic_layouts')

  try {
    const output = wrangler(args)
    const json = output.slice(output.indexOf('['))
    const [first] = JSON.parse(json) as {
      results: { base: string; orientation: MosaicOrientation }[]
    }[]
    return Object.fromEntries((first?.results ?? []).map((row) => [row.base, row.orientation]))
  } catch {
    // A fresh database has no layouts table yet; row-col is the safe default.
    return {}
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  // Two separate things that are easy to conflate: which wrangler environment
  // to run under, and how the resources are named. Terraform leaves production
  // unsuffixed, but wrangler still needs `--env production` or it falls back to
  // the top-level dev config and its placeholder database id.
  const wranglerEnv = options.env ?? (options.remote ? 'production' : undefined)
  const suffix = !wranglerEnv || wranglerEnv === 'production' ? '' : `-${wranglerEnv}`
  const bucket = `bufo-assets${suffix}`
  const database = `bufo-db${suffix}`

  const imageDir = ensureCheckout()
  const candidates = collect(imageDir, options.limit)
  const { templates, files } = loadTemplates()
  console.log(`found ${candidates.length} bufos and ${templates.length} templates`)

  const manifest = buildManifestDocument(
    candidates,
    templates,
    undefined,
    detectMosaics(
      candidates.map((bufo) => bufo.slug),
      readOrientations(wranglerEnv, options),
    ),
  )

  const uploads = [
    ...(options.manifestOnly
      ? []
      : candidates.map((bufo) => ({
          key: bufo.key,
          body: bufo.bytes,
          contentType: MIME[bufo.ext]!,
          cacheControl: 'public, max-age=31536000, immutable',
        }))),
    ...files.map((file) => ({
      key: file.key,
      body: new Uint8Array(readFileSync(file.path)),
      contentType: MIME.png!,
      cacheControl: 'public, max-age=31536000, immutable',
    })),
  ]

  const sqlPath = join(CACHE, 'seed.sql')
  writeFileSync(sqlPath, buildSql(candidates, templates))
  console.log(`wrote ${sqlPath}`)

  if (options.dryRun) {
    console.log('dry run: nothing uploaded, no database touched')
    return
  }

  // The manifest is derived from D1, which by now may hold approved community
  // submissions this import knows nothing about. Writing our own copy over the
  // top would erase them from the gallery, so only publish one when the bucket
  // has none yet; otherwise leave it to the Worker.
  const manifestPresent = await manifestExists(options, bucket, wranglerEnv)
  if (manifestPresent && !options.forceManifest) {
    console.log('a manifest already exists; leaving it alone')
  } else {
    uploads.push({
      key: R2_KEYS.manifest,
      body: new TextEncoder().encode(JSON.stringify(manifest)),
      contentType: MIME.json!,
      cacheControl: 'public, max-age=60, s-maxage=60',
    })
  }

  console.log(`uploading ${uploads.length} objects to ${bucket}…`)
  if (options.remote) await uploadRemote(uploads, bucket)
  else uploadLocal(uploads, bucket, wranglerEnv)

  console.log(`applying database rows to ${database}…`)
  const args = ['d1', 'execute', database, '--file', sqlPath, '--yes']
  args.push(options.remote ? '--remote' : '--local')
  if (wranglerEnv) args.push('--env', wranglerEnv)
  wrangler(args)

  if (manifestPresent && !options.forceManifest) {
    console.log(
      `seeded ${candidates.length} bufos — now rebuild the search index from /admin ` +
        '("Rebuild manifest"), or the new bufos will not show up in the gallery',
    )
  } else {
    console.log(`seeded ${candidates.length} bufos — manifest has ${manifest.count} entries`)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
