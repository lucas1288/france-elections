/**
 * Renders overseas territories as small D3-geo SVG insets positioned in the
 * bottom-left corner of the map. Two rows: DOM (row 1) and COM (row 2).
 *
 * Uses D3-geo SVG to avoid spinning up extra WebGL contexts.
 * French Polynesia (987) is omitted — its 20° bounding box makes inset display impractical.
 */

import { useEffect, useState, useMemo } from 'react'
import * as d3geo from 'd3-geo'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import type { Palette, RoundData } from '../types/election'
import { useElectionStore } from '../store/electionStore'
import { partyByName } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'
import { territoryColor, partyCodeSet } from '../utils/territoryColor'
import { dataUrl } from '../utils/dataUrl'

interface CommuneProperties {
  code: string
  nom: string
}

type GeoFeature = Feature<Polygon | MultiPolygon, CommuneProperties>

interface InsetDef {
  code: string
  label: string
  w: number
  h: number
}

// All overseas territories displayed as a vertical column on the left.
// Uniform width so the column edge is straight; height tuned per shape.
const W = 110  // px — column width for all insets

const INSETS: InsetDef[] = [
  // DOM
  { code: '971', label: 'Guadeloupe',              w: W, h: 58 },
  { code: '972', label: 'Martinique',              w: W, h: 62 },
  { code: '973', label: 'Guyane',                  w: W, h: 72 },
  { code: '974', label: 'La Réunion',              w: W, h: 56 },
  { code: '976', label: 'Mayotte',                 w: W, h: 52 },
  // COM
  { code: '975', label: 'St-Pierre-et-Miquelon',  w: W, h: 56 },
  { code: '977', label: 'St-Martin / St-Barth',   w: W, h: 52 },
  { code: '986', label: 'Wallis-et-Futuna',        w: W, h: 52 },
  { code: '987', label: 'Polynésie française',     w: W, h: 52 },
  { code: '988', label: 'Nouvelle-Calédonie',      w: W, h: 52 },
]

const GAP = 4

interface InsetProps extends InsetDef {
  feature: GeoFeature | undefined
  fillColor: string
  isHovered: boolean
  isClicked: boolean
  isWon: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
}

function SingleInset({ label, w, h, feature, fillColor, isHovered, isClicked, isWon, onEnter, onLeave, onClick }: InsetProps) {
  const fc = useMemo(
    () => feature ? { type: 'FeatureCollection' as const, features: [feature] } : null,
    [feature],
  )
  const projection = useMemo(
    () => fc ? d3geo.geoMercator().fitExtent([[2, 2], [w - 2, h - 2]], fc) : null,
    [fc, w, h],
  )
  const pathGen = useMemo(
    () => projection ? d3geo.geoPath().projection(projection) : null,
    [projection],
  )
  const d = feature && pathGen ? pathGen(feature) : null

  return (
    <div style={{ width: w, flexShrink: 0 }}>
      <svg width={w} height={h} style={{ display: 'block', cursor: 'pointer' }}>
        <rect
          width={w} height={h}
          fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.5} rx={2}
        />
        {d && (
          <path
            d={d}
            fill={fillColor}
            stroke={isClicked ? '#0f172a' : isWon ? '#ffffff' : isHovered ? '#334155' : '#94a3b8'}
            strokeWidth={isClicked ? 1.5 : isWon ? 2 : isHovered ? 1 : 0.5}
            onMouseEnter={onEnter}
            onMouseLeave={onLeave}
            onClick={onClick}
            style={{ transition: 'fill 0.15s ease' }}
          >
            <title>{label}</title>
          </path>
        )}
      </svg>
      <div style={{ fontSize: 9, textAlign: 'center', color: '#64748b', marginTop: 2 }}>
        {label}
      </div>
    </div>
  )
}

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
}

export function OverseasInsets({ electionData, palette }: Props) {
  const [features, setFeatures] = useState<Map<string, GeoFeature>>(new Map())
  const { hoveredCommune, clickedCommune, focusedTerritory, setHoveredCommune, setClickedCommune, setFocusedTerritory } = useElectionStore()
  const colorMode = useElectionStore((s) => s.colorMode)

  // Fetch overseas GeoJSON once
  useEffect(() => {
    fetch(dataUrl('/data/geo/overseas.geojson'))
      .then((r) => r.json())
      .then((fc) => {
        const map = new Map<string, GeoFeature>()
        for (const f of fc.features) {
          map.set(f.properties.code, f)
        }
        setFeatures(map)
      })
      .catch(console.error)
  }, [])

  // Per-territory fill colors, mode-aware (mirrors the main map's dept coloring).
  const fillByCode = useMemo(() => {
    const m = new Map<string, string>()
    if (!electionData) return m
    const national = computeNationalTotals(electionData)
    for (const c of electionData.communes) {
      m.set(c.inseeCode, territoryColor(c, colorMode, palette, national))
    }
    return m
  }, [electionData, palette, colorMode])

  const getFill = (code: string) => fillByCode.get(code) ?? '#e2e8f0'

  // Territories the selected force came 1st in (single-party view) — get a highlight border.
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

  if (focusedTerritory) return null

  return (
    <div
      className="absolute z-10 top-4 left-3"
      style={{ pointerEvents: 'none' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, pointerEvents: 'auto' }}>
        {INSETS.map((inset) => (
          <SingleInset
            key={inset.code}
            {...inset}
            feature={features.get(inset.code)}
            fillColor={getFill(inset.code)}
            isHovered={hoveredCommune === inset.code}
            isClicked={clickedCommune === inset.code}
            isWon={wonByCode.has(inset.code)}
            onEnter={() => setHoveredCommune(inset.code)}
            onLeave={() => setHoveredCommune(null)}
            onClick={() => { setClickedCommune(inset.code); setFocusedTerritory(inset.code) }}
          />
        ))}
      </div>
    </div>
  )
}
