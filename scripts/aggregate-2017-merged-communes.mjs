#!/usr/bin/env node
/**
 * Reshape the 2017 commune results onto the CURRENT tile geometry (COG drift).
 *
 * The tiles follow the current COG; between the May 2017 vote and today,
 * ~640 communes disappeared into communes nouvelles. Two situations:
 *
 *  1. MERGERS (the big set, ~550 metro codes): a 2017 commune's code no longer
 *     has a polygon — its territory is inside a current commune. Resolution
 *     comes from INSEE's commune-movements table
 *     (data-sources/cog/v_mvt_commune_2025.csv, from
 *     https://www.insee.fr/fr/statistiques/fichier/8377162/v_mvt_commune_2025.csv):
 *     follow post-vote COM→COM movements (fusion/commune nouvelle/code change,
 *     MOD 31/32/33/34/41/50) transitively to the current code, then SUM the
 *     constituents' results into one entry under the tile's code (votes,
 *     registered, turnout, blank/null/expressed; percentages + leader
 *     recomputed). The absorbed originals are REMOVED so dept-insight counts
 *     don't double-count — the dataset represents "the 2017 vote on today's
 *     communes", consistent with what the map can draw.
 *
 *  2. DÉFUSIONS (7 codes): communes restored after 2017 have polygons but
 *     voted inside their then-parent — the parent's entry is COPIED under the
 *     restored code (same UX as inject-merged-commune-results.mjs, which does
 *     NOT cover presidential/2017 — this script owns all 2017 COG handling).
 *
 * Not touched: Polynésie/NC/Wallis communes (98xxx) — no polygons in the
 * current tileset for ANY election (data-only entries, sidebar lookups); the
 * WWI-destroyed Meuse villages (intentionally blank); consular codes (99xxx);
 * PLM arrondissements (2017 arr data comes from the bureaux-de-vote source in
 * a separate step).
 *
 * Idempotent (resolved codes no longer appear as sources on re-runs).
 * Run right after the 2017 parser:
 *   node scripts/aggregate-2017-merged-communes.mjs               # presidential (default)
 *   node scripts/aggregate-2017-merged-communes.mjs legislative   # legislative
 * (Both 2017 elections share the machinery — commune entries are summed by
 * candidate NAME, which is the person for presidentials and the nuance label
 * for legislatives; either way the merge is well-defined.)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TYPE = process.argv[2] === 'legislative' ? 'legislative' : 'presidential'
const OUT = join(ROOT, 'public', 'data', 'elections', TYPE, '2017')
const MVT = join(ROOT, 'data-sources', 'cog', 'v_mvt_commune_2025.csv')
// Day after the election's R2 — earlier movements are already in the data.
const ELECTION_DATE = TYPE === 'legislative' ? '2017-06-19' : '2017-05-08'

// Restored communes (défusions post-2017): tile code → code holding the 2017 votes.
const DEFUSIONS = {
  '15031': '15141', // Celles           — ex-Neussargues en Pinatelle (split 2025)
  '15035': '15141', // Chalinargues
  '15047': '15141', // Chavagnac
  '15171': '15141', // Sainte-Anastasie
  '85165': '85084', // L'Oie            — ex-Essarts en Bocage (split 2024)
  '85212': '85084', // Sainte-Florence
  '14666': '14712', // Sannerville      — ex-Saline (split 2019)
  '60694': '60054', // Les Hauts-Talican — 2024 partial split: Beaumont-les-Nonains kept 60054, the remaining commune took 60694 (2017 votes are in the 60054 aggregate)
}

// ── Movement chains: 2017 code → current code (+ current name) ────────────────
const fwd = new Map()
for (const line of readFileSync(MVT, 'utf8').trim().split('\n').slice(1)) {
  const f = line.split(',').map((s) => s.replace(/^"|"$/g, ''))
  const [mod, date, typeAv, comAv, , , , , typeAp, comAp, , , , libAp] = f
  if (!['31', '32', '33', '34', '41', '50'].includes(mod)) continue
  if (typeAv !== 'COM' || typeAp !== 'COM' || comAv === comAp) continue
  if (date < ELECTION_DATE) continue
  fwd.set(comAv, { to: comAp, lib: libAp })
}
function resolveCode(code) {
  let cur = code
  let lib = null
  for (let i = 0; i < 10 && fwd.has(cur); i++) {
    const m = fwd.get(cur)
    cur = m.to
    lib = m.lib
  }
  return { code: cur, lib }
}

const round2f = (n) => Math.round(n * 100) / 100

function mergeEntries(target, entries, currentName) {
  const sum = (k) => entries.reduce((a, e) => a + (e[k] ?? 0), 0)
  const votes = new Map()
  const party = new Map()
  for (const e of entries) {
    for (const c of e.candidates) {
      votes.set(c.name, (votes.get(c.name) ?? 0) + c.votes)
      if (c.party) party.set(c.name, c.party)
    }
  }
  const expressed = sum('expressedVotes')
  const candidates = [...votes.entries()]
    .map(([name, v]) => ({
      name,
      party: party.get(name) ?? '',
      votes: v,
      percentage: expressed ? round2f((v / expressed) * 100) : 0,
    }))
    .sort((a, b) => b.votes - a.votes)
  return {
    inseeCode: target,
    name: currentName,
    registeredVoters: sum('registeredVoters'),
    turnout: sum('turnout'),
    blankVotes: sum('blankVotes'),
    nullVotes: sum('nullVotes'),
    expressedVotes: expressed,
    leadingCandidate: expressed ? candidates[0]?.name ?? '' : '',
    candidates,
  }
}

for (const round of [1, 2]) {
  const fullPath = join(OUT, `round${round}-communes.json`)
  const choroPath = join(OUT, `round${round}-communes-choropleth.json`)
  const full = JSON.parse(readFileSync(fullPath, 'utf8'))

  // Group entries by resolved current code.
  const groups = new Map()
  for (const e of full.communes) {
    if (e.inseeCode.startsWith('99')) {
      groups.set(e.inseeCode, { entries: [e], lib: null })
      continue
    }
    const r = resolveCode(e.inseeCode)
    const g = groups.get(r.code) ?? { entries: [], lib: null }
    g.entries.push(e)
    if (r.lib) g.lib = r.lib
    groups.set(r.code, g)
  }

  let merged = 0
  const outEntries = []
  for (const [code, g] of groups) {
    if (g.entries.length === 1 && g.entries[0].inseeCode === code) {
      outEntries.push(g.entries[0])
      continue
    }
    // Prefer the existing entry's (chef-lieu) name only if the code didn't
    // change; otherwise the movement row carries the current name.
    const own = g.entries.find((e) => e.inseeCode === code)
    outEntries.push(mergeEntries(code, g.entries, own?.name ?? g.lib ?? g.entries[0].name))
    merged += g.entries.length
  }

  // Défusions: copy the parent's (possibly just-merged) entry under the tile code.
  const byCode = new Map(outEntries.map((e) => [e.inseeCode, e]))
  let copied = 0
  for (const [tileCode, dataCode] of Object.entries(DEFUSIONS)) {
    if (byCode.has(tileCode)) continue
    const src = byCode.get(dataCode)
    if (!src) continue
    outEntries.push({ ...src, inseeCode: tileCode })
    copied++
  }

  full.communes = outEntries
  writeFileSync(fullPath, JSON.stringify(full))

  // Rebuild the choropleth from the reshaped full data (leader + abstention).
  const choro = JSON.parse(readFileSync(choroPath, 'utf8'))
  choro.communes = outEntries.map((e) => ({
    inseeCode: e.inseeCode,
    leadingCandidate: e.leadingCandidate,
    abstention: e.registeredVoters
      ? round2f(((e.registeredVoters - e.turnout) / e.registeredVoters) * 100)
      : undefined,
  }))
  writeFileSync(choroPath, JSON.stringify(choro))

  console.log(
    `round${round}: ${full.communes.length} communes (${merged} source entries merged into communes nouvelles, ${copied} défusion copies)`,
  )
}
