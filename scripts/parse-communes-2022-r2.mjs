/**
 * Parses the official Ministère de l'Intérieur sub-commune (subcom) TXT file
 * for the 2022 presidential election SECOND ROUND and produces the compact
 * commune-level choropleth JSON.
 *
 * Download the source file first:
 *   curl -L "https://www.data.gouv.fr/api/1/datasets/r/708b5ee0-3a53-4021-9a6a-3f73cec0a7a9" \
 *        -o /tmp/pres2022-t2-subcom.txt
 * (If that URL no longer works, search data.gouv.fr for "Présidentielle 2022 tour 2 subcom".)
 *
 * Column layout (2 candidates only):
 *   0  Code du département
 *   1  Libellé du département
 *   2  Code de la commune   (3-digit suffix)
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
  'Emmanuel MACRON': 'LREM',
  'Marine LE PEN':   'RN',
}

function parseNum(s) { return parseInt((s ?? '').replace(/\s/g, ''), 10) || 0 }

const lines = readFileSync('/tmp/pres2022-t2-subcom.txt', 'latin1').split('\n').filter(Boolean)
console.log(`Parsing ${lines.length - 1} data rows…`)

const byCode = new Map()

for (const line of lines.slice(1)) {
  const cols = line.split(';')
  if (cols.length < CAND_START + CAND_STRIDE) continue

  const deptCode    = cols[0].trim()
  const communeCode = cols[2].trim().padStart(3, '0')
  const inseeCode   = deptCode + communeCode
  const name        = cols[3].trim()
  const inscrits    = parseNum(cols[5])
  const votants     = parseNum(cols[8])
  const blancs      = parseNum(cols[10])
  const nuls        = parseNum(cols[13])
  const exprimes    = parseNum(cols[16])

  const candidateVotes = []
  for (let i = CAND_START; i + 5 < cols.length; i += CAND_STRIDE) {
    const nom    = cols[i + 2]?.trim()
    const prenom = cols[i + 3]?.trim()
    const voix   = parseNum(cols[i + 4])
    if (!nom) continue
    candidateVotes.push({ name: `${prenom} ${nom}`, votes: voix })
  }

  if (!byCode.has(inseeCode)) {
    byCode.set(inseeCode, {
      inseeCode, name,
      registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0,
      candidates: candidateVotes.map(c => ({
        name: c.name, party: PARTY_MAP[c.name] ?? '', votes: 0, percentage: 0,
      })),
    })
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

const firstEntry = [...byCode.values()][0]
const globalCandidates = firstEntry.candidates.map(c => ({ name: c.name, party: c.party }))

// Build compact choropleth (inseeCode + leadingCandidate only)
const choroplethCommunes = []
for (const entry of byCode.values()) {
  let leading = entry.candidates[0].name
  let leadingVotes = 0
  for (const c of entry.candidates) {
    if (c.votes > leadingVotes) { leadingVotes = c.votes; leading = c.name }
  }
  choroplethCommunes.push({ inseeCode: entry.inseeCode, leadingCandidate: leading })
}

const choropleth = {
  granularity: 'commune',
  year: 2022,
  round: 2,
  candidates: globalCandidates,
  communes: choroplethCommunes,
}

const dest = 'public/data/elections/presidential/2022/round2-communes-choropleth.json'
writeFileSync(dest, JSON.stringify(choropleth))

const macron  = choroplethCommunes.filter(c => c.leadingCandidate.includes('MACRON')).length
const lepen   = choroplethCommunes.filter(c => c.leadingCandidate.includes('PEN')).length
console.log(`Wrote ${choroplethCommunes.length} communes → ${dest}`)
console.log(`  MACRON leading: ${macron}`)
console.log(`  LE PEN leading: ${lepen}`)
