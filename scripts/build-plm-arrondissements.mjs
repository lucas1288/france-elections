// Build Paris/Lyon/Marseille arrondissement-level results and inject them into
// the commune data files.
//
// The ministry's commune/subcom files code PLM as a single commune each
// (75056 Paris, 69123 Lyon, 13055 Marseille). But the *bureau de vote* files
// encode the arrondissement inside the bureau code: `AABB` where AA = the
// arrondissement (01..20 Paris, 01..09 Lyon, 01..16 Marseille) and BB = the
// bureau within it. So we can aggregate the BV rows by arrondissement with no
// REU mapping at all.
//
// Output arrondissement INSEE codes: Paris 751xx, Lyon 693xx, Marseille 132xx.
// Entries are appended to the existing commune full + choropleth JSON files
// (the whole-city 75056/69123/13055 entries are kept; FranceMap hides their
// polygons so the arrondissements replace them on the map).
//
// Usage: node scripts/build-plm-arrondissements.mjs [eraFilter]
//   e.g. `node scripts/build-plm-arrondissements.mjs 2017` runs only the 2017 jobs.
//   The 2017 presidential BV files share the exact 2022 layout (21 fixed columns,
//   7-wide pres candidate blocks), so the same aggregation covers both vintages.

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCES = path.join(ROOT, 'data-sources')
const ELEC = path.join(ROOT, 'public/data/elections')

// PLM cities: ministry (dept, commune) → INSEE base for arrondissements + valid range.
const PLM = [
  { dept: '75', commune: '056', base: 75100, min: 1, max: 20 }, // Paris
  { dept: '69', commune: '123', base: 69380, min: 1, max: 9 },  // Lyon
  { dept: '13', commune: '055', base: 13200, min: 1, max: 16 }, // Marseille
]
const plmKey = (d, c) => `${d}|${c}`
const PLM_BY_KEY = new Map(PLM.map((p) => [plmKey(p.dept, p.commune), p]))

const FIXED = 21 // leading columns before the first candidate block

const round1 = (n) => Math.round(n * 10) / 10
const round2 = (n) => Math.round(n * 100) / 100

/**
 * Stream a BV file and aggregate PLM bureaux by arrondissement.
 * mode 'pres': candidate block = [Panneau,Sexe,Nom,Prénom,Voix,%Ins,%Exp] (7)
 *   keyed by "Prénom NOM".
 * mode 'legis': block = [Panneau,Sexe,Nom,Prénom,Nuance,Voix,%Ins,%Exp] (8)
 *   keyed by Nuance code.
 */
async function aggregate(file, mode) {
  const block = mode === 'pres' ? 7 : 8
  const acc = new Map() // insee → { totals, votes: Map<key,votes> }

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue } // header
    if (!line) continue
    const p = line.split(';')
    const city = PLM_BY_KEY.get(plmKey(p[0], p[4]))
    if (!city) continue
    const arr = parseInt(p[6].slice(0, 2), 10)
    if (!(arr >= city.min && arr <= city.max)) continue // skip stray (e.g. Lyon 0001)
    const insee = String(city.base + arr)

    let e = acc.get(insee)
    if (!e) {
      e = {
        registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0,
        votes: new Map(), party: new Map(),
      }
      acc.set(insee, e)
    }
    e.registeredVoters += +p[7] || 0
    e.turnout += +p[10] || 0
    e.blankVotes += +p[12] || 0
    e.nullVotes += +p[15] || 0
    e.expressedVotes += +p[18] || 0

    for (let i = FIXED; i + block <= p.length + 1 && p[i] !== undefined && p[i] !== ''; i += block) {
      if (mode === 'pres') {
        const name = `${p[i + 3]} ${p[i + 2]}`
        e.votes.set(name, (e.votes.get(name) ?? 0) + (+p[i + 4] || 0))
      } else {
        const code = p[i + 4]
        if (!code) continue
        e.votes.set(code, (e.votes.get(code) ?? 0) + (+p[i + 5] || 0))
      }
    }
  }
  return acc
}

/** Build the candidate array + leadingCandidate for one arrondissement entry. */
function buildCandidates(e, mode, presParty, legisLabel) {
  const expressed = e.expressedVotes || 1
  let cands
  if (mode === 'pres') {
    cands = [...e.votes.entries()].map(([name, votes]) => ({
      name,
      party: presParty.get(name) ?? '',
      votes,
      percentage: round2((votes / expressed) * 100),
    }))
  } else {
    cands = [...e.votes.entries()].map(([code, votes]) => ({
      name: legisLabel.get(code) ?? code,
      party: code,
      votes,
      percentage: round2((votes / expressed) * 100),
    }))
  }
  cands.sort((a, b) => b.votes - a.votes)
  return cands
}

function fullEntry(insee, name, e, cands) {
  return {
    inseeCode: insee,
    name,
    registeredVoters: e.registeredVoters,
    turnout: e.turnout,
    blankVotes: e.blankVotes,
    nullVotes: e.nullVotes,
    expressedVotes: e.expressedVotes,
    leadingCandidate: cands[0]?.name ?? '',
    candidates: cands,
  }
}

const ARR_NAME = (insee) => {
  const n = +insee
  if (n >= 75101 && n <= 75120) return `Paris ${n - 75100}e arrondissement`
  if (n >= 69381 && n <= 69389) return `Lyon ${n - 69380}e arrondissement`
  if (n >= 13201 && n <= 13216) return `Marseille ${n - 13200}e arrondissement`
  return insee
}

/** Append/replace arrondissement entries in a JSON file's `communes` array. */
function injectFull(relPath, entries) {
  const fp = path.join(ELEC, relPath)
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'))
  const codes = new Set(entries.map((x) => x.inseeCode))
  j.communes = j.communes.filter((c) => !codes.has(c.inseeCode)).concat(entries)
  fs.writeFileSync(fp, JSON.stringify(j))
  return j.communes.length
}

function injectChoro(relPath, choroEntries) {
  const fp = path.join(ELEC, relPath)
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'))
  const codes = new Set(choroEntries.map((x) => x.inseeCode))
  j.communes = j.communes.filter((c) => !codes.has(c.inseeCode)).concat(choroEntries)
  fs.writeFileSync(fp, JSON.stringify(j))
  return j.communes.length
}

async function processJob({ bvFile, mode, refPath, fullPath, choroPath }) {
  // Master lookups from the existing data files.
  const presParty = new Map()
  const legisLabel = new Map()
  const ref = JSON.parse(fs.readFileSync(path.join(ELEC, refPath), 'utf8'))
  if (mode === 'pres') {
    for (const c of ref.candidates) presParty.set(c.name, c.party)
  } else {
    for (const c of ref.candidates) legisLabel.set(c.party, c.name)
  }

  const acc = await aggregate(path.join(SOURCES, bvFile), mode)
  const fullEntries = []
  const choroEntries = []
  for (const [insee, e] of [...acc.entries()].sort()) {
    const cands = buildCandidates(e, mode, presParty, legisLabel)
    const name = ARR_NAME(insee)
    fullEntries.push(fullEntry(insee, name, e, cands))
    const abstention = e.registeredVoters
      ? round1(((e.registeredVoters - e.turnout) / e.registeredVoters) * 100)
      : 0
    choroEntries.push({ inseeCode: insee, leadingCandidate: cands[0]?.name ?? '', abstention })
  }

  if (fullPath) {
    const n = injectFull(fullPath, fullEntries)
    console.log(`  ${fullPath}: +${fullEntries.length} arr (${n} total)`)
  }
  const nc = injectChoro(choroPath, choroEntries)
  console.log(`  ${choroPath}: +${choroEntries.length} arr (${nc} total)`)
  return fullEntries
}

const JOBS = [
  { era: '2022', type: 'pres', round: 1, bvFile: 'burvot-2022/burvot-pres-t1.txt', mode: 'pres',
    refPath: 'presidential/2022/round1.json',
    fullPath: 'presidential/2022/round1-communes.json', choroPath: 'presidential/2022/round1-communes-choropleth.json' },
  { era: '2022', type: 'pres', round: 2, bvFile: 'burvot-2022/burvot-pres-t2.txt', mode: 'pres',
    refPath: 'presidential/2022/round2.json',
    fullPath: null, choroPath: 'presidential/2022/round2-communes-choropleth.json' }, // no R2 full commune file
  { era: '2022', type: 'legis', round: 1, bvFile: 'burvot-2022/burvot-legis-t1.txt', mode: 'legis',
    refPath: 'legislative/2022/round1-communes.json',
    fullPath: 'legislative/2022/round1-communes.json', choroPath: 'legislative/2022/round1-communes-choropleth.json' },
  { era: '2022', type: 'legis', round: 2, bvFile: 'burvot-2022/burvot-legis-t2.txt', mode: 'legis',
    refPath: 'legislative/2022/round1-communes.json',
    fullPath: 'legislative/2022/round2-communes.json', choroPath: 'legislative/2022/round2-communes-choropleth.json' },
  { era: '2017', type: 'pres', round: 1, bvFile: 'presidentielle-2017/pres2017-t1-bv.txt', mode: 'pres',
    refPath: 'presidential/2017/round1.json',
    fullPath: 'presidential/2017/round1-communes.json', choroPath: 'presidential/2017/round1-communes-choropleth.json' },
  { era: '2017', type: 'pres', round: 2, bvFile: 'presidentielle-2017/pres2017-t2-bv.txt', mode: 'pres',
    refPath: 'presidential/2017/round2.json',
    fullPath: 'presidential/2017/round2-communes.json', choroPath: 'presidential/2017/round2-communes-choropleth.json' },
  // 2017 legislative BV files share the 2022 legis layout (21 fixed cols + 8-wide
  // blocks with Nuance) — mode 'legis' applies unchanged.
  { era: '2017-leg', type: 'legis', round: 1, bvFile: 'legislatives-2017/leg2017-t1-bv.txt', mode: 'legis',
    refPath: 'legislative/2017/round1-communes.json',
    fullPath: 'legislative/2017/round1-communes.json', choroPath: 'legislative/2017/round1-communes-choropleth.json' },
  { era: '2017-leg', type: 'legis', round: 2, bvFile: 'legislatives-2017/leg2017-t2-bv.txt', mode: 'legis',
    refPath: 'legislative/2017/round2-communes.json',
    fullPath: 'legislative/2017/round2-communes.json', choroPath: 'legislative/2017/round2-communes-choropleth.json' },
]

const eraFilter = process.argv[2]
let sample = null
for (const job of JOBS) {
  if (eraFilter && job.era !== eraFilter) continue
  console.log(`${job.era} ${job.type} round ${job.round}:`)
  const entries = await processJob(job)
  if (job.type === 'pres' && job.round === 1) sample = entries
}

// Sanity print: Paris totals should sum to the whole-city figure in the data.
if (sample) {
  const paris = sample.filter((e) => +e.inseeCode >= 75101 && +e.inseeCode <= 75120)
  const reg = paris.reduce((a, e) => a + e.registeredVoters, 0)
  console.log(`\nParis 20 arr Σ inscrits (pres R1) = ${reg.toLocaleString('fr-FR')}`)
  console.log('Sample 1er arr leader:', paris[0]?.leadingCandidate, paris[0]?.candidates.slice(0, 3).map((c) => `${c.name} ${c.percentage}%`).join(', '))
}
