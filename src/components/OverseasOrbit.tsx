import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import { GlobeGlyph, SegmentedRing, Silhouette } from './overseas/discParts'
import {
  ABROAD,
  useOverseasDiscs,
  useOverseasShapes,
  useSelectOverseas,
  useSilhouettes,
} from '../utils/overseasDiscs'
import {
  ABROAD_SLOT,
  ARC_SLOTS,
  FE_RIGHT,
  FE_TOP,
  orbitArc,
  slotPoint,
  type Arc,
  type ArcSlot,
} from '../utils/orbitGeometry'

/**
 * The overseas ORBIT (redesign R4) — lucas's design: every territory in its own
 * floating disc, arranged around métropole. The discs BRACKET the mainland like
 * parentheses — five curving down the left, five down the right — and Français
 * de l'étranger floats free in the top-right corner, since it has no location to
 * place it by (its ring is broken for the same reason).
 *
 * The point is the geometry: equal disc size for every territory is "equal
 * standing" made visible — lucas's principle of "equally representing all
 * territories (either continental france or overseas)".
 *
 * REPLACES both `OverseasInsets` (the desktop left-hand column) and `AbroadMap`
 * (the top-right world map) — one control where there were two, which is what
 * frees the map's corners for the R3 chrome.
 *
 * DESKTOP ONLY since M6. The phone briefly rendered this same component as two
 * flat rows (M4/M5); it now collapses the eleven territories into one button and
 * an overlay ring instead — see `OverseasButton` / `OverseasOverlay`. All three
 * surfaces share the colour model (`utils/overseasDiscs`) and the disc parts
 * (`overseas/discParts`), so they cannot disagree with each other or the map.
 */

/**
 * The 11 abroad circonscriptions by ZONE. The data's own `name` is boilerplate
 * ("Français établis hors de France – 3ème circonscription" ×11), so it says
 * nothing the number doesn't; these zone names — carried over from the retired
 * AbroadMap, where they only existed as comments on the dot coordinates — are
 * the one human-meaningful label available.
 */
const ABROAD_ZONES: Record<string, string> = {
  '9901': 'Amérique du Nord',
  '9902': 'Amérique latine',
  '9903': 'Europe du Nord',
  '9904': 'Benelux',
  '9905': 'Péninsule ibérique, Monaco',
  '9906': 'Suisse, Liechtenstein',
  '9907': 'Europe centrale, Balkans',
  '9908': 'Afrique du Nord, Proche-Orient',
  '9909': 'Afrique subsaharienne',
  '9910': 'Moyen-Orient, Asie centrale',
  '9911': 'Asie, Océanie',
}

interface Props {
  electionData: RoundData | undefined
  circoChoro: ChoroplethData | null
  circoData: RoundData | null
  /** Full per-territory data for the active granularity — feeds the gradient. */
  fullData: RoundData | null
  palette: Palette | null
  /**
   * Whether the discs accept clicks. The caller fades the whole ring out, but
   * `pointer-events: none` on an ancestor does NOT disarm a descendant that sets
   * `auto` — so the discs have to be disarmed here, or an invisible ring would
   * still swallow clicks over the map.
   */
  interactive: boolean
}

export function OverseasOrbit({
  electionData,
  circoChoro,
  circoData,
  fullData,
  palette,
  interactive,
}: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [arc, setArc] = useState<Arc | null>(null)

  const discs = useOverseasDiscs({ electionData, circoChoro, circoData, fullData, palette })
  const shapes = useOverseasShapes()
  const silhouettes = useSilhouettes(discs, shapes)
  const select = useSelectOverseas()

  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const isDark = useElectionStore((s) => s.isDark)

  // Measure the map area so the arc re-derives on resize, matching FranceMap's
  // own re-fit — that pairing is what keeps métropole inside the brackets.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setArc(orbitArc(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /**
   * One disc + its label + its hover panel. Shared by the ten arc slots and by
   * the free-floating Français de l'étranger disc, which differ only in where
   * they are placed and which way their panel opens.
   */
  const renderCell = (
    code: string,
    label: string,
    place: CSSProperties,
    panel: { above: boolean; open: 'right' | 'left' | 'center' },
    d: number,
  ) => {
    const abroad = code === ABROAD
    const fill = discs.fillByCode.get(code) ?? discs.neutral
    const selected = abroad
      ? clickedCommune === ABROAD || !!clickedCommune?.startsWith('99')
      : focusedTerritory === code || clickedCommune === code
    const won = discs.wonByCode.has(code)
    const circos = discs.circosByTerritory.get(code) ?? []
    return (
      <div
        key={code}
        className={`absolute flex flex-col items-center ${
          interactive ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        // Anchor the DISC, not the cell: labels wrap to one or two lines, so
        // cells differ in height and centring those puts the discs off the arc
        // (measured: up to 41px). The label hangs below and no longer affects
        // placement.
        //
        // A1 (backlog): each cell is its own STACKING CONTEXT — it sets
        // `transform` — so a `z-20` on the hover panel can't lift it above a
        // cell that comes later in the DOM; the panel was painted under its
        // neighbours. Raising the whole hovered CELL is what fixes it.
        style={{ ...place, zIndex: hovered === code ? 20 : undefined }}
        onMouseEnter={() => setHovered(code)}
        onMouseLeave={() => setHovered(null)}
      >
        <button
          type="button"
          onClick={() => select(code)}
          aria-label={label}
          className="group relative rounded-full transition-transform hover:scale-105"
          style={{ width: d, height: d }}
        >
          <span
            className="absolute inset-0 rounded-full bg-white shadow-lg dark:bg-slate-900"
            style={{
              outline: selected
                ? `2px solid ${isDark ? '#f8fafc' : '#0f172a'}`
                : won
                  ? `2px solid ${isDark ? '#e2e8f0' : '#334155'}`
                  : 'none',
              outlineOffset: 2,
            }}
          />
          {/* The border IS the result: one arc per circonscription, so the
                    ring reads as the territory's political balance at a glance
                    and still carries full-strength colour when the silhouette
                    projects to a speck (Polynésie, Wallis, N-Calédonie). */}
          <SegmentedRing colors={discs.segmentsFor(code)} broken={abroad} d={d} />
          {abroad ? (
            <GlobeGlyph fill={fill} d={d} />
          ) : (
            <Silhouette parts={silhouettes.get(code) ?? []} d={d} />
          )}
        </button>
        <span className="mt-1 w-full text-center text-[10px] leading-tight text-gray-600 drop-shadow-sm dark:text-gray-300">
          {label}
        </span>

        {/* Per-circonscription detail on hover. Lives INSIDE the cell so
                  moving the pointer into it doesn't fire the cell's mouseleave. */}
        {hovered === code && circos.length > 0 && (
          <div
            // The panel is far wider than its cell, so which way it opens
            // matters: centred on a column disc it would run off the
            // window edge. West opens inward (rightward), east inward
            // (leftward), FE leftward away from the util stack. Vertically
            // it flips up for the lower half of each column so it never
            // runs into the timeline strip.
            className={`absolute z-20 w-60 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10 ${
              panel.above ? 'bottom-full mb-1' : 'top-full mt-1'
            } ${
              panel.open === 'right'
                ? 'left-0'
                : panel.open === 'left'
                  ? 'right-0'
                  : 'left-1/2 -translate-x-1/2'
            }`}
          >
            <p className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {circos.length} circonscription{circos.length > 1 ? 's' : ''}
            </p>
            {circos.map((c) => {
              const num = parseInt(c.inseeCode.slice(abroad ? 2 : 3), 10)
              const isSel = clickedCommune === c.inseeCode
              const last = c.leadingCandidate.split(' ').pop() ?? c.leadingCandidate
              const who = last === last.toUpperCase() ? last : c.leadingCandidate
              // Abroad circos are identified by ZONE (their numbers mean
              // nothing to a reader); the others by who won them.
              const rowLabel = abroad ? (ABROAD_ZONES[c.inseeCode] ?? who) : who
              const row = (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: discs.circoColor(c) }}
                  />
                  <span className="w-4 shrink-0 text-right text-gray-400 dark:text-gray-500">
                    {num}
                  </span>
                  <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">
                    {rowLabel}
                  </span>
                </>
              )
              const cls = `flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
                isSel ? 'bg-gray-100 dark:bg-slate-800' : ''
              }`
              // Circo tab: rows are selectable, so the ring doubles as a
              // circo picker for the overseas territories too.
              return discs.isCirco ? (
                <button
                  key={c.inseeCode}
                  type="button"
                  onClick={() => setClickedCommune(c.inseeCode)}
                  title={`${discs.circoNames.get(c.inseeCode) ?? ''} — ${who}`}
                  className={`${cls} transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60`}
                >
                  {row}
                </button>
              ) : (
                <div
                  key={c.inseeCode}
                  title={`${discs.circoNames.get(c.inseeCode) ?? ''} — ${who}`}
                  className={cls}
                >
                  {row}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    // Full map area. Everything is positioned in PIXELS off a measured arc (see
    // orbitGeometry) rather than as percentages of this box — percentages would
    // make the curve's shape change with every window resize.
    <div
      ref={boxRef}
      className="pointer-events-none absolute inset-0 z-10"
      aria-label="Outre-mer et Français de l'étranger"
    >
      {arc &&
        ARC_SLOTS.map((slot: ArcSlot) => {
          const { x, y } = slotPoint(arc, slot)
          return renderCell(
            slot.code,
            slot.label,
            { left: x, top: y - arc.disc / 2, width: arc.cellW, transform: 'translateX(-50%)' },
            { above: slot.step > 0, open: slot.side === 'west' ? 'right' : 'left' },
            arc.disc,
          )
        })}

      {/* Français de l'étranger, out of the brackets and floated top-right
          (lucas). Offset far enough from the right edge to clear FranceMap's
          zoom/theme stack, which owns that corner. */}
      {arc &&
        renderCell(
          ABROAD_SLOT.code,
          ABROAD_SLOT.label,
          { right: FE_RIGHT, top: FE_TOP, width: arc.cellW },
          { above: false, open: 'left' },
          arc.disc,
        )}
    </div>
  )
}
