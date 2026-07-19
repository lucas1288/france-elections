/**
 * Shared reader for the ministry's 2017-era Excel result sheets (.xls BIFF and
 * .xlsx alike, via the `xlsx` devDependency). Every sheet follows the same
 * convention: a header row starting with 'Code du département', stats columns
 * addressed by label, and repeating candidate blocks located by the 'Nom'
 * header positions (block stride varies per sheet — never assume it).
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const XLSX = require('xlsx')

/** Locate the header row + stats columns of a results sheet. */
export function sheetGrid(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
  const hdrIdx = rows.findIndex((r) => r?.[0] === 'Code du département')
  if (hdrIdx < 0) throw new Error('header row not found')
  const header = rows[hdrIdx]
  const col = (label) => {
    const i = header.indexOf(label)
    if (i < 0) throw new Error(`column '${label}' not found`)
    return i
  }
  const idxsOf = (label) => header.map((h, i) => (h === label ? i : -1)).filter((i) => i >= 0)
  return { rows: rows.slice(hdrIdx + 1), header, col, idxsOf }
}
