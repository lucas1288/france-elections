import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as d3geo from 'd3-geo'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import { computeNationalTotals } from '../utils/nationalResults'
import { getCandidateColor, partyByName } from '../utils/partyColors'
import { territoryColor, partyCodeSet } from '../utils/territoryColor'
import { abstentionShade, decidedAtR1Shade } from '../utils/gradient'
import { dataUrl } from '../utils/dataUrl'
import {
  ABROAD_SLOT,
  ALL_SLOT_CODES,
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
 */

interface CommuneProperties {
  code: string
  nom: string
}
type GeoFeature = Feature<Polygon | MultiPolygon, CommuneProperties>
type CircoEntry = ChoroplethData['communes'][number]
interface SilhouettePart {
  feature: GeoFeature
  color: string
}

const ABROAD = '99'

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
  const [features, setFeatures] = useState<Map<string, GeoFeature>>(new Map())
  const [circoShapes, setCircoShapes] = useState<Map<string, GeoFeature>>(new Map())
  const [hovered, setHovered] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [arc, setArc] = useState<Arc | null>(null)

  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const settleDept = useElectionStore((s) => s.settleDept)
  const granularity = useElectionStore((s) => s.granularity)
  const colorMode = useElectionStore((s) => s.colorMode)
  const isDark = useElectionStore((s) => s.isDark)

  const neutral = isDark ? '#334155' : '#e2e8f0'
  const isCirco = granularity === 'circonscription'

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

  // Same source the old insets column used — one silhouette per territory.
  useEffect(() => {
    fetch(dataUrl('/data/geo/overseas.geojson'))
      .then((r) => r.json())
      .then((fc) => {
        const m = new Map<string, GeoFeature>()
        for (const f of fc.features) m.set(f.properties.code, f)
        setFeatures(m)
      })
      .catch(console.error)
  }, [])

  // Per-CIRCO outlines (generated by scripts/build-overseas-circo-shapes.mjs)
  // so a territory's silhouette can be split by circo rather than painted one
  // winner's colour. DOM only — the COM circos have no polygons in the tileset,
  // so Polynésie and Nouvelle-Calédonie fall back to the whole-territory shape.
  useEffect(() => {
    fetch(dataUrl('/data/geo/overseas-circos.geojson'))
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (!fc) return
        const m = new Map<string, GeoFeature>()
        for (const f of fc.features) m.set(f.properties.code, f)
        setCircoShapes(m)
      })
      .catch(() => {
        /* optional enrichment — the dept outline still renders without it */
      })
  }, [])

  // Per-territory colour, mode-aware — the same shared function the map and the
  // dept layer use, so every surface agrees.
  const fillByCode = useMemo(() => {
    const m = new Map<string, string>()
    if (!electionData) return m
    const national = computeNationalTotals(electionData)
    for (const c of electionData.communes) {
      m.set(c.inseeCode, territoryColor(c, colorMode, palette, national, undefined, neutral))
    }
    return m
  }, [electionData, palette, colorMode, neutral])

  // Territories the selected force leads (party view) — highlighted ring.
  const wonByCode = useMemo(() => {
    const s = new Set<string>()
    if (!electionData || colorMode.kind !== 'party') return s
    const parties = partyByName(electionData.candidates)
    const codes = partyCodeSet(colorMode.party, palette)
    for (const c of electionData.communes) {
      if (codes.has(parties.get(c.leadingCandidate) ?? '')) s.add(c.inseeCode)
    }
    return s
  }, [electionData, palette, colorMode])

  /**
   * Circonscriptions grouped under their territory. Code shapes make this
   * unambiguous: métropole is a 2-char dept + 2 digits (`3401`, `2A01`), the
   * overseas ones are a 3-char dept + 2 digits (`97401`), and the abroad circos
   * are `9901`–`9911`. So length 5 ⇒ overseas, and 4-with-`99` ⇒ abroad.
   */
  const circosByTerritory = useMemo(() => {
    const m = new Map<string, CircoEntry[]>()
    for (const code of ALL_SLOT_CODES) m.set(code, [])
    for (const c of circoChoro?.communes ?? []) {
      const code = c.inseeCode
      if (code.length === 4 && code.startsWith(ABROAD)) m.get(ABROAD)?.push(c)
      else if (code.length === 5) m.get(code.slice(0, 3))?.push(c)
    }
    for (const list of m.values()) list.sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
    return m
  }, [circoChoro])

  const circoNames = useMemo(
    () => new Map((circoData?.communes ?? []).map((c) => [c.inseeCode, c.name])),
    [circoData],
  )
  const national = useMemo(
    () => (electionData ? computeNationalTotals(electionData) : null),
    [electionData],
  )
  const fullByCode = useMemo(
    () => new Map((fullData?.communes ?? []).map((e) => [e.inseeCode, e])),
    [fullData],
  )
  const circoParties = useMemo(
    () => partyByName(circoChoro?.candidates ?? electionData?.candidates ?? []),
    [circoChoro, electionData],
  )

  /** Palette key order is authored left→right, same basis the hemicycle uses. */
  const spectrum = useMemo(() => (palette?.parties ? Object.keys(palette.parties) : []), [palette])
  const spIdx = (party?: string) => {
    const i = party ? spectrum.indexOf(party) : -1
    return i < 0 ? spectrum.length : i
  }

  /** Colour for one circo, mirroring the map's mode handling. */
  const circoColor = (c: CircoEntry) => {
    if (colorMode.kind === 'leader') {
      const color = getCandidateColor(
        c.leadingCandidate,
        0,
        circoParties.get(c.leadingCandidate),
        palette,
      )
      return c.decidedAtR1 ? decidedAtR1Shade(color, neutral) : color
    }
    if (colorMode.kind === 'abstention')
      return c.abstention != null ? abstentionShade(c.abstention) : neutral
    const entry = fullByCode.get(c.inseeCode)
    return entry ? territoryColor(entry, colorMode, palette, national, undefined, neutral) : neutral
  }

  /**
   * Ring segments for a territory — lucas: "reflect the political balance of the
   * circonscriptions on the colored border… 4/7th of the circle in red, 3/7th in
   * blue". One equal arc per circo, SORTED BY POLITICAL SPECTRUM so identical
   * colours end up contiguous (interleaved arcs read as noise, not as a balance).
   * Falls back to the territory's own aggregate colour when there's no circo data.
   */
  const segmentsFor = (code: string): string[] => {
    const list = circosByTerritory.get(code) ?? []
    if (!list.length) return [fillByCode.get(code) ?? neutral]
    return [...list]
      .sort(
        (a, b) =>
          spIdx(circoParties.get(a.leadingCandidate)) -
            spIdx(circoParties.get(b.leadingCandidate)) || a.inseeCode.localeCompare(b.inseeCode),
      )
      .map(circoColor)
  }

  /**
   * What to draw inside each disc: one path per CIRCO when we have per-circo
   * geometry AND the territory has more than one (lucas: the territory itself
   * should show its internal split, before you zoom in), otherwise the single
   * whole-territory outline. The projection is fitted to whatever is drawn, so
   * either way the shape fills the disc identically.
   */
  const silhouettes = useMemo(() => {
    const m = new Map<string, SilhouettePart[]>()
    for (const code of ALL_SLOT_CODES) {
      const circos = circosByTerritory.get(code) ?? []
      if (circos.length > 1) {
        const parts = circos
          .map((c) => ({ feature: circoShapes.get(c.inseeCode), color: circoColor(c) }))
          .filter((p): p is SilhouettePart => !!p.feature)
        // All-or-nothing: a partial split would silently misrepresent the
        // territory as smaller than it is.
        if (parts.length === circos.length) {
          m.set(code, parts)
          continue
        }
      }
      const whole = features.get(code)
      if (whole) m.set(code, [{ feature: whole, color: fillByCode.get(code) ?? neutral }])
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    circosByTerritory,
    circoShapes,
    features,
    fillByCode,
    neutral,
    colorMode,
    palette,
    fullByCode,
  ])

  const select = (code: string) => {
    // `settleDept`, not `setFocusedTerritory`: every overseas territory —
    // including the collectivités (St-Pierre, St-Martin, Wallis, Polynésie,
    // Nouvelle-Calédonie) — has a full DÉPARTEMENT-level entry in the data, so
    // the results panel resolves it directly. Français de l'étranger's
    // equivalent is the '99' aggregate, which isn't a real dept to fly to.
    if (code === ABROAD) setClickedCommune(ABROAD)
    else settleDept(code)
  }

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
    const fill = fillByCode.get(code) ?? neutral
    const selected = abroad
      ? clickedCommune === ABROAD || !!clickedCommune?.startsWith('99')
      : focusedTerritory === code || clickedCommune === code
    const won = wonByCode.has(code)
    const circos = circosByTerritory.get(code) ?? []
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
        style={place}
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
          <SegmentedRing colors={segmentsFor(code)} broken={abroad} d={d} />
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
              const label = abroad ? (ABROAD_ZONES[c.inseeCode] ?? who) : who
              const row = (
                <>
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: circoColor(c) }}
                  />
                  <span className="w-4 shrink-0 text-right text-gray-400 dark:text-gray-500">
                    {num}
                  </span>
                  <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{label}</span>
                </>
              )
              const cls = `flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs ${
                isSel ? 'bg-gray-100 dark:bg-slate-800' : ''
              }`
              // Circo tab: rows are selectable, so the ring doubles as a
              // circo picker for the overseas territories too.
              return isCirco ? (
                <button
                  key={c.inseeCode}
                  type="button"
                  onClick={() => setClickedCommune(c.inseeCode)}
                  title={`${circoNames.get(c.inseeCode) ?? ''} — ${who}`}
                  className={`${cls} transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/60`}
                >
                  {row}
                </button>
              ) : (
                <div
                  key={c.inseeCode}
                  title={`${circoNames.get(c.inseeCode) ?? ''} — ${who}`}
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

/**
 * The disc's border, drawn as one arc per circonscription — a stacked bar
 * wrapped into a ring. `broken` adds a wider gap for Français de l'étranger,
 * which has no bearing and so is marked by a broken edge rather than by size.
 */
function SegmentedRing({ colors, broken, d: D }: { colors: string[]; broken: boolean; d: number }) {
  // Stroke and gaps scale with the disc so a small disc doesn't read as a thick
  // ring and a large one as a hairline.
  const W = Math.max(2, D * 0.04)
  const R = (D - W) / 2
  const C = 2 * Math.PI * R
  // A single solid arc can't show a gap without looking like a rendering bug, so
  // gaps only appear once there is more than one segment to separate — except
  // for FE, which needs its broken edge even when one force swept all 11 circos.
  const list: string[] = broken && colors.length === 1 ? Array(8).fill(colors[0]) : colors
  const m = Math.max(1, list.length)
  const s = C / m
  const gap = broken ? D * 0.062 : m > 1 ? D * 0.039 : 0

  return (
    <svg width={D} height={D} className="absolute inset-0" aria-hidden="true">
      <g transform={`rotate(-90 ${D / 2} ${D / 2})`}>
        {list.map((color, i) => (
          <circle
            key={i}
            cx={D / 2}
            cy={D / 2}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth={W}
            strokeDasharray={`${Math.max(0.5, s - gap)} ${C - Math.max(0.5, s - gap)}`}
            strokeDashoffset={-i * s - (m > 1 || broken ? gap / 2 : 0)}
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * The territory drawn inside the disc — one path per part. With per-circo
 * geometry that means the shape is a mini-choropleth of its circonscriptions;
 * with only the whole-territory outline it's a single filled shape. The
 * projection is fitted to ALL parts together so the composition is the same
 * either way.
 *
 * Scattered archipelagos (Polynésie, Wallis) still project to specks — the
 * segmented BORDER is what carries their colour, so the shape can stay honest
 * rather than being inflated to fake a reading.
 */
function Silhouette({ parts, d: D }: { parts: SilhouettePart[]; d: number }) {
  const paths = useMemo(() => {
    if (!parts.length) return []
    const pad = D * 0.23
    const projection = d3geo.geoMercator().fitExtent(
      [
        [pad, pad],
        [D - pad, D - pad],
      ],
      { type: 'FeatureCollection', features: parts.map((p) => p.feature) },
    )
    const path = d3geo.geoPath().projection(projection)
    return parts.map((p) => ({ d: path(p.feature), color: p.color }))
  }, [parts, D])

  if (!paths.length) return null
  return (
    <svg width={D} height={D} className="relative" style={{ display: 'block' }} aria-hidden="true">
      {paths.map(
        (p, i) =>
          p.d && (
            <path
              key={i}
              d={p.d}
              fill={p.color}
              stroke={p.color}
              strokeWidth={0.6}
              strokeLinejoin="round"
            />
          ),
      )}
    </svg>
  )
}

/** Français de l'étranger has no silhouette — a globe stands in. */
function GlobeGlyph({ fill, d: D }: { fill: string; d: number }) {
  return (
    <svg width={D} height={D} className="relative" style={{ display: 'block' }} aria-hidden="true">
      <g
        fill="none"
        stroke={fill}
        strokeWidth={D * 0.025}
        transform={`translate(${D / 2} ${D / 2}) scale(${D / 64})`}
      >
        <circle r={16} />
        <ellipse rx={6.5} ry={16} />
        <line x1={-16} y1={0} x2={16} y2={0} />
        <line x1={-13.8} y1={-8} x2={13.8} y2={-8} />
        <line x1={-13.8} y1={8} x2={13.8} y2={8} />
      </g>
    </svg>
  )
}
