/**
 * Rebuild public/data/tiles/circonscriptions.pmtiles, CLIPPED to the same land
 * outline the commune/département tiles are built from.
 *
 * WHY (Aug 7 2026, lucas): the circo tileset was built once from a data.gouv
 * GeoJSON of a different vintage, so its coastline was a different line from the
 * commune one. Sampling a 60×40 grid at z12 over La Grande-Motte / Le Grau-du-Roi
 * against the commune-derived land: 3 points where a circonscription covered
 * open water, 12 where land had no circonscription over it. Thin, but visible
 * both ways — and unlike the dept underlay it can't be fixed by hiding a layer,
 * because here the offender is the layer ON TOP.
 *
 * Simplification does NOT fix this: a coarser wrong coastline is still wrong.
 * The fix is to CLIP the circonscriptions to the land, so the coast comes from
 * the commune arcs by construction while the interior circo boundaries (which
 * only this source knows) are left alone.
 *
 * The clip alone was NOT enough (lucas, second report). It can only remove
 * area, and the source has the opposite defect too: 15 475 km² of France that
 * no circonscription polygon reaches, 99% of it two holes in the Guyanese
 * interior. Step 4 fills that from the commune polygons, attributed by the
 * ministry's own commune→circonscription table. Between the clip and the fill
 * the circonscription mesh now covers exactly the land the commune mesh does.
 *
 * Step 5 additionally keeps FULL detail at the maximum zoom, because everything
 * past z12 is an overzoom of that tile and `-S 8` there is what made the coast
 * read as long straight chords when you zoom in.
 *
 * SOURCE (record it — this was lost once and had to be re-found):
 *   Contours géographiques des circonscriptions législatives, data.gouv.fr,
 *   Licence Ouverte 2.0, updated 2024-06-13. Aggregated from bureau-de-vote
 *   contours. 559 features — the four COM circos (977/986/987/988) have never
 *   had polygons in it, which is why they are absent from the map and why
 *   `overseas.geojson` is their only geometry.
 *   The "p20 simplifiée" resource (~10 MB) is the one used; there is also a
 *   "p10 très simplifiée" (~5 MB), too coarse for z12.
 *
 * VINTAGE — this matters going forward: this file is the CURRENT (post-2010)
 * découpage. Circonscription boundaries change between elections (the 2010
 * redistricting is the big one), so a pre-2010 election will need its own
 * tileset and its own `circo-*` id in TILE_SOURCES; the manifest's
 * `geometry.circo` field exists precisely for that.
 *
 * Run: node scripts/build-circonscriptions.mjs
 *
 * AFTER SHIPPING: bump `?v=N` on the circo entry in TILE_SOURCES (FranceMap) —
 * PMTiles is read by byte offset, so a cached header from the old layout reads
 * garbage — then regenerate the two artefacts DERIVED from this tileset:
 *   node scripts/build-territory-bboxes.mjs
 *   node scripts/build-overseas-circo-shapes.mjs
 * and finally scripts/deploy/sync-r2.sh.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'
import { ZDEPT, pad, communeInsee2017 } from './lib/codes.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')

/** Rough planar area of a GeoJSON file, km². Good enough to report a gap. */
function areaKm2(file) {
  const fc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const ring = (r) => {
    let a = 0
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return a / 2
  }
  let total = 0
  // mapshaper omits `features` entirely when the result is empty — which is
  // exactly the outcome this is called to confirm.
  for (const f of fc.features ?? []) {
    if (!f.geometry) continue
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const p of polys) {
      let deg = Math.abs(ring(p[0]))
      for (let i = 1; i < p.length; i++) deg -= Math.abs(ring(p[i]))
      const lat = p[0].reduce((s, c) => s + c[1], 0) / p[0].length
      total += deg * 111.32 * 111.32 * Math.cos((lat * Math.PI) / 180)
    }
  }
  return total
}
// Scratch goes to the OS temp dir, not next to the script: the intermediates
// run to ~400 MB and a crash used to leave them sitting in an untracked
// `scripts/.circo-build-*`.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'circo-build-'))
const OUT = path.join(ROOT, 'public/data/tiles/circonscriptions.pmtiles')
const SRC = path.join(ROOT, 'data-sources/circonscriptions-p20.geojson')

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
/** Keep in step with build-departements.mjs — same arcs means same numbers. */
const SIMPLIFY_M = Number(arg('simplify', '20'))
const TIPPE_S = Number(arg('tippecanoe-simplify', '8'))

const SOURCE_URL = 'https://www.data.gouv.fr/api/1/datasets/r/67c0f382-dc8d-4d1f-8a76-1162c53b9dfe'

// ── 1. Source contours ────────────────────────────────────────────────────────
if (!fs.existsSync(SRC)) {
  console.log('Downloading circonscription contours from data.gouv…')
  const res = await fetch(SOURCE_URL)
  if (!res.ok) throw new Error(`data.gouv: HTTP ${res.status}`)
  fs.writeFileSync(SRC, Buffer.from(await res.arrayBuffer()))
}
const circos = JSON.parse(fs.readFileSync(SRC, 'utf8'))
console.log(`Source: ${circos.features.length} circonscriptions → ${path.relative(ROOT, SRC)}`)

// ── 2. Land outline, from the SAME commune contours the admin tiles use ───────
// Dissolving first matters for more than tidiness: clipping against 35k separate
// commune polygons is a different (and far slower) operation than clipping
// against one land mass whose interior arcs have been removed.
const metroDepts = []
for (let i = 1; i <= 95; i++) {
  if (i === 20) continue
  metroDepts.push(String(i).padStart(2, '0'))
}
metroDepts.splice(metroDepts.indexOf('19') + 1, 0, '2A', '2B')
const allDepts = [...metroDepts, '971', '972', '973', '974', '975', '976']

console.log(`Fetching commune contours for ${allDepts.length} départements…`)
const communes = []
for (const dept of allDepts) {
  const url = `https://geo.api.gouv.fr/communes?codeDepartement=${dept}&format=geojson&geometry=contour&fields=code`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  dept ${dept}: HTTP ${res.status} — skipped`)
    continue
  }
  const fc = await res.json()
  for (const f of (fc.features ?? []).filter((f) => f.geometry)) {
    f.properties = { code: f.properties.code, land: 1 }
    communes.push(f)
  }
  process.stdout.write(`\r  ${dept}: total ${communes.length} communes      `)
}
console.log()

// The PLM arrondissements are part of the land, and NOT a subset of it.
// geo.api's contour for Marseille (13055) excludes the Frioul archipelago,
// Château d'If and the Riou/calanques islands, while its contours for the 2e,
// 7e, 8e, 9e and 16e arrondissements include them — and the arrondissements are
// what the commune layer actually DRAWS there (`NOT_PLM_CITY` hides the whole
// city). Building the land from communes alone therefore clipped those islands
// off the circonscription mesh: coloured on the communes tab, background on the
// circos tab. Adding them here puts them back in the land, and the fill below
// attributes them.
const PLM = path.join(ROOT, 'data-sources/plm-arrondissements.geojson')
if (!fs.existsSync(PLM)) {
  throw new Error(
    `Missing ${path.relative(ROOT, PLM)} — regenerate with: node scripts/build-plm-contours.mjs`,
  )
}
const plm = JSON.parse(fs.readFileSync(PLM, 'utf8'))
for (const f of plm.features) {
  if (!f.geometry) continue
  communes.push({ type: 'Feature', properties: { code: f.properties.code, land: 1 }, geometry: f.geometry })
}
console.log(`  + ${plm.features.length} PLM arrondissements → ${communes.length} polygons`)

const RAW = path.join(TMP, 'communes-raw.geojson')
const COMMUNES = path.join(TMP, 'communes.geojson')
const LAND = path.join(TMP, 'land.geojson')
fs.writeFileSync(RAW, JSON.stringify({ type: 'FeatureCollection', features: communes }))
// Simplify ONCE and keep the result: the land outline, the gap fill and the
// tiles all have to come off the same arcs, and re-simplifying per step would
// quietly reintroduce the disagreement this script exists to remove.
execSync(
  `npx mapshaper "${RAW}" -simplify interval=${SIMPLIFY_M} keep-shapes -o "${COMMUNES}"`,
  { stdio: 'inherit', cwd: ROOT },
)
execSync(`npx mapshaper "${COMMUNES}" -dissolve2 fields=land -o "${LAND}"`, {
  stdio: 'inherit',
  cwd: ROOT,
})

// ── 3. Clip ───────────────────────────────────────────────────────────────────
const CLIPPED = path.join(TMP, 'circos-clipped.geojson')
console.log('Clipping circonscriptions to the land outline…')
execSync(`npx mapshaper "${SRC}" -clip "${LAND}" -o "${CLIPPED}"`, { stdio: 'inherit', cwd: ROOT })

const clipped = JSON.parse(fs.readFileSync(CLIPPED, 'utf8'))
const before = new Set(circos.features.map((f) => f.properties.codeCirconscription))
const after = new Set(clipped.features.map((f) => f.properties.codeCirconscription))
const lost = [...before].filter((c) => !after.has(c))
console.log(`Clipped: ${clipped.features.length} features, ${after.size} distinct codes`)
if (lost.length) {
  // A circonscription vanishing means the clip ate it — never acceptable, it
  // would be a hole in the map and an unreachable territory in the UI.
  throw new Error(`Clip DROPPED ${lost.length} circonscription(s): ${lost.join(', ')}`)
}

// ── 4. Fill the land the source does not cover ────────────────────────────────
// Clipping can only REMOVE circonscription area, so it cannot fix the opposite
// defect: land that no circonscription polygon reaches. Measured against the
// commune contours, the source leaves **15 475 km² of France uncovered**, and
// 99% of it is two pieces in the Guyanese interior — 14 185 km² in the
// south-west (Papaichton / Grand-Santi / Maripasoula) and 1 055 km² around
// Camopi. The source is aggregated from bureau-de-vote contours and those
// remote communes evidently contributed none. On the map that is a black hole
// the size of a région sitting inside Guyane at every zoom (lucas reported it).
// The remaining ~140 km² is border vintage (35 km² in the Roya, 27 km² in the
// Pyrenees) and coastal slivers.
//
// The fill is derived from the ministry's own commune→circonscription table,
// which is the legal definition of the découpage, so it is not a guess. Only
// communes belonging to exactly ONE circonscription are used: the 125 split
// across several (Paris, Lyon, Marseille and the bigger cities) cannot be
// attributed whole, and they are dense urban ground the source covers anyway.
//
// Filling ALSO removes the coastal fringe, because it makes the circonscription
// mesh's coastline the commune coastline by construction.
const SUBCOM = path.join(ROOT, 'data-sources/legislatives-2022/resultats-par-niveau-subcom-t1-france-entiere.txt')
if (!fs.existsSync(SUBCOM)) {
  throw new Error(
    `Missing ${path.relative(ROOT, SUBCOM)} — needed for the commune→circonscription table.\n` +
      `Fetch it with: node scripts/ingest.mjs legislative 2022 (it downloads the ministry sources).`,
  )
}
// One row per commune×circonscription, latin-1, ';'-separated.
const rows = fs.readFileSync(SUBCOM, 'latin1').split(/\r?\n/).slice(1)
const circoOfCommune = new Map()
const split = new Set()
for (const line of rows) {
  if (!line) continue
  const c = line.split(';')
  const dept = c[0]
  if (!dept || dept === 'ZZ') continue // Français de l'étranger: no geometry
  const insee = communeInsee2017(dept, c[4])
  // The tileset's ids: métropole/Corse `dept.pad2 + circo.pad2`, overseas the
  // raw Z-code + circo number (`ZC01`) — exactly the source's own convention.
  const circo = (ZDEPT[dept] ? dept : pad(dept, 2)) + pad(c[2], 2)
  const seen = circoOfCommune.get(insee)
  if (seen && seen !== circo) split.add(insee)
  else circoOfCommune.set(insee, circo)
}
console.log(
  `commune→circo table: ${circoOfCommune.size} communes, ${split.size} split across several circonscriptions (skipped)`,
)

// PLM arrondissements are not in the subcom table — the ministry counts them
// under the whole city (75056 / 69123 / 13055), which is split across many
// circonscriptions and therefore skipped above. But the BUREAU DE VOTE file
// gives dept + circo + commune + BV code, and the BV code is `AABB` with AA =
// the arrondissement (the same decoding `build-plm-arrondissements.mjs` uses).
// So arrondissement→circonscription is exact, straight from the ministry —
// no nearest-neighbour guessing for the Marseille islands.
// Arrondissements that are themselves split across circos (Marseille's 5e,
// 10e, 12e, 14e) are skipped by the same rule; none of them has a gap.
const BUREAUX = path.join(ROOT, 'data-sources/burvot-2022/burvot-legis-t1.txt')
if (!fs.existsSync(BUREAUX)) {
  throw new Error(
    `Missing ${path.relative(ROOT, BUREAUX)} — needed for the arrondissement→circonscription table.`,
  )
}
const PLM_CITY = { 75: '056', 69: '123', 13: '055' }
let plmSplit = 0
for (const line of fs.readFileSync(BUREAUX, 'latin1').split(/\r?\n/).slice(1)) {
  if (!line) continue
  const c = line.split(';')
  if (PLM_CITY[c[0]] !== c[4]) continue
  const arr = Math.floor(Number(c[6]) / 100)
  if (!arr) continue
  // Paris 751xx (1→01), Marseille 132xx (1→01), Lyon 693xx but OFFSET BY 80
  // (Lyon 1er is 69381, not 69301).
  const insee =
    c[0] === '75'
      ? '751' + pad(arr, 2)
      : c[0] === '69'
        ? '693' + pad(arr + 80, 2)
        : '132' + pad(arr, 2)
  const circo = pad(c[0], 2) + pad(c[2], 2)
  const seen = circoOfCommune.get(insee)
  if (seen && seen !== circo) {
    if (!split.has(insee)) plmSplit++
    split.add(insee)
  } else circoOfCommune.set(insee, circo)
}
console.log(`  + PLM arrondissements from the bureau file (${plmSplit} split across circos, skipped)`)

const GAPS = path.join(TMP, 'gaps.geojson')
const FILLRAW = path.join(TMP, 'fill-raw.geojson')
const FILL = path.join(TMP, 'fill.geojson')
console.log('Computing uncovered land…')
execSync(`npx mapshaper "${LAND}" -erase "${CLIPPED}" -explode -o "${GAPS}"`, {
  stdio: 'inherit',
  cwd: ROOT,
})
// Clip the COMMUNES by the gaps (not the reverse): that keeps each fragment's
// commune code, which is the only thing that says who the land belongs to.
execSync(`npx mapshaper "${COMMUNES}" -clip "${GAPS}" -o "${FILLRAW}"`, {
  stdio: 'inherit',
  cwd: ROOT,
})

const fillRaw = JSON.parse(fs.readFileSync(FILLRAW, 'utf8'))
let filled = 0
let orphan = 0
const fillFeatures = []
for (const f of fillRaw.features) {
  if (!f.geometry) continue
  const code = circoOfCommune.get(f.properties.code)
  if (!code || split.has(f.properties.code)) {
    orphan++
    continue
  }
  fillFeatures.push({
    type: 'Feature',
    properties: { codeCirconscription: code },
    geometry: f.geometry,
  })
  filled++
}
console.log(`Gap fill: ${filled} fragments attributed, ${orphan} left (split or unknown commune)`)
fs.writeFileSync(FILL, JSON.stringify({ type: 'FeatureCollection', features: fillFeatures }))

const MERGED = path.join(TMP, 'circos-final.geojson')
execSync(
  `npx mapshaper -i "${CLIPPED}" "${FILL}" combine-files -merge-layers force ` +
    `-dissolve2 fields=codeCirconscription copy-fields=codeDepartement,nomDepartement,nomCirconscription ` +
    `-o "${MERGED}"`,
  { stdio: 'inherit', cwd: ROOT },
)

const merged = JSON.parse(fs.readFileSync(MERGED, 'utf8'))
const finalCodes = new Set(merged.features.map((f) => f.properties.codeCirconscription))
const stillLost = [...before].filter((c) => !finalCodes.has(c))
if (stillLost.length) throw new Error(`Merge LOST ${stillLost.length}: ${stillLost.join(', ')}`)
console.log(`Merged: ${merged.features.length} features, ${finalCodes.size} distinct codes`)

// Residual check — what land is still uncovered after the fill.
const RESID = path.join(TMP, 'residual.geojson')
execSync(`npx mapshaper "${LAND}" -erase "${MERGED}" -explode -o "${RESID}"`, {
  stdio: 'inherit',
  cwd: ROOT,
})
console.log(`Residual uncovered land: ${areaKm2(RESID).toFixed(0)} km² (was ${areaKm2(GAPS).toFixed(0)} km²)`)

// ── 5. Tile ───────────────────────────────────────────────────────────────────
if (fs.existsSync(OUT)) {
  fs.copyFileSync(OUT, OUT + '.bak')
  console.log(`Backed up → ${path.relative(ROOT, OUT)}.bak`)
}
// `--simplification-at-maximum-zoom=1` keeps z12 at FULL detail. tippecanoe
// simplifies every zoom including the maximum, and the max-zoom tile is what
// you look at from z12 all the way in — at z15 the `-S 8` tolerance is 8×
// magnified and the coast reads as long straight chords. The commune mesh
// doesn't show this at the same setting because each commune is small and
// contributes only a short arc, so it keeps far more vertices (measured over
// La Grande-Motte at z12: 160 points for the communes against 36 for the
// circonscription covering the same ground). Only the max zoom is restored —
// z0–z11 keep `-S` and stay small.
console.log(`tippecanoe: circonscriptions (-S ${TIPPE_S}, full detail at z12)…`)
execSync(
  `tippecanoe -o "${OUT}" -Z0 -z12 --layer=circonscriptions --use-attribute-for-id=codeCirconscription --no-feature-limit --no-tile-size-limit -S ${TIPPE_S} --simplification-at-maximum-zoom=1 --force "${MERGED}"`,
  { stdio: 'inherit', cwd: ROOT },
)

fs.rmSync(TMP, { recursive: true, force: true })
console.log(`\nDone → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`)
console.log('NEXT: bump ?v=N on the circo entry in TILE_SOURCES, then re-run')
console.log('      build-territory-bboxes.mjs + build-overseas-circo-shapes.mjs, then sync-r2.sh')
