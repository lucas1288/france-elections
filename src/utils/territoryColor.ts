import type { CommuneResult, Palette } from '../types/election'
import type { ColorMode } from '../store/electionStore'
import type { NationalTotals } from './nationalResults'
import { getCandidateColor } from './partyColors'
import { partyRatioShade, abstentionShade, decidedAtR1Shade } from './gradient'
import { partySeatState, seatStateColor, seatCodeSet, type SeatContext } from './partySeats'

/** A party/alliance's set of nuance codes (itself + any alliance members). */
export function partyCodeSet(party: string, palette: Palette | null): Set<string> {
  const members = palette?.parties?.[party]?.members
  return new Set(members ? [party, ...members] : [party])
}

/**
 * Color for one territory's full result under the active color mode. Used by
 * every map surface that has full per-territory data (main map dept + gradient
 * layers, overseas insets) so they stay visually consistent.
 *
 * `codes` (the resolved party-code set) is optional — pass it when coloring many
 * territories in party mode to avoid rebuilding it per call.
 *
 * `neutral` is the surface's no-data fill (theme-dependent). Pass it to get the
 * `decidedAtR1` muting: at legislative T2, territories whose circo(s) were won
 * outright at round 1 show their ROUND-1 figures, so they're blended toward the
 * neutral to stop them reading as round-2 results. Leader mode only — the party
 * and abstention ramps already encode a value in lightness.
 */
export function territoryColor(
  entry: CommuneResult,
  mode: ColorMode,
  palette: Palette | null,
  national: NationalTotals | null,
  codes?: Set<string>,
  neutral?: string,
  seats?: SeatContext,
): string {
  if (mode.kind === 'abstention') {
    const reg = entry.registeredVoters
    const abstention = reg ? ((reg - entry.turnout) / reg) * 100 : 0
    return abstentionShade(abstention)
  }
  if (mode.kind === 'party') {
    const set = codes ?? partyCodeSet(mode.party, palette)
    const base =
      palette?.parties?.[mode.party]?.color ?? getCandidateColor('', 0, mode.party, palette)
    // C1: on the circonscriptions tab of a legislative election the question is
    // "did they win the seat here", not "how strong are they here" — so the
    // score gradient gives way to the seat states. Callers pass `seats` only in
    // that context; the communes tab and every presidential keep the ratio.
    // Note the code set: seats count the NUANCE ONLY, not the alliance members
    // `set` carries — see `seatCodeSet`.
    if (seats) {
      const state = partySeatState(entry, seatCodeSet(mode.party), seats.round)
      return seatStateColor(state, base, seats)
    }
    let votes = 0
    for (const c of entry.candidates) if (set.has(c.party)) votes += c.votes
    const localPct = entry.expressedVotes ? (votes / entry.expressedVotes) * 100 : 0
    const nationalPct = national?.candidates.find((c) => c.party === mode.party)?.percentage ?? 0
    return partyRatioShade(localPct, nationalPct, base)
  }
  // Empty leader = annulled ballots → neutral (matches the map's no-data grey).
  if (!entry.leadingCandidate) return '#cbd5e1'
  const lead = entry.candidates.find((c) => c.name === entry.leadingCandidate)
  const color = getCandidateColor(entry.leadingCandidate, 0, lead?.party, palette)
  return entry.decidedAtR1 && neutral ? decidedAtR1Shade(color, neutral) : color
}
