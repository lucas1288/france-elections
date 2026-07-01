export type ElectionType = 'presidential' | 'legislative' | 'european'

export type Granularity = 'commune' | 'circonscription' | 'hemicycle'

/** One election in the manifest (public/data/elections/index.json). */
export interface ElectionRef {
  type: ElectionType
  year: number
  rounds: number
  label: string
  /** Granularities for which data files exist. */
  granularities: Granularity[]
  /** Geometry version ids, resolved to tile URLs in FranceMap. */
  geometry: { admin: string; circo: string }
  /** National winner (leading force) — shown as a dot + label in the picker. */
  winner?: { name: string; color: string }
}

/**
 * Per-election color palette (palette.json next to the data files).
 * `byName` keys candidate names (presidentials); `parties` keys party/nuance
 * codes (legislatives — pre-electoral alliances like NUPES are nuance codes
 * of their own, flagged with `alliance`).
 */
export interface Palette {
  byName?: Record<string, string>
  parties?: Record<string, { label: string; color: string; alliance?: boolean; members?: string[] }>
}

export interface CandidateResult {
  name: string
  party: string
  votes: number
  percentage: number
  /** Won the seat in this round (legislatives). */
  elected?: boolean
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
  year: number
  round: number
  candidates: Array<{ name: string; party: string }>
  communes: CommuneResult[]
}
