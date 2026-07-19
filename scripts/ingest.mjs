#!/usr/bin/env node
/**
 * Election ingestion orchestrator (config-driven pipeline, July 2026).
 *
 *   node scripts/ingest.mjs <type> <year>       e.g. legislative 2024
 *   node scripts/ingest.mjs --validate-all      gate every election, no regen
 *
 * For one election, in order:
 *   1. ensure sources  — data-sources/<dir>/ files fetched from the data.gouv
 *                        resource URLs in elections.config.mjs when missing
 *   2. run the chain   — parser + post-steps as declared (all idempotent)
 *   3. validate        — national inscrits (exact), top shares (2 dp), and R2
 *                        seats (exact) against the official figures
 *   4. finishers       — validate-families.mjs + build-dept-history.mjs
 *                        (cross-election files that depend on every election)
 *
 * `legacy` elections (prés 2022: hand-repaired round2.json) refuse to re-run
 * and only validate. After any regen: scripts/deploy/sync-r2.sh.
 */
import { existsSync, mkdirSync, readFileSync, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ELECTIONS } from './elections.config.mjs'

const ROOT = join(import.meta.dirname, '..')
const die = (msg) => { console.error(`✘ ${msg}`); process.exit(1) }

// ── validation ───────────────────────────────────────────────────────────────
function validateElection(key, desc) {
  const dir = join(ROOT, 'public/data/elections', desc.type, String(desc.year))
  let failures = 0
  const check = (label, actual, want, exact = true) => {
    const ok = exact ? actual === want : Math.abs(actual - want) <= 0.011
    console.log(`  ${ok ? '✓' : '✘'} ${label}: ${actual}${ok ? '' : ` (expected ${want})`}`)
    if (!ok) failures++
  }
  for (const [round, exp] of Object.entries(desc.expected ?? {})) {
    const data = JSON.parse(readFileSync(join(dir, `round${round}.json`), 'utf8'))
    let ins = 0, expVotes = 0
    const votes = new Map()
    for (const c of data.communes) {
      ins += c.registeredVoters
      expVotes += c.expressedVotes
      for (const x of c.candidates) {
        const k = x.party || x.name
        votes.set(k, (votes.get(k) ?? 0) + x.votes)
      }
    }
    console.log(`— ${key} R${round}`)
    check('inscrits', ins, exp.inscrits)
    for (const [k, share] of Object.entries(exp.shares ?? {})) {
      const v = votes.get(k)
      check(`${k} %exp`, v ? Math.round((v / expVotes) * 10000) / 100 : 0, share, false)
    }
    if (exp.seats) {
      const circ = JSON.parse(readFileSync(join(dir, `round${round}-circ.json`), 'utf8'))
      const seats = new Map()
      for (const c of circ.communes)
        for (const cand of c.candidates)
          if (cand.elected) seats.set(cand.party, (seats.get(cand.party) ?? 0) + 1)
      for (const [k, n] of Object.entries(exp.seats)) check(`${k} sièges`, seats.get(k) ?? 0, n)
      if (exp.seatTotal)
        check('sièges total', [...seats.values()].reduce((a, b) => a + b, 0), exp.seatTotal)
    }
  }
  return failures
}

// ── source fetching ──────────────────────────────────────────────────────────
async function ensureSources(desc) {
  const groups = [desc.sources, desc.sources?.extra].filter(Boolean)
  for (const g of groups) {
    const dir = join(ROOT, 'data-sources', g.dir)
    mkdirSync(dir, { recursive: true })
    for (const [name, url] of Object.entries(g.files)) {
      const path = join(dir, name)
      if (existsSync(path)) continue
      if (!url) die(`${g.dir}/${name} missing and has no fetch URL — see data-sources/README.md`)
      console.log(`  fetching ${g.dir}/${name} …`)
      const res = await fetch(url, { redirect: 'follow' })
      if (!res.ok) die(`download failed (${res.status}) for ${name}`)
      await pipeline(Readable.fromWeb(res.body), createWriteStream(path))
    }
  }
}

const run = (script, args = []) => {
  console.log(`▶ ${script} ${args.join(' ')}`)
  const r = spawnSync('node', [join(ROOT, 'scripts', script), ...args], { stdio: 'inherit', cwd: ROOT })
  if (r.status !== 0) die(`${script} failed`)
}

// ── main ─────────────────────────────────────────────────────────────────────
const [a, b] = process.argv.slice(2)

if (a === '--validate-all') {
  let failures = 0
  for (const [key, desc] of Object.entries(ELECTIONS)) failures += validateElection(key, desc)
  console.log(failures ? `\n✘ ${failures} check(s) failed` : '\n✓ all elections validate')
  process.exit(failures ? 1 : 0)
}

const key = `${a}-${b}`
const desc = ELECTIONS[key]
if (!desc) die(`unknown election '${key}' — known: ${Object.keys(ELECTIONS).join(', ')}`)
if (desc.legacy) die(`${key} is legacy (hand-repaired outputs) — validation only: node scripts/ingest.mjs --validate-all`)

await ensureSources(desc)
for (const [script, ...args] of desc.steps) run(script, args)

const failures = validateElection(key, desc)
if (failures) die(`${failures} validation check(s) failed — outputs NOT trustworthy`)

run('validate-families.mjs')
run('build-dept-history.mjs')
console.log(`\n✓ ${key} ingested + validated. Remember: scripts/deploy/sync-r2.sh after merge.`)
