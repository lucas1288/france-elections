/**
 * Transforms the raw france-geojson départements GeoJSON into the shape
 * expected by the app (CommuneProperties), filters overseas territories,
 * and writes placeholder election data for each département.
 *
 * Source: https://github.com/gregoiredavid/france-geojson
 *
 * TODO: Replace with real commune-level GeoJSON once the data pipeline is ready.
 *       The app uses `code` as the join key — just ensure it matches the
 *       `inseeCode` field in the election JSON files.
 */

import { readFileSync, writeFileSync } from 'fs'

// Overseas département codes — kept in GeoJSON but rendered as insets in the map.
const OVERSEAS = new Set(['971', '972', '973', '974', '976'])

// Rough région code by département prefix (simplified — good enough for prototype)
const DEP_TO_REGION = {
  '01': '84', '02': '32', '03': '84', '04': '93', '05': '93',
  '06': '93', '07': '84', '08': '44', '09': '76', '10': '44',
  '11': '76', '12': '76', '13': '93', '14': '28', '15': '84',
  '16': '75', '17': '75', '18': '24', '19': '75', '21': '27',
  '22': '53', '23': '75', '24': '75', '25': '27', '26': '84',
  '27': '28', '28': '24', '29': '53', '2A': '94', '2B': '94',
  '30': '76', '31': '76', '32': '76', '33': '75', '34': '76',
  '35': '53', '36': '24', '37': '24', '38': '84', '39': '27',
  '40': '75', '41': '24', '42': '84', '43': '84', '44': '52',
  '45': '24', '46': '76', '47': '75', '48': '76', '49': '52',
  '50': '28', '51': '44', '52': '44', '53': '52', '54': '44',
  '55': '44', '56': '53', '57': '44', '58': '27', '59': '32',
  '60': '32', '61': '28', '62': '32', '63': '84', '64': '75',
  '65': '76', '66': '76', '67': '44', '68': '44', '69': '84',
  '70': '27', '71': '27', '72': '52', '73': '84', '74': '84',
  '75': '11', '76': '28', '77': '11', '78': '11', '79': '75',
  '80': '32', '81': '76', '82': '76', '83': '93', '84': '93',
  '85': '52', '86': '75', '87': '75', '88': '44', '89': '27',
  '90': '27', '91': '11', '92': '11', '93': '11', '94': '11',
  '95': '11',
  // Overseas
  '971': '01', '972': '02', '973': '03', '974': '04', '976': '06',
}

const raw = JSON.parse(readFileSync('/tmp/departements-outremer.geojson', 'utf8'))

// Filter and reshape features
const features = raw.features
  .map((f) => ({
    ...f,
    properties: {
      code: f.properties.code,
      nom: f.properties.nom,
      codeDepartement: f.properties.code,
      codeRegion: DEP_TO_REGION[f.properties.code] ?? '',
    },
  }))

const geojson = { type: 'FeatureCollection', features }

writeFileSync(
  'public/data/geo/communes-simplified.geojson',
  JSON.stringify(geojson),
)
console.log(`Wrote ${features.length} département features`)

// ── Generate placeholder election data ────────────────────────────────────────

function seededRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

const communes = features.map((f) => {
  const code = f.properties.code
  const seed = code.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const rng = seededRandom(seed * 31337)

  const registeredVoters = Math.floor(rng() * 400000 + 20000)
  const turnoutRate = 0.55 + rng() * 0.25
  const turnout = Math.floor(registeredVoters * turnoutRate)
  const blankVotes = Math.floor(turnout * (0.02 + rng() * 0.04))
  const nullVotes = Math.floor(turnout * 0.01)
  const expressedVotes = turnout - blankVotes - nullVotes

  const macronPct = 0.38 + rng() * 0.44  // 38–82 %, centred ~60 % nationally
  const macronVotes = Math.round(expressedVotes * macronPct)
  const lepVotes = expressedVotes - macronVotes

  return {
    inseeCode: code,
    name: f.properties.nom,
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

const electionData = {
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
  JSON.stringify(electionData, null, 2),
)
console.log(`Wrote election data for ${communes.length} départements`)
console.log('TODO: Replace with real commune-level data from data.gouv.fr')
