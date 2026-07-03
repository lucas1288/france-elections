import { useEffect, useRef, useState } from 'react'
import { useElectionStore } from '../store/electionStore'

interface CommuneHit {
  nom: string
  code: string
  codeDepartement: string
  centre?: { type: 'Point'; coordinates: [number, number] }
}

// Zoom used when flying to a found commune — past COMMUNE_MIN_ZOOM (7) so the
// commune polygon is rendered and clickable/highlighted.
const SEARCH_FLY_ZOOM = 11

/**
 * Search field over all French communes, backed by the geo.api.gouv.fr API
 * (same source as adminCenters.ts). Selecting a result zooms the map to the
 * commune and selects it, like the top-30 city list.
 */
export function CommuneSearch() {
  const { setClickedCommune, setFlyTarget } = useElectionStore()
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<CommuneHit[]>([])
  // Query string the current `hits` belong to — while it lags behind `term`,
  // a search is pending and we show "Recherche…" instead of an empty state.
  const [resultsFor, setResultsFor] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  // Debounced search-as-you-type
  useEffect(() => {
    abortRef.current?.abort()
    const q = term.trim()
    if (q.length < 2) return
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => {
      fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=centre,codeDepartement&boost=population&limit=8`,
        { signal: controller.signal },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((results: CommuneHit[]) => {
          setHits(results.filter((c) => c.centre))
          setResultsFor(q)
        })
        .catch(() => {/* aborted or network error — keep previous results */})
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  const select = (c: CommuneHit) => {
    if (!c.centre) return
    const [lng, lat] = c.centre.coordinates
    setClickedCommune(c.code)
    setFlyTarget({ lng, lat, zoom: SEARCH_FLY_ZOOM })
    setTerm('')
    setHits([])
    setResultsFor('')
  }

  return (
    <div className="px-4 pb-3">
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Rechercher une commune…"
        className="w-full text-sm border border-gray-300 dark:border-slate-600 rounded px-2.5 py-1.5 bg-white dark:bg-slate-900 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {term.trim().length >= 2 && (
        <div className="mt-1 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          {resultsFor !== term.trim() && hits.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-gray-400 dark:text-gray-500">Recherche…</p>
          ) : hits.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-gray-400 dark:text-gray-500">Aucune commune trouvée</p>
          ) : (
            hits.map((c) => (
              <button
                key={c.code}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-blue-50 transition-colors"
                onClick={() => select(c)}
              >
                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{c.nom}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{c.codeDepartement}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
