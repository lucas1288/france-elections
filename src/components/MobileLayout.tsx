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
import { SearchSheet } from './SearchSheet'
import type { LayoutProps } from './layoutProps'

const GRAN_LABEL: Record<Granularity, string> = {
  commune: 'Communes',
  circonscription: 'Circos',
  hemicycle: 'Hémi.',
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
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
 * Mobile-first shell (Phase 1): full-bleed map + floating top bar (election
 * chip · round toggle · search) + bottom manifest-driven granularity switcher.
 * Election picker and search are wired in later phases (stubs for now).
 */
export function MobileLayout(props: LayoutProps) {
  const { selected, setSelected, granularity, setGranularity } = useElectionStore()
  const colorMode = useElectionStore((s) => s.colorMode)
  const isHemicycle = granularity === 'hemicycle'
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const rounds = Array.from({ length: props.rounds }, (_, i) => i + 1)

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

      {/* Top bar — data axis: election chip · round toggle · search */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] bg-white/90 backdrop-blur-sm border-b border-gray-200/70 dark:bg-slate-900/90 dark:border-slate-700/70">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex-1 min-w-0 flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 dark:bg-slate-800 dark:text-gray-200"
        >
          <span className="truncate">{props.electionLabel || 'Élection'}</span>
          <span className="ml-auto text-gray-400 shrink-0 dark:text-gray-500">
            <ChevronDown />
          </span>
        </button>

        {props.rounds > 1 && (
          <div className="flex shrink-0 rounded-lg bg-gray-100 p-0.5 text-sm dark:bg-slate-800">
            {rounds.map((r) => {
              const active = selected.round === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelected({ ...selected, round: r })}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    active ? 'bg-blue-600 text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}
                >
                  T{r}
                </button>
              )
            })}
          </div>
        )}

        <button
          type="button"
          aria-label="Rechercher"
          onClick={() => setSearchOpen(true)}
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300"
        >
          <SearchIcon />
        </button>
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
        circoData={props.circoData}
        palette={props.palette}
      />

      <ElectionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
