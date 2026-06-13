/**
 * Adds an `abstention` field (percentage, 1 decimal) to every choropleth entry,
 * derived from its full-data sibling (registeredVoters / turnout joined by
 * inseeCode). This lets the abstention map view render from the lightweight
 * choropleth (~2 MB) without loading the full commune file (~34 MB).
 *
 * Idempotent. Skips a choropleth when its full-data file is absent (e.g. the
 * round-2 presidential commune data, whose ministry source is no longer on disk).
 *
 * Run: node scripts/add-choropleth-abstention.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

const ROOT = 'public/data/elections'
const SUFFIX = { commune: 'communes', circonscription: 'circ' }

const index = JSON.parse(readFileSync(`${ROOT}/index.json`, 'utf8'))

function abstentionByCode(fullPath) {
  const full = JSON.parse(readFileSync(fullPath, 'utf8'))
  const m = new Map()
  for (const c of full.communes) {
    const reg = c.registeredVoters
    if (reg) m.set(c.inseeCode, Math.round(((reg - c.turnout) / reg) * 1000) / 10)
  }
  return m
}

for (const e of index.elections) {
  for (let round = 1; round <= e.rounds; round++) {
    for (const gran of e.granularities) {
      const base = `${ROOT}/${e.type}/${e.year}/round${round}-${SUFFIX[gran]}`
      const choroPath = `${base}-choropleth.json`
      const fullPath = `${base}.json`
      if (!existsSync(choroPath) || !existsSync(fullPath)) continue

      const abst = abstentionByCode(fullPath)
      const choro = JSON.parse(readFileSync(choroPath, 'utf8'))
      let filled = 0
      for (const c of choro.communes) {
        const a = abst.get(c.inseeCode)
        if (a !== undefined) { c.abstention = a; filled++ }
      }
      writeFileSync(choroPath, JSON.stringify(choro))
      console.log(`${choroPath}: abstention set on ${filled}/${choro.communes.length}`)
    }
  }
}
