#!/usr/bin/env node
/**
 * Fill the ONE hole in the shipped data: présidentielle 2022, round 2, at
 * commune level.
 *
 * WHY (Aug 2026, lucas reported it via Paris): the Interior ministry never
 * published a per-commune breakdown for that round, so `round2-communes.json`
 * simply did not exist. Everything downstream degraded: a selected commune fell
 * back to its département with an amber advisory, and the PLM arrondissement
 * breakdown could not render at all — "why don't we have the Arrondissements
 * results? It seems odd to me". Only the leader-per-commune choropleth existed.
 *
 * The data IS available: data.gouv's consolidated "Données des élections
 * agrégées" (bureau-de-vote level, harmonized) covers 2022, and we already have
 * a generic adapter for it. Verified before trusting it — regenerating ROUND 1
 * from that source and diffing against our ministry-sourced `round1-communes.json`
 * gives **35 290 communes compared, zero differences** in inscrits and in every
 * candidate's votes. So the same source for round 2 is not a downgrade.
 *
 * SURGICAL BY DESIGN. `presidential-2022` is `legacy: true` in the registry —
 * its `round2.json` is the hand-rebuilt dept file (the ministry's own was
 * corrupt) and round 1 is ministry-sourced. This script therefore writes
 * EXACTLY TWO files and leaves the other eight alone:
 *   round2-communes.json            (new)
 *   round2-communes-choropleth.json (replaced — gains real abstention + PLM)
 *
 * Two things the generic adapter can't know:
 *  - `party` is empty, because the agrégées dataset carries no `nuance` for the
 *    2022 presidential. Filled from the shipped dept file's own candidate list
 *    (LREM / RN) so colours and the "(LREM)" row tags match round 1.
 *  - COG drift is handled afterwards by the normal pipeline step, not here.
 *
 * Run:
 *   python3 scripts/extract-agregees.py 2022_pres_t1 2022_pres_t2
 *   node scripts/repair-pres-2022-t2-communes.mjs
 *   node scripts/inject-merged-commune-results.mjs   # the 10 COG-drift codes
 *   node scripts/mark-annulled-communes.mjs
 * then scripts/deploy/sync-r2.sh (public/data is not git-tracked).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = path.resolve(import.meta.dirname, '..')
const DIR = path.join(ROOT, 'public/data/elections/presidential/2022')
const SRC = path.join(ROOT, 'data-sources/agregees')

for (const f of ['2022_pres_t1-general.csv', '2022_pres_t2-general.csv']) {
  if (!fs.existsSync(path.join(SRC, f))) {
    throw new Error(
      `Missing data-sources/agregees/${f}\n` +
        `Run: python3 scripts/extract-agregees.py 2022_pres_t1 2022_pres_t2  (needs pip duckdb)`,
    )
  }
}

// The adapter emits the whole standard set; we lift two files out of it. Both
// rounds are parsed because round 1 is what proves the source (see header).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'pres2022t2-'))
console.log('Regenerating prés-2022 from the agrégées dataset…')
execFileSync('node', ['scripts/parse-agregees.mjs', 'presidential', '2022', `--out=${TMP}`], {
  cwd: ROOT,
  stdio: 'inherit',
})

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const fresh = read(path.join(TMP, 'round2-communes.json'))
const freshChoro = read(path.join(TMP, 'round2-communes-choropleth.json'))
const dept = read(path.join(DIR, 'round2.json'))

// ── Guard: round 1 must reproduce what we already ship, exactly ──────────────
// If this ever stops holding, the source or the adapter changed and the round-2
// output cannot be trusted either.
const r1Fresh = read(path.join(TMP, 'round1-communes.json'))
const r1Ship = read(path.join(DIR, 'round1-communes.json'))
const shipByCode = new Map(r1Ship.communes.map((c) => [c.inseeCode, c]))
let compared = 0
const drift = []
for (const c of r1Fresh.communes) {
  const s = shipByCode.get(c.inseeCode)
  if (!s) continue
  compared++
  if (c.registeredVoters !== s.registeredVoters) drift.push(`${c.inseeCode} inscrits`)
  for (const cand of c.candidates) {
    const m = s.candidates.find((x) => x.name === cand.name)
    if (!m || m.votes !== cand.votes) drift.push(`${c.inseeCode} ${cand.name}`)
  }
}
if (drift.length) {
  throw new Error(
    `Round-1 cross-check FAILED on ${drift.length} field(s), e.g. ${drift.slice(0, 5).join(', ')}`,
  )
}
console.log(`Round-1 cross-check: ${compared} communes, 0 differences ✓`)

// ── Fill the party codes the source doesn't carry ────────────────────────────
const partyByName = new Map(dept.candidates.map((c) => [c.name, c.party]))
const fillParty = (list) =>
  list.map((c) => ({ ...c, party: c.party || (partyByName.get(c.name) ?? '') }))
fresh.candidates = fillParty(fresh.candidates)
for (const c of fresh.communes) c.candidates = fillParty(c.candidates)
freshChoro.candidates = fillParty(freshChoro.candidates)
const missing = fresh.candidates.filter((c) => !c.party)
if (missing.length) throw new Error(`No party code for: ${missing.map((c) => c.name).join(', ')}`)

// ── Guard: the commune file must sum to the dept file we already ship ────────
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0)
const deptTotals = {
  registeredVoters: sum(dept.communes, (c) => c.registeredVoters),
  turnout: sum(dept.communes, (c) => c.turnout),
}
// PLM arrondissements duplicate their whole-city entry — exclude them from sums.
const PLM = /^(751\d\d|693(8[1-9])|132\d\d)$/
const real = fresh.communes.filter((c) => !PLM.test(c.inseeCode))
const communeTotals = {
  registeredVoters: sum(real, (c) => c.registeredVoters),
  turnout: sum(real, (c) => c.turnout),
}
for (const k of ['registeredVoters', 'turnout']) {
  if (deptTotals[k] !== communeTotals[k]) {
    throw new Error(
      `${k} mismatch: communes ${communeTotals[k].toLocaleString('fr-FR')} vs départements ${deptTotals[k].toLocaleString('fr-FR')}`,
    )
  }
}
console.log(
  `Totals vs the shipped dept file: inscrits ${communeTotals.registeredVoters.toLocaleString('fr-FR')} ✓  votants ${communeTotals.turnout.toLocaleString('fr-FR')} ✓`,
)

// ── Write the two files, and only those two ─────────────────────────────────
const out = (name, data) => {
  fs.writeFileSync(path.join(DIR, name), JSON.stringify(data))
  const kb = (fs.statSync(path.join(DIR, name)).size / 1024).toFixed(0)
  console.log(`  ${name} (${kb} KB)`)
}
out('round2-communes.json', fresh)
out('round2-communes-choropleth.json', freshChoro)
fs.rmSync(TMP, { recursive: true, force: true })

const arr = fresh.communes.filter((c) => PLM.test(c.inseeCode)).length
console.log(`\n${fresh.communes.length} commune entries, ${arr} PLM arrondissements.`)
console.log('NEXT: node scripts/inject-merged-commune-results.mjs')
console.log('      node scripts/mark-annulled-communes.mjs')
console.log('      scripts/deploy/sync-r2.sh')
