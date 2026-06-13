/**
 * Parses the ministry result files for the 2022 legislative elections
 * (data-sources/legislatives-2022/, downloaded from data.gouv.fr) and emits:
 *
 *   round{N}.json                 — département-level aggregates by nuance
 *   round{N}-circ.json            — full per-circonscription candidate results
 *   round{N}-circ-choropleth.json — circo code + leading nuance label
 *
 * Coloring model: the "candidates" of dept-level data and the choropleth
 * leaders are NUANCES (the ministry's political families — in 2022 the
 * pre-electoral alliances NUPES and Ensemble are nuance codes of their own),
 * while per-circo full data keeps real candidate names with their nuance as
 * `party`. Colors resolve via palette.json by nuance code.
 *
 * Circos decided in round 1 (candidate elected with >50%) are merged into the
 * round-2 outputs so the round-2 map has no holes.
 *
 * Formats:
 *   cirlg: 19 fixed cols; then per candidate ×9: Panneau;Sexe;Nom;Prénom;Nuance;Voix;%Ins;%Exp;Sièges('Elu')
 *   dpt:   17 fixed cols; then per nuance ×5: Code Nuance;Voix;%Ins;%Exp;Sièges
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'

const SRC = 'data-sources/legislatives-2022'
const OUT = 'public/data/elections/legislative/2022'

// Ministry dept code → INSEE dept code (same convention as parse-cirlg-2022.mjs)
const ZDEPT = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976', ZS: '975',
  ZW: '986', ZX: '977', ZP: '987', ZN: '988', ZZ: '99',
}

const NUANCE_LABELS = {
  DXG: 'Extrême gauche', NUP: 'NUPES', RDG: 'Radicaux de gauche',
  DVG: 'Divers gauche', ECO: 'Écologistes', REG: 'Régionalistes',
  DIV: 'Divers', ENS: 'Ensemble', DVC: 'Divers centre', UDI: 'UDI',
  LR: 'Les Républicains', DVD: 'Divers droite', DSV: 'Droite souverainiste',
  REC: 'Reconquête', RN: 'Rassemblement national', DXD: 'Extrême droite',
}
const label = (nuance) => NUANCE_LABELS[nuance] ?? nuance

const num = (s) => parseInt((s ?? '').replace(/\s/g, ''), 10) || 0
const readLines = (f) =>
  readFileSync(`${SRC}/${f}`, 'latin1').split('\n').filter(Boolean).slice(1)

const deptCode = (raw) => ZDEPT[raw] ?? raw
const circoCode = (rawDept, rawCirco) => {
  const c = rawCirco.padStart(2, '0')
  return rawDept === 'ZZ' ? `99${c}` : `${deptCode(rawDept)}${c}`
}

const pct = (votes, expressed) =>
  parseFloat(((votes / (expressed || 1)) * 100).toFixed(2))

// ── Circo level ────────────────────────────────────────────────────────────────
function parseCirlg(file) {
  const circos = []
  for (const line of readLines(file)) {
    const cols = line.split(';')
    if (cols.length < 28) continue
    const code = circoCode(cols[0].trim(), cols[2].trim())
    const name = `${cols[1].trim()} – ${cols[3].trim()}`
    const expressed = num(cols[16])
    const candidates = []
    for (let i = 19; i + 6 < cols.length; i += 9) {
      const nom = cols[i + 2]?.trim()
      if (!nom) continue
      const votes = num(cols[i + 5])
      const cand = {
        name: `${cols[i + 3]?.trim()} ${nom}`,
        party: cols[i + 4]?.trim(),
        votes,
        percentage: pct(votes, expressed),
      }
      if (cols[i + 8]?.trim() === 'Elu') cand.elected = true
      candidates.push(cand)
    }
    candidates.sort((a, b) => b.votes - a.votes)
    circos.push({
      inseeCode: code,
      name,
      registeredVoters: num(cols[5]),
      turnout: num(cols[8]),
      blankVotes: num(cols[10]),
      nullVotes: num(cols[13]),
      expressedVotes: expressed,
      candidates,
      leadingCandidate: candidates[0]?.name ?? '',
      // Nuance of the leader — used by the choropleth
      leadingNuance: candidates[0]?.party ?? '',
    })
  }
  return circos
}

// ── Département level ──────────────────────────────────────────────────────────
function parseDpt(file) {
  const depts = []
  for (const line of readLines(file)) {
    const cols = line.split(';')
    if (cols.length < 22) continue
    const expressed = num(cols[14])
    const candidates = []
    for (let i = 17; i + 1 < cols.length; i += 5) {
      const nuance = cols[i]?.trim()
      if (!nuance) continue
      const votes = num(cols[i + 1])
      candidates.push({ name: label(nuance), party: nuance, votes, percentage: pct(votes, expressed) })
    }
    candidates.sort((a, b) => b.votes - a.votes)
    depts.push({
      inseeCode: deptCode(cols[0].trim()),
      name: cols[1].trim(),
      registeredVoters: num(cols[3]),
      turnout: num(cols[6]),
      blankVotes: num(cols[8]),
      nullVotes: num(cols[11]),
      expressedVotes: expressed,
      candidates,
      leadingCandidate: candidates[0]?.name ?? '',
    })
  }
  return depts
}

// Global nuance list for a round, ordered by national vote total.
function nuanceList(entries) {
  const totals = new Map()
  for (const e of entries)
    for (const c of e.candidates)
      totals.set(c.party, (totals.get(c.party) ?? 0) + c.votes)
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([nuance]) => ({ name: label(nuance), party: nuance }))
}

function write(file, obj) {
  writeFileSync(`${OUT}/${file}`, JSON.stringify(obj))
  console.log(`wrote ${OUT}/${file}`)
}

mkdirSync(OUT, { recursive: true })

const r1 = parseCirlg('resultats-par-niveau-cirlg-t1-france-entiere.txt')
const r2 = parseCirlg('resultats-par-niveau-cirlg-t2-france-entiere.txt')

// Circos decided at round 1 → carry into round 2 outputs
const r2Codes = new Set(r2.map((c) => c.inseeCode))
const decidedAtR1 = r1.filter(
  (c) => !r2Codes.has(c.inseeCode) && c.candidates.some((x) => x.elected),
)
const r2complete = [...r2, ...decidedAtR1].sort((a, b) =>
  a.inseeCode.localeCompare(b.inseeCode),
)
console.log(`r1: ${r1.length} circos | r2: ${r2.length} + ${decidedAtR1.length} decided at r1`)

for (const [round, circos] of [[1, r1], [2, r2complete]]) {
  const candidates = nuanceList(circos)
  write(`round${round}-circ.json`, {
    year: 2022, round, granularity: 'circonscription', candidates,
    communes: circos.map(({ leadingNuance: _ln, ...c }) => c),
  })
  write(`round${round}-circ-choropleth.json`, {
    granularity: 'circonscription', year: 2022, round, candidates,
    communes: circos.map((c) => ({ inseeCode: c.inseeCode, leadingCandidate: label(c.leadingNuance) })),
  })
}

for (const [round, file] of [[1, 'resultats-par-niveau-dpt-t1-france-entiere.txt'], [2, 'resultats-par-niveau-dpt-t2-france-entiere.txt']]) {
  const depts = parseDpt(file)
  write(`round${round}.json`, {
    year: 2022, round, candidates: nuanceList(depts), communes: depts,
  })
  console.log(`  round ${round}: ${depts.length} départements`)
}
