/**
 * Injects synthetic commune entries so every tile polygon has election data.
 *
 * The June 2026 tile rebuild (build-departements.mjs) fetches CURRENT geo.api
 * contours, so the `communes` layer follows the current COG — which drifts from
 * the ministry election files (2022/2024 vintages) in two ways:
 *
 *  1. Code migrations: a commune nouvelle now carries a different constituent's
 *     code than the one the ministry files use (e.g. Conques-en-Rouergue is
 *     12218 in the COG but 12076 in every election file).
 *  2. Défusions: communes restored after the vote (e.g. the four ex-Neussargues-
 *     en-Pinatelle villages, split back 2025) have polygons but voted as their
 *     former parent.
 *
 * Either way the polygon renders blank and hover/click find nothing. The static
 * MERGED_COMMUNE_TO_CURRENT map can't express this (it translates unconditionally
 * across all elections; these need per-election resolution). Fix: copy the entry
 * that actually holds the votes into the election files under the tile's code.
 * The sidebar then shows the results (and name) of the commune the votes were
 * counted under — same UX as the merged-communes translation.
 *
 * TILE_CODE_TO_DATA_CODE matches the current tileset. If the tiles are rebuilt
 * against a newer COG, re-derive it: diff tile codes (tippecanoe-decode -Z12 -z12
 * -l communes … | grep -o '"code": "[^"]*"' | sort -u) against each election's
 * commune data; resolve names via the election files + Étalab's communes.json
 * (communes déléguées carry a chefLieu pointer). Unresolved leftovers are
 * reported by this script.
 *
 * Idempotent; skips codes the election already has data for (e.g. L'Oie 85165
 * voted on its own in 2024 but as Essarts-en-Bocage in 2022). The four destroyed
 * WWI villages of the Meuse (55039/55139/55239/55307) are intentionally blank.
 *
 * Run after the parsers (all election dirs):
 *   node scripts/inject-merged-commune-results.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'

const ELEC = 'public/data/elections'

// tile (current COG) code → code the ministry election files use.
const TILE_CODE_TO_DATA_CODE = {
  '12218': '12076', // Conques-en-Rouergue (COG moved to the St-Cyprien code)
  '14581': '14011', // Aurseulles
  '49126': '49069', // Orée d'Anjou / Orée-d'Anjou
  '69114': '69159', // Porte des Pierres Dorées
  '15031': '15141', // Celles          — ex-Neussargues en Pinatelle (défusion 2025)
  '15035': '15141', // Chalinargues    — idem
  '15047': '15141', // Chavagnac       — idem
  '15171': '15141', // Sainte-Anastasie — idem
  '85165': '85084', // L'Oie           — ex-Essarts en Bocage (défusion 2024; has own 2024 data)
  '85212': '85084', // Sainte-Florence — idem
}
const INTENTIONALLY_BLANK = new Set(['55039', '55139', '55239', '55307']) // Meuse, destroyed 1914-18

const DIRS = ['presidential/2022', 'legislative/2022', 'legislative/2024']
const FILES = ['round1-communes.json', 'round2-communes.json', 'round1-communes-choropleth.json', 'round2-communes-choropleth.json']

for (const dir of DIRS) {
  for (const f of FILES) {
    const p = `${ELEC}/${dir}/${f}`
    if (!existsSync(p)) { console.log(`skip ${p}`); continue }
    const d = JSON.parse(readFileSync(p, 'utf8'))
    const byCode = new Map(d.communes.map((c) => [c.inseeCode, c]))
    let n = 0
    for (const [tileCode, dataCode] of Object.entries(TILE_CODE_TO_DATA_CODE)) {
      if (byCode.has(tileCode)) continue // has its own results (or already injected)
      const src = byCode.get(dataCode)
      if (!src) continue
      d.communes.push({ ...src, inseeCode: tileCode })
      n++
    }
    if (n) writeFileSync(p, JSON.stringify(d))
    console.log(`${dir}/${f}: +${n} injected`)
  }
}

// Report any still-blank tile polygons (needs the tile code list; optional).
// Accounts for MERGED_COMMUNE_TO_CURRENT — polygons it translates are colored
// app-side, so they're not blank even without a direct data entry.
const TILE_CODES = 'scratch-tile-codes.txt'
if (existsSync(TILE_CODES)) {
  const tiles = readFileSync(TILE_CODES, 'utf8').trim().split('\n')
  const mergedTs = readFileSync('src/utils/mergedCommunes.ts', 'utf8')
  const merged = Object.fromEntries([...mergedTs.matchAll(/'(\w+)': '(\w+)'/g)].map((m) => [m[1], m[2]]))
  for (const dir of DIRS) {
    const d = JSON.parse(readFileSync(`${ELEC}/${dir}/round1-communes-choropleth.json`, 'utf8'))
    const codes = new Set(d.communes.map((c) => c.inseeCode))
    const blank = tiles.filter(
      (c) => !codes.has(c) && !codes.has(merged[c]) && !INTENTIONALLY_BLANK.has(c),
    )
    if (blank.length) console.log(`⚠ ${dir}: still-blank tile polygons: ${blank.join(' ')}`)
  }
}
