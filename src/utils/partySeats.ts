import type { CommuneResult } from '../types/election'
import { mixHex } from './gradient'

/**
 * Seat-level reading of one force in one circonscription (C1, Aug 2026).
 *
 * lucas: "when clicking on a party/alliance, show — with the colour of the
 * Alliance, where their candidates have been elected; with dark grey, where
 * their candidate has lost the 2nd tour." Reference: Le Monde's 2024 T2 map.
 *
 * This is a THIRD reading of party mode, not a tweak to the score gradient.
 * It answers "did this force win the seat here", which only means anything at
 * the CIRCONSCRIPTION level of a LEGISLATIVE election — the circo is the
 * seat-bearing unit. Callers decide when it applies; everywhere else (the
 * communes tab, every presidential) keeps `partyRatioShade`.
 */
export type SeatState = 'elected' | 'qualified' | 'eliminated' | 'absent'

/**
 * Share of INSCRITS a candidate needs at round 1 to reach the runoff. This is
 * the actual rule (art. L162 code électoral), not a heuristic — and the same
 * threshold the parsers use when deriving `elected` for the 2012 vintage.
 */
const QUALIFY_SHARE_OF_INSCRITS = 0.125

/**
 * Who goes through to round 2. The 12.5%-of-inscrits bar, with the legal
 * fallback: if fewer than two candidates clear it, the top two by votes
 * qualify regardless.
 *
 * CAVEAT worth knowing before reading a T1 map: this is who qualified ON THE
 * NIGHT. Whether they then actually stood is a round-2 fact — 2024's mass
 * désistements are the obvious case, where ~200 qualified candidates withdrew.
 * Showing them as "qualifié" on the T1 map is the honest reading of a T1
 * result; the T2 map is where the withdrawal shows up.
 */
function qualifiedForRunoff(entry: CommuneResult): Set<CommuneResult['candidates'][number]> {
  const bar = entry.registeredVoters * QUALIFY_SHARE_OF_INSCRITS
  const cleared = entry.candidates.filter((c) => c.votes >= bar)
  if (cleared.length >= 2) return new Set(cleared)
  return new Set([...entry.candidates].sort((a, b) => b.votes - a.votes).slice(0, 2))
}

/**
 * The selected force's fate in this circonscription.
 *
 * `codes` is the force's own nuance code plus any alliance members, so a
 * selected alliance counts its component parties (`partyCodeSet`).
 *
 * At round 2 there are three outcomes — elected, stood and lost, didn't stand.
 * At round 1 there are four, because a circo that isn't decided outright sends
 * candidates to a runoff, and "qualifié" is a real and different result from
 * "éliminé". `elected` at R1 means won outright (>50% of exprimés and ≥25% of
 * inscrits); the parsers have already resolved that into the flag, so this
 * function never re-derives it.
 */
export function partySeatState(entry: CommuneResult, codes: Set<string>, round: number): SeatState {
  const mine = entry.candidates.filter((c) => codes.has(c.party))
  if (!mine.length) return 'absent'
  if (mine.some((c) => c.elected)) return 'elected'
  // A circo already decided has no runoff — everyone else there is eliminated,
  // and that covers both R1 outright wins and the R2 entries carried over from
  // R1 (`decidedAtR1`), which keep their `elected` flag.
  if (round === 1 && !entry.candidates.some((c) => c.elected)) {
    const through = qualifiedForRunoff(entry)
    if (mine.some((c) => through.has(c))) return 'qualified'
  }
  return 'eliminated'
}

/**
 * Greys for the two "not elected" states. `eliminated` has to read as a
 * deliberate value against BOTH the map background and the no-data neutral, so
 * it flips with the theme exactly like `DEFAULT_COLOR` does: on a light map it
 * is darker than the neutral, on a dark map lighter. Using one fixed grey looks
 * fine in light mode and disappears into the background in dark mode.
 */
export const ELIMINATED_LIGHT = '#64748b'
export const ELIMINATED_DARK = '#94a3b8'

/** How far "qualifié" is pulled toward the no-data neutral. */
const QUALIFIED_MUTE_T = 0.5

export interface SeatContext {
  /** Active round — decides whether "qualifié" is a possible state. */
  round: number
  /** Theme-resolved fill for a force that stood and lost. */
  eliminated: string
  /** Theme-resolved fill for a force that did not stand (the no-data neutral). */
  absent: string
}

/**
 * The code set a SEAT reading counts — the selected nuance and nothing else.
 *
 * Deliberately NOT `partyCodeSet`, which adds the alliance's member parties and
 * is right for the score gradient (a voter who backed a component party backed
 * the alliance). Seats are a counted, official quantity: the ministry attributes
 * each one to the nuance it recorded, and the app already publishes those
 * figures in the Pourcentages/Sièges switch. Using the member set here gave
 * **NFP 192 seats against the official 178** (+DVG 12 +SOC 2) and Ensemble 156
 * against 150 — two contradictory seat counts on the same screen.
 */
export function seatCodeSet(party: string): Set<string> {
  return new Set([party])
}

export type SeatCounts = Record<SeatState, number>

/**
 * How many circonscriptions fall in each state for one force — the numbers the
 * legend puts next to each swatch, the way Le Monde's does ("Candidat NFP élu
 * (182) / éliminé au second tour (134) / pas de candidat (261)"). Without them
 * the map shows a pattern the reader can't quantify.
 */
export function countSeatStates(
  circos: CommuneResult[],
  codes: Set<string>,
  round: number,
): SeatCounts {
  const counts: SeatCounts = { elected: 0, qualified: 0, eliminated: 0, absent: 0 }
  for (const c of circos) counts[partySeatState(c, codes, round)]++
  return counts
}

/** Fill for a seat state. `base` is the force's palette colour. */
export function seatStateColor(state: SeatState, base: string, ctx: SeatContext): string {
  switch (state) {
    case 'elected':
      return base
    case 'qualified':
      // Half-strength: still recognisably the force's colour, visibly not a win.
      return mixHex(base, ctx.absent, QUALIFIED_MUTE_T)
    case 'eliminated':
      return ctx.eliminated
    default:
      return ctx.absent
  }
}
