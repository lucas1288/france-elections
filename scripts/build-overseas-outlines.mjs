/**
 * Rebuild public/data/geo/overseas.geojson from the SAME commune contours the
 * tiles are built from.
 *
 * WHY (Aug 7 2026, lucas reported it): overseas territories are the one place
 * where THREE fills stack on the same ground — `overseas-fill` (this file,
 * coloured with the DÉPARTEMENT winner) sits under `communes-fill`/`circo-fill`
 * at every zoom. This file came from a different source than the tiles, so its
 * coastline simply disagreed with them: measured at 10.1 px median / 30 px p90
 * of disagreement in a Guyane tile at z10. That showed as a fringe of the dept's
 * colour all along every overseas coast — La Réunion rimmed in Mélenchon red
 * under orange Macron communes, Mayotte in Fillon blue, Guyane in red.
 *
 * Metropolitan France never had the problem because it has no equivalent layer:
 * there, `dept-fill` and `communes-fill` are both dissolved from one set of
 * arcs. This script gives the overseas underlay the same property.
 *
 * Verified NOT caused by the A3 generalisation: the same measurement against the
 * pre-A3 tiles gave an identical 10.10 px median.
 *
 * WHAT IT DOES
 *   - DOM (971–976): fetch commune contours from geo.api.gouv.fr, generalise at
 *     the same tolerance the tiles use, dissolve to one polygon per dept.
 *   - COM (977, 986, 987, 988): PRESERVED byte-for-byte from the existing file.
 *     geo.api serves no commune contours for them, so they have no polygons in
 *     the tiles either — nothing is ever drawn over them, so there is nothing to
 *     disagree with, and this file is their only geometry.
 *
 * A residual mismatch remains by design: the tiles are additionally simplified
 * per-zoom by tippecanoe (`-S`), this file is not. That residual is ~1 px at
 * z10, against the ~10 px it replaces.
 *
 * Run: node scripts/build-overseas-outlines.mjs [--simplify=20]
 * (build-departements.mjs runs it automatically at the end of a tile rebuild.)
 *
 * REMEMBER: public/data is not git-tracked — ship it with scripts/deploy/sync-r2.sh.
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'public/data/geo/overseas.geojson')
const TMP = fs.mkdtempSync(path.join(import.meta.dirname, '.overseas-build-'))

const argv = process.argv.slice(2)
const arg = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}
/** Must match build-departements.mjs, or the arcs stop being the same arcs. */
const SIMPLIFY_M = Number(arg('simplify', '20'))

/** Départements geo.api serves commune contours for — the ones drawn over. */
const DOM = ['971', '972', '973', '974', '975', '976']

const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'))
const byCode = new Map(existing.features.map((f) => [f.properties.code, f]))

console.log(`Fetching commune contours for ${DOM.length} overseas départements…`)
const communes = []
for (const dept of DOM) {
  const url = `https://geo.api.gouv.fr/communes?codeDepartement=${dept}&format=geojson&geometry=contour&fields=code,nom`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`dept ${dept}: HTTP ${res.status}`)
  const fc = await res.json()
  const feats = (fc.features ?? []).filter((f) => f.geometry)
  for (const f of feats) {
    f.properties = { code: f.properties.code, dept }
    communes.push(f)
  }
  console.log(`  ${dept}: ${feats.length} communes`)
}

const SRC = path.join(TMP, 'communes.geojson')
const DISSOLVED = path.join(TMP, 'dissolved.geojson')
fs.writeFileSync(SRC, JSON.stringify({ type: 'FeatureCollection', features: communes }))

// Same two steps, same order, same tolerance as the tile build — that identity
// is the entire point of this script.
execSync(
  `npx mapshaper "${SRC}" -simplify interval=${SIMPLIFY_M} keep-shapes -dissolve2 fields=dept -o "${DISSOLVED}"`,
  { stdio: 'inherit', cwd: ROOT },
)

const dissolved = JSON.parse(fs.readFileSync(DISSOLVED, 'utf8'))

/**
 * Ring winding: match the file's EXISTING convention — exterior CLOCKWISE.
 *
 * This is not cosmetic and it is not the map's problem. MapLibre fills polygons
 * with planar rules and doesn't care, so the map rendered correctly either way.
 * But the overseas ORBIT and the mobile overlay draw these same features with
 * **d3-geo**, which is SPHERICAL: there, winding is what distinguishes a polygon
 * from its complement — everything on the globe EXCEPT that polygon. mapshaper
 * emits RFC 7946 (exterior counter-clockwise); the rest of this file is the
 * older clockwise convention. Shipping the mix turned every rebuilt DOM
 * silhouette into a filled square (d3 drawing "the whole sphere", clipped to the
 * disc) while the four preserved COM entries still drew their real shapes.
 */
function windClockwise(geometry) {
  const signedArea = (ring) => {
    let a = 0
    for (let i = 0; i < ring.length - 1; i++)
      a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2
  }
  // Exterior ring clockwise (negative area), holes counter-clockwise.
  const fixPolygon = (rings) =>
    rings.map((ring, i) => {
      const wantNegative = i === 0
      const isNegative = signedArea(ring) < 0
      return isNegative === wantNegative ? ring : [...ring].reverse()
    })
  return geometry.type === 'Polygon'
    ? { ...geometry, coordinates: fixPolygon(geometry.coordinates) }
    : { ...geometry, coordinates: geometry.coordinates.map(fixPolygon) }
}

const newByCode = new Map(
  dissolved.features.map((f) => [f.properties.dept, { ...f, geometry: windClockwise(f.geometry) }]),
)

// Rebuild in the ORIGINAL feature order and with the original properties: the
// orbit, the mobile overlay and the map all key off `code`, and `nom` is shown
// to users.
const features = existing.features.map((old) => {
  const fresh = newByCode.get(old.properties.code)
  if (!fresh) return old
  return { type: 'Feature', properties: { ...old.properties }, geometry: fresh.geometry }
})

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))
fs.rmSync(TMP, { recursive: true, force: true })

const count = (g) =>
  g.type === 'Polygon'
    ? g.coordinates.reduce((a, r) => a + r.length, 0)
    : g.coordinates.reduce((a, p) => a + p.reduce((b, r) => b + r.length, 0), 0)
console.log(`\nWrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`)
for (const f of features) {
  const src = newByCode.has(f.properties.code) ? 'rebuilt from commune arcs' : 'preserved (no contours)'
  console.log(`  ${f.properties.code} ${f.properties.nom.padEnd(34)} ${String(count(f.geometry)).padStart(6)} pts  ${src}`)
}
