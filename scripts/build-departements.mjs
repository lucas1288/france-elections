/**
 * Rebuild france-admin.pmtiles so that département boundaries coincide EXACTLY
 * with commune edges (no slivers at the Paris ↔ petite-couronne boundary etc.).
 *
 * Why: the previous `departements` layer came from a different source/vintage
 * than the `communes` layer, so the dept outline didn't trace commune arcs.
 * Fix: dissolve the *same* commune contours into one polygon per département, so
 * every dept boundary is, by construction, a shared commune arc.
 *
 * Pipeline (all metropolitan + overseas commune contours from geo.api.gouv.fr):
 *   1. Fetch commune contours per département → one combined communes.geojson
 *      (`code` = INSEE code, matches election data + existing tiles).
 *   2. Dissolve communes by département (topology-preserving, via mapshaper
 *      -dissolve2) → departements.geojson (`code` = dept code: '01'…'95',
 *      '2A'/'2B', '971'…'988').
 *   3. tippecanoe both layers into a fresh france-admin.pmtiles (communes layer
 *      promoteId=code minzoom-able like before; departements always visible).
 *   4. tile-join the Paris/Lyon/Marseille arrondissement contours back into the
 *      `communes` layer (data-sources/plm-arrondissements.geojson, see
 *      scripts/build-plm-contours.mjs).
 *
 * tile-join can't drop/replace a single layer, so the whole admin tileset is
 * rebuilt in one coherent tippecanoe run; PLM arrondissements are the only
 * separate join (they're an overlay on top of the city communes).
 *
 * Requires: tippecanoe + tile-join on PATH, npx mapshaper. Keep a backup of the
 * current public/data/tiles/france-admin.pmtiles first (script also writes .bak).
 *
 * Run: node scripts/build-departements.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = fs.mkdtempSync(path.join(import.meta.dirname, '.dept-build-'))
const COMMUNES = path.join(TMP, 'communes.geojson')
const DEPTS = path.join(TMP, 'departements.geojson')
const PLM = path.join(ROOT, 'data-sources/plm-arrondissements.geojson')
const OUT = path.join(ROOT, 'public/data/tiles/france-admin.pmtiles')

// Métropole: 01–95 (no 20 — Corsica is 2A/2B), plus overseas dept codes that
// geo.api serves commune contours for. Anything geo.api has no contours for is
// skipped (logged); it simply won't get a dept polygon (e.g. 977/978/986/987/988
// have no public commune contours — they're abroad-style and live on AbroadMap).
const metroDepts = []
for (let i = 1; i <= 95; i++) {
  if (i === 20) continue
  metroDepts.push(String(i).padStart(2, '0'))
}
metroDepts.splice(metroDepts.indexOf('19') + 1, 0, '2A', '2B')
const overseasDepts = ['971', '972', '973', '974', '975', '976']
const allDepts = [...metroDepts, ...overseasDepts]

console.log(`Fetching commune contours for ${allDepts.length} départements…`)
const features = []
for (const dept of allDepts) {
  const url = `https://geo.api.gouv.fr/communes?codeDepartement=${dept}&format=geojson&geometry=contour&fields=code,nom`
  try {
    const res = await fetch(url)
    if (!res.ok) { console.warn(`  dept ${dept}: HTTP ${res.status} — skipped`); continue }
    const fc = await res.json()
    const feats = (fc.features ?? []).filter((f) => f.geometry)
    for (const f of feats) {
      f.properties = { code: f.properties.code, nom: f.properties.nom }
      features.push(f)
    }
    process.stdout.write(`\r  dept ${dept}: ${feats.length} communes (total ${features.length})        `)
  } catch (e) {
    console.warn(`\n  dept ${dept}: ${e.message} — skipped`)
  }
}
console.log()

fs.writeFileSync(COMMUNES, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Wrote ${features.length} communes → ${path.relative(ROOT, COMMUNES)}`)

// Dissolve communes → départements. `dept` = first 3 chars for overseas
// (97x/98x), else first 2; topology-preserving so dept arcs == shared commune
// arcs. Output `code` = dept code, matching the election dept data.
console.log('Dissolving communes by département (mapshaper -dissolve2)…')
const deptExpr =
  'dept = (code.substr(0,2)=="97"||code.substr(0,2)=="98") ? code.substr(0,3) : code.substr(0,2)'
execSync(
  `npx mapshaper "${COMMUNES}" -each '${deptExpr}' -dissolve2 fields=dept -each 'code = dept, nom = dept' -o "${DEPTS}"`,
  { stdio: 'inherit', cwd: ROOT },
)
const deptCount = JSON.parse(fs.readFileSync(DEPTS)).features.length
console.log(`Dissolved into ${deptCount} départements → ${path.relative(ROOT, DEPTS)}`)

// Back up the existing tileset, then rebuild both layers in one tippecanoe run.
if (fs.existsSync(OUT)) {
  fs.copyFileSync(OUT, OUT + '.bak')
  console.log(`Backed up existing tileset → ${path.relative(ROOT, OUT)}.bak`)
}

// Tile the two layers SEPARATELY, then tile-join. They must be separate runs:
//   - communes: dense, so `--drop-densest-as-needed` (they're hidden below z7 by
//     the style anyway, so low-zoom thinning is harmless).
//   - departements: the always-visible base layer — it must keep ALL 102
//     features at EVERY zoom, so it gets NO drop-densest (mixing it into the
//     commune run made drop-densest discard most dept polygons at z4–z6, which
//     blanked ~2/3 of metropolitan France at overview zoom). tippecanoe still
//     simplifies dept geometry per-zoom; it just never drops whole features.
const TMP_COMMUNES = path.join(TMP, 'communes.pmtiles')
const TMP_DEPTS = path.join(TMP, 'departements.pmtiles')
const TMP_PLM = path.join(TMP, 'plm.pmtiles')

console.log('tippecanoe: communes layer (drop-densest)…')
execSync(
  `tippecanoe -o "${TMP_COMMUNES}" -Z0 -z12 --layer=communes --use-attribute-for-id=code --drop-densest-as-needed --no-tile-size-limit --force "${COMMUNES}"`,
  { stdio: 'inherit', cwd: ROOT },
)

console.log('tippecanoe: departements layer (full retention, no drop)…')
execSync(
  `tippecanoe -o "${TMP_DEPTS}" -Z0 -z12 --layer=departements --use-attribute-for-id=code --no-feature-limit --no-tile-size-limit --force "${DEPTS}"`,
  { stdio: 'inherit', cwd: ROOT },
)

// PLM arrondissement contours overlay into the `communes` layer.
console.log('tippecanoe: PLM arrondissements (communes overlay)…')
execSync(
  `tippecanoe -o "${TMP_PLM}" -Z0 -z12 --layer=communes --use-attribute-for-id=code --drop-densest-as-needed --no-tile-size-limit --force "${PLM}"`,
  { stdio: 'inherit', cwd: ROOT },
)

// `-pk` (--no-tile-size-limit) is REQUIRED: without it, tile-join enforces the
// 500 KB/tile limit and DROPS features to fit — in dense southern tiles the
// merged communes+depts overflow, so the always-visible dept polygons get
// discarded there (blanking ~2/3 of metro France at overview zoom).
console.log('tile-join: communes + departements + PLM → france-admin.pmtiles…')
execSync(`tile-join -f -pk -o "${OUT}" "${TMP_COMMUNES}" "${TMP_DEPTS}" "${TMP_PLM}"`, { stdio: 'inherit', cwd: ROOT })

fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\nDone → ${path.relative(ROOT, OUT)}`)
console.log('Verify: dept fills still color, commune fills + arrondissements + overseas still render/click, dept outline now sits on commune edges.')
