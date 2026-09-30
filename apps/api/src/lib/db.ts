import type { BufoExt, BufoSource, BufoStatus, TemplateSlot } from '@bufo/shared'
import { newId, nowSeconds } from './ids'

export type BufoRow = {
  id: string
  mosaic_id?: string | null
  mosaic_rows?: number | null
  mosaic_cols?: number | null
  mosaic_row?: number | null
  mosaic_col?: number | null
  slug: string | null
  title: string
  ext: BufoExt
  r2_key: string
  width: number
  height: number
  bytes: number
  sha256: string
  is_animated: number
  status: BufoStatus
  source: BufoSource
  source_url: string | null
  credit: string | null
  submitter_note: string | null
  submitter_contact: string | null
  reject_reason: string | null
  created_at: number
  reviewed_at: number | null
  reviewed_by: string | null
}

export type TemplateRow = {
  id: string
  slug: string
  name: string
  name_pattern: string
  base_key: string
  overlay_key: string | null
  canvas_w: number
  canvas_h: number
  slot_json: string
  status: 'active' | 'hidden'
  sort_order: number
  created_at: number
  updated_at: number
}

export async function findBufoBySha(db: D1Database, sha256: string) {
  return db
    .prepare('SELECT id, slug, status FROM bufos WHERE sha256 = ?1')
    .bind(sha256)
    .first<{ id: string; slug: string | null; status: BufoStatus }>()
}

export async function getBufoById(db: D1Database, id: string) {
  return db.prepare('SELECT * FROM bufos WHERE id = ?1').bind(id).first<BufoRow>()
}

export async function getApprovedBufoBySlug(db: D1Database, slug: string) {
  return db
    .prepare("SELECT * FROM bufos WHERE slug = ?1 AND status = 'approved'")
    .bind(slug)
    .first<BufoRow>()
}

export type MosaicPlacement = {
  mosaicId: string
  rows: number
  cols: number
  row: number
  col: number
}

export type NewBufo = {
  id: string
  title: string
  ext: BufoExt
  r2Key: string
  width: number
  height: number
  bytes: number
  sha256: string
  isAnimated: boolean
  status: BufoStatus
  source: BufoSource
  slug?: string | null
  sourceUrl?: string | null
  credit?: string | null
  note?: string | null
  contact?: string | null
  mosaic?: MosaicPlacement | null
}

export async function insertBufo(db: D1Database, bufo: NewBufo): Promise<void> {
  await db
    .prepare(
      `INSERT INTO bufos (id, slug, title, ext, r2_key, width, height, bytes, sha256,
                          is_animated, status, source, source_url, credit,
                          submitter_note, submitter_contact, created_at,
                          mosaic_id, mosaic_rows, mosaic_cols, mosaic_row, mosaic_col)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
               ?18, ?19, ?20, ?21, ?22)`,
    )
    .bind(
      bufo.id,
      bufo.slug ?? null,
      bufo.title,
      bufo.ext,
      bufo.r2Key,
      bufo.width,
      bufo.height,
      bufo.bytes,
      bufo.sha256,
      bufo.isAnimated ? 1 : 0,
      bufo.status,
      bufo.source,
      bufo.sourceUrl ?? null,
      bufo.credit ?? null,
      bufo.note ?? null,
      bufo.contact ?? null,
      nowSeconds(),
      bufo.mosaic?.mosaicId ?? null,
      bufo.mosaic?.rows ?? null,
      bufo.mosaic?.cols ?? null,
      bufo.mosaic?.row ?? null,
      bufo.mosaic?.col ?? null,
    )
    .run()
}

export async function listMosaicTiles(db: D1Database, mosaicId: string) {
  const { results } = await db
    .prepare('SELECT * FROM bufos WHERE mosaic_id = ?1 ORDER BY mosaic_row ASC, mosaic_col ASC')
    .bind(mosaicId)
    .all<BufoRow>()
  return results
}

export async function listPendingBufos(db: D1Database, limit = 60) {
  const { results } = await db
    .prepare("SELECT * FROM bufos WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?1")
    .bind(limit)
    .all<BufoRow>()
  return results
}

export async function countByStatus(db: D1Database) {
  const { results } = await db
    .prepare('SELECT status, COUNT(*) AS n FROM bufos GROUP BY status')
    .all<{ status: BufoStatus; n: number }>()
  return Object.fromEntries(results.map((row) => [row.status, row.n])) as Partial<
    Record<BufoStatus, number>
  >
}

/** Append -2, -3 … until the slug is free. Approvals are rare, so a loop is fine. */
export async function uniqueSlug(
  db: D1Database,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  for (let attempt = 1; attempt < 50; attempt++) {
    const candidate = attempt === 1 ? desired : `${desired}-${attempt}`
    const clash = await db
      .prepare('SELECT id FROM bufos WHERE slug = ?1 AND id IS NOT ?2')
      .bind(candidate, ignoreId ?? null)
      .first<{ id: string }>()
    if (!clash) return candidate
  }
  return `${desired}-${newId().slice(-6)}`
}

/** Replace a bufo's tags, creating any tag rows that do not exist yet. */
export async function setTags(db: D1Database, bufoId: string, tags: string[]): Promise<void> {
  const statements: D1PreparedStatement[] = [
    db.prepare('DELETE FROM bufo_tags WHERE bufo_id = ?1').bind(bufoId),
  ]
  for (const tag of tags) {
    statements.push(db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?1)').bind(tag))
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO bufo_tags (bufo_id, tag_id)
           VALUES (?1, (SELECT id FROM tags WHERE name = ?2))`,
        )
        .bind(bufoId, tag),
    )
  }
  await db.batch(statements)
}

export async function markApproved(
  db: D1Database,
  args: {
    id: string
    slug: string
    title: string
    r2Key: string
    credit?: string | null
    reviewer: string
  },
): Promise<void> {
  await db
    .prepare(
      `UPDATE bufos
          SET status = 'approved', slug = ?2, title = ?3, r2_key = ?4, credit = ?5,
              reviewed_at = ?6, reviewed_by = ?7, reject_reason = NULL
        WHERE id = ?1`,
    )
    .bind(
      args.id,
      args.slug,
      args.title,
      args.r2Key,
      args.credit ?? null,
      nowSeconds(),
      args.reviewer,
    )
    .run()
}

export async function markRejected(
  db: D1Database,
  args: { id: string; reason: string; reviewer: string },
): Promise<void> {
  await db
    .prepare(
      `UPDATE bufos SET status = 'rejected', reject_reason = ?2, reviewed_at = ?3, reviewed_by = ?4
        WHERE id = ?1`,
    )
    .bind(args.id, args.reason, nowSeconds(), args.reviewer)
    .run()
}

export async function deleteBufo(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM bufo_tags WHERE bufo_id = ?1').bind(id),
    db.prepare('DELETE FROM bufos WHERE id = ?1').bind(id),
  ])
}

export type ManifestQueryRow = Pick<
  BufoRow,
  'id' | 'slug' | 'title' | 'ext' | 'width' | 'height' | 'is_animated' | 'credit' | 'created_at'
>

/**
 * Everything the public manifest needs, as two flat queries joined in memory.
 * A correlated group_concat would re-read the tag tables once per bufo, which
 * matters against D1's daily row-read allowance.
 */
export async function listApprovedForManifest(db: D1Database) {
  const bufos = await db
    .prepare(
      `SELECT id, slug, title, ext, width, height, is_animated, credit, created_at
         FROM bufos
        WHERE status = 'approved' AND slug IS NOT NULL
        ORDER BY slug ASC`,
    )
    .all<ManifestQueryRow>()

  const tags = await db
    .prepare(
      `SELECT bt.bufo_id AS bufo_id, t.name AS name
         FROM bufo_tags bt
         JOIN tags t ON t.id = bt.tag_id`,
    )
    .all<{ bufo_id: string; name: string }>()

  const byBufo = new Map<string, string[]>()
  for (const row of tags.results) {
    const list = byBufo.get(row.bufo_id)
    if (list) list.push(row.name)
    else byBufo.set(row.bufo_id, [row.name])
  }

  return { bufos: bufos.results, tagsByBufo: byBufo }
}

export async function listTemplates(db: D1Database, includeHidden = false) {
  const sql = includeHidden
    ? 'SELECT * FROM templates ORDER BY sort_order ASC, slug ASC'
    : "SELECT * FROM templates WHERE status = 'active' ORDER BY sort_order ASC, slug ASC"
  const { results } = await db.prepare(sql).all<TemplateRow>()
  return results
}

export type TemplateUpsertRow = {
  slug: string
  name: string
  namePattern: string
  baseKey: string
  overlayKey: string | null
  canvasW: number
  canvasH: number
  slot: TemplateSlot
  status: 'active' | 'hidden'
}

export async function upsertTemplate(db: D1Database, row: TemplateUpsertRow): Promise<void> {
  const now = nowSeconds()
  await db
    .prepare(
      `INSERT INTO templates (id, slug, name, name_pattern, base_key, overlay_key,
                              canvas_w, canvas_h, slot_json, status, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
       ON CONFLICT (slug) DO UPDATE SET
         name = excluded.name,
         name_pattern = excluded.name_pattern,
         base_key = excluded.base_key,
         overlay_key = excluded.overlay_key,
         canvas_w = excluded.canvas_w,
         canvas_h = excluded.canvas_h,
         slot_json = excluded.slot_json,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .bind(
      newId(),
      row.slug,
      row.name,
      row.namePattern,
      row.baseKey,
      row.overlayKey,
      row.canvasW,
      row.canvasH,
      JSON.stringify(row.slot),
      row.status,
      now,
    )
    .run()
}

export async function deleteTemplate(db: D1Database, slug: string): Promise<void> {
  await db.prepare('DELETE FROM templates WHERE slug = ?1').bind(slug).run()
}

export async function insertReport(
  db: D1Database,
  args: { slug: string; bufoId: string | null; reason: string; note?: string | null },
): Promise<string> {
  const id = newId()
  await db
    .prepare(
      `INSERT INTO reports (id, bufo_id, slug, reason, note, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(id, args.bufoId, args.slug, args.reason, args.note ?? null, nowSeconds())
    .run()
  return id
}

export async function listOpenReports(db: D1Database, limit = 100) {
  const { results } = await db
    .prepare('SELECT * FROM reports WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT ?1')
    .bind(limit)
    .all()
  return results
}

export async function resolveReport(db: D1Database, id: string, reviewer: string): Promise<void> {
  await db
    .prepare('UPDATE reports SET resolved_at = ?2, resolved_by = ?3 WHERE id = ?1')
    .bind(id, nowSeconds(), reviewer)
    .run()
}

export async function writeAudit(
  db: D1Database,
  args: { actor: string; action: string; targetId?: string | null; meta?: unknown },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log (id, actor_email, action, target_id, meta_json, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(
      newId(),
      args.actor,
      args.action,
      args.targetId ?? null,
      args.meta === undefined ? null : JSON.stringify(args.meta),
      nowSeconds(),
    )
    .run()
}

export async function listAudit(db: D1Database, limit = 100) {
  const { results } = await db
    .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?1')
    .bind(limit)
    .all()
  return results
}
