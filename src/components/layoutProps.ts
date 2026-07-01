import type { RoundData, Palette, ElectionRef, Granularity } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'

/**
 * Everything the presentation layer needs, computed once by App (the data
 * orchestrator) and handed to whichever layout the breakpoint selects.
 * Store-derived UI state (granularity, colorMode, selection…) is read directly
 * from the Zustand store inside each layout, so it is intentionally absent here.
 */
export interface LayoutProps {
  electionData: RoundData | undefined
  communeData: RoundData | null
  communeChoro: ChoroplethData | null
  circoData: RoundData | null
  circoChoro: ChoroplethData | null
  /** Choropleth for the active granularity (commune vs circo). */
  effectiveChoropleth: ChoroplethData | null
  /** Full per-territory data for the active granularity (lazy-loaded). */
  fullData: RoundData | null
  palette: Palette | null
  geometry: ElectionRef['geometry'] | undefined
  availableGranularities: Granularity[]
  circoAvailable: boolean
  /** Manifest label of the active election, e.g. "Présidentielle 2022". */
  electionLabel: string
  /** Number of rounds for the active election (drives the T1/T2 toggle). */
  rounds: number
  isLoading: boolean
  error: unknown
}
