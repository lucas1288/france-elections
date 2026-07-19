/**
 * Ministry → INSEE code normalization shared across election adapters.
 * The tiles use INSEE-derived codes (admin-2022 / circo-2010 conventions);
 * ministry files use Z-codes for overseas with per-vintage quirks.
 */

/** Ministry Z-codes → INSEE dept codes (the full 2017-era table; later
 *  vintages use subsets — unknown codes simply never match). */
export const ZDEPT = {
  ZA: '971', ZB: '972', ZC: '973', ZD: '974', ZM: '976', ZN: '988',
  ZP: '987', ZS: '975', ZW: '986', ZX: '977', ZZ: '99',
}

export const pad = (v, n) => String(v).padStart(n, '0')

/** Dept cell → INSEE dept code ('1' → '01', 'ZA' → '971', '2A' stays). */
export const deptCode = (raw) => {
  const s = String(raw)
  return ZDEPT[s] ?? pad(s, 2)
}

/**
 * 2017-era commune code → INSEE: the commune number embeds per-dept numeric
 * offsets overseas (ZA 101→97101, ZM 501→97601, ZP 11→98711, ZW 1→98601,
 * ZX 701/801→97701/97801) and ZZ consular rows are 99-prefixed 3-digit codes.
 */
export function communeInsee2017(rawDept, rawCode) {
  const z = String(rawDept)
  if (z === 'ZZ') return '99' + pad(rawCode, 3)
  if (z === 'ZX') return '97' + String(rawCode)
  if (ZDEPT[z]) return ZDEPT[z] + pad(Number(rawCode) % 100, 2)
  return pad(z, 2) + pad(rawCode, 3)
}
