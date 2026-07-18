#!/usr/bin/env node
/**
 * Parse the ministry's présidentielle 2017 results (legacy BIFF .xls — the
 * 2017 vintage published no CSV) into the standard election file set:
 *
 *   round{1,2}.json                       dept level (107 entries incl. '99')
 *   round{N}-circ.json                    full circo (577 entries)
 *   round{N}-circ-choropleth.json         circo leaders + abstention
 *   round{N}-communes.json                full communes (~35k entries)
 *   round{N}-communes-choropleth.json     commune leaders + abstention
 *
 * Sources (data-sources/presidentielle-2017/, from data.gouv.fr):
 *   pres2017-t{N}-multi.xls      sheets: FE Metro OM / Régions / Départements /
 *                                Circo. Leg. / Canton  (dept + circo levels)
 *   pres2017-t{N}-communes.xls   sheet Feuil1 (~35 719 commune rows)
 *
 * Format: header row starts with 'Code du département'; stats columns by
 * label, then repeating candidate blocks [Sexe] Nom Prénom Voix %Ins %Exp
 * (dept sheets omit N°Panneau — block stride differs, so blocks are located
 * by the 'Nom' header positions, not by a fixed stride). Candidates are
 * RANK-ORDERED per row, so identity comes from the block's Nom/Prénom.
 *
 * Overseas: the file uses Z-codes with per-dept numeric offsets baked into
 * the commune code (ZA 101→97101, ZM 501→97601, ZP 11→98711, ZW 1→98601,
 * ZX 701/801→97701/97801, ZZ consular → 99001…) — normalised to the same
 * INSEE codes the 2022/2024 datasets and the tiles use.
 *
 * After this: run inject-merged-commune-results.mjs (2017 COG drift is large),
 * mark-annulled-communes.mjs, and build-plm-arrondissements for 2017 (separate
 * BV source) — see the pipeline order in CLAUDE.md.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const SRC = join(import.meta.dirname, '..', 'data-sources', 'presidentielle-2017')
const OUT = join(import.meta.dirname, '..', 'public', 'data', 'elections', 'presidential', '2017')
mkdirSync(OUT, { recursive: true })

// Ministry Z-codes → INSEE dept codes (2017 uses more Z-codes than the circo tiles).
const ZDEPT = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976', ZN: '988',
  ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
}

const PARTY_BY_NOM = {
  'MACRON': 'EM', 'LE PEN': 'FN', 'FILLON': 'LR', 'MÉLENCHON': 'LFI',
  'HAMON': 'PS', 'DUPONT-AIGNAN': 'DLF', 'LASSALLE': 'RES', 'POUTOU': 'NPA',
  'ASSELINEAU': 'UPR', 'ARTHAUD': 'LO', 'CHEMINADE': 'SP',
}

// Header order of the candidates array in every output file (R1 national rank).
const CANDIDATES_R1 = [
  { name: 'Emmanuel MACRON', party: 'EM' },
  { name: 'Marine LE PEN', party: 'FN' },
  { name: 'François FILLON', party: 'LR' },
  { name: 'Jean-Luc MÉLENCHON', party: 'LFI' },
  { name: 'Benoît HAMON', party: 'PS' },
  { name: 'Nicolas DUPONT-AIGNAN', party: 'DLF' },
  { name: 'Jean LASSALLE', party: 'RES' },
  { name: 'Philippe POUTOU', party: 'NPA' },
  { name: 'François ASSELINEAU', party: 'UPR' },
  { name: 'Nathalie ARTHAUD', party: 'LO' },
  { name: 'Jacques CHEMINADE', party: 'SP' },
]
const CANDIDATES_R2 = [
  { name: 'Emmanuel MACRON', party: 'EM' },
  { name: 'Marine LE PEN', party: 'FN' },
]

const pad = (v, n) => String(v).padStart(n, '0')
const round2 = (n) => Math.round(n * 100) / 100

function deptCode(raw) {
  const s = String(raw)
  return ZDEPT[s] ?? pad(s, 2)
}

function communeInsee(rawDept, rawCode) {
  const z = String(rawDept)
  if (z === 'ZZ') return '99' + pad(rawCode, 3)          // consular "communes"
  if (z === 'ZX') return '97' + String(rawCode)          // 701→97701 St-Barth, 801→97801 St-Martin
  if (ZDEPT[z]) return ZDEPT[z] + pad(Number(rawCode) % 100, 2) // ZA 101→97101, ZM 501→97601, ZP 11→98711…
  return pad(z, 2) + pad(rawCode, 3)                     // metro incl. 2A/2B
}

/**
 * Parse one results sheet into entries. `makeKey(row)` returns
 * { inseeCode, name } for the sheet's geographic level.
 */
function parseSheet(sheet, makeKey) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const hdrIdx = rows.findIndex((r) => r[0] === 'Code du département')
  if (hdrIdx < 0) throw new Error('header row not found')
  const header = rows[hdrIdx]
  const col = (label) => {
    const i = header.indexOf(label)
    if (i < 0) throw new Error(`column '${label}' not found`)
    return i
  }
  const cInscrits = col('Inscrits'), cVotants = col('Votants')
  const cBlancs = col('Blancs'), cNuls = col('Nuls'), cExprimes = col('Exprimés')
  const nomIdxs = header.map((h, i) => (h === 'Nom' ? i : -1)).filter((i) => i >= 0)

  const entries = []
  for (const r of rows.slice(hdrIdx + 1)) {
    if (r[0] == null || r[0] === '') continue
    const key = makeKey(r)
    const expressed = Number(r[cExprimes]) || 0
    const candidates = []
    for (const ni of nomIdxs) {
      const nom = r[ni]
      if (!nom) continue
      const votes = Number(r[ni + 2]) || 0
      candidates.push({
        name: `${r[ni + 1]} ${nom}`,
        party: PARTY_BY_NOM[nom] ?? '',
        votes,
        percentage: expressed ? round2((votes / expressed) * 100) : 0,
      })
    }
    const leader = candidates.reduce((a, b) => (b.votes > (a?.votes ?? -1) ? b : a), null)
    entries.push({
      inseeCode: key.inseeCode,
      name: key.name,
      registeredVoters: Number(r[cInscrits]) || 0,
      turnout: Number(r[cVotants]) || 0,
      blankVotes: Number(r[cBlancs]) || 0,
      nullVotes: Number(r[cNuls]) || 0,
      expressedVotes: expressed,
      leadingCandidate: expressed ? leader?.name ?? '' : '',
      candidates,
    })
  }
  return entries
}

function choropleth(entries, granularity, round) {
  return {
    granularity,
    year: 2017,
    round,
    candidates: round === 1 ? CANDIDATES_R1 : CANDIDATES_R2,
    communes: entries.map((e) => ({
      inseeCode: e.inseeCode,
      leadingCandidate: e.leadingCandidate,
      abstention: e.registeredVoters
        ? round2(((e.registeredVoters - e.turnout) / e.registeredVoters) * 100)
        : undefined,
    })),
  }
}

function roundData(entries, round) {
  return {
    election: { type: 'presidential', year: 2017, round },
    year: 2017,
    round,
    candidates: round === 1 ? CANDIDATES_R1 : CANDIDATES_R2,
    communes: entries,
  }
}

const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data))
  console.log(`  ${name}`)
}

for (const round of [1, 2]) {
  console.log(`— Tour ${round}`)
  const multi = XLSX.readFile(join(SRC, `pres2017-t${round}-multi.xls`))
  const depts = parseSheet(multi.Sheets[`Départements Tour ${round}`], (r) => ({
    inseeCode: deptCode(r[0]),
    name: String(r[1]),
  }))
  const circos = parseSheet(multi.Sheets[`Circo. Leg. Tour ${round}`], (r) => ({
    inseeCode: deptCode(r[0]) + pad(r[2], 2),
    name: `${r[1]} – ${r[3]}`,
  }))
  const communesWb = XLSX.readFile(join(SRC, `pres2017-t${round}-communes.xls`))
  const communes = parseSheet(communesWb.Sheets['Feuil1'], (r) => ({
    inseeCode: communeInsee(r[0], r[2]),
    name: String(r[3]),
  }))

  write(`round${round}.json`, roundData(depts, round))
  write(`round${round}-circ.json`, roundData(circos, round))
  write(`round${round}-circ-choropleth.json`, choropleth(circos, 'circonscription', round))
  write(`round${round}-communes.json`, roundData(communes, round))
  write(`round${round}-communes-choropleth.json`, choropleth(communes, 'commune', round))

  // Sanity: national totals from the dept file vs official figures.
  const tot = { ins: 0, exp: 0, votes: new Map() }
  for (const d of depts) {
    tot.ins += d.registeredVoters
    tot.exp += d.expressedVotes
    for (const c of d.candidates) tot.votes.set(c.name, (tot.votes.get(c.name) ?? 0) + c.votes)
  }
  console.log(`  depts=${depts.length} circos=${circos.length} communes=${communes.length}`)
  console.log(`  inscrits=${tot.ins.toLocaleString('fr-FR')}`)
  for (const [name, v] of [...tot.votes].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    console.log(`  ${name}: ${((v / tot.exp) * 100).toFixed(2)}%`)
  }
}
