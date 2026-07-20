import { overseasDeptCode } from './territoryDetail'

/**
 * Département-insight helpers (two-axis P2). A "département code" is what the
 * dept-level round files use: '01'…'95', '2A'/'2B', '971'…'988'. '99' (Français
 * à l'étranger) is an aggregate, not a département — it gets no insight view.
 */
export function isDeptCode(code: string): boolean {
  return code !== '99' && (code.length === 2 || code.length === 3)
}

/** Circo codes are dept-prefixed: '3401' (metro, 2-char dept) / '97101' (overseas). */
export function circoInDept(circoCode: string, deptCode: string): boolean {
  return circoCode.length === deptCode.length + 2 && circoCode.startsWith(deptCode)
}

/** Commune codes are 5 chars, dept-prefixed (metro incl. 2A/2B, overseas 97x/98x). */
export function communeInDept(communeCode: string, deptCode: string): boolean {
  return communeCode.length === 5 && communeCode.startsWith(deptCode)
}

/**
 * Paris/Lyon/Marseille arrondissement codes. The commune data carries BOTH the
 * whole-city aggregate (75056/69123/13055) and the arrondissements — commune
 * counts and rankings must use one of the two; we keep the city aggregate.
 * The ranges are collision-free: no genuine commune shares these prefixes
 * (Paris has no other commune, Rhône stops at 692xx, Bouches-du-Rhône at 131xx).
 */
const PLM_ARR = /^(751\d\d|6938\d|132\d\d)$/
export function isPlmArrondissement(code: string): boolean {
  return PLM_ARR.test(code)
}

/**
 * Paris/Lyon/Marseille whole-city commune codes, and the metadata to enumerate
 * their arrondissements: `prefix` matches the arrondissement codes, `base` is
 * subtracted from a code to get the arrondissement number (Paris 75101→1, Lyon
 * 69381→1, Marseille 13201→1). The data carries BOTH the whole-city aggregate
 * (these codes) and the arrondissements — so a PLM city can be shown as a
 * single result AND broken down by arrondissement.
 */
const PLM_CITY_META: Record<string, { prefix: string; base: number }> = {
  '75056': { prefix: '751', base: 75100 },
  '69123': { prefix: '6938', base: 69380 },
  '13055': { prefix: '132', base: 13200 },
}
export function isPlmCity(code: string): boolean {
  return code in PLM_CITY_META
}
export function arrondissementsMeta(cityCode: string): { prefix: string; base: number } | null {
  return PLM_CITY_META[cityCode] ?? null
}

/**
 * The PLM whole-city code for a département that IS a single PLM commune — only
 * Paris (dept 75 = the sole commune 75056). Rhône (69) and Bouches-du-Rhône (13)
 * contain many other communes besides Lyon/Marseille, so their dept insight
 * keeps the normal commune sections; only Paris's degenerate to one entry.
 */
export function plmCityOfDept(deptCode: string): string | null {
  return deptCode === '75' ? '75056' : null
}

/**
 * Département a selection belongs to, for the hierarchy breadcrumb: circo
 * '3401'→'34', commune '2A004'→'2A', overseas circo/commune '97101'→'971'.
 * Returns null for dept codes themselves and for abroad circos (no geometry).
 */
export function parentDeptCode(code: string): string | null {
  if (isDeptCode(code)) return null
  if (code.length === 4) return code.startsWith('99') ? null : code.slice(0, 2)
  if (code.length === 5) return overseasDeptCode(code) ?? code.slice(0, 2)
  return null
}

/** '3401' → 1, '97102' → 2 — the circo's number within its département. */
export function circoNumber(circoCode: string, deptCode: string): number {
  return parseInt(circoCode.slice(deptCode.length), 10)
}
