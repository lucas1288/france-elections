import { useElectionStore } from '../store/electionStore'
import type { RoundData } from '../types/election'
import { resolveTerritory } from '../utils/territoryDetail'

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

interface Props {
  onOpen: () => void
  electionData?: RoundData
  communeData: RoundData | null
  circoData: RoundData | null
  className?: string
}

/**
 * The geo-axis control (two-axis navigation P1, "variant B"): a search pill
 * that plays three roles — empty it invites a search (opens the
 * TerritoryNavigator), settled it names the selected territory, and its ✕
 * un-settles the geo axis (clears the selection + refits the overview).
 */
export function TerritorySearchBar({ onOpen, electionData, communeData, circoData, className = '' }: Props) {
  const { clickedCommune, granularity, setClickedCommune, setFocusedTerritory, setFlyBounds } = useElectionStore()

  // Name of the settled territory (any granularity, incl. dept + fallbacks).
  const { commune } = resolveTerritory(clickedCommune, granularity, { electionData, communeData, circoData })
  const settledName = clickedCommune ? (commune?.name ?? clickedCommune) : null

  const unsettle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setClickedCommune(null)
    setFocusedTerritory(null)
    setFlyBounds('overview')
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen() }}
      aria-label="Rechercher un territoire"
      className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 ${className}`}
    >
      <span className="shrink-0 text-gray-400 dark:text-gray-500"><SearchIcon /></span>
      {settledName ? (
        <>
          <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-gray-200">{settledName}</span>
          <button
            type="button"
            aria-label="Revenir à la vue générale"
            onClick={unsettle}
            className="shrink-0 rounded-full p-0.5 text-gray-400 hover:bg-gray-300/60 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-slate-600 dark:hover:text-gray-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate text-gray-400 dark:text-gray-500">Commune, circo, département…</span>
      )}
    </div>
  )
}
