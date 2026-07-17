#!/usr/bin/env node
/**
 * Political-family integrity check (two-axis P3). For every election in the
 * manifest, verifies that every party/nuance code appearing in the data
 * (dept round files — their `candidates` header is the union of all codes)
 * resolves through the election's palette.json to a family id defined in
 * public/data/elections/families.json, and that every family points to a
 * defined bloc. Run after adding an election or editing a palette:
 *
 *   node scripts/validate-families.mjs
 *
 * Exits non-zero on any gap so it can gate future ingestion pipelines.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', 'public', 'data', 'elections')
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))

const registry = read('families.json')
const manifest = read('index.json')

let failures = 0
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`) }

// Registry self-consistency: every family's bloc must exist.
for (const [id, fam] of Object.entries(registry.families)) {
  if (!registry.blocs[fam.bloc]) fail(`family '${id}' references undefined bloc '${fam.bloc}'`)
}

for (const el of manifest.elections) {
  const base = `${el.type}/${el.year}`
  console.log(`${el.label ?? base}:`)
  let palette
  try {
    palette = read(`${base}/palette.json`)
  } catch {
    fail(`no palette.json — families unmappable`)
    continue
  }

  // Union of party codes across all rounds' dept files.
  const codes = new Set()
  for (let round = 1; round <= (el.rounds ?? 1); round++) {
    try {
      for (const c of read(`${base}/round${round}.json`).candidates) codes.add(c.party)
    } catch {
      /* round file absent locally — skip */
    }
  }

  let ok = 0
  for (const code of [...codes].sort()) {
    const entry = palette.parties?.[code]
    if (!entry) { fail(`code '${code}' missing from palette.parties`); continue }
    if (!entry.family) { fail(`code '${code}' (${entry.label}) has no family`); continue }
    if (!registry.families[entry.family]) { fail(`code '${code}' → undefined family '${entry.family}'`); continue }
    ok++
  }
  console.log(`  ✓ ${ok}/${codes.size} codes resolve to a family`)
}

if (failures) {
  console.error(`\n${failures} problem(s).`)
  process.exit(1)
}
console.log('\nAll party/nuance codes resolve to a defined family + bloc.')
