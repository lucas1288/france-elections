export type ElectionType = 'presidential' | 'legislative' | 'european'

export interface ElectionRef {
  type: ElectionType
  year: number
  rounds: number
  label: string
}

export interface ElectionIndex {
  elections: ElectionRef[]
}

export interface CandidateResult {
  name: string
  party: string
  votes: number
  percentage: number
}

export interface CommuneResult {
  /** INSEE commune code — join key with GeoJSON */
  inseeCode: string
  name: string
  registeredVoters: number
  turnout: number
  blankVotes: number
  nullVotes: number
  expressedVotes: number
  candidates: CandidateResult[]
  /** Candidate name with the highest vote share */
  leadingCandidate: string
}

export interface RoundData {
  electionType: ElectionType
  year: number
  round: number
  date: string
  candidates: Array<{ name: string; party: string }>
  communes: CommuneResult[]
}
