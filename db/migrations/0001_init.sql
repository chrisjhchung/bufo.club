-- bufo.club core schema.
-- D1 holds metadata only: images live in R2 and the public read path is the
-- generated manifest, so nothing here is queried by ordinary page views.

CREATE TABLE bufos (
  id                TEXT PRIMARY KEY,
  slug              TEXT,                      -- assigned on approval, NULL while pending
  title             TEXT NOT NULL,
  ext               TEXT NOT NULL CHECK (ext IN ('png', 'gif', 'webp')),
  r2_key            TEXT NOT NULL,             -- pending/<id>.<ext> then b/<slug>.<ext>
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,
  bytes             INTEGER NOT NULL,
  sha256            TEXT NOT NULL,
  is_animated       INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  source            TEXT NOT NULL CHECK (source IN ('all-the-bufo', 'submission', 'generator')),
  source_url        TEXT,
  credit            TEXT,
  submitter_note    TEXT,
  submitter_contact TEXT,
  reject_reason     TEXT,
  created_at        INTEGER NOT NULL,
  reviewed_at       INTEGER,
  reviewed_by       TEXT
);

-- Slugs are unique among the bufos that actually have one.
CREATE UNIQUE INDEX bufos_slug_unique ON bufos (slug) WHERE slug IS NOT NULL;
-- Identical bytes are rejected up front, whatever they are named.
CREATE UNIQUE INDEX bufos_sha256_unique ON bufos (sha256);
CREATE INDEX bufos_status_created ON bufos (status, created_at DESC);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE bufo_tags (
  bufo_id TEXT NOT NULL REFERENCES bufos (id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (bufo_id, tag_id)
);

CREATE INDEX bufo_tags_tag ON bufo_tags (tag_id);

-- Generator templates: base plate + optional overlay + the slot the user's
-- image is fitted into. Editable from /admin so new templates need no deploy.
CREATE TABLE templates (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  name_pattern TEXT NOT NULL,
  base_key     TEXT NOT NULL,
  overlay_key  TEXT,
  canvas_w     INTEGER NOT NULL DEFAULT 128,
  canvas_h     INTEGER NOT NULL DEFAULT 128,
  slot_json    TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  sort_order   INTEGER NOT NULL DEFAULT 100,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX templates_status ON templates (status, sort_order);

-- Takedown / moderation requests from the public.
CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  bufo_id     TEXT REFERENCES bufos (id) ON DELETE SET NULL,
  slug        TEXT NOT NULL,
  reason      TEXT NOT NULL,
  note        TEXT,
  created_at  INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT
);

CREATE INDEX reports_open ON reports (resolved_at, created_at DESC);

CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_id   TEXT,
  meta_json   TEXT,
  created_at  INTEGER NOT NULL
);

CREATE INDEX audit_log_created ON audit_log (created_at DESC);
