/**
 * Parses the official Ministère de l'Intérieur sub-commune (subcom) TXT file
 * for the 2022 presidential election first round and produces commune-level
 * JSON aggregated to the INSEE commune code.
 *
 * Column layout (data rows have 19 fixed + 12×7 candidate = 103 cols):
 *   0  Code du département
 *   1  Libellé du département
 *   2  Code de la commune        ← 3-digit suffix
 *   3  Libellé de la commune
 *   4  Etat saisie
 *   5  Inscrits   6 Abstentions  7 %Abs/Ins
 *   8  Votants    9 %Vot/Ins
 *  10  Blancs    11 %Blancs/Ins 12 %Blancs/Vot
 *  13  Nuls      14 %Nuls/Ins   15 %Nuls/Vot
 *  16  Exprimés  17 %Exp/Ins    18 %Exp/Vot
 *  then per candidate (stride 7): N°Panneau | Sexe | Nom | Prénom | Voix | %/Ins | %/Exp
 */

import { readFileSync, writeFileSync } from 'fs'

const CAND_START = 19
const CAND_STRIDE = 7

const PARTY_MAP = {
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

function parseNum(s) { return parseInt((s ?? '').replace(/\s/g, ''), 10) || 0 }
function parsePct(s) { return parseFloat((s ?? '').replace(',', '.')) || 0 }

const lines = readFileSync('/tmp/pres2022-t1-subcom.txt', 'latin1').split('\n').filter(Boolean)
console.log(`Parsing ${lines.length - 1} data rows…`)

// Accumulate by INSEE commune code (some large communes have multiple subcom rows)
const byCode = new Map()

for (const line of lines.slice(1)) {
  const cols = line.split(';')
  if (cols.length < CAND_START + CAND_STRIDE) continue

  const deptCode = cols[0].trim()
  const communeCode = cols[2].trim().padStart(3, '0')

  // Build 5-char INSEE code — handles 2A/2B Corsica correctly
  const inseeCode = deptCode + communeCode

  const name = cols[3].trim()
  const inscrits    = parseNum(cols[5])
  const votants     = parseNum(cols[8])
  const blancs      = parseNum(cols[10])
  const nuls        = parseNum(cols[13])
  const exprimes    = parseNum(cols[16])

  // Parse 12 candidate results
  const candidateVotes = []
  for (let i = CAND_START; i + 5 < cols.length; i += CAND_STRIDE) {
    const nom    = cols[i + 2]?.trim()
    const prenom = cols[i + 3]?.trim()
    const voix   = parseNum(cols[i + 4])
    if (!nom) continue
    candidateVotes.push({ name: `${prenom} ${nom}`, votes: voix })
  }

  // Aggregate (most communes appear once; Paris arrondissements appear multiple times)
  if (!byCode.has(inseeCode)) {
    byCode.set(inseeCode, { inseeCode, name, registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0, candidates: candidateVotes.map(c => ({ name: c.name, party: PARTY_MAP[c.name] ?? '', votes: 0, percentage: 0 })) })
  }
  const entry = byCode.get(inseeCode)
  entry.registeredVoters += inscrits
  entry.turnout          += votants
  entry.blankVotes       += blancs
  entry.nullVotes        += nuls
  entry.expressedVotes   += exprimes
  for (let j = 0; j < entry.candidates.length; j++) {
    entry.candidates[j].votes += candidateVotes[j]?.votes ?? 0
  }
}

// Compute percentages and leading candidate
const communes = []
for (const entry of byCode.values()) {
  const total = entry.expressedVotes || 1
  let leading = entry.candidates[0].name
  let leadingVotes = 0
  for (const c of entry.candidates) {
    c.percentage = parseFloat(((c.votes / total) * 100).toFixed(2))
    if (c.votes > leadingVotes) { leadingVotes = c.votes; leading = c.name }
  }
  communes.push({ ...entry, leadingCandidate: leading })
}

// Derive global candidate list (order consistent across all rows)
const firstEntry = [...byCode.values()][0]
const globalCandidates = firstEntry.candidates.map(c => ({ name: c.name, party: c.party }))

const output = {
  electionType: 'presidential',
  year: 2022,
  round: 1,
  date: '2022-04-10',
  granularity: 'commune',
  candidates: globalCandidates,
  communes,
}

const dest = 'public/data/elections/presidential/2022/round1-communes.json'
writeFileSync(dest, JSON.stringify(output))

const macron = communes.filter(c => c.leadingCandidate.includes('MACRON')).length
const lepen  = communes.filter(c => c.leadingCandidate.includes('PEN')).length
const melenchon = communes.filter(c => c.leadingCandidate.includes('LENCHON')).length
console.log(`Wrote ${communes.length} communes → ${dest}`)
console.log(`  MACRON leading: ${macron}`)
console.log(`  LE PEN leading: ${lepen}`)
console.log(`  MÉLENCHON leading: ${melenchon}`)
console.log(`  Other leading: ${communes.length - macron - lepen - melenchon}`)
