#!/usr/bin/env node
/**
 * Generates public/data/geo/overseas-circos.geojson — one polygon per OVERSEAS
 * circonscription, so the orbit's discs can colour a territory's silhouette by
 * circo instead of painting the whole outline one winner's colour (lucas, R4
 * review: "the overseas territory within it should have different colors …
 * when they have multiple circos").
 *
 * Source is the shipped circonscriptions.pmtiles, decoded with tippecanoe-decode
 * — the same approach build-territory-bboxes.mjs uses.
 *
 * IMPORTANT COVERAGE LIMIT: the circo tileset only ever contained polygons for
 * the DOM (Z-prefixes ZA/ZB/ZC/ZD/ZS/ZM → 971/972/973/974/975/976). The COM
 * circos — 977 St-Martin, 986 Wallis, 987 Polynésie, 988 Nouvelle-Calédonie —
 * have no geometry at all, so Polynésie (3 circos) and Nouvelle-Calédonie (2)
 * keep a single-colour silhouette; their segmented BORDER still shows the split.
 *
 * Usage: node scripts/build-overseas-circo-shapes.mjs
 * Requires: tippecanoe-decode on PATH. Re-run after any circo tile rebuild.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CIRCO = path.join(root, 'public/data/tiles/circonscriptions.pmtiles')
const OUT = path.join(root, 'public/data/geo/overseas-circos.geojson')

// Same mapping as FranceMap.tsx INSEE_TO_CIRCO_ZCODE, inverted.
const ZPREFIX_TO_INSEE = { ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZS: '975', ZM: '976' }

// These outlines are only ever drawn ~34px wide inside a disc, where ONE PIXEL
// is roughly 5 km of ground. z6 already carries far more shape than that, and 3
// decimals (~110 m) is still ~45× finer than a pixel — so both are chosen for
// size, not fidelity. Consecutive duplicate points (which rounding creates) are
// dropped afterwards.
const ZOOM = 6
const PRECISION = 1e3

function decode(file, layer, zoom) {
  const out = execFileSync('tippecanoe-decode', ['-l', layer, `-Z${zoom}`, `-z${zoom}`, file], {
    maxBuffer: 1024 * 1024 * 512,
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

/** Collect every polygon ring per circo code, across all tiles. */
function collectPolygons(decoded) {
  const byCode = new Map()
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Feature' && node.properties && node.geometry) {
      const raw = node.properties.codeCirconscription
      if (raw != null) {
        const z = String(raw)
        const insee = ZPREFIX_TO_INSEE[z.slice(0, 2)]
        if (insee) {
          const code = insee + z.slice(2)
          const g = node.geometry
          const polys =
            g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
          const list = byCode.get(code) ?? []
          list.push(...polys)
          byCode.set(code, list)
        }
      }
      return
    }
    if (Array.isArray(node.features)) node.features.forEach(walk)
    else for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v)
  }
  walk(decoded)
  return byCode
}

const roundPt = (c) => [
  Math.round(c[0] * PRECISION) / PRECISION,
  Math.round(c[1] * PRECISION) / PRECISION,
]
/** Round a ring and drop points rounding made identical to their neighbour. */
const roundRing = (ring) => {
  const out = []
  for (const pt of ring.map(roundPt)) {
    const prev = out[out.length - 1]
    if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt)
  }
  // A ring needs at least 4 points (first === last); drop degenerate slivers.
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]))
    out.push(out[0])
  return out.length >= 4 ? out : null
}
const roundPolys = (polys) =>
  polys
    .map((poly) => poly.map(roundRing).filter(Boolean))
    .filter((poly) => poly.length > 0)

console.log(`Decoding circonscriptions at z${ZOOM}…`)
const byCode = collectPolygons(decode(CIRCO, 'circonscriptions', ZOOM))

const features = [...byCode.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([code, polys]) => ({
    type: 'Feature',
    properties: { code, dept: code.slice(0, 3) },
    geometry: { type: 'MultiPolygon', coordinates: roundPolys(polys) },
  }))

writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))

const byDept = features.reduce((m, f) => {
  m[f.properties.dept] = (m[f.properties.dept] ?? 0) + 1
  return m
}, {})
console.log(`Wrote ${features.length} overseas circo shapes → ${path.relative(root, OUT)}`)
console.log('  per territory:', JSON.stringify(byDept))
console.log(`  ${(JSON.stringify({ features }).length / 1024).toFixed(0)} KB`)
