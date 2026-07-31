import { useMemo } from 'react'
import type { RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { computeNationalTotals, type NationalTotals } from './nationalResults'
import { computeCircoCounts, type CircoCounts } from './circoCounts'

/** What the national result rows display: vote share, or per-force circo counts. */
export type NationalViewMode = 'pct' | 'circos'

/** Per-force circo counts, as EXCLUSIVE buckets ready to render. */
export interface ForceBuckets {
  /** Seats actually won (R1 outright wins included). */
  won: number
  /** Leading but not yet won — excludes `won` so the buckets don't double-count. */
  lead1st: number
  /** Arrived second. */
  second: number
}

export interface NationalSummaryModel {
  totals: NationalTotals
  circoCounts: CircoCounts | null
  /** True when at least one force has seats (presidentials never do). */
  hasSeats: boolean
  /**
   * True when some lead is not yet a win — round 1 of legislatives, and always
   * for presidentials. At legislative T2 every lead IS the seat winner, so the
   * bucket would read 0 for everyone and is hidden.
   */
  showLeadBucket: boolean
  turnoutPct: number
  abstentionPct: number
  blankPct: number
  nullPct: number
  /** Candidates in display order for the given mode (circos → sorted by won → lead → 2nd). */
  order: (mode: NationalViewMode) => NationalTotals['candidates']
  /** Exclusive circo buckets for one force. */
  buckets: (name: string) => ForceBuckets
  /** A count as a percentage of all circos — the width of a stacked bar segment. */
  pctOfCircos: (n: number) => number
  /** Label for the second segment of the Pourcentages/… switch. */
  circoSwitchLabel: string
  /** "sièges remportés | en tête | 2e position", adapted to the available buckets. */
  bucketLegend: string
}

/**
 * Shared model behind BOTH national-results surfaces (desktop `NationalSummary`
 * sidebar block and mobile `AffichageSheet`). Everything here used to be
 * duplicated verbatim in the two components — the circo-count sort key, the
 * exclusive-bucket arithmetic and the bucket-visibility rules in particular —
 * which is how the two drifted apart. They now differ only in markup.
 *
 * Returns null when there is nothing to summarise (no election data loaded, or
 * an election with no registered voters).
 */
export function useNationalSummary(
  electionData: RoundData | undefined,
  circoChoro?: ChoroplethData | null,
  circoData?: RoundData | null,
): NationalSummaryModel | null {
  const totals = useMemo(
    () => (electionData ? computeNationalTotals(electionData) : null),
    [electionData],
  )
  const circoCounts = useMemo(
    () => (circoChoro && circoData ? computeCircoCounts(circoChoro, circoData) : null),
    [circoChoro, circoData],
  )

  return useMemo(() => {
    if (!totals || !totals.registeredVoters) return null

    const hasSeats = !!circoCounts && circoCounts.countsWon.size > 0
    const showLeadBucket =
      !!circoCounts &&
      [...circoCounts.counts1st].some(([name, n]) => n > (circoCounts.countsWon.get(name) ?? 0))

    const buckets = (name: string): ForceBuckets => {
      const won = circoCounts?.countsWon.get(name) ?? 0
      return {
        won,
        lead1st: Math.max(0, (circoCounts?.counts1st.get(name) ?? 0) - won),
        second: circoCounts?.counts2nd.get(name) ?? 0,
      }
    }

    const order = (mode: NationalViewMode) => {
      if (mode !== 'circos' || !circoCounts) return totals.candidates
      // Sort by seats, then by leads not yet won, then by second places.
      const key = (name: string) => {
        const b = buckets(name)
        return b.won * 1e6 + b.lead1st * 1e3 + b.second
      }
      return [...totals.candidates].sort((a, b) => key(b.name) - key(a.name))
    }

    return {
      totals,
      circoCounts,
      hasSeats,
      showLeadBucket,
      turnoutPct: (totals.turnout / totals.registeredVoters) * 100,
      abstentionPct: (totals.abstention / totals.registeredVoters) * 100,
      blankPct: (totals.blankVotes / totals.registeredVoters) * 100,
      nullPct: (totals.nullVotes / totals.registeredVoters) * 100,
      order,
      buckets,
      pctOfCircos: (n: number) => (circoCounts ? (n / circoCounts.total) * 100 : 0),
      circoSwitchLabel: hasSeats ? 'Sièges' : 'Circonscriptions',
      bucketLegend: [hasSeats && 'sièges remportés', showLeadBucket && 'en tête', '2e position']
        .filter(Boolean)
        .join(' | '),
    }
  }, [totals, circoCounts])
}

/** The right-hand figure of a force row in circos mode: "178 | 140" etc. */
export function bucketCounts(
  b: ForceBuckets,
  hasSeats: boolean,
  showLeadBucket: boolean,
  fmtInt: (n: number) => string,
): string {
  return [
    hasSeats ? fmtInt(b.won) : null,
    showLeadBucket ? fmtInt(b.lead1st) : null,
    fmtInt(b.second),
  ]
    .filter((v) => v !== null)
    .join(' | ')
}
