/**
 * Shared ingestion library (config-driven pipeline, July 2026): the half of
 * every election parser that is identical across vintages. Adapters
 * (parse-*.mjs) read the ministry's format-of-the-year into standard ENTRY
 * objects and use these helpers for the assembly that used to be copy-pasted.
 *
 * An entry is:
 *   { inseeCode, name, registeredVoters, turnout, blankVotes, nullVotes,
 *     expressedVotes, candidates: [{name, party, votes, percentage,
 *     elected?}], leadingCandidate }
 *
 * Serialization quirks (key order, abstention precision, percentage rounding
 * convention) deliberately stay in the adapters — existing elections must
 * re-emit byte-identical files, so this library never imposes a format.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ── numbers ──────────────────────────────────────────────────────────────────
/** Ministry int cell (space thousand-separators tolerated). */
export const num = (s) => parseInt((s ?? '').replace(/\s/g, ''), 10) || 0

/** % of expressed, toFixed(2) convention (légis 2022/2024 files). */
export const pctFixed = (votes, expressed) =>
  parseFloat(((votes / (expressed || 1)) * 100).toFixed(2))

/** % of expressed, Math.round convention, 0 when no expressed (2017 files).
 *  NOTE the two-step (×100 then ×100) operation order — collapsing it to
 *  ×10000 lands differently on exact .5 float boundaries and breaks
 *  byte-identity with the shipped files. */
export const pctRound = (votes, expressed) =>
  expressed ? Math.round(votes / expressed * 100 * 100) / 100 : 0

/** Abstention %, 1 decimal (légis 2022/2024 choropleths). */
export const abstention1 = (reg, vot) =>
  reg ? Math.round(((reg - vot) / reg) * 1000) / 10 : undefined

/** Abstention %, 2 decimals (2017 choropleths; same two-step order caveat). */
export const abstention2 = (reg, vot) =>
  reg ? Math.round((reg - vot) / reg * 100 * 100) / 100 : undefined

// ── assembly ─────────────────────────────────────────────────────────────────
/**
 * The files' header `candidates` list for nuance-keyed elections: every
 * party/nuance code seen in `entries`, ordered by national vote total desc.
 */
export function nuanceList(entries, label) {
  const totals = new Map()
  for (const e of entries)
    for (const c of e.candidates) totals.set(c.party, (totals.get(c.party) ?? 0) + c.votes)
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => ({ name: label(code), party: code }))
}

/**
 * Legislative round 2: circos decided outright at round 1 have no R2 row —
 * carry their R1 entries in so the round-2 map has no holes. Returns the
 * merged, code-sorted list plus the carried count.
 * (Dept/commune-level holes are filled later by carry-r1-into-round2.mjs.)
 */
export function carryDecidedR1(r1, r2) {
  const have = new Set(r2.map((c) => c.inseeCode))
  const carried = r1.filter((c) => !have.has(c.inseeCode) && c.candidates.some((x) => x.elected))
  const all = [...r2, ...carried].sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
  return { circos: all, carried: carried.length }
}

/** Seat counts by party/nuance from `elected` flags (legislatives). */
export function seatCounts(circos) {
  const seats = new Map()
  for (const c of circos)
    for (const cand of c.candidates)
      if (cand.elected) seats.set(cand.party, (seats.get(cand.party) ?? 0) + 1)
  return seats
}

/** JSON writer bound to an output dir (created on first use). */
export function makeWriter(outDir) {
  mkdirSync(outDir, { recursive: true })
  return (name, data) => {
    writeFileSync(join(outDir, name), JSON.stringify(data))
    console.log(`  ${name}`)
  }
}

// ── national sanity totals (from dept-level entries) ─────────────────────────
/** Sum dept entries → national {ins, exp, votes: Map(key → votes)}; key by
 *  `party` (legislatives) or `name` (presidentials) via keyOf. */
export function nationalTotals(depts, keyOf = (c) => c.party) {
  const tot = { ins: 0, exp: 0, votes: new Map() }
  for (const d of depts) {
    tot.ins += d.registeredVoters
    tot.exp += d.expressedVotes
    for (const c of d.candidates) tot.votes.set(keyOf(c), (tot.votes.get(keyOf(c)) ?? 0) + c.votes)
  }
  return tot
}
