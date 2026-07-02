import { create } from 'zustand'
import type { ElectionType, Granularity } from '../types/election'

interface SelectedElection {
  type: ElectionType
  year: number
  round: number
}

export type { Granularity }

interface FlyTarget {
  lng: number
  lat: number
  zoom: number
}

/**
 * How the choropleth is colored:
 * - `leader`     — each territory by its winning candidate/nuance (default)
 * - `party`      — single force; territories shaded by score-vs-national (ratio)
 * - `abstention` — grey ramp by abstention rate
 */
export type ColorMode =
  | { kind: 'leader' }
  | { kind: 'party'; party: string }
  | { kind: 'abstention' }

const LEADER: ColorMode = { kind: 'leader' }

interface ElectionStore {
  selected: SelectedElection
  granularity: Granularity
  hoveredCommune: string | null
  clickedCommune: string | null
  focusedTerritory: string | null
  flyTarget: FlyTarget | null
  colorMode: ColorMode
  /** True once the map is zoomed past the overview (drives auto-hide of overlays). */
  mapZoomedIn: boolean
  /** True whenever the map is zoomed in past the overview baseline by any amount
   * (finer than `mapZoomedIn`); drives the mobile back button + national snippet hide. */
  zoomedAway: boolean

  setSelected: (sel: SelectedElection) => void
  setGranularity: (g: Granularity) => void
  setHoveredCommune: (inseeCode: string | null) => void
  setClickedCommune: (inseeCode: string | null) => void
  setFocusedTerritory: (code: string | null) => void
  setFlyTarget: (target: FlyTarget | null) => void
  setMapZoomedIn: (zoomedIn: boolean) => void
  setZoomedAway: (away: boolean) => void
  /** Toggle the single-party view for `party`; clicking the active one returns to leader. */
  togglePartyMode: (party: string) => void
  /** Toggle the abstention view; calling it while active returns to leader. */
  toggleAbstentionMode: () => void
  /** Reset to the default leader (winner) view. */
  setLeaderMode: () => void
}

export const useElectionStore = create<ElectionStore>((set) => ({
  selected: { type: 'presidential', year: 2022, round: 1 },
  granularity: 'commune',
  hoveredCommune: null,
  clickedCommune: null,
  focusedTerritory: null,
  flyTarget: null,
  colorMode: LEADER,
  mapZoomedIn: false,
  zoomedAway: false,

  // Election change resets a party view (its candidates differ); abstention persists.
  setSelected: (sel) =>
    set((s) => ({
      selected: sel,
      hoveredCommune: null,
      clickedCommune: null,
      colorMode: s.colorMode.kind === 'party' ? LEADER : s.colorMode,
    })),
  setGranularity: (granularity) => set({ granularity }),
  setHoveredCommune: (inseeCode) => set({ hoveredCommune: inseeCode }),
  setClickedCommune: (inseeCode) =>
    set((s) => ({
      clickedCommune: s.clickedCommune === inseeCode ? null : inseeCode,
    })),
  setFocusedTerritory: (focusedTerritory) => set({ focusedTerritory }),
  setFlyTarget: (flyTarget) => set({ flyTarget }),
  setMapZoomedIn: (mapZoomedIn) => set({ mapZoomedIn }),
  setZoomedAway: (zoomedAway) => set({ zoomedAway }),
  togglePartyMode: (party) =>
    set((s) => ({
      colorMode: s.colorMode.kind === 'party' && s.colorMode.party === party ? LEADER : { kind: 'party', party },
    })),
  toggleAbstentionMode: () =>
    set((s) => ({ colorMode: s.colorMode.kind === 'abstention' ? LEADER : { kind: 'abstention' } })),
  setLeaderMode: () => set({ colorMode: LEADER }),
}))

/**
 * True when the map shows the full-France overview (nothing selected except
 * possibly the Français à l'étranger aggregate, no overseas territory focused).
 * Drives the fade-out of the overseas insets and the abroad panel.
 */
export function useIsOverview(): boolean {
  return useElectionStore(
    (s) => (!s.clickedCommune || s.clickedCommune === '99') && !s.focusedTerritory,
  )
}
