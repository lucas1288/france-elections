// Fetch Paris/Lyon/Marseille arrondissement contours from geo.api.gouv.fr and
// write a GeoJSON FeatureCollection (one feature per arrondissement, `code`
// property = INSEE arrondissement code) for tippecanoe → tile-join into the
// `communes` layer of france-admin.pmtiles.
//
// Usage: node scripts/build-plm-contours.mjs

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUT = path.join(ROOT, 'data-sources/plm-arrondissements.geojson')

const codes = []
for (let i = 75101; i <= 75120; i++) codes.push(String(i))
for (let i = 69381; i <= 69389; i++) codes.push(String(i))
for (let i = 13201; i <= 13216; i++) codes.push(String(i))

const features = []
for (const code of codes) {
  const r = await fetch(`https://geo.api.gouv.fr/communes/${code}?fields=nom,code,contour&format=json`)
  if (!r.ok) { console.warn(`  ${code}: HTTP ${r.status}`); continue }
  const j = await r.json()
  if (!j.contour) { console.warn(`  ${code}: no contour`); continue }
  features.push({
    type: 'Feature',
    properties: { code: j.code, nom: j.nom },
    geometry: j.contour,
  })
  process.stdout.write(`\r  fetched ${features.length}/${codes.length}`)
}
console.log()

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`Wrote ${features.length} arrondissement contours → ${path.relative(ROOT, OUT)}`)
