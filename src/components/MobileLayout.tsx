import { useState } from 'react'
import { useElectionStore, useIsOverview } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { MobileDetailSheet } from './MobileDetailSheet'
import { AffichageSheet } from './AffichageSheet'
import { HemicycleSheet } from './HemicycleSheet'
import { ElectionPicker } from './ElectionPicker'
import { TerritoryNavigator } from './TerritoryNavigator'
import { TimelineStrip } from './TimelineStrip'
import { LayersMenu } from './LayersMenu'
import { TerritorySearchBar } from './TerritorySearchBar'
import { OverseasButton } from './OverseasButton'
import { OverseasOverlay } from './OverseasOverlay'
import { ABOVE_SNIPPET, CHIP_ROW, TOP_RAIL } from '../utils/mobileChrome'
import { MOBILE_BUTTON_GAP, MOBILE_BUTTON_LEFT } from '../utils/orbitGeometry'
import { useOverseasDiscs } from '../utils/overseasDiscs'
import type { LayoutProps } from './layoutProps'

/**
 * Mobile-first shell (R3, then M1). Full-bleed map with TWO floating rails and
 * no header band:
 *   top-left   the search magnifier (geo axis), then FranceMap's back button
 *   top-right  the layers menu (découpage), then FranceMap's zoom + theme stack
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
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const setFocusedTerritory = useElectionStore((s) => s.setFocusedTerritory)
  const setFlyBounds = useElectionStore((s) => s.setFlyBounds)
  const isHemicycle = granularity === 'hemicycle'
  const isOverview = useIsOverview()
  const zoomedAway = useElectionStore((s) => s.zoomedAway)
  // Same gate as the desktop orbit AND as the national snippet the button sits
  // on top of: an overview device, gone the moment you zoom or settle a
  // territory.
  const showOverseas = isOverview && !zoomedAway && !isHemicycle
  const away = zoomedAway || !isOverview
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [overseasOpen, setOverseasOpen] = useState(false)

  // The colour model for the overseas button. Cheap — no geometry is fetched
  // here; only the overlay, once opened, pays for the silhouettes.
  const discs = useOverseasDiscs({
    electionData: props.electionData,
    circoChoro: props.circoChoro,
    circoData: props.circoData,
    fullData: props.fullData,
    palette: props.palette,
  })

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
        <Hemicycle
          circoData={props.circoData}
          palette={props.palette}
          round={selected.round}
          mobile
        />
      )}

      {props.isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-50 dark:bg-slate-900">
          <p className="text-sm text-gray-500 dark:text-gray-400">Chargement des données…</p>
        </div>
      )}

      {/* Geo axis (M6) — back to a FULL-WIDTH search bar, reversing M1's
          magnifier. lucas: "I would like to go back to a search bar that takes
          the full width of the screen". It costs the ~55px M1 reclaimed, but
          collapsing the eleven overseas discs into one button more than paid for
          it — and the bar gets its second job back with it: settled, it names the
          territory and offers a ✕ to clear it. */}
      <TerritorySearchBar
        variant="floating"
        onOpen={() => setSearchOpen(true)}
        electionData={props.electionData}
        communeData={props.communeData}
        circoData={props.circoData}
        style={{ top: TOP_RAIL }}
        className="absolute inset-x-3 z-40"
      />

      {/* Second row, Google-Maps style (lucas: "put the layering option below the
          search bar on the right side, a bit like in google maps again"): back on
          the left when there is somewhere to go back FROM, layers on the right.
          Both FLOAT over the map — only the search bar is reserved out of it,
          which is what makes a two-row top affordable at all. */}
      {away && (
        <button
          type="button"
          aria-label="Revenir à la vue d'ensemble"
          onClick={() => {
            // Through the store, not the map: `flyBounds: 'overview'` re-fits
            // with the layout-aware padding, which is what lets this chip live
            // in the layout instead of inside FranceMap, where it used to be.
            setFocusedTerritory(null)
            setClickedCommune(null)
            setFlyBounds('overview')
          }}
          style={{ top: CHIP_ROW }}
          className="absolute left-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-lg ring-1 ring-black/5 backdrop-blur-sm active:bg-gray-100 dark:bg-slate-900/90 dark:text-gray-200 dark:ring-white/10 dark:active:bg-slate-800"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}

      <LayersMenu
        value={granularity}
        onChange={setGranularity}
        available={props.availableGranularities}
        placement="left-down"
        // Dark mode lives in here on mobile (M6): removing the zoom buttons took
        // the theme toggle down with them — they were one stack — and this menu
        // already answers "how is the map drawn".
        showTheme
        style={{ top: CHIP_ROW }}
        // z-50: ABOVE the detail sheet (z-40). The menu opens downward into the
        // sheet's band, so at the sheet's level or below it opens invisibly —
        // the button lights up and nothing appears. The full-screen takeovers
        // (navigator, election picker) sit at z-[60] so THEY still win — at z-40
        // this button used to float on top of them.
        className="absolute right-3 z-50"
      />

      {/* Time axis — pinned to the bottom (thumb zone), mirroring the desktop
          strip's floating-card treatment. */}
      <TimelineStrip
        compact
        onOpenPicker={() => setPickerOpen(true)}
        className="absolute inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-xl bg-white/95 px-3 py-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-900/95 dark:ring-white/10"
      />

      {/* Overseas, phone (M6) — ONE button standing for all eleven territories,
          bottom-left of the map and sitting on the national snippet, exactly
          where lucas put it in his sketch. It replaces the two flat disc rows of
          M4/M5 (see orbitGeometry's mobile section for why they went), and its
          ring is what carries their information across.
          Faded rather than unmounted so the aggregate isn't recomputed on every
          zoom; `pointer-events-none` while faded, or an invisible button keeps
          eating taps over the map. */}
      <div
        className="absolute z-30 transition-opacity duration-300"
        style={{
          left: MOBILE_BUTTON_LEFT,
          bottom: `calc(${ABOVE_SNIPPET} + ${MOBILE_BUTTON_GAP}px)`,
          opacity: showOverseas ? 1 : 0,
          pointerEvents: showOverseas ? 'auto' : 'none',
        }}
      >
        <OverseasButton discs={discs} onOpen={() => setOverseasOpen(true)} />
      </div>

      {/* Mounted only while open, so its two GeoJSON fetches happen on the first
          tap rather than on every page load. */}
      {overseasOpen && <OverseasOverlay discs={discs} onClose={() => setOverseasOpen(false)} />}

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
