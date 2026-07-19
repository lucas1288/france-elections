#!/usr/bin/env node
/**
 * Repair commune names in outputs parsed from the consolidated "élections
 * agrégées" dataset. Upstream, libelle_commune (and ONLY that field — dept and
 * circo labels are clean) is corrupted for the pre-2017 vintages: every
 * accented character was replaced by a literal '?' and the whole name was
 * Title-Cased per word ("Amb?Rieu-En-Bugey" for "Ambérieux-en-Bugey").
 *
 * Fix: join clean names by INSEE code from our ministry-sourced elections
 * (prés 2022 → légis 2022 → prés 2017 — the 2012 files are post-COG-
 * aggregation, so their codes live on the same current tile geometry). Every
 * replacement is verified by wildcard match ('?' ↔ one accented char, œ/æ
 * aware, case/accent-insensitive). A still-garbled name whose verification
 * fails adopts the reference name anyway: those are COG-merge targets (the
 * entry sums the constituents of the CURRENT tile polygon, so the current
 * name fits better than the absorbing constituent's 2012 name) and
 * article-inversion spellings ("Noni?Res (Les)"). The 11 FE zone entries (99001–99011,
 * aggregated at circo level in this dataset — NOT 2022's consular numbering)
 * have no join reference and use a hand-authored accent restoration.
 *
 * Usage: node scripts/fix-agregees-names.mjs <type> <year>   (idempotent)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ELECTIONS_DIR = join(ROOT, 'public/data/elections')

const [type, year] = process.argv.slice(2)
if (!type || !year) {
  console.error('usage: node scripts/fix-agregees-names.mjs <type> <year>')
  process.exit(1)
}

// 2012 FE zones as named by the dataset, accents restored (no code-join
// reference: 2022's 99xxx codes number ~210 consular communes instead).
const FE_ZONES = {
  99001: 'Amérique du Nord',
  99002: 'Amérique latine',
  99003: 'Europe du Nord',
  99004: 'Benelux',
  99005: 'Péninsule Ibérique et Monaco',
  99006: 'Suisse',
  99007: 'Europe centrale',
  99008: 'Europe du Sud, Turquie, Israël',
  99009: 'Afrique Nord-Ouest',
  99010: 'Afrique Centre, Sud et Est',
  99011: "Europe de l'Est, Asie, Océanie",
}

const REF_FILES = [
  'presidential/2022/round1-communes.json',
  'legislative/2022/round1-communes.json',
  'presidential/2017/round1-communes.json',
]

const ref = new Map()
for (const rel of REF_FILES) {
  const path = join(ELECTIONS_DIR, rel)
  if (!existsSync(path)) continue
  for (const c of JSON.parse(readFileSync(path, 'utf8')).communes) {
    if (!ref.has(c.inseeCode)) ref.set(c.inseeCode, c.name)
  }
}

// Accent-stripped lowercase skeleton (œ/æ expanded — they don't NFD-decompose).
const skeleton = (s) =>
  s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')

// Does the corrupted name plausibly denote the reference name?
function matches(corrupted, refName) {
  const pattern = corrupted.toLowerCase()
    .replace(/[.*+^${}()|[\]\\]/g, '\\$&')
    .replace(/\?/g, '.{1,2}') // one accented char; 2 covers œ/æ expansion
  return new RegExp(`^${pattern}$`).test(skeleton(refName))
}

for (const round of [1, 2]) {
  const path = join(ELECTIONS_DIR, type, String(year), `round${round}-communes.json`)
  if (!existsSync(path)) continue
  const data = JSON.parse(readFileSync(path, 'utf8'))
  let fixed = 0, adopted = 0, garbled = []
  for (const c of data.communes) {
    const zone = FE_ZONES[c.inseeCode]
    const clean = zone ?? ref.get(c.inseeCode)
    if (clean == null) {
      if (c.name.includes('?')) garbled.push(c)
      continue
    }
    if (clean === c.name) continue
    if (zone || matches(c.name, clean)) {
      c.name = clean
      fixed++
    } else if (c.name.includes('?')) {
      c.name = clean
      adopted++
    }
  }
  writeFileSync(path, JSON.stringify(data))
  console.log(`round${round}: ${fixed} verified repairs, ${adopted} adopted current names, ${garbled.length} still garbled`)
  for (const c of garbled.slice(0, 20)) console.log(`  ! ${c.inseeCode} ${c.name}`)
}
