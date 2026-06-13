/**
 * Converts ministry Z-prefixed overseas commune codes to INSEE codes in the
 * already-generated election JSON files (the raw ministry TXT sources are no
 * longer on disk, so this patches the parser output in place).
 *
 * Ministry SUBCOM convention: dept code 'ZA' + 3-digit commune code where the
 * first digit repeats the dept digit, e.g. ZA101 = Guadeloupe commune 01
 * → INSEE 97101. Mapping verified against commune names (Les Abymes = 97101,
 * Belep = 98801, Anaa = 98711, …).
 *
 *   ZA→971  ZB→972  ZC→973  ZD→974  ZM→976  ZS→975        (DOM + SPM)
 *   ZW→986  ZP→987  ZN→988                                 (COM Pacifique)
 *   ZX7xx→977 (St-Barthélemy)  ZX8xx→978 (St-Martin)
 *   ZZ→99 + 3-digit code (consular "communes" of Français à l'étranger)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'

const DEPT3 = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976', ZS: '975',
  ZW: '986', ZP: '987', ZN: '988',
}

export function inseeFromMinistry(code) {
  const prefix = code.slice(0, 2)
  const suffix = code.slice(2)            // 3-digit ministry commune code
  if (DEPT3[prefix]) return DEPT3[prefix] + suffix.slice(1)
  if (prefix === 'ZX') return '97' + suffix             // 97701 / 97801
  if (prefix === 'ZZ') return '99' + suffix             // consulates: 99001…
  return code
}

// Only rewrite files when run directly (this module is also imported by the
// parse scripts for inseeFromMinistry).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  rewriteFiles()
}

function rewriteFiles() {
const FILES = [
  'public/data/elections/presidential/2022/round1-communes.json',
  'public/data/elections/presidential/2022/round1-communes-choropleth.json',
  'public/data/elections/presidential/2022/round2-communes-choropleth.json',
]

for (const file of FILES) {
  if (!existsSync(file)) { console.log(`skip (absent): ${file}`); continue }
  const data = JSON.parse(readFileSync(file, 'utf8'))
  let fixed = 0
  for (const c of data.communes) {
    if (/^Z/.test(c.inseeCode)) {
      c.inseeCode = inseeFromMinistry(c.inseeCode)
      fixed++
    }
  }
  writeFileSync(file, JSON.stringify(data))
  console.log(`${file}: ${fixed} codes converted`)
}
}
