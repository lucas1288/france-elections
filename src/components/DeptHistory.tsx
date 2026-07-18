import { useMemo } from 'react'
import { useElectionStore } from '../store/electionStore'
import { useDeptHistory, useFamilies } from '../hooks/useElectionData'

interface Props {
  /** Dept code, or 'FR' for the national series (idle views). */
  deptCode: string
}

const TYPE_LABELS_PLURAL: Record<string, string> = {
  presidential: 'Présidentielles',
  legislative: 'Législatives',
  european: 'Européennes',
}

function fmt(n: number) {
  return n.toFixed(1).replace('.', ',')
}

// Combined chart geometry (viewBox units; rendered responsive via w-full).
const W = 260
const H = 118
const PLOT = { left: 26, right: 252, top: 8, bottom: 96 }
const YEAR_Y = 112

/**
 * "Historique" insight section (two-axis P5, bloc-level v2 — lucas's call:
 * blocs for BOTH election types, the level whose series stay continuous across
 * alliance years like NUPES/NFP). One combined multi-line chart on a SHARED
 * 0-based scale so magnitude differences read true, + legend rows with the
 * latest value, + a participation sparkline on a fixed 0–100 scale. Series
 * cover every ingested election of the CURRENT type (the timeline strip's
 * lane), round 1 only (the comparable round). Data: history/depts.json
 * (family-level, generated) aggregated to blocs client-side via families.json.
 * Renders for a settled département — or nationally with deptCode='FR' in the
 * idle views. Hidden until both files load or when <2 elections of the type.
 */
export function DeptHistory({ deptCode }: Props) {
  const selectedType = useElectionStore((s) => s.selected.type)
  const { data: history } = useDeptHistory()
  const { data: registry } = useFamilies()

  const series = useMemo(() => {
    const dept = history?.depts[deptCode]
    if (!dept || !registry) return null
    const points = dept.series.filter((p) => p.t === selectedType && p.r === 1)
    if (points.length < 2) return null
    const years = points.map((p) => p.y)

    // Family scores → bloc scores per point.
    const blocOfFam = new Map(
      Object.entries(registry.families).map(([id, def]) => [id, def.bloc]),
    )
    const blocValues = new Map<string, number[]>() // blocId → value per point
    points.forEach((p, i) => {
      for (const [famId, v] of Object.entries(p.fam)) {
        const bloc = blocOfFam.get(famId)
        if (!bloc) continue
        let arr = blocValues.get(bloc)
        if (!arr) blocValues.set(bloc, (arr = new Array(points.length).fill(0)))
        arr[i] = Math.round((arr[i] + v) * 10) / 10
      }
    })

    const rows = [...blocValues.entries()]
      .map(([id, values]) => ({
        id,
        def: registry.blocs[id],
        values,
        latest: values[values.length - 1],
      }))
      .filter((r) => r.def && r.values.some((v) => v > 0))
      .sort((a, b) => b.latest - a.latest)

    return { years, rows, participation: points.map((p) => p.part) }
  }, [history, registry, deptCode, selectedType])

  if (!series) return null

  const { years, rows } = series
  const minYear = years[0]
  const maxYear = years[years.length - 1]
  const x = (y: number) =>
    maxYear === minYear
      ? (PLOT.left + PLOT.right) / 2
      : PLOT.left + ((y - minYear) / (maxYear - minYear)) * (PLOT.right - PLOT.left)

  // Shared 0-based scale with a little headroom, snapped to a 5% step.
  const peak = Math.max(...rows.flatMap((r) => r.values), 10)
  const scaleMax = Math.ceil((peak * 1.12) / 5) * 5
  const yPos = (v: number) => PLOT.bottom - (v / scaleMax) * (PLOT.bottom - PLOT.top)
  const gridSteps = [25, 50, 75].filter((g) => g < scaleMax)

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1.5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Historique — {TYPE_LABELS_PLURAL[selectedType] ?? selectedType}
        </p>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          1er tour · {minYear}–{maxYear}
        </span>
      </div>

      {/* Combined bloc chart — one shared 0-based scale */}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-gray-300 dark:text-slate-600" aria-hidden="true">
        {/* baseline + gridlines with % labels */}
        <line x1={PLOT.left} y1={PLOT.bottom} x2={PLOT.right} y2={PLOT.bottom} stroke="currentColor" strokeWidth="1" />
        {gridSteps.map((g) => (
          <g key={g}>
            <line
              x1={PLOT.left} y1={yPos(g)} x2={PLOT.right} y2={yPos(g)}
              stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3"
            />
            <text x={PLOT.left - 3} y={yPos(g) + 2.5} textAnchor="end" fontSize="7" fill="currentColor">
              {g}%
            </text>
          </g>
        ))}
        {/* year ticks */}
        {years.map((y) => (
          <text
            key={y} x={x(y)} y={YEAR_Y} fontSize="8" textAnchor="middle"
            className="fill-gray-400 dark:fill-gray-500"
          >
            {y}
          </text>
        ))}
        {/* bloc lines, drawn lowest-last so leaders sit on top */}
        {[...rows].reverse().map((r) => {
          const pts = years.map((y, i) => `${x(y).toFixed(1)},${yPos(r.values[i]).toFixed(1)}`).join(' ')
          return (
            <g key={r.id}>
              <polyline
                points={pts} fill="none" stroke={r.def.color} strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              />
              {years.map((y, i) => (
                <circle
                  key={y} cx={x(y)} cy={yPos(r.values[i])}
                  r={i === years.length - 1 ? 2.8 : 1.8} fill={r.def.color}
                />
              ))}
            </g>
          )
        })}
      </svg>

      {/* Legend: bloc, latest value */}
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: r.def.color }} />
          <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">
            {r.def.label}
          </span>
          <span className="w-11 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
            {fmt(r.latest)}%
          </span>
        </div>
      ))}

      {/* Participation — own row, fixed 0–100 scale so it reads absolutely */}
      <div className="flex items-center gap-2 pt-1">
        <span className="w-2 h-2 rounded-sm shrink-0 bg-gray-300 dark:bg-slate-600" />
        <span className="flex-1 min-w-0 text-sm text-gray-500 dark:text-gray-400 truncate">
          Participation
        </span>
        <svg width="96" height="22" viewBox="0 0 96 22" className="shrink-0" aria-hidden="true">
          <polyline
            points={years
              .map((y, i) => {
                const px = maxYear === minYear ? 48 : 3 + ((y - minYear) / (maxYear - minYear)) * 90
                const py = 19 - (series.participation[i] / 100) * 16
                return `${px.toFixed(1)},${py.toFixed(1)}`
              })
              .join(' ')}
            fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        <span className="w-11 shrink-0 text-right text-sm font-semibold text-gray-500 dark:text-gray-400">
          {fmt(series.participation[series.participation.length - 1])}%
        </span>
      </div>

      <p className="pt-0.5 text-[10px] leading-relaxed text-gray-400 dark:text-gray-500">
        Scores par bloc politique, en % des exprimés au 1er tour.
      </p>
    </div>
  )
}
