/**
 * Fetches overseas (DOM + COM) commune contours from geo.api.gouv.fr and writes
 * one combined GeoJSON (data-sources/overseas-communes.geojson) with a `code`
 * property = INSEE code (matches the election data). This is tiled by tippecanoe
 * and tile-joined into france-admin.pmtiles' `communes` layer (see README), so
 * overseas communes become first-class commune polygons on the map.
 *
 * Run: node scripts/build-overseas-communes.mjs
 */

import { writeFileSync } from 'fs'

// Overseas département codes present in the election data.
const DEPTS = ['971', '972', '973', '974', '975', '976', '977', '978', '986', '987', '988']

const features = []
for (const dept of DEPTS) {
  const url = `https://geo.api.gouv.fr/communes?codeDepartement=${dept}&format=geojson&geometry=contour&fields=code,nom`
  try {
    const res = await fetch(url)
    if (!res.ok) { console.log(`dept ${dept}: HTTP ${res.status} — skipped`); continue }
    const fc = await res.json()
    const feats = fc.features ?? []
    for (const f of feats) {
      // Keep only code + nom in properties (the rest is unused).
      f.properties = { code: f.properties.code, nom: f.properties.nom }
      features.push(f)
    }
    console.log(`dept ${dept}: ${feats.length} communes`)
  } catch (e) {
    console.log(`dept ${dept}: ${e.message} — skipped`)
  }
}

const out = 'data-sources/overseas-communes.geojson'
writeFileSync(out, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`\nWrote ${features.length} overseas communes → ${out}`)
