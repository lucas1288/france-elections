import { create } from 'zustand'
import type { ElectionType } from '../types/election'

interface SelectedElection {
  type: ElectionType
  year: number
  round: number
}

export type Granularity = 'commune' | 'departement' | 'circonscription'

interface ElectionStore {
  selected: SelectedElection
  granularity: Granularity
  hoveredCommune: string | null
  clickedCommune: string | null
  focusedTerritory: string | null   // overseas territory code being zoomed into

  setSelected: (sel: SelectedElection) => void
  setGranularity: (g: Granularity) => void
  setHoveredCommune: (inseeCode: string | null) => void
  setClickedCommune: (inseeCode: string | null) => void
  setFocusedTerritory: (code: string | null) => void
}

export const useElectionStore = create<ElectionStore>((set) => ({
  selected: { type: 'presidential', year: 2022, round: 1 },
  granularity: 'commune',
  hoveredCommune: null,
  clickedCommune: null,
  focusedTerritory: null,

  setSelected: (sel) => set({ selected: sel, hoveredCommune: null, clickedCommune: null }),
  setGranularity: (granularity) => set({ granularity }),
  setHoveredCommune: (inseeCode) => set({ hoveredCommune: inseeCode }),
  setClickedCommune: (inseeCode) =>
    set((s) => ({
      clickedCommune: s.clickedCommune === inseeCode ? null : inseeCode,
    })),
  setFocusedTerritory: (focusedTerritory) => set({ focusedTerritory }),
}))
