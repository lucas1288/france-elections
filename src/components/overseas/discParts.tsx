import { useMemo } from 'react'
import * as d3geo from 'd3-geo'
import type { Feature, MultiPolygon, Polygon } from 'geojson'

/**
 * The three pieces every overseas DISC is made of, shared by the surfaces that
 * draw them: the desktop orbit, the mobile aggregate button and the mobile
 * overlay ring. They were private to `OverseasOrbit` until M6 gave the phone its
 * own two surfaces — three copies of a ring that has this much geometry in it is
 * exactly the drift the R2 unification exists to prevent.
 */

export interface CommuneProperties {
  code: string
  nom: string
}
export type GeoFeature = Feature<Polygon | MultiPolygon, CommuneProperties>
export interface SilhouettePart {
  feature: GeoFeature
  color: string
}

/**
 * The disc's border, drawn as one arc per segment — a stacked bar wrapped into a
 * ring. lucas: "reflect the political balance … 4/7th of the circle in red, 3/7th
 * in blue".
 *
 * What one segment MEANS depends on the caller, and both readings are live:
 * on a territory disc it is one CIRCONSCRIPTION, on the mobile aggregate button
 * it is one TERRITORY. Either way the rule is the same — equal arcs, sorted so
 * identical colours land contiguous, because interleaved arcs read as noise
 * rather than as a balance.
 *
 * `broken` widens the gaps, which is how Français de l'étranger is marked: it has
 * no bearing, so it differs by edge style rather than by size.
 */
export function SegmentedRing({
  colors,
  broken,
  d: D,
}: {
  colors: string[]
  broken: boolean
  d: number
}) {
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
export function Silhouette({ parts, d: D }: { parts: SilhouettePart[]; d: number }) {
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

/**
 * Français de l'étranger has no silhouette — a globe stands in. M6 gives it a
 * second job: it is also the glyph of the mobile button that stands for ALL
 * eleven territories, which works because "everywhere that isn't the mainland"
 * is exactly what a globe says.
 */
export function GlobeGlyph({ fill, d: D }: { fill: string; d: number }) {
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
