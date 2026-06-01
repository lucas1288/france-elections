/**
 * Builds commune→circonscription mapping from the official 2017 XLSX table,
 * then aggregates presidential election commune-level results to
 * circonscription level for rounds 1 and 2.
 *
 * Source files (already downloaded):
 *   /tmp/circo_mapping.xlsx  — official Table de correspondance communes↔circos 2017
 *   public/data/elections/presidential/2022/round1-communes.json
 *   public/data/elections/presidential/2022/round2-communes-choropleth.json
 *
 * Output:
 *   public/data/elections/presidential/2022/round1-circ-choropleth.json
 *   public/data/elections/presidential/2022/round2-circ-choropleth.json
 */

import { createRequire } from 'module'
import { readFileSync, writeFileSync } from 'fs'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

// ── Z-code → INSEE dept code (same mapping used in parse scripts) ──────────────
const ZCODE_TO_INSEE = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976',
  ZN: '988', ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
}

// ── Build commune INSEE code from XLSX dept + commune codes ───────────────────
function toInseeCode(deptRaw, communeRaw) {
  const commune = String(communeRaw).padStart(3, '0')
  if (typeof deptRaw === 'number') {
    return String(deptRaw).padStart(2, '0') + commune
  }
  if (deptRaw === '2A' || deptRaw === '2B') return deptRaw + commune
  if (ZCODE_TO_INSEE[deptRaw]) return ZCODE_TO_INSEE[deptRaw] + commune
  return String(deptRaw).padStart(2, '0') + commune
}

// ── Build circonscription code to match GeoJSON `codeCirconscription` ─────────
// GeoJSON format: dept_padded_2 + circ_padded_2, e.g. '7501', '0104'
// For 2A/2B and overseas, use dept as-is + circ padded 2
function toCircoCode(deptRaw, circNum) {
  const circ = String(circNum).padStart(2, '0')
  if (typeof deptRaw === 'number') return String(deptRaw).padStart(2, '0') + circ
  if (deptRaw === '2A' || deptRaw === '2B') return deptRaw + circ
  if (ZCODE_TO_INSEE[deptRaw]) return ZCODE_TO_INSEE[deptRaw].padStart(2, '0') + circ
  return String(deptRaw).padStart(2, '0') + circ
}

// ── Parse XLSX → Map<inseeCode, Set<circoCode>> ───────────────────────────────
console.log('Parsing XLSX mapping…')
const wb = XLSX.readFile('/tmp/circo_mapping.xlsx')
const ws = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1) // skip header

// commune INSEE → set of circo codes (some communes split across circos)
const communeToCircos = new Map()

for (const row of rows) {
  const [deptRaw, , communeRaw, , circNum] = row
  if (!deptRaw || !communeRaw || !circNum) continue

  const inseeCode = toInseeCode(deptRaw, communeRaw)
  const circoCode = toCircoCode(deptRaw, circNum)

  if (!communeToCircos.has(inseeCode)) communeToCircos.set(inseeCode, new Set())
  communeToCircos.get(inseeCode).add(circoCode)
}

// Keep only communes that map to exactly one circo (avoids inflating multi-circo cities)
const communeToCirco = new Map()
let multiCount = 0
for (const [inseeCode, circos] of communeToCircos) {
  if (circos.size === 1) {
    communeToCirco.set(inseeCode, [...circos][0])
  } else {
    multiCount++
  }
}
console.log(`Mapping: ${communeToCirco.size} single-circo communes, ${multiCount} multi-circo (skipped)`)

// ── Aggregate helper ──────────────────────────────────────────────────────────
function aggregateRound(sourceFile, round, candidates) {
  const source = JSON.parse(readFileSync(sourceFile, 'utf8'))
  const communes = source.communes

  // circo code → { votes per candidate, expressedVotes, ... }
  const byCirco = new Map()

  for (const commune of communes) {
    const circoCode = communeToCirco.get(commune.inseeCode)
    if (!circoCode) continue

    if (!byCirco.has(circoCode)) {
      byCirco.set(circoCode, {
        code: circoCode,
        expressedVotes: 0,
        candidateVotes: new Map(), // name → votes
      })
    }

    const entry = byCirco.get(circoCode)

    // If source is full commune data (has candidates array)
    if (commune.candidates) {
      entry.expressedVotes += commune.expressedVotes ?? 0
      for (const cand of commune.candidates) {
        entry.candidateVotes.set(cand.name, (entry.candidateVotes.get(cand.name) ?? 0) + cand.votes)
      }
    } else {
      // Choropleth-only data — just track leading candidate count (approximate)
      const name = commune.leadingCandidate
      entry.candidateVotes.set(name, (entry.candidateVotes.get(name) ?? 0) + 1)
    }
  }

  // Build output: find leading candidate per circo
  const circoList = []
  for (const [circoCode, entry] of byCirco) {
    let leading = ''
    let leadingVotes = -1
    for (const [name, votes] of entry.candidateVotes) {
      if (votes > leadingVotes) { leadingVotes = votes; leading = name }
    }
    if (leading) circoList.push({ inseeCode: circoCode, leadingCandidate: leading })
  }

  return {
    granularity: 'circonscription',
    year: 2022,
    round,
    candidates,
    communes: circoList,
  }
}

// ── Round 1 ───────────────────────────────────────────────────────────────────
const r1Full = JSON.parse(readFileSync(
  'public/data/elections/presidential/2022/round1-communes.json', 'utf8'
))
const r1Candidates = r1Full.candidates.map(c => ({ name: c.name, party: c.party }))
const r1Output = aggregateRound(
  'public/data/elections/presidential/2022/round1-communes.json', 1, r1Candidates
)
writeFileSync(
  'public/data/elections/presidential/2022/round1-circ-choropleth.json',
  JSON.stringify(r1Output),
)
console.log(`Round 1: ${r1Output.communes.length} circonscriptions written`)

// ── Round 2 ───────────────────────────────────────────────────────────────────
const r2Choropleth = JSON.parse(readFileSync(
  'public/data/elections/presidential/2022/round2-communes-choropleth.json', 'utf8'
))
const r2Candidates = r2Choropleth.candidates
const r2Output = aggregateRound(
  'public/data/elections/presidential/2022/round2-communes-choropleth.json', 2, r2Candidates
)
writeFileSync(
  'public/data/elections/presidential/2022/round2-circ-choropleth.json',
  JSON.stringify(r2Output),
)
console.log(`Round 2: ${r2Output.communes.length} circonscriptions written`)
