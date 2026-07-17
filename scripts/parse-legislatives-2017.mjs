#!/usr/bin/env node
/**
 * Parse the ministry's législatives 2017 results (.xlsx) into the standard
 * legislative election file set (same conventions as 2022/2024):
 *
 *   round{1,2}.json                       dept level, keyed by NUANCE (107 entries incl. '99')
 *   round{N}-circ.json                    full circo — real candidate names, nuance as
 *                                         `party`, `elected: true` from the Sièges column
 *   round{N}-circ-choropleth.json         circo leaders (NUANCE labels) + abstention
 *   round{N}-communes.json                communes keyed by NUANCE (~35k entries)
 *   round{N}-communes-choropleth.json     commune leaders (nuance labels) + abstention
 *
 * Sources (data-sources/legislatives-2017/, from data.gouv.fr):
 *   leg2017-t{N}-multi.xlsx     sheets 'Departements TN' (5-wide NUANCE blocks:
 *                               Code Nuance/Voix/%Ins/%Exp/Sièges — already
 *                               aggregated by nuance) and 'Circo. leg. TN'
 *                               (9-wide candidate blocks: N°Panneau/Sexe/Nom/
 *                               Prénom/Nuance/Voix/%Ins/%Exp/Sièges).
 *   leg2017-t{N}-communes.xlsx  sheet Feuil1 — ONE ROW PER COMMUNE×CIRCO
 *                               (like 2022's subcom; 8-wide candidate blocks
 *                               with Nuance), aggregated here to the commune
 *                               by nuance, summing across circos.
 *
 * R1-decided circos (Sièges=1 at T1) have no T2 rows; their T1 circo entries
 * are carried into the round-2 circ outputs here (the dept/commune T2 holes
 * are filled later by carry-r1-into-round2.mjs, as for 2022/2024).
 *
 * Overseas Z-codes share the présidentielle-2017 offset rules (see
 * parse-presidential-2017.mjs); abroad circos ZZ 01–11 → 9901–9911.
 *
 * Pipeline after this: aggregate-2017-merged-communes.mjs legislative →
 * build-plm-arrondissements.mjs 2017-leg → carry-r1-into-round2.mjs →
 * mark-annulled-communes.mjs → validate-families.mjs.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SRC = join(import.meta.dirname, '..', 'data-sources', 'legislatives-2017')
const OUT = join(import.meta.dirname, '..', 'public', 'data', 'elections', 'legislative', '2017')
mkdirSync(OUT, { recursive: true })

const ZDEPT = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976', ZN: '988',
  ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
}

// Ministry nuance codes, législatives 2017 (labels shown in the UI).
const NUANCE_LABELS = {
  EXG: 'Extrême gauche',
  COM: 'Parti communiste français',
  FI: 'La France insoumise',
  SOC: 'Parti socialiste',
  RDG: 'Parti radical de gauche',
  DVG: 'Divers gauche',
  ECO: 'Écologiste',
  REG: 'Régionaliste',
  DIV: 'Divers',
  REM: 'La République en marche',
  MDM: 'Mouvement démocrate',
  UDI: 'Union des démocrates et indépendants',
  LR: 'Les Républicains',
  DVD: 'Divers droite',
  DLF: 'Debout la France',
  FN: 'Front national',
  EXD: 'Extrême droite',
}
const label = (code) => NUANCE_LABELS[code] ?? code

const pad = (v, n) => String(v).padStart(n, '0')
const round2 = (n) => Math.round(n * 100) / 100

function deptCode(raw) {
  const s = String(raw)
  return ZDEPT[s] ?? pad(s, 2)
}

function communeInsee(rawDept, rawCode) {
  const z = String(rawDept)
  if (z === 'ZZ') return '99' + pad(rawCode, 3)
  if (z === 'ZX') return '97' + String(rawCode)
  if (ZDEPT[z]) return ZDEPT[z] + pad(Number(rawCode) % 100, 2)
  return pad(z, 2) + pad(rawCode, 3)
}

/** Locate the header row + stats columns of a results sheet. */
function sheetGrid(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const hdrIdx = rows.findIndex((r) => r?.[0] === 'Code du département')
  if (hdrIdx < 0) throw new Error('header row not found')
  const header = rows[hdrIdx]
  const col = (l) => {
    const i = header.indexOf(l)
    if (i < 0) throw new Error(`column '${l}' not found`)
    return i
  }
  return { rows: rows.slice(hdrIdx + 1), header, col }
}

function baseEntry(r, key, col) {
  return {
    inseeCode: key.inseeCode,
    name: key.name,
    registeredVoters: Number(r[col('Inscrits')]) || 0,
    turnout: Number(r[col('Votants')]) || 0,
    blankVotes: Number(r[col('Blancs')]) || 0,
    nullVotes: Number(r[col('Nuls')]) || 0,
    expressedVotes: Number(r[col('Exprimés')]) || 0,
  }
}

function finishEntry(e, candidates) {
  candidates.sort((a, b) => b.votes - a.votes)
  return {
    ...e,
    leadingCandidate: e.expressedVotes ? candidates[0]?.name ?? '' : '',
    candidates,
  }
}

/** Dept sheet: 5-wide nuance blocks [Code Nuance, Voix, %Ins, %Exp, Sièges]. */
function parseDepts(sheet) {
  const { rows, header, col } = sheetGrid(sheet)
  const nuanceIdxs = header.map((h, i) => (h === 'Code Nuance' ? i : -1)).filter((i) => i >= 0)
  const entries = []
  for (const r of rows) {
    if (r[0] == null || r[0] === '') continue
    const e = baseEntry(r, { inseeCode: deptCode(r[0]), name: String(r[1]) }, col)
    const candidates = []
    for (const ni of nuanceIdxs) {
      const code = r[ni]
      const votes = Number(r[ni + 1]) || 0
      if (!code || !votes) continue
      candidates.push({
        name: label(code),
        party: code,
        votes,
        percentage: e.expressedVotes ? round2((votes / e.expressedVotes) * 100) : 0,
      })
    }
    entries.push(finishEntry(e, candidates))
  }
  return entries
}

/** Circo sheet: 9-wide candidate blocks, Sièges (=1) marks the elected MP. */
function parseCircos(sheet) {
  const { rows, header, col } = sheetGrid(sheet)
  const nomIdxs = header.map((h, i) => (h === 'Nom' ? i : -1)).filter((i) => i >= 0)
  const entries = []
  for (const r of rows) {
    if (r[0] == null || r[0] === '') continue
    const e = baseEntry(
      r,
      { inseeCode: deptCode(r[0]) + pad(r[2], 2), name: `${r[1]} – ${r[3]}` },
      col,
    )
    const candidates = []
    for (const ni of nomIdxs) {
      const nom = r[ni]
      if (!nom) continue
      const votes = Number(r[ni + 3]) || 0
      const c = {
        name: `${r[ni + 1]} ${nom}`,
        party: String(r[ni + 2] ?? ''),
        votes,
        percentage: e.expressedVotes ? round2((votes / e.expressedVotes) * 100) : 0,
      }
      if (r[ni + 6] === 'Elu' || Number(r[ni + 6]) === 1) c.elected = true
      candidates.push(c)
    }
    entries.push(finishEntry(e, candidates))
  }
  return entries
}

/** Commune file: one row per commune×circo — aggregate to commune by NUANCE. */
function parseCommunes(wb) {
  const { rows, header, col } = sheetGrid(wb.Sheets['Feuil1'])
  const nomIdxs = header.map((h, i) => (h === 'Nom' ? i : -1)).filter((i) => i >= 0)
  const acc = new Map()
  for (const r of rows) {
    if (r[0] == null || r[0] === '') continue
    const insee = communeInsee(r[0], r[4])
    let a = acc.get(insee)
    if (!a) {
      a = {
        inseeCode: insee, name: String(r[5]),
        registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0,
        votes: new Map(),
      }
      acc.set(insee, a)
    }
    a.registeredVoters += Number(r[col('Inscrits')]) || 0
    a.turnout += Number(r[col('Votants')]) || 0
    a.blankVotes += Number(r[col('Blancs')]) || 0
    a.nullVotes += Number(r[col('Nuls')]) || 0
    a.expressedVotes += Number(r[col('Exprimés')]) || 0
    for (const ni of nomIdxs) {
      if (!r[ni]) continue
      const code = String(r[ni + 2] ?? '')
      const votes = Number(r[ni + 3]) || 0
      if (!code || !votes) continue
      a.votes.set(code, (a.votes.get(code) ?? 0) + votes)
    }
  }
  const entries = []
  for (const a of acc.values()) {
    const candidates = [...a.votes.entries()].map(([code, votes]) => ({
      name: label(code),
      party: code,
      votes,
      percentage: a.expressedVotes ? round2((votes / a.expressedVotes) * 100) : 0,
    }))
    const { votes: _v, ...rest } = a
    entries.push(finishEntry(rest, candidates))
  }
  return entries
}

/** Nuances ranked by total votes desc — the files' header `candidates` list. */
function nuanceList(entries) {
  const totals = new Map()
  for (const e of entries)
    for (const c of e.candidates) totals.set(c.party, (totals.get(c.party) ?? 0) + c.votes)
  return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => ({ name: label(code), party: code }))
}

function roundData(entries, round, candidates) {
  return { year: 2017, round, candidates: candidates ?? nuanceList(entries), communes: entries }
}

function choropleth(entries, granularity, round, candidates, { leaderAsNuance = false } = {}) {
  return {
    granularity,
    year: 2017,
    round,
    candidates,
    communes: entries.map((e) => {
      // Circo entries lead with a PERSON — the choropleth wants the nuance label.
      const leader = leaderAsNuance ? label(e.candidates[0]?.party ?? '') : e.leadingCandidate
      return {
        inseeCode: e.inseeCode,
        leadingCandidate: e.expressedVotes && e.leadingCandidate ? leader : '',
        abstention: e.registeredVoters
          ? round2(((e.registeredVoters - e.turnout) / e.registeredVoters) * 100)
          : undefined,
      }
    }),
  }
}

const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data))
  console.log(`  ${name}`)
}

let r1Circos = null
for (const round of [1, 2]) {
  console.log(`— Tour ${round}`)
  const multi = XLSX.readFile(join(SRC, `leg2017-t${round}-multi.xlsx`))
  const depts = parseDepts(multi.Sheets[`Departements T${round}`])
  let circos = parseCircos(multi.Sheets[`Circo. leg. T${round}`])
  const communes = parseCommunes(XLSX.readFile(join(SRC, `leg2017-t${round}-communes.xlsx`), { dense: true }))

  // Carry R1-decided circos (elected at T1, no T2 vote) into the round-2 file.
  let carried = 0
  if (round === 2 && r1Circos) {
    const have = new Set(circos.map((c) => c.inseeCode))
    const decided = r1Circos.filter((c) => !have.has(c.inseeCode))
    circos = [...circos, ...decided].sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
    carried = decided.length
  }
  if (round === 1) r1Circos = circos

  const circoNuances = nuanceList(circos)
  write(`round${round}.json`, roundData(depts, round))
  write(`round${round}-circ.json`, roundData(circos, round, circoNuances))
  write(`round${round}-circ-choropleth.json`, choropleth(circos, 'circonscription', round, circoNuances, { leaderAsNuance: true }))
  const communeNuances = nuanceList(communes)
  write(`round${round}-communes.json`, roundData(communes, round, communeNuances))
  write(`round${round}-communes-choropleth.json`, choropleth(communes, 'commune', round, communeNuances))

  // ── Sanity: national totals + seats ────────────────────────────────────────
  const tot = { ins: 0, exp: 0, votes: new Map() }
  for (const d of depts) {
    tot.ins += d.registeredVoters
    tot.exp += d.expressedVotes
    for (const c of d.candidates) tot.votes.set(c.party, (tot.votes.get(c.party) ?? 0) + c.votes)
  }
  const seats = new Map()
  for (const c of circos)
    for (const cand of c.candidates)
      if (cand.elected) seats.set(cand.party, (seats.get(cand.party) ?? 0) + 1)
  const seatTotal = [...seats.values()].reduce((a, b) => a + b, 0)
  console.log(`  depts=${depts.length} circos=${circos.length}${carried ? ` (dont ${carried} acquises au T1)` : ''} communes=${communes.length}`)
  console.log(`  inscrits=${tot.ins.toLocaleString('fr-FR')}`)
  for (const [code, v] of [...tot.votes].sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    console.log(`  ${code}: ${((v / tot.exp) * 100).toFixed(2)}%`)
  }
  console.log(`  sièges: total=${seatTotal} — ${[...seats].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, s]) => `${n} ${s}`).join(', ')}`)
}
