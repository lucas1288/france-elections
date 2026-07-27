import { useElectionStore, useIsOverview } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { useState } from 'react'
import { ElectionPicker } from './ElectionPicker'
import { TerritoryNavigator } from './TerritoryNavigator'
import { TerritorySearchBar } from './TerritorySearchBar'
import { TimelineStrip } from './TimelineStrip'
import { ResultsPanel } from './ResultsPanel'
import { AbroadMap } from './AbroadMap'
import { ThemeToggle } from './ThemeToggle'
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
  const inactive = 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
  const disabled = 'text-gray-300 cursor-not-allowed dark:text-gray-600'

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
    <div className="flex items-center gap-1 border border-gray-200 rounded p-0.5 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
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
  const [pickerOpen, setPickerOpen] = useState(false)
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const circoAvailable = props.circoAvailable
  const isHemicycle = granularity === 'hemicycle'

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
      {/* Top bar */}
      <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-gray-200 flex items-center gap-4 px-4 dark:border-slate-700">
        <div className="py-3">
          <h1 className="text-base font-bold text-gray-900 leading-none dark:text-gray-100">
            Élections France
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 dark:text-gray-500">
            Résultats par {
              granularity === 'circonscription' && circoAvailable ? 'circonscription' : 'commune'
            }
          </p>
        </div>
        <div className="border-l border-gray-200 h-8 dark:border-slate-700" />

        {/* NOTE (July 2026): the election chip + T1/T2 toggle used to live here.
            Both moved to the TimelineStrip (bottom-centre of the map): its stops
            switch elections, its pills switch rounds, and its list icon opens the
            full ElectionPicker. The top bar keeps only the view + geo controls. */}
        <GranularityToggle
          value={granularity}
          onChange={setGranularity}
          available={props.availableGranularities}
        />
        {/* Geo-axis control: search pill (settled territory + ✕), opens the navigator */}
        <TerritorySearchBar
          onOpen={() => setNavigatorOpen(true)}
          electionData={props.electionData}
          communeData={props.communeData}
          circoData={props.circoData}
          className="ml-auto w-72"
        />
        <ThemeToggle className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800" />
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map area */}
        <div className="flex-1 relative">
          {props.isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20 dark:bg-slate-900">
              <p className="text-sm text-gray-500 dark:text-gray-400">Chargement des données…</p>
            </div>
          )}

          {!!props.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20 dark:bg-slate-900">
              <div className="text-sm text-red-500 max-w-sm text-center">
                <p className="font-semibold mb-1">Erreur de chargement</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
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

          {/* Timeline scrubber (two-axis P4) — adjacent moves on the time axis;
              floats bottom-centre, above the hemicycle cover (z-20) so the time
              axis stays reachable in every view. */}
          <TimelineStrip
            onOpenPicker={() => setPickerOpen(true)}
            className="absolute bottom-4 left-1/2 z-30 w-[24rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-white/95 px-4 pb-1.5 pt-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-900/95 dark:ring-white/10"
          />
          {/* Top-right overlay: abroad panel (map views only). The old "En tête"
              legend is gone — force selection lives in the sidebar's national
              results now (mobile model); each row carries its colour key. */}
          {!isHemicycle && (
            <div
              className="absolute top-4 right-14 z-10 flex flex-col gap-2 max-h-[calc(100vh-5rem)] overflow-y-auto transition-opacity duration-300"
              style={{
                opacity: mapZoomedIn ? 0 : 1,
                pointerEvents: mapZoomedIn ? 'none' : 'auto',
              }}
            >
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
          communeDataMissing={props.communeDataMissing}
          communeChoro={props.communeChoro}
          circoData={props.circoData}
          circoChoro={props.circoChoro}
          granularity={granularity}
          palette={props.palette}
        />
      </div>

      <ElectionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <TerritoryNavigator
        open={navigatorOpen}
        onClose={() => setNavigatorOpen(false)}
        electionData={props.electionData}
        circoData={props.circoData}
      />
    </div>
  )
}
