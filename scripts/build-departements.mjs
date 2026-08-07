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
 *   1b. GENERALISE the communes once, topology-aware (mapshaper -simplify), at
 *      `--simplify=<metres>` (default 20 — see SIMPLIFY_M). Everything
 *      downstream inherits it, so the dept outline and the PLM arrondissements
 *      are generalised from the same arcs rather than independently.
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
 *      node scripts/build-departements.mjs --simplify=40 --out=/tmp/try.pmtiles
 *
 * REMEMBER after shipping a rebuild: bump `?v=N` in TILE_SOURCES (FranceMap) —
 * a PMTiles archive is read by byte offset, so a cached header from the old
 * layout reads garbage out of the new file — then `scripts/deploy/sync-r2.sh`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const TMP = fs.mkdtempSync(path.join(import.meta.dirname, '.dept-build-'))
const COMMUNES = path.join(TMP, 'communes.geojson')
const DEPTS = path.join(TMP, 'departements.geojson')
const PLM = path.join(ROOT, 'data-sources/plm-arrondissements.geojson')

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
const OUT = path.resolve(ROOT, arg('out', 'public/data/tiles/france-admin.pmtiles'))

/**
 * Generalisation tolerance in METRES, applied to the commune contours BEFORE
 * anything else (A3, Aug 2026 — lucas: "maybe the map is too detailed").
 *
 * geo.api's IGN contours carry roughly one vertex every 5–10 m, which measured
 * out at ~1 vertex per RENDERED PIXEL of outline at z10 (median commune: 247
 * points over a 250 px perimeter). Nothing below a pixel can be seen, so most of
 * those points are pure weight.
 *
 * 20 m is the FIDELITY-biased choice: at the tileset's maximum zoom (z12) one
 * screen pixel is 24–27 m of ground across France's latitudes, so the tolerance
 * is sub-pixel everywhere at the deepest zoom the tiles describe. Overzooming
 * past z12 magnifies it like any other tile data.
 *
 * It runs BEFORE the dissolve on purpose: the dept layer is then generalised by
 * construction, from the very same arcs, rather than being an independently
 * simplified approximation of them.
 */
const SIMPLIFY_M = Number(arg('simplify', '20'))

/**
 * tippecanoe's own simplification (`-S`), in TILE UNITS — i.e. a constant
 * SCREEN-SPACE tolerance at every zoom, which is the right unit for "how many
 * vertices per rendered pixel". This, not `--simplify`, is what actually
 * controls how detailed the map LOOKS.
 *
 * Measured on the shipped tiles at z10 (rural Aveyron, 44 communes):
 *
 *   -S1  (tippecanoe default)  10 961 pts   ~1.0 vertex per pixel   86.0 MB
 *   -S8                         2 973 pts   1 vertex per ~4 px      45.7 MB
 *   -S20                        1 564 pts   1 vertex per ~7 px      35.7 MB
 *
 * 8 is lucas's call (Aug 7 2026), biased to FIDELITY: coastlines still read as
 * themselves — the Gulf of Morbihan, Quiberon, the estuaries all survive — the
 * map just stops drawing detail below a pixel. At 20 small inlets start
 * disappearing and Paris goes visibly polygonal at z12.
 *
 * Feature counts are unaffected: verified 44/44/44, 65/65/65, 26/26/26 at
 * z10/z11/z12 across all three settings, so no commune is ever dropped.
 *
 * NOTE the source `--simplify` above is nearly invisible on its own (it cut the
 * source 57% but the tiles only 18%) because tippecanoe already quantises
 * coordinates onto the tile grid — ~6 m at z12, ~26 m at z10. It is kept because
 * it is free and because it makes the dept outline a literal union of commune
 * arcs rather than a separately simplified approximation of them.
 */
const TIPPE_S = Number(arg('tippecanoe-simplify', '8'))

/** Total vertex count of a GeoJSON file — used to report what generalising cost. */
function countVertices(file) {
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'))
  let n = 0
  for (const f of fc.features ?? []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') n += g.coordinates.reduce((a, r) => a + r.length, 0)
    else if (g.type === 'MultiPolygon')
      n += g.coordinates.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0)
  }
  return n
}

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

// Generalise ONCE, topology-aware, before the dissolve (see SIMPLIFY_M above).
// mapshaper builds topology first, so a shared arc is simplified identically for
// both communes that use it — which is what keeps the mesh gap-free — and the
// dissolved dept outline then traces those same generalised arcs.
// `keep-shapes` stops small communes collapsing to nothing at any tolerance.
if (SIMPLIFY_M > 0) {
  const before = countVertices(COMMUNES)
  execSync(
    `npx mapshaper "${COMMUNES}" -simplify interval=${SIMPLIFY_M} keep-shapes -o force "${COMMUNES}"`,
    { stdio: 'inherit', cwd: ROOT },
  )
  const after = countVertices(COMMUNES)
  console.log(
    `Generalised at ${SIMPLIFY_M} m: ${before.toLocaleString('fr-FR')} → ${after.toLocaleString('fr-FR')} vertices (−${(100 * (1 - after / before)).toFixed(1)}%)`,
  )
}

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
  `tippecanoe -o "${TMP_COMMUNES}" -Z0 -z12 --layer=communes --use-attribute-for-id=code --drop-densest-as-needed --no-tile-size-limit -S ${TIPPE_S} --force "${COMMUNES}"`,
  { stdio: 'inherit', cwd: ROOT },
)

console.log('tippecanoe: departements layer (full retention, no drop)…')
execSync(
  `tippecanoe -o "${TMP_DEPTS}" -Z0 -z12 --layer=departements --use-attribute-for-id=code --no-feature-limit --no-tile-size-limit -S ${TIPPE_S} --force "${DEPTS}"`,
  { stdio: 'inherit', cwd: ROOT },
)

// PLM arrondissement contours overlay into the `communes` layer. Generalised at
// the same tolerance — they sit inside the commune mesh, so leaving them at full
// resolution would make Paris/Lyon/Marseille the one place where the two levels
// of detail meet visibly.
let plmSrc = PLM
if (SIMPLIFY_M > 0) {
  plmSrc = path.join(TMP, 'plm.geojson')
  execSync(
    `npx mapshaper "${PLM}" -simplify interval=${SIMPLIFY_M} keep-shapes -o force "${plmSrc}"`,
    { stdio: 'inherit', cwd: ROOT },
  )
}

console.log('tippecanoe: PLM arrondissements (communes overlay)…')
execSync(
  `tippecanoe -o "${TMP_PLM}" -Z0 -z12 --layer=communes --use-attribute-for-id=code --drop-densest-as-needed --no-tile-size-limit -S ${TIPPE_S} --force "${plmSrc}"`,
  { stdio: 'inherit', cwd: ROOT },
)

// `-pk` (--no-tile-size-limit) is REQUIRED: without it, tile-join enforces the
// 500 KB/tile limit and DROPS features to fit — in dense southern tiles the
// merged communes+depts overflow, so the always-visible dept polygons get
// discarded there (blanking ~2/3 of metro France at overview zoom).
console.log('tile-join: communes + departements + PLM → france-admin.pmtiles…')
execSync(`tile-join -f -pk -o "${OUT}" "${TMP_COMMUNES}" "${TMP_DEPTS}" "${TMP_PLM}"`, { stdio: 'inherit', cwd: ROOT })

fs.rmSync(TMP, { recursive: true, force: true })

// The overseas underlay (`overseas-fill`) has to be rebuilt from the same arcs,
// or it disagrees with the mesh drawn on top of it and rims every overseas coast
// in the département's colour. Skipped when building to a scratch --out, since
// that isn't a real ship.
if (OUT === path.join(ROOT, 'public/data/tiles/france-admin.pmtiles')) {
  console.log('\nRebuilding the overseas underlay from the same arcs…')
  execSync(`node "${path.join(import.meta.dirname, 'build-overseas-outlines.mjs')}" --simplify=${SIMPLIFY_M}`, {
    stdio: 'inherit',
    cwd: ROOT,
  })
}

console.log(`\nDone → ${path.relative(ROOT, OUT)}`)
console.log('Verify: dept fills still color, commune fills + arrondissements + overseas still render/click, dept outline now sits on commune edges.')
