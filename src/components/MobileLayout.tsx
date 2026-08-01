import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { MobileDetailSheet } from './MobileDetailSheet'
import { AffichageSheet } from './AffichageSheet'
import { HemicycleSheet } from './HemicycleSheet'
import { ElectionPicker } from './ElectionPicker'
import { TerritoryNavigator } from './TerritoryNavigator'
import { TerritorySearchBar } from './TerritorySearchBar'
import { TimelineStrip } from './TimelineStrip'
import { LayersMenu } from './LayersMenu'
import { UNDER_HEADER } from '../utils/mobileChrome'
import type { LayoutProps } from './layoutProps'

/**
 * Mobile-first shell (redesign R3). Full-bleed map with:
 *   top        a ONE-row header — just the search pill (geo axis)
 *   top-right  the layers menu (découpage), under the search; FranceMap's
 *              zoom + theme stack sits below it
 *   bottom     the timeline strip (time axis), pinned
 *
 * lucas moved the strip from the top to the bottom: "consistent with the desktop
 * one and easier to navigate on mobile devices" — i.e. into the thumb zone. The
 * bottom band therefore belongs to the time axis, which is why the granularity
 * switcher that used to live there became the layers menu at top-right, and why
 * the detail sheet stops at `SHEET_BOTTOM` instead of the viewport floor: the
 * time axis stays reachable while you read a territory.
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

      {/* Top bar — ONE row now: the geo axis. The time axis moved to the bottom. */}
      <header className="absolute inset-x-0 top-0 z-20 px-3 pb-2 pt-[max(0.625rem,env(safe-area-inset-top))] bg-white/90 backdrop-blur-sm border-b border-gray-200/70 dark:bg-slate-900/90 dark:border-slate-700/70">
        <TerritorySearchBar
          onOpen={() => setSearchOpen(true)}
          electionData={props.electionData}
          communeData={props.communeData}
          circoData={props.circoData}
          className="w-full"
        />
      </header>

      {/* Découpage — top-right under the search, since the bottom band is the
          time axis now. Opens downward/left: at this corner the desktop's
          up-and-right popover would run off the screen edge. z-30 keeps the menu
          above the Hemicycle cover, which you leave through this same menu. */}
      <LayersMenu
        value={granularity}
        onChange={setGranularity}
        available={props.availableGranularities}
        placement="left-down"
        style={{ top: UNDER_HEADER }}
        // z-50: ABOVE the detail sheet (z-40). The menu opens downward into the
        // sheet's band, so at the sheet's level or below it opens invisibly —
        // the button lights up and nothing appears.
        className="absolute right-3 z-50"
      />

      {/* Time axis — pinned to the bottom (thumb zone), mirroring the desktop
          strip's floating-card treatment. */}
      <TimelineStrip
        onOpenPicker={() => setPickerOpen(true)}
        className="absolute inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-xl bg-white/95 px-3 pb-1.5 pt-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-900/95 dark:ring-white/10"
      />

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
