import { useEffect, useMemo, useRef, useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { RoundData } from '../types/election'
import { TOP_CITIES } from '../utils/topCities'
import { DEPT_BBOXES, CIRCO_BBOXES } from '../utils/territoryBBoxes'
import { overseasDeptCode } from '../utils/territoryDetail'

// Zoom past COMMUNE_MIN_ZOOM (7) so the commune polygon renders + highlights.
const SEARCH_FLY_ZOOM = 11

interface CommuneHit {
  nom: string
  code: string
  codeDepartement: string
  centre?: { type: 'Point'; coordinates: [number, number] }
}

type TerritoryKind = 'commune' | 'departement' | 'circonscription'

/** A remembered selection — enough to re-run it without a lookup. */
interface RecentEntry {
  kind: TerritoryKind
  code: string
  name: string
  /** commune only: fly target */
  lng?: number
  lat?: number
}

const RECENTS_KEY = 'fe-recent-territories'
const MAX_RECENTS = 6

function loadRecents(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    const parsed = raw ? (JSON.parse(raw) as RecentEntry[]) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Accent- and case-insensitive haystack normalisation for local search. */
function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const KIND_BADGE: Record<TerritoryKind, { label: string; cls: string }> = {
  commune: { label: 'C', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300' },
  departement: { label: 'D', cls: 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' },
  circonscription: { label: 'Ci', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  /** Dept-level data (always loaded) — dept names for search + browse. */
  electionData?: RoundData
  /** Full circo data (loaded whenever the election has circos) — circo names. */
  circoData: RoundData | null
}

/**
 * Territory navigator — the geo-axis counterpart of the ElectionPicker
 * (two-axis navigation P1). One federated search over communes
 * (geo.api.gouv.fr), départements and circonscriptions (local data), grouped
 * by kind; empty state = recents + big cities + départements. Selecting a
 * result settles the geo axis: selection + granularity switch + fly/fitBounds.
 * Presentation adapts like ElectionPicker: full-screen slide-up on mobile,
 * centered modal on desktop.
 */
export function TerritoryNavigator({ open, onClose, electionData, circoData }: Props) {
  const { granularity, setGranularity, selectTerritory, settleDept, setFlyTarget, setFlyBounds } = useElectionStore()
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<CommuneHit[]>([])
  const [resultsFor, setResultsFor] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Recents: re-read from localStorage on each open (writes happen on select,
  // which also closes — so a per-open read is always fresh).
  const recents = useMemo<RecentEntry[]>(() => (open ? loadRecents() : []), [open])

  // Focus the field once the open transition finishes.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open])

  const close = () => {
    setTerm('')
    setHits([])
    setResultsFor('')
    onClose()
  }

  // Debounced commune search-as-you-type (geo.api.gouv.fr)
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

  // Départements: the dept-level entries of the always-loaded round file.
  const departements = useMemo(
    () =>
      (electionData?.communes ?? [])
        .filter((c) => c.inseeCode.length <= 3 && c.inseeCode !== '99')
        .map((c) => ({ code: c.inseeCode, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [electionData],
  )

  // Local matches (no debounce needed — in-memory filters).
  const q = norm(term.trim())
  const deptHits = q.length >= 2 ? departements.filter((d) => norm(d.name).includes(q)).slice(0, 6) : []
  const circoHits =
    q.length >= 2 && circoData
      ? circoData.communes
          .filter((c) => norm(c.name).includes(q))
          .map((c) => ({ code: c.inseeCode, name: c.name }))
          .slice(0, 8)
      : []

  const remember = (entry: RecentEntry) => {
    const next = [entry, ...loadRecents().filter((r) => !(r.kind === entry.kind && r.code === entry.code))].slice(0, MAX_RECENTS)
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch {/* storage full/blocked — recents are a nicety */}
  }

  const selectCommune = (code: string, name: string, lng: number, lat: number, zoom = SEARCH_FLY_ZOOM) => {
    if (granularity !== 'commune') setGranularity('commune')
    selectTerritory(code)
    setFlyTarget({ lng, lat, zoom })
    remember({ kind: 'commune', code, name, lng, lat })
    close()
  }

  const selectDept = (code: string, name: string) => {
    settleDept(code)
    remember({ kind: 'departement', code, name })
    close()
  }

  const selectCirco = (code: string, name: string) => {
    if (granularity !== 'circonscription') setGranularity('circonscription')
    selectTerritory(code)
    const bbox = CIRCO_BBOXES[code] ?? DEPT_BBOXES[overseasDeptCode(code) ?? code.slice(0, 2)]
    if (bbox) setFlyBounds(bbox) // abroad circos (99xx) have no geometry — select only
    remember({ kind: 'circonscription', code, name })
    close()
  }

  const selectRecent = (r: RecentEntry) => {
    if (r.kind === 'commune' && r.lng != null && r.lat != null) selectCommune(r.code, r.name, r.lng, r.lat)
    else if (r.kind === 'departement') selectDept(r.code, r.name)
    else if (r.kind === 'circonscription') selectCirco(r.code, r.name)
  }

  const showResults = term.trim().length >= 2
  const pending = showResults && resultsFor !== term.trim() && hits.length === 0
  const nothing = showResults && !pending && hits.length === 0 && deptHits.length === 0 && circoHits.length === 0

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col bg-white dark:bg-slate-900 transition-transform duration-300 md:flex-row md:items-center md:justify-center md:bg-black/40 md:transition-opacity dark:md:bg-black/60 ${
        open
          ? 'translate-y-0 md:opacity-100'
          : 'pointer-events-none translate-y-full md:translate-y-0 md:opacity-0'
      }`}
      aria-hidden={!open}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="flex min-h-0 flex-1 flex-col md:h-[70vh] md:w-full md:max-w-md md:flex-none md:overflow-hidden md:rounded-2xl md:bg-white md:shadow-2xl dark:md:bg-slate-900">
        {/* Search bar header */}
        <div className="flex items-center gap-2 px-3 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:pt-4">
          <div className="flex flex-1 items-center gap-2 rounded-xl bg-gray-100 dark:bg-slate-800 px-3 py-2.5">
            <span className="text-gray-400 dark:text-gray-500"><SearchIcon /></span>
            <input
              ref={inputRef}
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Commune, département, circonscription…"
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

        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {!showResults ? (
            <>
              {recents.length > 0 && (
                <>
                  <SectionLabel>Récents</SectionLabel>
                  {recents.map((r) => (
                    <Row key={`${r.kind}-${r.code}`} kind={r.kind} name={r.name} sub={r.code} onClick={() => selectRecent(r)} />
                  ))}
                </>
              )}
              <SectionLabel>Grandes villes</SectionLabel>
              {TOP_CITIES.map((city) => (
                <Row
                  key={city.inseeCode}
                  kind="commune"
                  name={city.name}
                  onClick={() => selectCommune(city.inseeCode, city.name, city.lng, city.lat, city.zoom)}
                />
              ))}
              <SectionLabel>Départements</SectionLabel>
              {departements.map((d) => (
                <Row key={d.code} kind="departement" name={d.name} sub={d.code} onClick={() => selectDept(d.code, d.name)} />
              ))}
            </>
          ) : (
            <>
              {hits.length > 0 && <SectionLabel>Communes</SectionLabel>}
              {hits.map((c) => (
                <Row
                  key={c.code}
                  kind="commune"
                  name={c.nom}
                  sub={c.codeDepartement}
                  onClick={() => c.centre && selectCommune(c.code, c.nom, c.centre.coordinates[0], c.centre.coordinates[1])}
                />
              ))}
              {deptHits.length > 0 && <SectionLabel>Départements</SectionLabel>}
              {deptHits.map((d) => (
                <Row key={d.code} kind="departement" name={d.name} sub={d.code} onClick={() => selectDept(d.code, d.name)} />
              ))}
              {circoHits.length > 0 && <SectionLabel>Circonscriptions</SectionLabel>}
              {circoHits.map((c) => (
                <Row key={c.code} kind="circonscription" name={c.name} onClick={() => selectCirco(c.code, c.name)} />
              ))}
              {pending && <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Recherche…</p>}
              {nothing && <p className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500">Aucun lieu trouvé</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </p>
  )
}

function Row({ kind, name, sub, onClick }: { kind: TerritoryKind; name: string; sub?: string; onClick: () => void }) {
  const badge = KIND_BADGE[kind]
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-slate-800/60 dark:active:bg-slate-800"
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${badge.cls}`}>
        {badge.label}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{name}</span>
      {sub && <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{sub}</span>}
    </button>
  )
}
