import { create } from 'zustand'
import type { ElectionType, Granularity } from '../types/election'
import { DEPT_BBOXES } from '../utils/territoryBBoxes'

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
 * Bounds fly request, consumed by FranceMap like `flyTarget`:
 * [west, south, east, north], or 'overview' to re-fit metropolitan France
 * (with the layout-aware padding only FranceMap knows).
 */
export type FlyBounds = [number, number, number, number] | 'overview'

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

/**
 * Color theme. `system` follows the OS/browser preference (and tracks live
 * changes); `light`/`dark` are explicit user overrides. Persisted to
 * localStorage; the resolved boolean drives both the Tailwind `dark` class on
 * <html> (chrome) and the MapLibre/D3 surfaces (via `isDark`).
 */
export type Theme = 'system' | 'light' | 'dark'

const THEME_KEY = 'fe-theme'
const systemDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
const resolveDark = (theme: Theme) => (theme === 'system' ? systemDark() : theme === 'dark')
const storedTheme = (): Theme => {
  if (typeof window === 'undefined') return 'system'
  const t = window.localStorage.getItem(THEME_KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}
const applyThemeClass = (dark: boolean) => {
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', dark)
}

interface ElectionStore {
  selected: SelectedElection
  granularity: Granularity
  hoveredCommune: string | null
  clickedCommune: string | null
  focusedTerritory: string | null
  flyTarget: FlyTarget | null
  flyBounds: FlyBounds | null
  colorMode: ColorMode
  /** True once the map is zoomed past the overview (drives auto-hide of overlays). */
  mapZoomedIn: boolean
  /** True whenever the map is zoomed in past the overview baseline by any amount
   * (finer than `mapZoomedIn`); drives the mobile back button + national snippet hide. */
  zoomedAway: boolean
  /** User theme preference (persisted; `system` follows the OS). */
  theme: Theme
  /** Resolved dark flag — drives MapLibre/D3 colors (chrome uses the `dark` class). */
  isDark: boolean

  setSelected: (sel: SelectedElection) => void
  setGranularity: (g: Granularity) => void
  setHoveredCommune: (inseeCode: string | null) => void
  setClickedCommune: (inseeCode: string | null) => void
  /** Set the selection WITHOUT the map-click toggle semantics (navigator/search). */
  selectTerritory: (inseeCode: string) => void
  /** Settle the geo axis on a département: selection + camera (overseas depts
   * ride the focus machinery, metro depts fit their bbox). Shared by the
   * territory navigator and the detail panels' breadcrumb. */
  settleDept: (deptCode: string) => void
  setFocusedTerritory: (code: string | null) => void
  setFlyTarget: (target: FlyTarget | null) => void
  setFlyBounds: (bounds: FlyBounds | null) => void
  setMapZoomedIn: (zoomedIn: boolean) => void
  setZoomedAway: (away: boolean) => void
  setTheme: (theme: Theme) => void
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
  flyBounds: null,
  colorMode: LEADER,
  mapZoomedIn: false,
  zoomedAway: false,
  theme: storedTheme(),
  isDark: resolveDark(storedTheme()),

  // Election change resets a party view (its candidates differ); abstention persists.
  // The territory selection (clickedCommune) survives round/election switches —
  // it's an INSEE code, valid across datasets, so the panel re-resolves it.
  setSelected: (sel) =>
    set((s) => ({
      selected: sel,
      hoveredCommune: null,
      colorMode: s.colorMode.kind === 'party' ? LEADER : s.colorMode,
    })),
  setGranularity: (granularity) => set({ granularity }),
  setHoveredCommune: (inseeCode) => set({ hoveredCommune: inseeCode }),
  setClickedCommune: (inseeCode) =>
    set((s) => ({
      clickedCommune: s.clickedCommune === inseeCode ? null : inseeCode,
    })),
  selectTerritory: (inseeCode) => set({ clickedCommune: inseeCode }),
  settleDept: (deptCode) => {
    if (deptCode.length === 3 && (deptCode.startsWith('97') || deptCode.startsWith('98'))) {
      set({ clickedCommune: deptCode, focusedTerritory: deptCode })
    } else {
      // Clearing a stale overseas focus here would fly to the metro overview and
      // fight the bbox fit — FranceMap's flyBounds effect runs last, so the bbox
      // wins, but we still clear the focus so `useIsOverview` stays coherent.
      const bbox = DEPT_BBOXES[deptCode]
      set({ clickedCommune: deptCode, focusedTerritory: null, ...(bbox ? { flyBounds: bbox as FlyBounds } : {}) })
    }
  },
  setFocusedTerritory: (focusedTerritory) => set({ focusedTerritory }),
  setFlyTarget: (flyTarget) => set({ flyTarget }),
  setFlyBounds: (flyBounds) => set({ flyBounds }),
  setMapZoomedIn: (mapZoomedIn) => set({ mapZoomedIn }),
  setZoomedAway: (zoomedAway) => set({ zoomedAway }),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(THEME_KEY, theme)
    const isDark = resolveDark(theme)
    applyThemeClass(isDark)
    set({ theme, isDark })
  },
  togglePartyMode: (party) =>
    set((s) => ({
      colorMode: s.colorMode.kind === 'party' && s.colorMode.party === party ? LEADER : { kind: 'party', party },
    })),
  toggleAbstentionMode: () =>
    set((s) => ({ colorMode: s.colorMode.kind === 'abstention' ? LEADER : { kind: 'abstention' } })),
  setLeaderMode: () => set({ colorMode: LEADER }),
}))

// Apply the initial theme class and track live OS preference changes while in
// `system` mode. Module-level (not a React effect): runs once, no component owns
// the document class, and the listener updates the store like any event handler.
if (typeof window !== 'undefined') {
  applyThemeClass(useElectionStore.getState().isDark)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (useElectionStore.getState().theme !== 'system') return
    applyThemeClass(e.matches)
    useElectionStore.setState({ isDark: e.matches })
  })
}

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
