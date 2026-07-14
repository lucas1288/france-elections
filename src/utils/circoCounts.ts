import type { RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'

export interface CircoCounts {
  /** Times each display name leads a circo (from the lightweight choropleth).
   *  Includes seats already won — subtract countsWon for the exclusive bucket. */
  counts1st: Map<string, number>
  /** Times each display name comes 2nd (from full circo data, when loaded). */
  counts2nd: Map<string, number>
  /** Seats won (`elected: true` in full circo data — legislatives only; at R1
   *  these are the circos decided outright, at R2 the R1 wins are carried in). */
  countsWon: Map<string, number>
  /** Total number of circonscriptions in the choropleth. */
  total: number
}

/**
 * Per-force 1st/2nd place counts across circonscriptions. Keys are the
 * choropleth's DISPLAY names: the candidate's own name for presidentials, the
 * nuance label for legislatives (full-data candidates are persons there, so
 * 2nd places are re-keyed through the nuance). Shared by the desktop idle
 * sidebar ranking and the mobile national-results sheet.
 */
export function computeCircoCounts(
  circoChoro: ChoroplethData,
  circoData: RoundData | null,
): CircoCounts {
  const counts1st = new Map<string, number>()
  for (const c of circoChoro.communes) {
    if (!c.leadingCandidate) continue // annulled → no leader
    counts1st.set(c.leadingCandidate, (counts1st.get(c.leadingCandidate) ?? 0) + 1)
  }

  const displayNameByParty = new Map(circoChoro.candidates.map((c) => [c.party, c.name]))
  const counts2nd = new Map<string, number>()
  const countsWon = new Map<string, number>()
  if (circoData) {
    for (const circo of circoData.communes) {
      const second = [...circo.candidates].sort((a, b) => b.votes - a.votes)[1]
      if (second?.votes) {
        const key = displayNameByParty.get(second.party) ?? second.name
        counts2nd.set(key, (counts2nd.get(key) ?? 0) + 1)
      }
      const winner = circo.candidates.find((c) => c.elected)
      if (winner) {
        const key = displayNameByParty.get(winner.party) ?? winner.name
        countsWon.set(key, (countsWon.get(key) ?? 0) + 1)
      }
    }
  }

  return { counts1st, counts2nd, countsWon, total: circoChoro.communes.length }
}
