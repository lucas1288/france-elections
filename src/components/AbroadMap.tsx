import { useState, useEffect } from 'react'
import * as d3geo from 'd3-geo'
import * as topojson from 'topojson-client'
import type { ChoroplethData } from '../hooks/useElectionData'
import type { RoundData } from '../types/election'
import type { Granularity } from '../store/electionStore'
import { useElectionStore } from '../store/electionStore'
import { getCandidateColor } from '../utils/partyColors'

interface Props {
  electionData: RoundData | undefined
  circoChoro: ChoroplethData | null
  granularity: Granularity
}

const W = 220
const H = Math.round(W * 490 / 960) // ≈ 112 — Natural Earth 1 aspect ratio

// Module-level constants: projection is fully determined by W/H
const projection = d3geo.geoNaturalEarth1()
  .scale(153 * W / 960)
  .translate([W / 2, H / 2])
const pathFn = d3geo.geoPath(projection)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SPHERE_PATH = pathFn({ type: 'Sphere' } as any) ?? ''
const GRATICULE_PATH = pathFn(d3geo.geoGraticule().step([30, 30])()) ?? ''

// Approximate geographic centroids for each overseas French circo
const CIRCO_CENTERS: Record<string, [number, number]> = {
  '9901': [-100,  46],  // Amériques du Nord
  '9902': [ -55, -15],  // Amériques du Sud
  '9903': [  -5,  56],  // Europe du Nord (UK, Scandinavie…)
  '9904': [   5,  51],  // Bénélux
  '9905': [  -5,  38],  // Péninsule ibérique + Maroc
  '9906': [   8,  47],  // Suisse
  '9907': [  15,  51],  // Europe centrale
  '9908': [  13,  28],  // Afrique du Nord + Proche-Orient
  '9909': [  22,  -5],  // Afrique subsaharienne
  '9910': [  55,  25],  // Moyen-Orient + Asie centrale
  '9911': [ 120,  15],  // Asie + Pacifique
}

export function AbroadMap({ electionData, circoChoro, granularity }: Props) {
  const { clickedCommune, setClickedCommune } = useElectionStore()
  const [landPath, setLandPath] = useState<string>('')

  useEffect(() => {
    fetch('/data/geo/land-110m.json')
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((topo: any) => {
        const land = topojson.feature(topo, topo.objects.land)
        setLandPath(pathFn(land as GeoJSON.GeoJSON) ?? '')
      })
      .catch(() => {/* silently ignore if file unavailable */})
  }, [])

  const candidates = circoChoro?.candidates ?? electionData?.candidates ?? []
  const partyByName = new Map(candidates.map(c => [c.name, c.party]))
  const abroadEntries = (circoChoro?.communes ?? []).filter(c => c.inseeCode.startsWith('99'))

  // Overall abroad winner: prefer '99' aggregate; fall back to modal leader
  const abroad99 = electionData?.communes.find(c => c.inseeCode === '99')
  const overallWinner = abroad99?.leadingCandidate ?? (() => {
    if (!abroadEntries.length) return null
    const counts = new Map<string, number>()
    abroadEntries.forEach(c => counts.set(c.leadingCandidate, (counts.get(c.leadingCandidate) ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  })()

  const isCirco = granularity === 'circonscription'

  // Whether the aggregate abroad entry is currently selected
  const aggregateSelected = clickedCommune === '99'

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        Français à l'étranger
      </p>

      {/* World map */}
      <svg
        width={W}
        height={H}
        style={{
          display: 'block',
          cursor: isCirco ? 'default' : 'pointer',
          borderRadius: 4,
          outline: aggregateSelected && !isCirco ? '2px solid #0f172a' : 'none',
        }}
        onClick={isCirco ? undefined : () => setClickedCommune('99')}
      >
        {/* Ocean */}
        <path d={SPHERE_PATH} fill="#dbeafe" />

        {/* Land masses */}
        {landPath && <path d={landPath} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.4} />}

        {/* Graticule */}
        <path d={GRATICULE_PATH} fill="none" stroke="#bfdbfe" strokeWidth={0.3} />

        {/* Circo dots — visible in all tabs */}
        {abroadEntries.map(c => {
          const center = CIRCO_CENTERS[c.inseeCode]
          if (!center) return null
          const projected = projection(center)
          if (!projected) return null
          const [x, y] = projected
          const color = getCandidateColor(c.leadingCandidate, 0, partyByName.get(c.leadingCandidate))
          const isSelected = clickedCommune === c.inseeCode

          return (
            <circle
              key={c.inseeCode}
              cx={x} cy={y}
              r={isSelected ? 7 : 5}
              fill={color}
              fillOpacity={0.92}
              stroke="white"
              strokeWidth={isSelected ? 2.5 : 1.5}
              style={{ cursor: isCirco ? 'pointer' : 'default' }}
              onClick={isCirco ? (e) => { e.stopPropagation(); setClickedCommune(c.inseeCode) } : undefined}
            />
          )
        })}

        {/* Sphere outline */}
        <path d={SPHERE_PATH} fill="none" stroke="#94a3b8" strokeWidth={0.8} />
      </svg>

      {/* Dept/Commune mode: aggregate winner label */}
      {!isCirco && overallWinner && (
        <p className="mt-1.5 text-xs text-gray-600">
          En tête :{' '}
          <span
            className="font-semibold"
            style={{ color: getCandidateColor(overallWinner, 0, partyByName.get(overallWinner)) }}
          >
            {overallWinner}
          </span>
        </p>
      )}

      {/* Circo mode: compact ranked list */}
      {isCirco && abroadEntries.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {abroadEntries.map(c => {
            const num = parseInt(c.inseeCode.replace('99', ''), 10)
            const color = getCandidateColor(c.leadingCandidate, 0, partyByName.get(c.leadingCandidate))
            const isSelected = clickedCommune === c.inseeCode
            return (
              <button
                key={c.inseeCode}
                className={`w-full flex items-center gap-1.5 text-xs px-1 py-0.5 rounded text-left transition-colors
                  ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => setClickedCommune(c.inseeCode)}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className={`w-5 text-right shrink-0 ${isSelected ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>
                  {num}e
                </span>
                <span className={isSelected ? 'font-semibold text-gray-800' : 'text-gray-600'}>
                  {c.leadingCandidate.split(' ').pop()}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
