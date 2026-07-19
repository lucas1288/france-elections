/**
 * Parses the ministry "résultats définitifs" CSVs for the 2024 legislative
 * elections (data-sources/legislatives-2024/, downloaded from data.gouv.fr) and
 * emits the same file set as the 2022 pipeline:
 *
 *   round{N}.json                     — département-level aggregates by nuance
 *   round{N}-circ.json                — full per-circonscription candidate results
 *   round{N}-circ-choropleth.json     — circo code + leading nuance label
 *   round{N}-communes.json            — full per-commune results by nuance
 *   round{N}-communes-choropleth.json — commune code + leading nuance + abstention
 *
 * The 2024 ministry format differs from 2022: labeled UTF-8 CSVs (CRLF, ';'),
 * one file per geographic level, candidate columns in repeating 9-wide blocks
 * [Panneau;Nuance;Nom;Prénom;Sexe;Voix;%Ins;%Exp;Elu]. Geometry is unchanged
 * (same circo-2010 / admin-2022 as 2022), so codes are normalised to match the
 * existing tiles exactly (validated against the 2022 circo code set).
 *
 * Paris/Lyon/Marseille arrondissements are aggregated from the bureau-de-vote
 * file (the BV code encodes the arrondissement: arr = floor(code/100)) and
 * injected into the commune outputs, exactly like scripts/build-plm-arrondissements.mjs.
 *
 * Usage: node scripts/parse-legislatives-2024.mjs
 */

import { readFileSync } from 'fs'
import { num, pctFixed as pct, abstention1 as abst, nuanceList as sharedNuanceList, carryDecidedR1, makeWriter } from './lib/emit.mjs'

const SRC = 'data-sources/legislatives-2024'
const OUT = 'public/data/elections/legislative/2024'

const NUANCE_LABELS = {
  EXG: 'Extrême gauche', FI: 'La France insoumise', COM: 'Parti communiste',
  SOC: 'Parti socialiste', RDG: 'Parti radical de gauche', VEC: 'Les Écologistes',
  ECO: 'Divers écologiste', UG: 'Nouveau Front populaire', DVG: 'Divers gauche',
  REG: 'Régionalistes', DIV: 'Divers', ENS: 'Ensemble', DVC: 'Divers centre',
  HOR: 'Horizons', UDI: 'UDI', LR: 'Les Républicains', DVD: 'Divers droite',
  DSV: 'Droite souverainiste', UXD: "Union de l'extrême droite",
  RN: 'Rassemblement national', REC: 'Reconquête', EXD: 'Extrême droite',
}
const label = (n) => NUANCE_LABELS[n] ?? n

// Round-1 files are unquoted; round-2 files wrap text/code fields in double
// quotes (e.g. "01";"0101"). Strip surrounding quotes per cell so both parse the same.
const unquote = (s) => s.replace(/^"(.*)"$/s, '$1')
const readRows = (file) =>
  readFileSync(`${SRC}/${file}`, 'utf8').split(/\r?\n/).filter(Boolean).slice(1).map((l) => l.split(';').map(unquote))

// ── code normalisation (match the 2022 / circo-2010 + admin-2022 tiles) ──────────
const circoCode = (dept, code) => {
  const circo = code.slice(-2) // last 2 chars = circo number within the dept
  if (dept === 'ZZ') return `99${circo}` // Français de l'étranger
  if (dept === 'ZX') return `977${circo}` // Saint-Martin / Saint-Barthélemy
  if (/^\d{3}$/.test(dept)) return `${dept}${circo}` // DOM 971–988 (code already dept-prefixed)
  return `${dept.padStart(2, '0')}${circo}` // métropole incl. Corse 2A/2B
}
// commune code already embeds the dept; 1-digit-dept rows come 4-wide → pad to INSEE 5.
// Letter-coded rows follow the 2022 convention: ZX### (St-Barth/St-Martin) → 97###
// (ZX701→97701, ZX801→97801) and ZZ### (consular "communes" abroad) → 99###.
const communeInsee = (code) =>
  code.startsWith('ZX') ? `97${code.slice(2)}`
  : code.startsWith('ZZ') ? `99${code.slice(2)}`
  : /^\d{4}$/.test(code) ? `0${code}` : code

// ── generic candidate-block reader ──────────────────────────────────────────────
// fixed = number of leading columns; offs = {reg,vot,exp,bl,nul} fixed-col indices.
const BLOCK = 9 // Panneau;Nuance;Nom;Prénom;Sexe;Voix;%Ins;%Exp;Elu
function readCandidates(cols, fixed, expressed) {
  const cands = []
  for (let i = fixed; i + 5 < cols.length; i += BLOCK) {
    const nuance = cols[i + 1]?.trim()
    if (!nuance) continue
    const nom = cols[i + 2]?.trim()
    const votes = num(cols[i + 5])
    const cand = {
      name: nom ? `${cols[i + 3]?.trim()} ${nom}` : label(nuance),
      party: nuance,
      votes,
      percentage: pct(votes, expressed),
    }
    if (cols[i + 8]?.trim()) cand.elected = true
    cands.push(cand)
  }
  cands.sort((a, b) => b.votes - a.votes)
  return cands
}

// Global nuance list for a round, ordered by national vote total.
const nuanceList = (entries) => sharedNuanceList(entries, label)

// ── circonscription level ───────────────────────────────────────────────────────
// fixed 18: 0 dept,2 codeCirco,3 libellé,4 inscrits,5 votants,9 exprimés,12 blancs,15 nuls
function parseCirco(file) {
  return readRows(file).map((c) => {
    const expressed = num(c[9])
    const candidates = readCandidates(c, 18, expressed)
    return {
      inseeCode: circoCode(c[0].trim(), c[2].trim()),
      name: `${c[1].trim()} – ${c[3].trim()}`,
      registeredVoters: num(c[4]), turnout: num(c[5]),
      blankVotes: num(c[12]), nullVotes: num(c[15]), expressedVotes: expressed,
      candidates, leadingCandidate: candidates[0]?.name ?? '',
      leadingNuance: candidates[0]?.party ?? '',
    }
  })
}

// ── commune level ───────────────────────────────────────────────────────────────
// fixed 18: 0 dept,2 codeCommune,3 libellé,4 inscrits,5 votants,9 exprimés,12 blancs,15 nuls
// Commune results are keyed by NUANCE (not person), matching the 2022 commune
// pipeline + the dept/arrondissement paths, so the choropleth leader + sidebar +
// all coloring resolve via palette by nuance. A commune row carries one candidate
// per nuance; group by nuance (and sum, harmless for the single-circo case).
function parseCommunes(file) {
  return readRows(file).map((c) => {
    const expressed = num(c[9])
    const byNuance = new Map()
    for (let i = 18; i + 5 < c.length; i += BLOCK) {
      const nuance = c[i + 1]?.trim()
      if (!nuance) continue
      byNuance.set(nuance, (byNuance.get(nuance) ?? 0) + num(c[i + 5]))
    }
    const candidates = [...byNuance.entries()]
      .map(([nuance, votes]) => ({ name: label(nuance), party: nuance, votes, percentage: pct(votes, expressed) }))
      .sort((a, b) => b.votes - a.votes)
    return {
      inseeCode: communeInsee(c[2].trim()),
      name: c[3].trim(),
      registeredVoters: num(c[4]), turnout: num(c[5]),
      blankVotes: num(c[12]), nullVotes: num(c[15]), expressedVotes: expressed,
      candidates, leadingCandidate: candidates[0]?.name ?? '',
    }
  })
}

// ── département level ────────────────────────────────────────────────────────────
// fixed 16: 0 dept,1 libellé,2 inscrits,3 votants,7 exprimés,10 blancs,13 nuls;
// block 4: Nuance;Voix;%Ins;%Exp
function parseDpt(file) {
  return readRows(file).map((c) => {
    const expressed = num(c[7])
    const candidates = []
    for (let i = 16; i + 1 < c.length; i += 4) {
      const nuance = c[i]?.trim()
      if (!nuance) continue
      const votes = num(c[i + 1])
      candidates.push({ name: label(nuance), party: nuance, votes, percentage: pct(votes, expressed) })
    }
    candidates.sort((a, b) => b.votes - a.votes)
    const dept = c[0].trim()
    return {
      inseeCode: dept === 'ZZ' ? '99' : dept === 'ZX' ? '977' : /^\d$/.test(dept) ? dept.padStart(2, '0') : dept,
      name: c[1].trim(),
      registeredVoters: num(c[2]), turnout: num(c[3]),
      blankVotes: num(c[10]), nullVotes: num(c[13]), expressedVotes: expressed,
      candidates, leadingCandidate: candidates[0]?.name ?? '',
    }
  })
}

// ── Paris/Lyon/Marseille arrondissements from the bureau-de-vote file ─────────────
// fixed 19: 0 dept,2 codeCommune,4 codeBV,5 inscrits,6 votants,10 exprimés,13 blancs,16 nuls
const PLM = {
  '75056': { base: 75100, min: 1, max: 20, fmt: (a) => `Paris ${a}e arrondissement` },
  '69123': { base: 69380, min: 1, max: 9, fmt: (a) => `Lyon ${a}e arrondissement` },
  '13055': { base: 13200, min: 1, max: 16, fmt: (a) => `Marseille ${a}e arrondissement` },
}
function parseArrondissements(file) {
  const acc = new Map() // insee → aggregate
  for (const c of readRows(file)) {
    const city = PLM[c[2].trim()]
    if (!city) continue
    const arr = Math.floor(num(c[4]) / 100)
    if (!(arr >= city.min && arr <= city.max)) continue
    const insee = String(city.base + arr)
    let e = acc.get(insee)
    if (!e) { e = { insee, city, reg: 0, vot: 0, bl: 0, nul: 0, exp: 0, votes: new Map() }; acc.set(insee, e) }
    e.reg += num(c[5]); e.vot += num(c[6]); e.bl += num(c[13]); e.nul += num(c[16]); e.exp += num(c[10])
    for (let i = 19; i + 5 < c.length; i += BLOCK) {
      const nuance = c[i + 1]?.trim()
      if (!nuance) continue
      e.votes.set(nuance, (e.votes.get(nuance) ?? 0) + num(c[i + 5]))
    }
  }
  return [...acc.values()].map((e) => {
    const candidates = [...e.votes.entries()]
      .map(([nuance, votes]) => ({ name: label(nuance), party: nuance, votes, percentage: pct(votes, e.exp) }))
      .sort((a, b) => b.votes - a.votes)
    return {
      inseeCode: e.insee, name: e.city.fmt(+e.insee - e.city.base),
      registeredVoters: e.reg, turnout: e.vot, blankVotes: e.bl, nullVotes: e.nul, expressedVotes: e.exp,
      candidates, leadingCandidate: candidates[0]?.name ?? '',
    }
  })
}

const write = makeWriter(OUT)

// ── circonscription outputs ──────────────────────────────────────────────────────
const cr1 = parseCirco('t1-circo.csv')
const cr2raw = parseCirco('t2-circo.csv')
// circos won outright at round 1 have no round-2 row → carry them into round 2
const { circos: cr2, carried } = carryDecidedR1(cr1, cr2raw)
console.log(`circo r1: ${cr1.length} | r2: ${cr2raw.length} + ${carried} decided at r1 = ${cr2.length}`)

for (const [round, circos] of [[1, cr1], [2, cr2]]) {
  const candidates = nuanceList(circos)
  write(`round${round}-circ.json`, {
    year: 2024, round, granularity: 'circonscription', candidates,
    communes: circos.map(({ leadingNuance: _ln, ...c }) => c),
  })
  write(`round${round}-circ-choropleth.json`, {
    granularity: 'circonscription', year: 2024, round, candidates,
    communes: circos.map((c) => ({ inseeCode: c.inseeCode, leadingCandidate: label(c.leadingNuance), abstention: abst(c.registeredVoters, c.turnout) })),
  })
}

// ── département outputs ───────────────────────────────────────────────────────────
for (const [round, file] of [[1, 't1-dpt.csv'], [2, 't2-dpt.csv']]) {
  const depts = parseDpt(file)
  write(`round${round}.json`, { year: 2024, round, candidates: nuanceList(depts), communes: depts })
  console.log(`  round ${round}: ${depts.length} départements`)
}

// ── commune outputs (+ PLM arrondissements) ──────────────────────────────────────
for (const [round, cFile, bFile] of [[1, 't1-communes.csv', 't1-bureau.csv'], [2, 't2-communes.csv', 't2-bureau.csv']]) {
  const communes = parseCommunes(cFile)
  const arr = parseArrondissements(bFile)
  const all = [...communes, ...arr] // whole-city 75056/69123/13055 kept; FranceMap hides their polygons
  const candidates = nuanceList(all)
  write(`round${round}-communes.json`, { year: 2024, round, candidates, communes: all })
  write(`round${round}-communes-choropleth.json`, {
    granularity: 'commune', year: 2024, round, candidates,
    communes: all.map((c) => ({ inseeCode: c.inseeCode, leadingCandidate: c.leadingCandidate, abstention: abst(c.registeredVoters, c.turnout) })),
  })
  console.log(`  round ${round}: ${communes.length} communes + ${arr.length} arrondissements`)
}
