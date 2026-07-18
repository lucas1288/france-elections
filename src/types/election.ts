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
 * of their own, flagged with `alliance`). `family` links each code to the
 * cross-election political-family registry (families.json, two-axis P3).
 */
export interface Palette {
  byName?: Record<string, string>
  parties?: Record<string, { label: string; color: string; alliance?: boolean; members?: string[]; family?: string }>
}

/**
 * Cross-election political-family registry (public/data/elections/families.json).
 * Families are lineages (PS, LR, FN/RN…); blocs are the coarser level whose
 * series stay continuous across alliance years (NUPES/NFP → bloc `gauche`).
 * `order` is the left→right spectrum position. Family colors are canonical for
 * CROSS-ELECTION surfaces only — per-election views keep their palettes.
 */
export interface FamilyDef {
  label: string
  color: string
  bloc: string
  order: number
}

export interface FamiliesRegistry {
  blocs: Record<string, { label: string; color: string; order: number }>
  families: Record<string, FamilyDef>
}

/** One election×round point of a territory's history series (P5, generated
 *  by scripts/build-dept-history.mjs). `fam` = % of expressed votes per
 *  political-family id; `part` = participation %. */
export interface DeptHistoryPoint {
  t: ElectionType
  y: number
  r: number
  part: number
  fam: Record<string, number>
}

export interface DeptHistoryFile {
  depts: Record<string, { name: string; series: DeptHistoryPoint[] }>
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
  /** Candidate name with the highest vote share ('' when annulled) */
  leadingCandidate: string
  /** All ballots annulled (Conseil constitutionnel) — no expressed votes. */
  annulled?: boolean
}

export interface RoundData {
  year: number
  round: number
  candidates: Array<{ name: string; party: string }>
  communes: CommuneResult[]
}
