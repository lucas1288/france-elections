#!/usr/bin/env node
/**
 * Generic adapter for data.gouv's consolidated "Données des élections
 * agrégées" (bureau-de-vote level, harmonized, 1999→today) — the preferred
 * source for pre-2017 vintages: one format for every election. Emits the
 * standard file set (dept / circo / commune + choropleths, both rounds).
 *
 *   node scripts/parse-agregees.mjs presidential 2012
 *   node scripts/parse-agregees.mjs legislative 2012
 *
 * Inputs: data-sources/agregees/{year}_{pres|legi}_t{N}-{general,candidat}.csv
 * (extracted from the parquet by scripts/extract-agregees.py).
 *
 * Conventions (match the 2017 ingestions):
 *  - presidential: candidates keyed by "Prénom NOM"; `party` = the dataset's
 *    per-candidate nuance code (HOLL, SARK, …) — palette keys.
 *  - legislative: dept/commune entries keyed by NUANCE (label as name); circo
 *    entries keep real candidate names with nuance as `party`.
 *  - ELECTED (legislative): the source has no Elu flag — derived: R2 = circo
 *    winner; R1 = >50% of expressed AND ≥25% of inscrits (code électoral).
 *    Gated against official seat counts in elections.config.mjs.
 *  - PLM arrondissements: derived inline from the AABB bureau codes
 *    (whole-city entries kept too, as everywhere else).
 *  - Blancs: null before 2014 (counted within nuls) → 0.
 *  - Codes: dept Z-codes → INSEE via lib; commune codes are ALREADY INSEE
 *    (975xx/98xxx incl.), except FE 'ZZnnn' → '99nnn'; circo = dept + 2-digit.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deptCode } from './lib/codes.mjs'
import { pctRound, abstention2, nuanceList as sharedNuanceList, carryDecidedR1, seatCounts, nationalTotals, makeWriter } from './lib/emit.mjs'

const TYPE = process.argv[2]
const YEAR = process.argv[3]
if (!['presidential', 'legislative'].includes(TYPE) || !/^\d{4}$/.test(YEAR ?? '')) {
  console.error('usage: node scripts/parse-agregees.mjs <presidential|legislative> <year>')
  process.exit(1)
}
const IDTYPE = TYPE === 'presidential' ? 'pres' : 'legi'
const SRC = join(import.meta.dirname, '..', 'data-sources', 'agregees')
const OUT = join(import.meta.dirname, '..', 'public', 'data', 'elections', TYPE, YEAR)
const write = makeWriter(OUT)

// Legislative nuance labels per vintage (shown in the UI).
const NUANCE_LABELS_2012 = {
  EXG: 'Extrême gauche', FG: 'Front de gauche', SOC: 'Parti socialiste',
  RDG: 'Parti radical de gauche', DVG: 'Divers gauche', VEC: 'Europe Écologie Les Verts',
  ECO: 'Divers écologiste', REG: 'Régionaliste', CEN: 'Centre pour la France',
  ALLI: 'Alliance centriste', PRV: 'Parti radical valoisien', NCE: 'Nouveau Centre',
  UMP: 'Union pour un mouvement populaire', DVD: 'Divers droite',
  FN: 'Front national', EXD: 'Extrême droite', AUT: 'Autres',
}
const NUANCE_LABELS = { 2012: NUANCE_LABELS_2012 }[YEAR] ?? {}
const label = (code) => NUANCE_LABELS[code] ?? code

const PLM = {
  '75056': { base: 75100, min: 1, max: 20, fmt: (a) => `Paris ${a}e arrondissement` },
  '69123': { base: 69380, min: 1, max: 9, fmt: (a) => `Lyon ${a}e arrondissement` },
  '13055': { base: 13200, min: 1, max: 16, fmt: (a) => `Marseille ${a}e arrondissement` },
}

const communeInsee = (raw) => (raw.startsWith('ZZ') ? '99' + raw.slice(2) : raw)

const readCsv = (name) => {
  const lines = readFileSync(join(SRC, name), 'utf8').trim().split('\n')
  const header = lines[0].split(';')
  return lines.slice(1).map((l) => {
    const cells = l.split(';')
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]))
  })
}

/** Aggregation bucket keyed by territory code. */
function bucket(map, code, name) {
  let b = map.get(code)
  if (!b) {
    b = { inseeCode: code, name, registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0, votes: new Map() }
    map.set(code, b)
  }
  return b
}
function addStats(b, r) {
  b.registeredVoters += +r.inscrits || 0
  b.turnout += +r.votants || 0
  b.blankVotes += +r.blancs || 0
  b.nullVotes += +r.nuls || 0
  b.expressedVotes += +r.exprimes || 0
}
/** votes keyed by [key, displayName, party] — key controls aggregation. */
function addVotes(b, key, name, party, voix) {
  const cur = b.votes.get(key)
  if (cur) cur.votes += voix
  else b.votes.set(key, { name, party, votes: voix })
}
function finish(b) {
  const candidates = [...b.votes.values()]
    .map((c) => ({ name: c.name, party: c.party, votes: c.votes, percentage: pctRound(c.votes, b.expressedVotes) }))
    .sort((a, b2) => b2.votes - a.votes)
  const { votes: _v, ...rest } = b
  return {
    ...rest,
    leadingCandidate: b.expressedVotes ? candidates[0]?.name ?? '' : '',
    candidates,
  }
}

function parseRound(round) {
  const general = readCsv(`${YEAR}_${IDTYPE}_t${round}-general.csv`)
  const candidat = readCsv(`${YEAR}_${IDTYPE}_t${round}-candidat.csv`)

  const depts = new Map(), circos = new Map(), communes = new Map()
  const bvCirco = new Map() // dept|commune|bv → circo code (for the candidat join)

  for (const r of general) {
    const dept = deptCode(r.code_departement)
    const commune = communeInsee(r.code_commune)
    const circo = (r.code_departement === 'ZZ' ? '99' : dept) + r.code_circonscription
    bvCirco.set(`${r.code_departement}|${r.code_commune}|${r.code_bv}`, circo)

    addStats(bucket(depts, dept, r.libelle_departement), r)
    // FE rows have an empty libelle_circonscription — fall back to the number.
    const circoLabel = r.libelle_circonscription ||
      `${+r.code_circonscription === 1 ? '1ère' : `${+r.code_circonscription}ème`} circonscription`
    addStats(bucket(circos, circo, `${r.libelle_departement} – ${circoLabel}`), r)
    addStats(bucket(communes, commune, r.libelle_commune), r)
    const plm = PLM[commune]
    if (plm) {
      const arr = Math.floor((+r.code_bv || 0) / 100)
      if (arr >= plm.min && arr <= plm.max) {
        addStats(bucket(communes, String(plm.base + arr), plm.fmt(arr)), r)
      }
    }
  }

  for (const r of candidat) {
    const dept = deptCode(r.code_departement)
    const commune = communeInsee(r.code_commune)
    const circo = bvCirco.get(`${r.code_departement}|${r.code_commune}|${r.code_bv}`)
    const voix = +r.voix || 0
    const person = `${r.prenom} ${r.nom}`
    // presidential: everything keyed by candidate; legislative: dept/commune
    // by nuance, circo by person (nuance as party).
    const [key, name, party] =
      TYPE === 'presidential' ? [person, person, r.nuance] : [r.nuance, label(r.nuance), r.nuance]
    addVotes(depts.get(dept), key, name, party, voix)
    if (circo) addVotes(circos.get(circo), person, person, r.nuance, voix)
    addVotes(communes.get(commune), key, name, party, voix)
    const plm = PLM[commune]
    if (plm) {
      const arr = Math.floor((+r.code_bv || 0) / 100)
      if (arr >= plm.min && arr <= plm.max) addVotes(communes.get(String(plm.base + arr)), key, name, party, voix)
    }
  }

  const sortByCode = (m) => [...m.values()].map(finish).sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
  const out = { depts: sortByCode(depts), circos: sortByCode(circos), communes: sortByCode(communes) }

  // Derived elected flags (legislative): R2 winner; R1 per code électoral.
  if (TYPE === 'legislative') {
    for (const c of out.circos) {
      if (!c.expressedVotes) continue
      const top = c.candidates[0]
      if (!top) continue
      const wins =
        round === 2 ||
        (top.votes > c.expressedVotes / 2 && top.votes >= c.registeredVoters * 0.25)
      if (wins) top.elected = true
    }
  }
  return out
}

// ── emit ─────────────────────────────────────────────────────────────────────
const yearNum = +YEAR
const roundData = (entries, round, candidates) => ({ year: yearNum, round, candidates, communes: entries })
const choropleth = (entries, granularity, round, candidates, { leaderAsNuance = false } = {}) => ({
  granularity, year: yearNum, round, candidates,
  communes: entries.map((e) => ({
    inseeCode: e.inseeCode,
    leadingCandidate:
      e.expressedVotes && e.leadingCandidate
        ? leaderAsNuance ? label(e.candidates[0]?.party ?? '') : e.leadingCandidate
        : '',
    abstention: abstention2(e.registeredVoters, e.turnout),
  })),
})

/** Presidential header list: national rank order, stable across files. */
function presCandidates(depts) {
  const tot = nationalTotals(depts, (c) => c.name)
  const party = new Map()
  for (const d of depts) for (const c of d.candidates) party.set(c.name, c.party)
  return [...tot.votes.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => ({ name, party: party.get(name) ?? '' }))
}

let r1Circos = null
for (const round of [1, 2]) {
  console.log(`— Tour ${round}`)
  let { depts, circos, communes } = parseRound(round)

  let carried = 0
  if (TYPE === 'legislative' && round === 2 && r1Circos) {
    ;({ circos, carried } = carryDecidedR1(r1Circos, circos))
  }
  if (round === 1) r1Circos = circos

  if (TYPE === 'presidential') {
    const candidates = presCandidates(depts)
    write(`round${round}.json`, { election: { type: TYPE, year: yearNum, round }, ...roundData(depts, round, candidates) })
    write(`round${round}-circ.json`, roundData(circos, round, candidates))
    write(`round${round}-circ-choropleth.json`, choropleth(circos, 'circonscription', round, candidates))
    write(`round${round}-communes.json`, roundData(communes, round, candidates))
    write(`round${round}-communes-choropleth.json`, choropleth(communes, 'commune', round, candidates))
  } else {
    const circoNuances = sharedNuanceList(circos, label)
    write(`round${round}.json`, roundData(depts, round, sharedNuanceList(depts, label)))
    write(`round${round}-circ.json`, roundData(circos, round, circoNuances))
    write(`round${round}-circ-choropleth.json`, choropleth(circos, 'circonscription', round, circoNuances, { leaderAsNuance: true }))
    const communeNuances = sharedNuanceList(communes, label)
    write(`round${round}-communes.json`, roundData(communes, round, communeNuances))
    write(`round${round}-communes-choropleth.json`, choropleth(communes, 'commune', round, communeNuances))
  }

  // Sanity
  const tot = nationalTotals(depts, TYPE === 'presidential' ? (c) => c.name : (c) => c.party)
  console.log(`  depts=${depts.length} circos=${circos.length}${carried ? ` (dont ${carried} acquises au T1)` : ''} communes=${communes.length}`)
  console.log(`  inscrits=${tot.ins.toLocaleString('fr-FR')}`)
  for (const [k, v] of [...tot.votes].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log(`  ${k}: ${((v / tot.exp) * 100).toFixed(2)}%`)
  if (TYPE === 'legislative') {
    const seats = seatCounts(circos)
    const total = [...seats.values()].reduce((a, b) => a + b, 0)
    console.log(`  sièges: total=${total} — ${[...seats].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, s]) => `${n} ${s}`).join(', ')}`)
  }
}
