# bufo.club

A searchable home for bufo emoji: browse, download, generate your own from a
photo, and submit new ones for review. Everything runs on Cloudflare's free
tier, and the infrastructure that makes that true is in this repo.

Inspired by [bufo.zone](https://bufo.zone/); seeded from
[knobiknows/all-the-bufo](https://github.com/knobiknows/all-the-bufo).

## How it fits together

```
browser ── bufo.club ───────► Worker (Hono)
                               ├─ static assets  → apps/web/dist (unmetered)
                               ├─ /api/*         → submissions, reports, detail
                               └─ /api/admin/*   → behind Cloudflare Access
        ── cdn.bufo.club ───► R2 bufo-assets (public custom domain)
                               ├─ b/<slug>.<ext>        approved bufos
                               ├─ templates/*.png       generator plates
                               └─ manifest/latest.json  the whole search index
                              R2 bufo-pending (private) submissions in review
                              D1 bufo-db               metadata, tags, audit
```

**The one design rule:** public reads are static. The gallery downloads one
manifest from the CDN and searches it in the browser, and images come straight
from R2. Browsing costs zero Worker requests and zero D1 row reads, so the free
tier is a comfortable fit rather than a cliff edge:

| Resource | Free allowance | What we spend it on |
| --- | --- | --- |
| Worker requests | 100k/day | submissions, reports, admin actions |
| Worker CPU | 10ms/request | streaming to R2 and hashing; no image decoding |
| D1 | 5M reads, 100k writes/day, 500MB | metadata, touched only on write paths |
| R2 | 10GB, 1M class A, 10M class B /mo | ~1,700 bufos ≈ 150MB, egress free |
| Access / Turnstile / Rate limiting | free | admin auth and anti-abuse |

## Layout

| Path | What lives there |
| --- | --- |
| `apps/web` | Vite + React SPA: gallery, generator, upload, admin |
| `apps/api` | The Worker: Hono routes, D1 access, manifest builder |
| `packages/shared` | Types, zod schemas, slug rules, image header parser |
| `packages/bufo-gen` | Canvas compositor and template types |
| `db/migrations` | D1 schema |
| `infra/terraform` | Buckets, database, hostnames, Access, Turnstile |
| `templates` | Generator plate art + slot geometry |
| `scripts` | Seed importer and the template plate builder |

## Getting started

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
cp apps/web/.env.example apps/web/.env

pnpm db:migrate:local                       # create the local D1 schema
pnpm seed -- --local --limit 40             # a sample library + templates
pnpm dev                                    # vite on :5173, worker on :8787
```

Open http://localhost:5173. `/admin` works locally because `DEV_ADMIN_EMAIL` is
set in `wrangler.jsonc`; that bypass is ignored in every other environment.

### Useful commands

| Command | Does |
| --- | --- |
| `pnpm test` | Vitest across all packages, Worker tests on the real runtime |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` / `pnpm format` | Biome |
| `pnpm build` | Builds the SPA into `apps/web/dist` |
| `pnpm deploy` | Builds, then `wrangler deploy` |
| `pnpm seed -- --remote` | Full import into production R2 + D1 |

## Deploying

1. Follow [`infra/README.md`](infra/README.md) to bootstrap Terraform and apply.
2. Copy `terraform output worker_vars` into the matching `env` block of
   `apps/api/wrangler.jsonc`, set the `TURNSTILE_SECRET` secret.
3. Push to `main` — CI builds, migrates and deploys.
4. Seed the library once:
   `R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… pnpm seed -- --remote`

## Moderation and credit

Uploads are anonymous, gated by Turnstile and a per-IP rate limit, and land in
`bufo-pending` with a `pending` row until an admin approves them at `/admin`.
Approval moves the object into the public bucket, writes an audit entry and
rebuilds the manifest.

The upstream all-the-bufo collection ships without a licence file. Every seeded
row keeps its `credit` and `source_url`, `/about` credits the project, and the
"Report this bufo" flow is a working takedown path — anything reported as a
copyright issue is removed on request.
