/**
 * Parses the official Ministère de l'Intérieur CIRLG TXT files for the 2022
 * presidential election (both rounds) and produces circumscription-level
 * choropleth JSON files.
 *
 * Column layout (same wide format as DPT / SUBCOM files):
 *   0  Code du département
 *   1  Libellé du département
 *   2  Code de la circonscription   ← 2-digit suffix within dept
 *   3  Libellé de la circonscription
 *   4  Etat saisie
 *   5  Inscrits   6 Abstentions  7 %Abs/Ins
 *   8  Votants    9 %Vot/Ins
 *  10  Blancs    11 %Blancs/Ins 12 %Blancs/Vot
 *  13  Nuls      14 %Nuls/Ins   15 %Nuls/Vot
 *  16  Exprimés  17 %Exp/Ins    18 %Exp/Vot
 *  then per candidate (stride 7): N°Panneau | Sexe | Nom | Prénom | Voix | %/Ins | %/Exp
 *
 * The circonscription code in the GeoJSON uses the format: dept_padded_2 + circ_padded_2
 * e.g. dept='01', circ='01' → '0101'  |  dept='75', circ='01' → '7501'
 */

import { readFileSync, writeFileSync } from 'fs'

const CAND_START = 19
const CAND_STRIDE = 7

const ZCODE_TO_INSEE = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976',
  ZN: '988', ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
}

const PARTY_MAP_R1 = {
  'Nathalie ARTHAUD':      'LO',
  'Fabien ROUSSEL':        'PCF',
  'Emmanuel MACRON':       'LREM',
  'Jean LASSALLE':         'RES',
  'Marine LE PEN':         'RN',
  'Éric ZEMMOUR':          'REC',
  'Jean-Luc MÉLENCHON':   'LFI',
  'Anne HIDALGO':          'PS',
  'Yannick JADOT':         'EELV',
  'Valérie PÉCRESSE':      'LR',
  'Philippe POUTOU':       'NPA',
  'Nicolas DUPONT-AIGNAN': 'DLF',
}

const PARTY_MAP_R2 = {
  'Emmanuel MACRON': 'LREM',
  'Marine LE PEN':   'RN',
}

function parseNum(s) { return parseInt((s ?? '').replace(/\s/g, ''), 10) || 0 }
function parsePct(s) { return parseFloat((s ?? '').replace(',', '.')) || 0 }

function toCircoCode(deptRaw, circRaw) {
  const dept = ZCODE_TO_INSEE[deptRaw] ?? deptRaw
  return dept.padStart(2, '0') + String(circRaw).padStart(2, '0')
}

function parseFile(path, round, partyMap) {
  const lines = readFileSync(path, 'latin1').split('\n').filter(Boolean)
  console.log(`Round ${round}: parsing ${lines.length - 1} rows from ${path}`)

  const circos = []

  for (const line of lines.slice(1)) {
    const cols = line.split(';')
    if (cols.length < CAND_START + CAND_STRIDE) continue

    const deptRaw  = cols[0].trim()
    const deptName = cols[1].trim()
    const circRaw  = cols[2].trim()
    const circName = cols[3].trim()
    const inscrits    = parseNum(cols[5])
    const votants     = parseNum(cols[8])
    const blancs      = parseNum(cols[10])
    const nuls        = parseNum(cols[13])
    const exprimes    = parseNum(cols[16])

    const candidates = []
    let leadingCandidate = ''
    let leadingVotes = -1

    for (let i = CAND_START; i + 5 < cols.length; i += CAND_STRIDE) {
      const nom    = cols[i + 2]?.trim()
      const prenom = cols[i + 3]?.trim()
      const voix   = parseNum(cols[i + 4])
      const pct    = parsePct(cols[i + 6])
      if (!nom) continue

      const fullName = `${prenom} ${nom}`
      candidates.push({
        name: fullName,
        party: partyMap[fullName] ?? '',
        votes: voix,
        percentage: pct,
      })

      if (voix > leadingVotes) { leadingVotes = voix; leadingCandidate = fullName }
    }

    circos.push({
      inseeCode: toCircoCode(deptRaw, circRaw),
      name: `${deptName} – ${circName}`,
      registeredVoters: inscrits,
      turnout: votants,
      blankVotes: blancs,
      nullVotes: nuls,
      expressedVotes: exprimes,
      leadingCandidate,
      candidates,
    })
  }

  return circos
}

// ── Round 1 ───────────────────────────────────────────────────────────────────
const r1Circos = parseFile('/tmp/pres2022-t1-cirlg.txt', 1, PARTY_MAP_R1)

const r1GlobalCandidates = r1Circos[0].candidates.map(c => ({ name: c.name, party: c.party }))

const r1Full = {
  electionType: 'presidential',
  year: 2022,
  round: 1,
  date: '2022-04-10',
  granularity: 'circonscription',
  candidates: r1GlobalCandidates,
  communes: r1Circos,
}

const r1Choropleth = {
  granularity: 'circonscription',
  year: 2022,
  round: 1,
  candidates: r1GlobalCandidates,
  communes: r1Circos.map(c => ({ inseeCode: c.inseeCode, leadingCandidate: c.leadingCandidate })),
}

writeFileSync('public/data/elections/presidential/2022/round1-circ.json', JSON.stringify(r1Full))
writeFileSync('public/data/elections/presidential/2022/round1-circ-choropleth.json', JSON.stringify(r1Choropleth))
console.log(`Round 1: ${r1Circos.length} circonscriptions → round1-circ.json + round1-circ-choropleth.json`)

// ── Round 2 ───────────────────────────────────────────────────────────────────
const r2Circos = parseFile('/tmp/pres2022-t2-cirlg.txt', 2, PARTY_MAP_R2)

const r2GlobalCandidates = r2Circos[0].candidates.map(c => ({ name: c.name, party: c.party }))

const r2Full = {
  electionType: 'presidential',
  year: 2022,
  round: 2,
  date: '2022-04-24',
  granularity: 'circonscription',
  candidates: r2GlobalCandidates,
  communes: r2Circos,
}

const r2Choropleth = {
  granularity: 'circonscription',
  year: 2022,
  round: 2,
  candidates: r2GlobalCandidates,
  communes: r2Circos.map(c => ({ inseeCode: c.inseeCode, leadingCandidate: c.leadingCandidate })),
}

writeFileSync('public/data/elections/presidential/2022/round2-circ.json', JSON.stringify(r2Full))
writeFileSync('public/data/elections/presidential/2022/round2-circ-choropleth.json', JSON.stringify(r2Choropleth))
console.log(`Round 2: ${r2Circos.length} circonscriptions → round2-circ.json + round2-circ-choropleth.json`)
