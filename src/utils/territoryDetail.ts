import { useMemo } from 'react'
import type { RoundData, CommuneResult } from '../types/election'
import type { Granularity } from '../store/electionStore'
import { computeNationalTotals } from './nationalResults'
import { isDeptCode, parentDeptCode } from './deptInsight'

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
  /** True when département-level data stands in because the full commune file
   *  doesn't exist for this round (e.g. présidentielle 2022 T2). */
  isRoundFallback: boolean
}

/** Département code of any 5-char commune code (metro incl. Corsica 2A/2B, overseas). */
function communeDeptCode(code: string): string | null {
  if (code.length !== 5) return null
  return overseasDeptCode(code) ?? code.slice(0, 2)
}

/**
 * Resolve the selected code to a `CommuneResult`, honouring granularity and the
 * overseas → département fallback. Shared by the desktop sidebar and the mobile
 * detail sheet so both resolve selections identically.
 */
export function resolveTerritory(
  activeCode: string | null,
  granularity: Granularity,
  data: {
    electionData?: RoundData
    communeData: RoundData | null
    circoData: RoundData | null
    /** Full commune file confirmed absent for this round (404), not loading. */
    communeDataMissing?: boolean
  },
): ResolvedTerritory {
  const { electionData, communeData, circoData, communeDataMissing } = data
  if (!activeCode) return { commune: null, isOverseasFallback: false, isRoundFallback: false }

  let commune: CommuneResult | null
  if (granularity === 'commune' && communeData) {
    const direct =
      communeData.communes.find((c) => c.inseeCode === activeCode) ??
      electionData?.communes.find((c) => c.inseeCode === activeCode)
    if (direct) {
      commune = direct
    } else {
      const deptCode = overseasDeptCode(activeCode)
      commune = deptCode
        ? (electionData?.communes.find((c) => c.inseeCode === deptCode) ?? null)
        : null
    }
  } else if (granularity === 'commune' && communeDataMissing) {
    // No full commune file for this round: stand in the département entry.
    const deptCode = communeDeptCode(activeCode)
    const dept = deptCode
      ? (electionData?.communes.find((c) => c.inseeCode === deptCode) ?? null)
      : null
    if (dept) return { commune: dept, isOverseasFallback: false, isRoundFallback: true }
    commune = electionData?.communes.find((c) => c.inseeCode === activeCode) ?? null
  } else if (granularity !== 'commune' && circoData) {
    // circonscription + hemicycle both resolve against full circo data;
    // département codes (selected via the territory navigator) fall back to
    // the dept-level entry so a dept selection shows results on any tab.
    commune =
      circoData.communes.find((c) => c.inseeCode === activeCode) ??
      electionData?.communes.find((c) => c.inseeCode === activeCode) ??
      null
  } else {
    commune = electionData?.communes.find((c) => c.inseeCode === activeCode) ?? null
  }

  const isOverseasFallback =
    commune !== null && overseasDeptCode(activeCode) !== null && commune.inseeCode !== activeCode

  return { commune, isOverseasFallback, isRoundFallback: false }
}

export type NationalPctLookup = (name: string, party?: string) => number | null

/**
 * National baseline ("reminder" bar) lookup. Keyed by display name (presidential
 * both levels + legislative commune) and by party/nuance code (legislative circo,
 * where local rows are persons but the nuance carries the national figure).
 */
export function makeNationalPctLookup(
  electionData: RoundData | undefined,
): NationalPctLookup | null {
  if (!electionData) return null
  const totals = computeNationalTotals(electionData)
  const byName = new Map<string, number>()
  const byParty = new Map<string, number>()
  for (const c of totals.candidates) {
    byName.set(c.name, c.percentage)
    if (c.party && !byParty.has(c.party)) byParty.set(c.party, c.percentage)
  }
  return (name, party) => byName.get(name) ?? (party ? (byParty.get(party) ?? null) : null)
}

export interface TerritoryView extends ResolvedTerritory {
  /** National baseline lookup for the "reminder" bars (null before data loads). */
  nationalPct: NationalPctLookup | null
  /**
   * True only for a SETTLED département selection — the dept insight sections
   * appear for those, but not for hover previews or the overseas/round
   * fallbacks (where the dept entry merely stands in for a commune).
   */
  isDeptSelection: boolean
  /** Parent département entry, for the "↑ {dept}" breadcrumb. Null at dept level. */
  parentDept: CommuneResult | null
  turnoutPct: number
  blankPct: number
  nullPct: number
}

/**
 * Everything both detail surfaces (desktop `ResultsPanel`, mobile
 * `MobileDetailSheet`) derive from a selection. Previously each recomputed the
 * fallbacks, the settled-dept test, the breadcrumb lookup and the three
 * percentages itself; they now share this and differ only in markup.
 *
 * `activeCode` is the hovered-or-clicked code on desktop but click-only on
 * mobile, so the caller passes whichever it uses; `clickedCommune` is passed
 * separately because the settled-dept test must ignore hover previews.
 */
export function useTerritoryView(
  activeCode: string | null,
  clickedCommune: string | null,
  granularity: Granularity,
  data: {
    electionData?: RoundData
    communeData: RoundData | null
    circoData: RoundData | null
    communeDataMissing?: boolean
  },
): TerritoryView {
  const { electionData } = data
  const resolved = resolveTerritory(activeCode, granularity, data)
  const nationalPct = useMemo(() => makeNationalPctLookup(electionData), [electionData])

  const commune = resolved.commune
  const isDeptSelection =
    !!clickedCommune && isDeptCode(clickedCommune) && commune?.inseeCode === clickedCommune

  const parentCode = activeCode ? parentDeptCode(activeCode) : null
  const parentDept =
    parentCode && parentCode !== commune?.inseeCode
      ? (electionData?.communes.find((c) => c.inseeCode === parentCode) ?? null)
      : null

  const reg = commune?.registeredVoters ?? 0
  return {
    ...resolved,
    nationalPct,
    isDeptSelection,
    parentDept,
    turnoutPct: commune && reg ? (commune.turnout / reg) * 100 : 0,
    blankPct: commune && reg ? (commune.blankVotes / reg) * 100 : 0,
    nullPct: commune && reg ? (commune.nullVotes / reg) * 100 : 0,
  }
}
