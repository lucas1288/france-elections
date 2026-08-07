import type { ElectionRef } from '../types/election'

/**
 * Which round to land on when the user picks an election outright (B2, Aug 2026).
 *
 * lucas: "default to the 2nd tour, especially for legislative". The last round
 * is the one that answers the question people arrive with — who actually won,
 * who holds the seat — whereas T1 is the field before it narrowed. Presidentials
 * with two rounds land on the runoff for the same reason.
 *
 * It is the LAST round rather than a literal `2` so the rule survives an
 * election that was decided in one (and single-round vintages, if any are ever
 * ingested, are unaffected by construction).
 *
 * Two deliberate non-users of this:
 * - The **timeline strip** preserves the current round when you move along the
 *   time axis (`min(round, e.rounds)`) — comparing the same round across years
 *   is the entire point of that control.
 * - The **cold-start default** in `electionStore` stays présidentielle 2022 T1.
 *   That election is the one exception in the data: the ministry never published
 *   its T2 commune file, so a T2 landing would greet a first-time visitor with
 *   the dept-level fallback notice on their first commune click. The store's
 *   initial state is also a literal that can't consult the manifest (it loads
 *   async), so changing it means an effect that has to not fight `useUrlSync`.
 */
export function defaultRound(e: Pick<ElectionRef, 'rounds'>) {
  return Math.max(1, e.rounds)
}
