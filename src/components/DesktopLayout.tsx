import { useElectionStore, useIsOverview } from '../store/electionStore'
import { FranceMap } from './FranceMap'
import { Hemicycle } from './Hemicycle'
import { useState } from 'react'
import { ElectionPicker } from './ElectionPicker'
import { LayersMenu } from './LayersMenu'
import { TerritoryNavigator } from './TerritoryNavigator'
import { TerritorySearchBar } from './TerritorySearchBar'
import { TimelineStrip } from './TimelineStrip'
import { ResultsPanel } from './ResultsPanel'
import { OverseasOrbit } from './OverseasOrbit'
import { Wordmark } from './Wordmark'
import type { LayoutProps } from './layoutProps'

/**
 * Desktop shell. Since redesign R3 there is NO header container (lucas: kill it,
 * "search becomes a floating bar, still on top but more centered, like north of
 * the map"): the map runs the full height of the shell and every control floats
 * over it —
 *   top-left    the wordmark, which doubles as the home control
 *   top-centre  the search pill (geo axis)
 *   top-right   utilities (zoom + theme), rendered by FranceMap since they drive
 *               the camera; the abroad panel sits under them
 *   bottom-left the layers menu (découpage)
 *   bottom-centre the timeline strip (time axis)
 * Grouping the two AXIS controls along the bottom edge and identity/search/utils
 * along the top is what keeps five floating elements legible as two rows rather
 * than as scattered buttons.
 */
export function DesktopLayout(props: LayoutProps) {
  const { selected, granularity, setGranularity } = useElectionStore()
  const isOverview = useIsOverview()
  const colorMode = useElectionStore((s) => s.colorMode)
  const zoomedAway = useElectionStore((s) => s.zoomedAway)
  // The orbit is an OVERVIEW device: it shows only when nothing is settled and
  // the map is at its baseline zoom.
  const showOrbit = isOverview && !zoomedAway
  const [pickerOpen, setPickerOpen] = useState(false)
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const isHemicycle = granularity === 'hemicycle'

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-slate-950">
      {/* Main content — full height now that the header is gone */}
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

          {/* ── Floating chrome (R3) ─────────────────────────────────────── */}

          {/* Identity + home, top-left. Above the hemicycle cover so you can
              always get back out of it. */}
          <Wordmark className="absolute left-4 top-4 z-30" />

          {/* Geo axis, top-centre — "north of the map". Narrower than the old
              top-bar field so it reads as a control floating over the canvas
              rather than a docked input. */}
          <TerritorySearchBar
            onOpen={() => setNavigatorOpen(true)}
            electionData={props.electionData}
            communeData={props.communeData}
            circoData={props.circoData}
            communeDataMissing={props.communeDataMissing}
            className="absolute left-1/2 top-4 z-30 w-80 -translate-x-1/2 bg-white/90 shadow-lg ring-1 ring-black/5 backdrop-blur-sm hover:bg-white dark:bg-slate-900/90 dark:ring-white/10 dark:hover:bg-slate-900"
          />

          {/* Découpage, bottom-left — paired with the timeline strip along the
              bottom edge: both answer "what am I looking at", one in space, one
              in time. Hidden in the hemicycle view, which has no découpage of
              its own to switch (you leave it via this menu, so it stays
              reachable — hence z-30, above the cover). */}
          <LayersMenu
            value={granularity}
            onChange={setGranularity}
            available={props.availableGranularities}
            className="absolute bottom-4 left-4 z-30"
          />

          {/* Timeline scrubber (two-axis P4) — adjacent moves on the time axis;
              floats bottom-centre, above the hemicycle cover (z-20) so the time
              axis stays reachable in every view. */}
          <TimelineStrip
            onOpenPicker={() => setPickerOpen(true)}
            className="absolute bottom-4 left-1/2 z-30 w-[24rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl bg-white/95 px-4 pb-1.5 pt-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-900/95 dark:ring-white/10"
          />
          {/* Overseas ORBIT (R4) — one control replacing the old left-hand
              insets column AND the top-right abroad panel. It exists only at
              the overview: the moment you zoom in or settle a territory you're
              working on the mainland, and the ring would just be in the way. */}
          {/* GOTCHA: this wrapper spans the WHOLE map area, so it must stay
              `pointer-events: none` — with `auto` it swallowed every wheel event
              and the map could not be zoomed at all. Interactivity is granted
              per-DISC inside (via `interactive`), never on the full-area layer.
              Hidden as soon as the user zooms AT ALL (`zoomedAway`), not at the
              coarser z8 `mapZoomedIn` threshold: the ring is an overview device,
              and leaving it up during a zoom is exactly when it's in the way. */}
          {!isHemicycle && (
            <div
              className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
              style={{ opacity: showOrbit ? 1 : 0 }}
            >
              <OverseasOrbit
                electionData={props.electionData}
                circoChoro={props.circoChoro}
                circoData={props.circoData}
                fullData={props.fullData}
                palette={props.palette}
                interactive={showOrbit}
              />
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
