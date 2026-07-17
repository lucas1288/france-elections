import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { MobileDetailSheet } from './MobileDetailSheet'
import { AffichageSheet } from './AffichageSheet'
import { HemicycleSheet } from './HemicycleSheet'
import { ThemeToggle } from './ThemeToggle'
import { ElectionPicker } from './ElectionPicker'
import { TerritoryNavigator } from './TerritoryNavigator'
import { TerritorySearchBar } from './TerritorySearchBar'
import { TimelineStrip } from './TimelineStrip'
import type { LayoutProps } from './layoutProps'

const GRAN_LABEL: Record<Granularity, string> = {
  commune: 'Communes',
  circonscription: 'Circos',
  hemicycle: 'Hémi.',
}

/**
 * Mobile-first shell: full-bleed map + floating top bar (search pill above the
 * timeline strip — the two axes) + bottom manifest-driven granularity switcher.
 */
export function MobileLayout(props: LayoutProps) {
  const { selected, granularity, setGranularity } = useElectionStore()
  const colorMode = useElectionStore((s) => s.colorMode)
  const isHemicycle = granularity === 'hemicycle'
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <div className="h-full relative overflow-hidden">
      <FranceMap
        electionData={props.electionData}
        choroplethData={props.effectiveChoropleth}
        fullData={props.fullData}
        palette={props.palette}
        colorMode={colorMode}
        geometry={props.geometry}
        mobile
      />
      {isHemicycle && (
        <Hemicycle circoData={props.circoData} palette={props.palette} round={selected.round} />
      )}

      {props.isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Chargement des données…</p>
        </div>
      )}

      {/* Top bar — two rows: geo axis (search pill) above, time axis below.
          The timeline strip (two-axis P4) took over the slot previously held
          by the election chip + T1/T2 toggle: it IS the time selector now; the
          full picker opens from its list icon. */}
      <header className="absolute inset-x-0 top-0 z-20 flex flex-col gap-1.5 px-3 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))] bg-white/90 backdrop-blur-sm border-b border-gray-200/70 dark:bg-slate-900/90 dark:border-slate-700/70">
        <TerritorySearchBar
          onOpen={() => setSearchOpen(true)}
          electionData={props.electionData}
          communeData={props.communeData}
          circoData={props.circoData}
          className="w-full"
        />
        <TimelineStrip onOpenPicker={() => setPickerOpen(true)} className="w-full" />
      </header>

      {/* Bottom granularity switcher — view axis (manifest-driven) */}
      <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2">
        <div className="flex items-center gap-0.5 rounded-xl bg-white/90 p-1 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:bg-slate-900/90 dark:ring-white/10">
          {props.availableGranularities.map((g, i) => {
            const active = granularity === g
            const isHemi = g === 'hemicycle'
            return (
              <div key={g} className="flex items-center">
                {isHemi && i > 0 && <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-slate-700" />}
                <button
                  type="button"
                  onClick={() => setGranularity(g)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {GRAN_LABEL[g]}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Theme chip — bottom-right corner (bottom-left holds the results chip, the
          centre the granularity switcher, and the snippet card spans above them). */}
      <ThemeToggle className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 text-gray-600 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:bg-slate-900/90 dark:text-gray-300 dark:ring-white/10" />

      {!isHemicycle && (
        <AffichageSheet
          electionData={props.electionData}
          palette={props.palette}
          electionLabel={props.electionLabel}
          round={selected.round}
          circoChoro={props.circoChoro}
          circoData={props.circoData}
        />
      )}
      {/* Overseas inset now lives inside FranceMap (geo-anchored MapLibre marker). */}
      {isHemicycle && (
        <HemicycleSheet
          circoData={props.circoData}
          palette={props.palette}
          electionLabel={props.electionLabel}
          round={selected.round}
        />
      )}

      <MobileDetailSheet
        electionData={props.electionData}
        communeData={props.communeData}
        communeDataMissing={props.communeDataMissing}
        communeChoro={props.communeChoro}
        circoData={props.circoData}
        circoChoro={props.circoChoro}
        palette={props.palette}
      />

      <ElectionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <TerritoryNavigator
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        electionData={props.electionData}
        circoData={props.circoData}
      />
    </div>
  )
}
