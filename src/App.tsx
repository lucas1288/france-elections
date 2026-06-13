import { useEffect } from 'react'
import { useElectionStore, useIsOverview } from './store/electionStore'
import type { Granularity } from './store/electionStore'
import { useElectionData, useChoroplethData, useCircoChoroplethData, useFullCommuneData, useFullCircoData, useElectionIndex, usePalette } from './hooks/useElectionData'
import { FranceMap } from './components/FranceMap'
import { ElectionSelector } from './components/ElectionSelector'
import { ResultsPanel } from './components/ResultsPanel'
import { Legend } from './components/Legend'
import { AbroadMap } from './components/AbroadMap'

function GranularityToggle({
  value,
  onChange,
  communeAvailable,
  circoAvailable,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
  communeAvailable: boolean
  circoAvailable: boolean
}) {
  const base = 'px-3 py-1 text-xs font-medium rounded transition-colors'
  const active = 'bg-blue-600 text-white'
  const inactive = 'text-gray-600 hover:bg-gray-100'
  const disabled = 'text-gray-300 cursor-not-allowed'

  const btn = (g: Granularity, label: string, available: boolean) => (
    <button
      className={`${base} ${!available ? disabled : value === g ? active : inactive}`}
      disabled={!available}
      onClick={() => available && onChange(g)}
      title={!available ? 'Données non disponibles' : undefined}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded p-0.5 bg-gray-50">
      {btn('commune', 'Commune', communeAvailable)}
      {btn('circonscription', 'Circonscription', circoAvailable)}
    </div>
  )
}

export default function App() {
  const { selected, granularity, setGranularity } = useElectionStore()
  const isOverview = useIsOverview()
  const indexQuery = useElectionIndex()
  const electionRef = indexQuery.data?.elections.find(
    (e) => e.type === selected.type && e.year === selected.year,
  )
  // Availability comes from the manifest; while it loads, assume available so
  // the initial (presidential 2022) queries start without waiting.
  const communeAvailable = electionRef?.granularities.includes('commune') ?? true
  const circoAvailable = electionRef?.granularities.includes('circonscription') ?? true

  // If the selected election doesn't offer the active granularity, switch.
  useEffect(() => {
    if (!electionRef) return
    if (!electionRef.granularities.includes(granularity)) {
      setGranularity(electionRef.granularities[0])
    }
  }, [electionRef, granularity, setGranularity])

  const electionQuery = useElectionData(selected.type, selected.year, selected.round)
  const paletteQuery = usePalette(selected.type, selected.year)
  const choroplethQuery = useChoroplethData(selected.type, selected.year, selected.round, communeAvailable)
  const circoQuery = useCircoChoroplethData(selected.type, selected.year, selected.round, circoAvailable)
  const fullCommuneQuery = useFullCommuneData(
    selected.type, selected.year, selected.round,
    communeAvailable && granularity === 'commune',
  )
  const fullCircoQuery = useFullCircoData(
    selected.type, selected.year, selected.round,
    circoAvailable && granularity === 'circonscription',
  )
  const palette = paletteQuery.data ?? null
  const colorMode = useElectionStore((s) => s.colorMode)

  const effectiveChoropleth =
    granularity === 'commune' ? (choroplethQuery.data ?? null) : (circoQuery.data ?? null)
  const fullData =
    granularity === 'commune' ? (fullCommuneQuery.data ?? null) : (fullCircoQuery.data ?? null)

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Top bar */}
      <header className="shrink-0 bg-white border-b border-gray-200 flex items-center gap-4 px-4">
        <div className="py-3">
          <h1 className="text-base font-bold text-gray-900 leading-none">
            Élections France
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Résultats par {
              granularity === 'circonscription' && circoAvailable ? 'circonscription' : 'commune'
            }
          </p>
        </div>
        <div className="border-l border-gray-200 h-8" />
        <ElectionSelector />
        <div className="border-l border-gray-200 h-8" />
        <GranularityToggle
          value={granularity}
          onChange={setGranularity}
          communeAvailable={communeAvailable}
          circoAvailable={circoAvailable}
        />
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          {electionQuery.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
              <p className="text-sm text-gray-500">Chargement des données…</p>
            </div>
          )}

          {electionQuery.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
              <div className="text-sm text-red-500 max-w-sm text-center">
                <p className="font-semibold mb-1">Erreur de chargement</p>
                <p className="text-xs text-gray-500">
                  {(electionQuery.error as Error).message}
                </p>
              </div>
            </div>
          )}

          <FranceMap
            electionData={electionQuery.data}
            choroplethData={effectiveChoropleth}
            fullData={fullData}
            palette={palette}
            colorMode={colorMode}
            geometry={electionRef?.geometry}
          />
          {/* Top-right overlay: legend + abroad panel stacked */}
          <div className="absolute top-4 right-14 z-10 flex flex-col gap-2 max-h-[calc(100vh-5rem)] overflow-y-auto">
            <Legend electionData={electionQuery.data} palette={palette} />
            <div
              className="transition-opacity duration-300"
              style={{
                opacity: isOverview ? 1 : 0,
                pointerEvents: isOverview ? 'auto' : 'none',
              }}
            >
              <AbroadMap
                electionData={electionQuery.data}
                circoChoro={circoQuery.data ?? null}
                fullData={fullData}
                granularity={granularity}
                palette={palette}
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <ResultsPanel
          electionData={electionQuery.data}
          communeData={fullCommuneQuery.data ?? null}
          communeChoro={choroplethQuery.data ?? null}
          circoData={fullCircoQuery.data ?? null}
          circoChoro={circoQuery.data ?? null}
          granularity={granularity}
          palette={palette}
        />
      </div>
    </div>
  )
}
