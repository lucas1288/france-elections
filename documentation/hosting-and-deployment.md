# Hosting & deployment

How the app is meant to be put online, and the reasoning behind it. Nothing here is
deployed yet — this is the agreed plan plus the work already done to make it cheap.

## The shape of the problem

The app is a **pure static SPA** (Vite build → HTML/JS/CSS — no server, no database,
no auth) **plus a large pile of static data**:

- `public/data/tiles/france-admin.pmtiles` — ~82 MB
- `public/data/tiles/circonscriptions.pmtiles` — ~7 MB
- `public/data/elections/**/*.json` — ~140 MB total (full commune files dominate)

Data is read with plain `fetch` + PMTiles **HTTP range requests**. There is no query
workload at runtime. So "hosting" is really **two independent placements**:

1. **The static site** — trivially cheap/free anywhere.
2. **The heavy data** — either rides along in `public/`, or moves to object storage + CDN.

## Key concept: egress

**Egress** = data leaving the host *out to users*. For a tile-heavy map it is the
dominant cost: every visitor pulls megabytes. Many object stores charge per-GB egress
(AWS S3 ≈ $0.09/GB, Backblaze B2, Supabase Storage metered); **Cloudflare R2 charges
$0 egress**. Storage itself is trivial (~$0.015/GB/month) everywhere. For a public map
where bytes-out is the main activity, zero-egress is the difference between "free
forever" and "a bill that scales with popularity."

## Decision: Cloudflare ecosystem, static-first, incremental

Chosen for two reasons: zero-egress R2, **and** a clean upgrade path that never
requires re-platforming as features grow.

| Need | Cloudflare piece | When |
|---|---|---|
| Static site | **Pages** | now |
| Tiles + data | **R2** (zero egress, range requests work) | now |
| Query/API endpoints (comparisons that outgrow static) | **Workers** (edge functions) | when a feature needs it |
| Queryable store (ad-hoc queries) | **D1** (serverless SQLite) / KV | only if/when ad-hoc queries appear |
| Election-night live ingestion | **Cron Triggers + Queues** writing to R2 | when live-night becomes concrete |

**No database today.** The data is static and read-only; a relational DB only earns
its place if server-side filtering/aggregation (ad-hoc queries) becomes a real feature.
See [`roadmap.md`](roadmap.md) for the future-feature thinking.

### The two realistic starting paths

- **Just get it online** → Vercel/Netlify/Pages with data left in `public/`. Zero data
  migration; ship today. Trade-off: ~230 MB shipped per deploy, host size/bandwidth
  limits hit sooner, and GitHub still warns on the 82 MB file. Fine for low traffic.
- **Do it right (public-facing)** → **Pages + R2**: site on Pages, tiles+JSON on R2,
  point the app at the bucket. Lean repo, zero egress, no warning, no 100 MB ceiling.
  Recommended, since the intent is a real public site.

`*.pages.dev` / `*.vercel.app` work to start; a custom domain can be added anytime.

## What's already done to make this cheap

- **`VITE_DATA_BASE_URL` indirection** ([`src/utils/dataUrl.ts`](../src/utils/dataUrl.ts)):
  every data/tile URL resolves through `dataUrl()` / `pmtilesUrl()`. Unset (default) →
  served from the app's own `/data` (i.e. `public/`), so local dev and a plain static
  deploy are unchanged. Set it to a bucket root that mirrors the `data/...` layout
  (e.g. `https://cdn.example.com`, no trailing slash) and the heavy assets load from
  there with **no code change**. See [`.env.example`](../.env.example).
- **Repo slimming**: raw `data-sources/` untracked + git-ignored (build inputs only,
  regenerable — provenance in [`../data-sources/README.md`](../data-sources/README.md));
  git history purged of those + dead blobs (`.git` 317 MB → 113 MB).

## Outstanding before/at deploy

- **Pick a starting path** (just-ship vs Pages+R2) and a domain.
- ~~**Move `public/data` tiles+JSON to R2** and untrack from git~~ DONE June 2026 — data
  lives in R2; `public/data/` is git-ignored and was purged from history (`.git` shrunk
  again). This cleared GitHub's 82 MB-file warning and removed the 100 MB/file push
  ceiling. Local dev now needs `VITE_DATA_BASE_URL` → R2 or regenerated data (see README).
- PMTiles requires the host to honour **range requests** (R2/S3/B2 do; GitHub Pages is
  unreliable for this on large files — avoid it for the data).

## Live deployment

- **Production site**: https://france-elections.pages.dev (Cloudflare Pages project
  `france-elections`, production branch `main`).
- **Data**: R2 bucket `france-elections-data`, public base
  `https://pub-dc194401b9554e44a944ff785d4ced48.r2.dev` (the value baked in as
  `VITE_DATA_BASE_URL` at build). 37 objects under `data/...`, CORS allows the prod
  origin + localhost.
- Deployed via **direct upload** (`wrangler pages deploy`), not Git-connected CI yet.
- ⚠️ Per-deploy hash URLs (`<hash>.france-elections.pages.dev`) and any non-`main`
  preview branch are *different origins* the R2 CORS does not yet allow — they'll load
  the app shell but fail to fetch data. Use the apex prod URL. Widen CORS (wildcard
  `https://*.france-elections.pages.dev`) when enabling the preview workflow.

## Deploy runbook (Cloudflare Pages + R2)

Defaults: R2 bucket `france-elections-data`, Pages project `france-elections`
(→ `https://france-elections.pages.dev`, which is the origin allowed in
[`../scripts/deploy/r2-cors.json`](../scripts/deploy/r2-cors.json)). Uploads use your
`wrangler login` session — no S3 API keys needed (only 37 data files).

```bash
# 1. Authenticate (browser OAuth)
npx wrangler login

# 2. Create the data bucket (requires R2 enabled on the account)
npx wrangler r2 bucket create france-elections-data

# 3. Turn on the public r2.dev URL — copy the printed https://pub-xxxx.r2.dev
npx wrangler r2 bucket dev-url enable france-elections-data

# 4. Upload public/data/** to R2 + apply CORS
BUCKET=france-elections-data ./scripts/deploy/sync-r2.sh

# 5. Build against R2 and deploy ONLY the app shell to Pages
#    (the script strips dist/data so the 230 MB never enters the Pages deploy)
VITE_DATA_BASE_URL=https://pub-xxxx.r2.dev ./scripts/deploy/deploy-pages.sh
```

Re-deploys: data changed → re-run step 4; app code changed → re-run step 5.
Later, swap the r2.dev URL for a custom domain on the bucket (update
`VITE_DATA_BASE_URL` + the CORS origins, rebuild). Scripts live in
[`../scripts/deploy/`](../scripts/deploy/).
