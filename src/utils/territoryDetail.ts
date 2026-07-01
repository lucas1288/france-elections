import type { RoundData, CommuneResult } from '../types/election'
import type { Granularity } from '../store/electionStore'
import { computeNationalTotals } from './nationalResults'

/**
 * Overseas commune codes are 5 digits starting with 97x or 98x; the
 * corresponding département code is the first 3 digits.
 */
export function overseasDeptCode(code: string): string | null {
  if (code.length === 5 && (code.startsWith('97') || code.startsWith('98'))) {
    return code.slice(0, 3)
  }
  return null
}

export interface ResolvedTerritory {
  commune: CommuneResult | null
  /** True when département-level data stands in for an overseas commune click. */
  isOverseasFallback: boolean
}

/**
 * Resolve the selected code to a `CommuneResult`, honouring granularity and the
 * overseas → département fallback. Shared by the desktop sidebar and the mobile
 * detail sheet so both resolve selections identically.
 */
export function resolveTerritory(
  activeCode: string | null,
  granularity: Granularity,
  data: { electionData?: RoundData; communeData: RoundData | null; circoData: RoundData | null },
): ResolvedTerritory {
  const { electionData, communeData, circoData } = data
  if (!activeCode) return { commune: null, isOverseasFallback: false }

  let commune: CommuneResult | null
  if (granularity === 'commune' && communeData) {
    const direct =
      communeData.communes.find((c) => c.inseeCode === activeCode) ??
      electionData?.communes.find((c) => c.inseeCode === activeCode)
    if (direct) {
      commune = direct
    } else {
      const deptCode = overseasDeptCode(activeCode)
      commune = deptCode ? (electionData?.communes.find((c) => c.inseeCode === deptCode) ?? null) : null
    }
  } else if (granularity !== 'commune' && circoData) {
    // circonscription + hemicycle both resolve against full circo data
    commune = circoData.communes.find((c) => c.inseeCode === activeCode) ?? null
  } else {
    commune = electionData?.communes.find((c) => c.inseeCode === activeCode) ?? null
  }

  const isOverseasFallback =
    commune !== null && overseasDeptCode(activeCode) !== null && commune.inseeCode !== activeCode

  return { commune, isOverseasFallback }
}

export type NationalPctLookup = (name: string, party?: string) => number | null

/**
 * National baseline ("reminder" bar) lookup. Keyed by display name (presidential
 * both levels + legislative commune) and by party/nuance code (legislative circo,
 * where local rows are persons but the nuance carries the national figure).
 */
export function makeNationalPctLookup(electionData: RoundData | undefined): NationalPctLookup | null {
  if (!electionData) return null
  const totals = computeNationalTotals(electionData)
  const byName = new Map<string, number>()
  const byParty = new Map<string, number>()
  for (const c of totals.candidates) {
    byName.set(c.name, c.percentage)
    if (c.party && !byParty.has(c.party)) byParty.set(c.party, c.percentage)
  }
  return (name, party) => byName.get(name) ?? (party ? byParty.get(party) ?? null : null)
}
