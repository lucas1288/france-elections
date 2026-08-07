import { useHasDeptHistory } from './deptHistoryAvailable'
import { isPlmCity } from './deptInsight'

/**
 * The results panel's tabs (redesign R2). Grouped by the QUESTION being asked —
 * "who won here" / "how does it break down" / "how has it changed" — rather
 * than by data source, which is what keeps each tab meaningful for every scope.
 */
export type PanelTabId = 'results' | 'territories' | 'history'

export interface PanelTab {
  id: PanelTabId
  label: string
}

const LABELS: Record<PanelTabId, string> = {
  results: 'Résultats',
  territories: 'Territoires',
  history: 'Historique',
}

export interface PanelTabsInput {
  /** National (nothing selected) or a specific territory. */
  scope: 'national' | 'territory'
  /** Resolved entry's code — '75', '7506', '06027'… Null for the national scope. */
  code: string | null
  /** True when the selection is a settled département (dept insight sections). */
  isDeptSelection: boolean
}

/**
 * Which tabs exist for the current panel state.
 *
 * A tab is only offered when it has content: the Historique tab needs the
 * history files plus ≥2 elections of the selected type, and the Territoires tab
 * needs something to break down — the dept insight sections for a département,
 * or the arrondissements of a PLM whole-city (Paris/Lyon/Marseille). A plain
 * commune or circonscription has neither, so it gets a single tab and the
 * caller renders no tab bar at all.
 *
 * **The NATIONAL scope never has a Territoires tab** (B1, Aug 2026, lucas: the
 * 30-biggest-cities list it used to hold was "not sure it adds any kind of
 * value"). The cities are still reachable — they're the territory navigator's
 * empty state and the map's own city dots.
 *
 * Returning a LIST rather than booleans means both platforms iterate the same
 * order and labels; only the bar's styling differs.
 */
export function usePanelTabs({ scope, code, isDeptSelection }: PanelTabsInput): PanelTab[] {
  // Nationally the history is the 'FR' entry; for a territory it's the dept's
  // own — and only a settled dept shows one (a commune has no history series).
  const historyCode = scope === 'national' ? 'FR' : isDeptSelection ? code : null
  const hasHistory = useHasDeptHistory(historyCode)

  const hasTerritories =
    scope === 'territory' &&
    (isDeptSelection ||
      // Lyon/Marseille selected as communes, or Paris reached via its city
      // dot: the arrondissement breakdown is their territorial view.
      (!!code && isPlmCity(code)))

  const tabs: PanelTab[] = [{ id: 'results', label: LABELS.results }]
  if (hasTerritories) tabs.push({ id: 'territories', label: LABELS.territories })
  if (hasHistory) tabs.push({ id: 'history', label: LABELS.history })
  return tabs
}
