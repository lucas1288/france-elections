import { useEffect, useRef, useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import { TOP_CITIES } from '../utils/topCities'

interface CommuneHit {
  nom: string
  code: string
  codeDepartement: string
  centre?: { type: 'Point'; coordinates: [number, number] }
}

// Zoom past COMMUNE_MIN_ZOOM (7) so the commune polygon renders + highlights.
const SEARCH_FLY_ZOOM = 11

interface Props {
  open: boolean
  onClose: () => void
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

/**
 * Mobile full-screen search (Phase 6). A "find any place" sheet — commune-first
 * (geo.api.gouv.fr, same source as the desktop CommuneSearch) but the row format
 * is built to extend to départements / circonscriptions later. Selecting a
 * commune while in a non-commune granularity SWITCHES to commune, then flies +
 * selects. Empty state = the 30 biggest cities as quick jumps. "Autour de moi"
 * (geolocation) is a parked slot for v2.
 */
export function SearchSheet({ open, onClose }: Props) {
  const { granularity, setGranularity, setClickedCommune, setFlyTarget } = useElectionStore()
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<CommuneHit[]>([])
  const [resultsFor, setResultsFor] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the field once the open transition finishes.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open])

  // Clear state on every close path (Annuler + selecting a result) — done here
  // rather than in an effect to satisfy react-hooks/set-state-in-effect.
  const close = () => {
    setTerm('')
    setHits([])
    setResultsFor('')
    onClose()
  }

  // Debounced search-as-you-type
  useEffect(() => {
    abortRef.current?.abort()
    const q = term.trim()
    if (q.length < 2) return
    const controller = new AbortController()
    abortRef.current = controller
    const timer = setTimeout(() => {
      fetch(
        `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(q)}&fields=centre,codeDepartement&boost=population&limit=12`,
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

  const selectCommune = (code: string, lng: number, lat: number, zoom = SEARCH_FLY_ZOOM) => {
    // Searching a place is inherently a commune-level action: switch tabs if needed.
    if (granularity !== 'commune') setGranularity('commune')
    setClickedCommune(code)
    setFlyTarget({ lng, lat, zoom })
    close()
  }

  const showResults = term.trim().length >= 2
  const pending = resultsFor !== term.trim() && hits.length === 0

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-900 transition-transform duration-300 ${
        open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
      aria-hidden={!open}
    >
      {/* Search bar header */}
      <div className="flex items-center gap-2 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-100 dark:bg-slate-800 px-3 py-2.5">
          <span className="text-gray-400 dark:text-gray-500"><SearchIcon /></span>
          <input
            ref={inputRef}
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Rechercher un lieu…"
            className="w-full bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 px-1 text-sm font-medium text-gray-600 dark:text-gray-300"
        >
          Annuler
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Autour de moi — parked for v2 (slot designed now, wired later) */}
        <button
          type="button"
          disabled
          className="flex w-full items-center gap-3 px-4 py-3 text-left opacity-60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M22 12h-3M5 12H2" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-gray-700 dark:text-gray-300">Autour de moi</span>
            <span className="block text-xs text-gray-400 dark:text-gray-500">Bientôt disponible</span>
          </span>
        </button>

        {!showResults ? (
          <>
            <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Grandes villes
            </p>
            {TOP_CITIES.map((city) => (
              <button
                key={city.inseeCode}
                type="button"
                onClick={() => selectCommune(city.inseeCode, city.lng, city.lat, city.zoom)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-gray-100 dark:active:bg-slate-800"
              >
                <span className="text-gray-300 dark:text-gray-600"><SearchIcon /></span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{city.name}</span>
              </button>
            ))}
          </>
        ) : pending ? (
          <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Recherche…</p>
        ) : hits.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Aucun lieu trouvé</p>
        ) : (
          hits.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => c.centre && selectCommune(c.code, c.centre.coordinates[0], c.centre.coordinates[1])}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-slate-800"
            >
              <span className="text-gray-300 dark:text-gray-600"><SearchIcon /></span>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{c.nom}</span>
              <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{c.codeDepartement}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
