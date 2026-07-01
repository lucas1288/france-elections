import { useElectionStore, useIsOverview } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { ElectionSelector } from './ElectionSelector'
import { ResultsPanel } from './ResultsPanel'
import { Legend } from './Legend'
import { AbroadMap } from './AbroadMap'
import type { LayoutProps } from './layoutProps'

function GranularityToggle({
  value,
  onChange,
  available,
}: {
  value: Granularity
  onChange: (g: Granularity) => void
  available: Granularity[]
}) {
  const base = 'px-3 py-1 text-xs font-medium rounded transition-colors'
  const activeCls = 'bg-blue-600 text-white'
  const inactive = 'text-gray-600 hover:bg-gray-100'
  const disabled = 'text-gray-300 cursor-not-allowed'

  const btn = (g: Granularity, label: string) => {
    const ok = available.includes(g)
    return (
      <button
        className={`${base} ${!ok ? disabled : value === g ? activeCls : inactive}`}
        disabled={!ok}
        onClick={() => ok && onChange(g)}
        title={!ok ? 'Données non disponibles' : undefined}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 border border-gray-200 rounded p-0.5 bg-gray-50">
      {btn('commune', 'Commune')}
      {btn('circonscription', 'Circonscription')}
      {available.includes('hemicycle') && btn('hemicycle', 'Hémicycle')}
    </div>
  )
}

export function DesktopLayout(props: LayoutProps) {
  const { selected, granularity, setGranularity } = useElectionStore()
  const isOverview = useIsOverview()
  const colorMode = useElectionStore((s) => s.colorMode)
  const mapZoomedIn = useElectionStore((s) => s.mapZoomedIn)
  const circoAvailable = props.circoAvailable
  const isHemicycle = granularity === 'hemicycle'

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
          available={props.availableGranularities}
        />
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          {props.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
              <p className="text-sm text-gray-500">Chargement des données…</p>
            </div>
          )}

          {!!props.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
              <div className="text-sm text-red-500 max-w-sm text-center">
                <p className="font-semibold mb-1">Erreur de chargement</p>
                <p className="text-xs text-gray-500">
                  {(props.error as Error).message}
                </p>
              </div>
            </div>
          )}

          <FranceMap
            electionData={props.electionData}
            choroplethData={props.effectiveChoropleth}
            fullData={props.fullData}
            palette={props.palette}
            colorMode={colorMode}
            geometry={props.geometry}
          />
          {/* Hemicycle replaces the map (kept mounted underneath to avoid re-init) */}
          {isHemicycle && (
            <Hemicycle circoData={props.circoData} palette={props.palette} round={selected.round} />
          )}
          {/* Top-right overlay: legend + abroad panel stacked (map views only) */}
          {!isHemicycle && (
            <div
              className="absolute top-4 right-14 z-10 flex flex-col gap-2 max-h-[calc(100vh-5rem)] overflow-y-auto transition-opacity duration-300"
              style={{
                opacity: mapZoomedIn ? 0 : 1,
                pointerEvents: mapZoomedIn ? 'none' : 'auto',
              }}
            >
              <Legend electionData={props.electionData} palette={props.palette} />
              <div
                className="transition-opacity duration-300"
                style={{
                  opacity: isOverview ? 1 : 0,
                  pointerEvents: isOverview ? 'auto' : 'none',
                }}
              >
                <AbroadMap
                  electionData={props.electionData}
                  circoChoro={props.circoChoro}
                  fullData={props.fullData}
                  granularity={granularity}
                  palette={props.palette}
                />
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <ResultsPanel
          electionData={props.electionData}
          communeData={props.communeData}
          communeChoro={props.communeChoro}
          circoData={props.circoData}
          circoChoro={props.circoChoro}
          granularity={granularity}
          palette={props.palette}
        />
      </div>
    </div>
  )
}
