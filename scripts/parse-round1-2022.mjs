/**
 * Parses the official Ministère de l'Intérieur TXT file for the 2022
 * presidential election first round (département level) and converts it
 * into the app's RoundData JSON format.
 *
 * Source: https://www.data.gouv.fr/fr/datasets/
 *   election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-1er-tour/
 */

import { readFileSync, writeFileSync } from 'fs'

// The file is ISO-8859-1 encoded
const raw = readFileSync('/tmp/pres2022-t1-dpt.txt', 'latin1')
const lines = raw.split('\n').filter((l) => l.trim())

const header = lines[0].split(';')
console.log(`Columns: ${header.length}, Data rows: ${lines.length - 1}`)

// Column layout:
// 0  Code du département
// 1  Libellé du département
// 2  Etat saisie
// 3  Inscrits
// 4  Abstentions   5 %Abs/Ins
// 6  Votants       7 %Vot/Ins
// 8  Blancs        9 %Blancs/Ins  10 %Blancs/Vot
// 11 Nuls          12 %Nuls/Ins   13 %Nuls/Vot
// 14 Exprimés      15 %Exp/Ins    16 %Exp/Vot
// Then repeating per candidate (6 cols each):
//   Sexe | Nom | Prénom | Voix | %Voix/Ins | %Voix/Exp
const CANDIDATE_START = 17
const CANDIDATE_STRIDE = 6

function parseNum(s) {
  return parseInt(s.replace(/\s/g, ''), 10) || 0
}

function parsePct(s) {
  return parseFloat(s.replace(',', '.')) || 0
}

const communes = []
const candidateSet = new Map() // name → party (filled in below)

for (const line of lines.slice(1)) {
  const cols = line.split(';')
  if (cols.length < CANDIDATE_START + CANDIDATE_STRIDE) continue

  // Ministry uses Z-codes for overseas; map to real INSEE dept codes
  const ZCODE_TO_INSEE = {
    ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976',
    ZN: '988', ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
  }
  const rawCode = cols[0].trim()
  const inseeCode = ZCODE_TO_INSEE[rawCode] ?? rawCode
  const name = cols[1].trim()
  const registeredVoters = parseNum(cols[3])
  const turnout = parseNum(cols[6])
  const blankVotes = parseNum(cols[8])
  const nullVotes = parseNum(cols[11])
  const expressedVotes = parseNum(cols[14])

  const candidates = []
  let leadingCandidate = ''
  let leadingVotes = -1

  for (let i = CANDIDATE_START; i + 5 < cols.length; i += CANDIDATE_STRIDE) {
    const nom = cols[i + 1]?.trim()
    const prenom = cols[i + 2]?.trim()
    const voix = parseNum(cols[i + 3])
    const pct = parsePct(cols[i + 5]) // % Voix/Exp

    if (!nom) continue

    const fullName = `${prenom} ${nom}`
    candidates.push({ name: fullName, party: '', votes: voix, percentage: pct })
    candidateSet.set(fullName, '')

    if (voix > leadingVotes) {
      leadingVotes = voix
      leadingCandidate = fullName
    }
  }

  communes.push({
    inseeCode,
    name,
    registeredVoters,
    turnout,
    blankVotes,
    nullVotes,
    expressedVotes,
    leadingCandidate,
    candidates,
  })
}

// All 12 candidates from the first round — map to party labels
const PARTY_MAP = {
  'Nathalie ARTHAUD':       'LO',
  'Fabien ROUSSEL':         'PCF',
  'Emmanuel MACRON':        'LREM',
  'Jean LASSALLE':          'RES',
  'Marine LE PEN':          'RN',
  'Éric ZEMMOUR':           'REC',
  'Jean-Luc MÉLENCHON':    'LFI',
  'Anne HIDALGO':           'PS',
  'Yannick JADOT':          'EELV',
  'Valérie PÉCRESSE':       'LR',
  'Philippe POUTOU':        'NPA',
  'Nicolas DUPONT-AIGNAN':  'DLF',
}

// Fix up parties on all communes
for (const commune of communes) {
  for (const cand of commune.candidates) {
    cand.party = PARTY_MAP[cand.name] ?? ''
  }
}

// Derive global candidate list from first département (order is consistent)
const globalCandidates = communes[0].candidates.map((c) => ({
  name: c.name,
  party: PARTY_MAP[c.name] ?? '',
}))

const output = {
  electionType: 'presidential',
  year: 2022,
  round: 1,
  date: '2022-04-10',
  candidates: globalCandidates,
  communes,
}

writeFileSync(
  'public/data/elections/presidential/2022/round1.json',
  JSON.stringify(output, null, 2),
)

console.log(`Written ${communes.length} départements, ${globalCandidates.length} candidates`)
console.log('Candidates:', globalCandidates.map((c) => c.name).join(', '))
