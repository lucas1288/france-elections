import type { RoundData } from '../types/election'

export interface NationalCandidateTotal {
  name: string
  party: string
  votes: number
  /** Share of expressed votes, in percent. */
  percentage: number
}

export interface NationalTotals {
  registeredVoters: number
  turnout: number
  abstention: number
  blankVotes: number
  nullVotes: number
  expressedVotes: number
  /** Candidates (presidential) or nuances (legislative), sorted by votes desc. */
  candidates: NationalCandidateTotal[]
}

/**
 * Aggregates département-level results (round{N}.json) into national totals.
 * The dept level sums exactly to the national figures (it already includes the
 * overseas départements and the Français à l'étranger entry when present).
 *
 * Votes are accumulated by candidate/nuance NAME, not by index, because the
 * legislative dept data does not carry every nuance in every département.
 * This is the single source of truth for the results summary and for the
 * national baseline that the gradient views compare against.
 */
export function computeNationalTotals(round: RoundData): NationalTotals {
  let registeredVoters = 0, turnout = 0, blankVotes = 0, nullVotes = 0, expressedVotes = 0
  const byName = new Map<string, NationalCandidateTotal>()

  for (const dept of round.communes) {
    registeredVoters += dept.registeredVoters
    turnout += dept.turnout
    blankVotes += dept.blankVotes
    nullVotes += dept.nullVotes
    expressedVotes += dept.expressedVotes
    for (const c of dept.candidates) {
      const entry = byName.get(c.name) ?? { name: c.name, party: c.party, votes: 0, percentage: 0 }
      entry.votes += c.votes
      byName.set(c.name, entry)
    }
  }

  const expressed = expressedVotes || 1
  const candidates = [...byName.values()]
    .map((c) => ({ ...c, percentage: (c.votes / expressed) * 100 }))
    .sort((a, b) => b.votes - a.votes)

  return {
    registeredVoters,
    turnout,
    abstention: registeredVoters - turnout,
    blankVotes,
    nullVotes,
    expressedVotes,
    candidates,
  }
}
