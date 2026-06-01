import { useElectionStore } from './store/electionStore'
import type { Granularity } from './store/electionStore'
import { useElectionData, useChoroplethData, useCircoChoroplethData, useFullCommuneData, useFullCircoData } from './hooks/useElectionData'
import { FranceMap } from './components/FranceMap'
import { ElectionSelector } from './components/ElectionSelector'
import { ResultsPanel } from './components/ResultsPanel'
import { Legend } from './components/Legend'

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
      {btn('departement', 'Département', true)}
      {btn('commune', 'Commune', communeAvailable)}
      {btn('circonscription', 'Circonscription', circoAvailable)}
    </div>
  )
}

export default function App() {
  const { selected, granularity, setGranularity } = useElectionStore()
  const electionQuery = useElectionData(selected.type, selected.year, selected.round)
  const choroplethQuery = useChoroplethData(selected.type, selected.year, selected.round)
  const circoQuery = useCircoChoroplethData(selected.type, selected.year, selected.round)
  const fullCommuneQuery = useFullCommuneData(
    selected.type, selected.year, selected.round,
    granularity === 'commune',
  )
  const fullCircoQuery = useFullCircoData(
    selected.type, selected.year, selected.round,
    granularity === 'circonscription',
  )

  const communeAvailable = !!choroplethQuery.data
  const circoAvailable = !!circoQuery.data

  const effectiveChoropleth =
    granularity === 'commune' ? (choroplethQuery.data ?? null) :
    granularity === 'circonscription' ? (circoQuery.data ?? null) :
    null

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
              granularity === 'commune' && communeAvailable ? 'commune' :
              granularity === 'circonscription' && circoAvailable ? 'circonscription' :
              'département'
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

          <FranceMap electionData={electionQuery.data} choroplethData={effectiveChoropleth} />
          <Legend electionData={electionQuery.data} />
        </div>

        {/* Sidebar */}
        <ResultsPanel
          electionData={electionQuery.data}
          communeData={fullCommuneQuery.data ?? null}
          circoData={fullCircoQuery.data ?? null}
          granularity={granularity}
          circoAvailable={circoAvailable}
        />
      </div>
    </div>
  )
}
