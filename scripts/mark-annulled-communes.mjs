#!/usr/bin/env node
/**
 * Marks communes whose ballots were entirely annulled (e.g. by the Conseil
 * constitutionnel — décision 2022-195 PDR annulled all suffrages in 14 communes
 * at the 2022 presidential round 1: Dénipaire, Cargèse, Blérancourt, Besmé, …).
 *
 * The ministry files record these as turnout > 0 but expressedVotes = 0 (every
 * ballot counted null). With all candidates at 0 votes, the parsers' "leader"
 * pick degrades to the first candidate on the ballot, so the map paints them
 * as won by that candidate (they all rendered "Arthaud en tête").
 *
 * This script sweeps every full commune/circo/dept file: entries matching the
 * pattern get `annulled: true` and `leadingCandidate: ''` (→ neutral map color,
 * notice in the detail panels). Choropleth siblings are fixed via the codes
 * found in their full-data file. Idempotent — run after any parser re-run,
 * AFTER carry-r1-into-round2.mjs and inject-merged-commune-results.mjs.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'public', 'data', 'elections')

const isAnnulled = (c) => c.turnout > 0 && c.expressedVotes === 0

function markFull(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const codes = []
  for (const c of data.communes) {
    if (!isAnnulled(c)) continue
    codes.push(c.inseeCode)
    c.annulled = true
    c.leadingCandidate = ''
  }
  if (codes.length) writeFileSync(path, JSON.stringify(data))
  return codes
}

function markChoropleth(path, codes) {
  if (!existsSync(path) || !codes.length) return 0
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const set = new Set(codes)
  let n = 0
  for (const c of data.communes) {
    if (!set.has(c.inseeCode)) continue
    c.annulled = true
    c.leadingCandidate = ''
    n++
  }
  if (n) writeFileSync(path, JSON.stringify(data))
  return n
}

for (const type of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const year of readdirSync(join(ROOT, type.name))) {
    const dir = join(ROOT, type.name, year)
    for (const file of readdirSync(dir)) {
      // Full-data files: roundN.json (dept), roundN-communes.json, roundN-circ.json
      const m = file.match(/^(round\d+)(-communes|-circ)?\.json$/)
      if (!m) continue
      const codes = markFull(join(dir, file))
      if (!codes.length) continue
      console.log(`${type.name}/${year}/${file}: ${codes.length} annulled → ${codes.join(', ')}`)
      const choro = join(dir, `${m[1]}${m[2] ?? ''}-choropleth.json`)
      const n = markChoropleth(choro, codes)
      if (n) console.log(`  + choropleth sibling: ${n} entries marked`)
    }
  }
}
console.log('done')
