// Carry round-1 results into legislative round-2 files for territories that had
// NO round-2 vote (their circo(s) were won outright at round 1, e.g. Saint-Denis
// 93066 in 2024 — Coquerel/Peu elected at R1 — or the whole of Wallis-et-Futuna,
// dept 986, whose single circo was decided at R1).
//
// The circo-level parsers already do this carry-forward (parse-legislatives-*.mjs
// "decided at r1"), so round2-circ*.json are complete (577); but the commune and
// département outputs were emitted per-round from the ministry files only, leaving
// holes at T2: 3,852 communes + dept 986 in 2024; 102 communes (Mayenne circos +
// Paris 19e arrondissement) in 2022. Those territories rendered uncolored on the
// T2 commune/dept views while the same territory was colored on the T2 circo view.
//
// This script is the LAST step of the legislative data pipeline (after the
// parsers and, for 2022, build-plm-arrondissements.mjs): for each level, append
// to round 2 every round-1 entry whose inseeCode is absent, and recompute the
// top-level `candidates` list from the merged entries. Idempotent — re-running
// finds nothing missing.
//
//   node scripts/carry-r1-into-round2.mjs
import { readFileSync, writeFileSync, existsSync } from 'fs'

const ELEC = 'public/data/elections/legislative'

const read = (p) => JSON.parse(readFileSync(p, 'utf8'))

// Rebuild the `candidates` list the way the parsers' nuanceList does: nuances
// ranked by total votes desc. At these levels candidate `name` IS the nuance
// label, so the label is taken from the first occurrence of each party code.
function nuanceList(entries) {
  const totals = new Map()
  const labels = new Map()
  for (const e of entries) {
    for (const c of e.candidates) {
      totals.set(c.party, (totals.get(c.party) ?? 0) + c.votes)
      if (!labels.has(c.party)) labels.set(c.party, c.name)
    }
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => ({ name: labels.get(n), party: n }))
}

function carry(year, r1Path, r2Path, { candidates } = {}) {
  const p1 = `${ELEC}/${year}/${r1Path}`
  const p2 = `${ELEC}/${year}/${r2Path}`
  if (!existsSync(p1) || !existsSync(p2)) { console.log(`skip ${p2} (missing)`); return null }
  const r1 = read(p1)
  const r2 = read(p2)
  const have = new Set(r2.communes.map((c) => c.inseeCode))
  const missing = r1.communes.filter((c) => !have.has(c.inseeCode))
  if (!missing.length) { console.log(`${year} ${r2Path}: complete (${r2.communes.length})`); return r2.candidates }
  r2.communes = [...r2.communes, ...missing]
  // Choropleth entries carry no per-candidate votes → reuse the list recomputed
  // for the sibling full file so the pair stays consistent.
  r2.candidates = candidates ?? nuanceList(r2.communes)
  writeFileSync(p2, JSON.stringify(r2))
  console.log(`${year} ${r2Path}: +${missing.length} carried from round 1 → ${r2.communes.length}`)
  return r2.candidates
}

for (const year of [2012, 2017, 2022, 2024]) {
  carry(year, 'round1.json', 'round2.json') // départements
  const cands = carry(year, 'round1-communes.json', 'round2-communes.json')
  carry(year, 'round1-communes-choropleth.json', 'round2-communes-choropleth.json', { candidates: cands ?? undefined })
}
