/**
 * Generates placeholder 2022 presidential round 2 data.
 * Each commune gets random-but-realistic vote percentages for Macron vs Le Pen.
 *
 * TODO: Replace this with real data from data.gouv.fr:
 *   https://www.data.gouv.fr/fr/datasets/election-presidentielle-des-10-et-24-avril-2022-resultats-definitifs-du-2eme-tour/
 *
 * INSEE codes are fabricated here — replace with codes matching your GeoJSON.
 */

import { writeFileSync } from 'fs'

// Fabricated sample of ~20 communes to demonstrate the data shape.
// In production this file has one entry per ~35 000 communes.
const SAMPLE_COMMUNES = [
  { code: '75056', nom: 'Paris', dep: '75' },
  { code: '13055', nom: 'Marseille', dep: '13' },
  { code: '69123', nom: 'Lyon', dep: '69' },
  { code: '31555', nom: 'Toulouse', dep: '31' },
  { code: '06088', nom: 'Nice', dep: '06' },
  { code: '44109', nom: 'Nantes', dep: '44' },
  { code: '67482', nom: 'Strasbourg', dep: '67' },
  { code: '34172', nom: 'Montpellier', dep: '34' },
  { code: '33063', nom: 'Bordeaux', dep: '33' },
  { code: '59350', nom: 'Lille', dep: '59' },
  { code: '35238', nom: 'Rennes', dep: '35' },
  { code: '76540', nom: 'Rouen', dep: '76' },
  { code: '38185', nom: 'Grenoble', dep: '38' },
  { code: '34090', nom: 'Nîmes', dep: '34' }, // adjusted to match real code
  { code: '86194', nom: 'Poitiers', dep: '86' },
  { code: '64445', nom: 'Pau', dep: '64' },
  { code: '57463', nom: 'Metz', dep: '57' },
  { code: '51454', nom: 'Reims', dep: '51' },
  { code: '49007', nom: 'Angers', dep: '49' },
  { code: '29232', nom: 'Brest', dep: '29' },
]

function seededRandom(seed) {
  // Simple LCG — deterministic so the map looks the same on every build
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

const communes = SAMPLE_COMMUNES.map((c) => {
  const rng = seededRandom(parseInt(c.code, 10))

  const registeredVoters = Math.floor(rng() * 50000 + 5000)
  const turnoutRate = 0.55 + rng() * 0.25 // 55–80%
  const turnout = Math.floor(registeredVoters * turnoutRate)
  const blankVotes = Math.floor(turnout * (0.02 + rng() * 0.04))
  const nullVotes = Math.floor(turnout * 0.01)
  const expressedVotes = turnout - blankVotes - nullVotes

  // Macron base ~58% nationally; add local noise
  const macronPct = 0.4 + rng() * 0.4 // 40–80%
  const lepPct = 1 - macronPct

  const macronVotes = Math.round(expressedVotes * macronPct)
  const lepVotes = expressedVotes - macronVotes

  return {
    inseeCode: c.code,
    name: c.nom,
    registeredVoters,
    turnout,
    blankVotes,
    nullVotes,
    expressedVotes,
    leadingCandidate: macronVotes > lepVotes ? 'Emmanuel Macron' : 'Marine Le Pen',
    candidates: [
      {
        name: 'Emmanuel Macron',
        party: 'LREM',
        votes: macronVotes,
        percentage: parseFloat(((macronVotes / expressedVotes) * 100).toFixed(2)),
      },
      {
        name: 'Marine Le Pen',
        party: 'RN',
        votes: lepVotes,
        percentage: parseFloat(((lepVotes / expressedVotes) * 100).toFixed(2)),
      },
    ],
  }
})

const output = {
  electionType: 'presidential',
  year: 2022,
  round: 2,
  date: '2022-04-24',
  candidates: [
    { name: 'Emmanuel Macron', party: 'LREM' },
    { name: 'Marine Le Pen', party: 'RN' },
  ],
  communes,
}

writeFileSync(
  'public/data/elections/presidential/2022/round2.json',
  JSON.stringify(output, null, 2),
)

console.log(`Generated ${communes.length} placeholder communes.`)
console.log('TODO: Replace with real data from data.gouv.fr')
