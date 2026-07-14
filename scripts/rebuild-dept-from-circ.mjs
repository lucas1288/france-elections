#!/usr/bin/env node
/**
 * Rebuilds a département-level round file (roundN.json) by aggregating the
 * full circonscription file (roundN-circ.json) of the same election.
 *
 * Written for présidentielle 2022 round 2, whose original round2.json was
 * corrupt (101 scrambled entries, 22.7M of 48.7M inscrits, national Macron
 * 71.7% vs the official 58.5%) while round2-circ.json checked out exactly
 * against the official totals. Aggregating circos → departments also restores
 * the '99' Français-à-l'étranger aggregate the old file lacked.
 *
 * Usage: node scripts/rebuild-dept-from-circ.mjs <type> <year> <round>
 *   e.g. node scripts/rebuild-dept-from-circ.mjs presidential 2022 2
 *
 * Département names are taken from the election's round1.json (same codes);
 * a .bak of the replaced file is kept alongside.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [type, year, round] = process.argv.slice(2)
if (!type || !year || !round) {
  console.error('usage: node scripts/rebuild-dept-from-circ.mjs <type> <year> <round>')
  process.exit(1)
}

const dir = join(import.meta.dirname, '..', 'public', 'data', 'elections', type, year)
const circ = JSON.parse(readFileSync(join(dir, `round${round}-circ.json`), 'utf8'))

// Circo code → département code: abroad 99xx → '99'; overseas 5-digit 97x/98x →
// first 3; metro (incl. Corsica 2A/2B) 4-char → first 2.
const deptOf = (code) =>
  code.startsWith('99') ? '99'
  : code.length === 5 && (code.startsWith('97') || code.startsWith('98')) ? code.slice(0, 3)
  : code.slice(0, 2)

// Département names from round1.json (the uncorrupted sibling).
const names = new Map()
const r1Path = join(dir, 'round1.json')
if (existsSync(r1Path)) {
  for (const c of JSON.parse(readFileSync(r1Path, 'utf8')).communes) names.set(c.inseeCode, c.name)
}

const depts = new Map()
for (const c of circ.communes) {
  const code = deptOf(c.inseeCode)
  let d = depts.get(code)
  if (!d) {
    d = {
      inseeCode: code,
      name: names.get(code) ?? code,
      registeredVoters: 0, turnout: 0, blankVotes: 0, nullVotes: 0, expressedVotes: 0,
      leadingCandidate: '',
      votesByName: new Map(circ.candidates.map((cd) => [cd.name, { party: cd.party, votes: 0 }])),
    }
    depts.set(code, d)
  }
  d.registeredVoters += c.registeredVoters
  d.turnout += c.turnout
  d.blankVotes += c.blankVotes
  d.nullVotes += c.nullVotes
  d.expressedVotes += c.expressedVotes
  for (const cd of c.candidates) {
    const acc = d.votesByName.get(cd.name)
    if (acc) acc.votes += cd.votes
    else d.votesByName.set(cd.name, { party: cd.party, votes: cd.votes })
  }
}

const communes = [...depts.values()]
  .sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
  .map((d) => {
    const candidates = [...d.votesByName.entries()].map(([name, { party, votes }]) => ({
      name, party, votes,
      percentage: d.expressedVotes ? +((votes / d.expressedVotes) * 100).toFixed(2) : 0,
    }))
    const lead = candidates.reduce((a, b) => (b.votes > a.votes ? b : a), candidates[0])
    const { votesByName: _, ...rest } = d
    return { ...rest, leadingCandidate: lead?.votes ? lead.name : '', candidates }
  })

const out = {
  election: circ.election ?? { type, year: +year, round: +round },
  year: +year, round: +round,
  candidates: circ.candidates,
  communes,
}

const target = join(dir, `round${round}.json`)
if (existsSync(target)) copyFileSync(target, `${target}.bak`)
writeFileSync(target, JSON.stringify(out))

const tot = communes.reduce((s, c) => s + c.registeredVoters, 0)
console.log(`${communes.length} départements, ${tot.toLocaleString('en')} inscrits → ${target} (.bak kept)`)
