import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import { getCandidateColor } from '../utils/partyColors'
import { OverseasInsets } from './OverseasInsets'

interface Props {
  electionData: RoundData | undefined
  choroplethData: ChoroplethData | null | undefined
}

// ── PMTiles protocol — initialised once per app session ────────────────────────
let pmtilesReady = false
function ensurePMTiles() {
  if (pmtilesReady) return
  const p = new Protocol()
  maplibregl.addProtocol('pmtiles', p.tile.bind(p))
  pmtilesReady = true
}

// ── Constants ──────────────────────────────────────────────────────────────────
const METRO_BOUNDS: maplibregl.LngLatBoundsLike = [[-5.5, 41.2], [9.7, 51.2]]

// Bounding boxes for overseas territories (used for flyTo on inset click)
const OVERSEAS_BOUNDS: Record<string, maplibregl.LngLatBoundsLike> = {
  '971': [[-62.1096, 15.5321], [-60.7021, 16.8143]],  // Guadeloupe
  '972': [[-61.5293, 14.0887], [-60.5095, 15.1788]],  // Martinique
  '973': [[-54.9016,  1.8113], [-51.3191,  6.0482]],  // Guyane
  '974': [[ 54.9165,-21.6894], [ 56.1367,-20.5717]],  // La Réunion
  '975': [[-56.6966, 46.4528], [-55.8448, 47.4413]],  // Saint-Pierre-et-Miquelon
  '976': [[ 44.7183,-13.3053], [ 45.6000,-12.3366]],  // Mayotte
  '977': [[-63.4468, 17.7334], [-62.7107, 18.4221]],  // Saint-Martin / Saint-Barth
  '986': [[-178.4857,-14.6194], [-175.8256,-12.9089]], // Wallis-et-Futuna
  '987': [[-154.8370,-27.9412], [-134.6430, -7.6501]], // Polynésie française
  '988': [[ 163.3157,-22.9707], [ 171.6438,-19.3237]], // Nouvelle-Calédonie
}

// Zoom level at which commune tiles from tippecanoe become reliably complete.
// Below this, dept-fill acts as the visual base even in commune mode.
const COMMUNE_MIN_ZOOM = 7

// ── MapLibre style ─────────────────────────────────────────────────────────────
function makeStyle(): maplibregl.StyleSpecification {
  const adminUrl = `pmtiles://${window.location.origin}/data/tiles/france-admin.pmtiles`
  const circoUrl = `pmtiles://${window.location.origin}/data/tiles/circonscriptions.pmtiles`

  const fillPaint = (opacity: number): maplibregl.FillLayerSpecification['paint'] => ({
    'fill-color': ['coalesce', ['feature-state', 'color'], '#e2e8f0'],
    'fill-opacity': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], 1,
      ['boolean', ['feature-state', 'hover'], false], 0.92,
      opacity,
    ],
  })

  const outlinePaint = (width: number): maplibregl.LineLayerSpecification['paint'] => ({
    'line-color': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], '#0f172a',
      ['boolean', ['feature-state', 'hover'], false], '#334155',
      '#64748b',
    ],
    'line-width': [
      'case',
      ['boolean', ['feature-state', 'selected'], false], width * 2.5,
      ['boolean', ['feature-state', 'hover'], false], width * 1.8,
      width,
    ],
  })

  return {
    version: 8,
    sources: {
      admin: {
        type: 'vector',
        url: adminUrl,
        promoteId: { communes: 'code', departements: 'code' },
      },
      circo: {
        type: 'vector',
        url: circoUrl,
        promoteId: { circonscriptions: 'codeCirconscription' },
      },
      overseas: {
        type: 'geojson',
        data: '/data/geo/overseas.geojson',
        promoteId: 'code',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f1f5f9' } },

      // Overseas territory fill — dept-level coloring, always visible for zoom support
      { id: 'overseas-fill', type: 'fill', source: 'overseas', paint: fillPaint(0.82) },
      { id: 'overseas-outline', type: 'line', source: 'overseas', paint: outlinePaint(1.4) },

      // Département fill — always the base layer; provides full-France coverage at any zoom
      { id: 'dept-fill', type: 'fill', source: 'admin', 'source-layer': 'departements',
        layout: { visibility: 'visible' }, paint: fillPaint(0.82) },

      // Commune fill — rendered ON TOP of dept; only starts appearing where tippecanoe
      // has tiles (around zoom 7+). Starts hidden; shown in commune mode via setLayoutProperty.
      { id: 'communes-fill', type: 'fill', source: 'admin', 'source-layer': 'communes',
        minzoom: COMMUNE_MIN_ZOOM,
        layout: { visibility: 'none' }, paint: fillPaint(0.88) },

      // Circonscription fill — separate PMTiles source, hidden by default
      { id: 'circo-fill', type: 'fill', source: 'circo', 'source-layer': 'circonscriptions',
        layout: { visibility: 'none' }, paint: fillPaint(0.85) },

      // Commune outlines — shown only in commune mode
      { id: 'communes-outline', type: 'line', source: 'admin', 'source-layer': 'communes',
        minzoom: COMMUNE_MIN_ZOOM,
        layout: { visibility: 'none' },
        paint: { 'line-color': '#94a3b8', 'line-width': 0.3, 'line-opacity': 0.5 } },

      // Département outlines — always visible as reference, slightly thicker than sub-layers
      { id: 'dept-outline', type: 'line', source: 'admin', 'source-layer': 'departements',
        paint: outlinePaint(1.4) },

      // Circonscription outlines — shown when circo layer is active
      { id: 'circo-outline', type: 'line', source: 'circo', 'source-layer': 'circonscriptions',
        layout: { visibility: 'none' }, paint: outlinePaint(0.7) },
    ],
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function partyByName(candidates: Array<{ name: string; party: string }>): Map<string, string> {
  const m = new Map<string, string>()
  candidates.forEach((c) => m.set(c.name, c.party))
  return m
}

function applyDeptColors(map: maplibregl.Map, electionData: RoundData) {
  const parties = partyByName(electionData.candidates)
  for (const dept of electionData.communes) {
    const color = getCandidateColor(dept.leadingCandidate, 0, parties.get(dept.leadingCandidate))
    map.setFeatureState({ source: 'admin', sourceLayer: 'departements', id: dept.inseeCode }, { color })
  }
}

// Our CIRLG parser produces INSEE-derived codes (e.g. '97101') but the circo PMTiles
// uses the original Z-codes from the data.gouv.fr GeoJSON (e.g. 'ZA01'). Translate
// before calling setFeatureState so overseas circos get colored correctly.
const INSEE_TO_CIRCO_ZCODE: Record<string, string> = {
  '97101': 'ZA01', '97102': 'ZA02', '97103': 'ZA03', '97104': 'ZA04',
  '97201': 'ZB01', '97202': 'ZB02', '97203': 'ZB03', '97204': 'ZB04',
  '97301': 'ZC01', '97302': 'ZC02',
  '97401': 'ZD01', '97402': 'ZD02', '97403': 'ZD03', '97404': 'ZD04',
  '97405': 'ZD05', '97406': 'ZD06', '97407': 'ZD07',
  '97501': 'ZS01',
  '97601': 'ZM01', '97602': 'ZM02',
}

function applyChoroplethColors(map: maplibregl.Map, choropleth: ChoroplethData) {
  const parties = partyByName(choropleth.candidates)
  const isCirco = choropleth.granularity === 'circonscription'
  for (const c of choropleth.communes) {
    const color = getCandidateColor(c.leadingCandidate, 0, parties.get(c.leadingCandidate))
    if (isCirco) {
      const featureId = INSEE_TO_CIRCO_ZCODE[c.inseeCode] ?? c.inseeCode
      map.setFeatureState({ source: 'circo', sourceLayer: 'circonscriptions', id: featureId }, { color })
    } else {
      map.setFeatureState({ source: 'admin', sourceLayer: 'communes', id: c.inseeCode }, { color })
    }
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type SourceLayer = 'communes' | 'departements' | 'circonscriptions'
interface HoverTarget { id: string; sourceLayer: SourceLayer; source: 'admin' | 'circo' }

// ── Component ──────────────────────────────────────────────────────────────────
export function FranceMap({ electionData, choroplethData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const electionDataRef = useRef(electionData)
  const choroplethRef = useRef(choroplethData)

  const prevHoveredRef = useRef<HoverTarget | null>(null)
  const prevSelectedRef = useRef<HoverTarget | null>(null)
  const clickedSourceLayerRef = useRef<{ sourceLayer: SourceLayer; source: 'admin' | 'circo' }>({
    sourceLayer: 'departements', source: 'admin',
  })

  const { setHoveredCommune, setClickedCommune, clickedCommune, focusedTerritory, setFocusedTerritory } = useElectionStore()

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    ensurePMTiles()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(),
      bounds: METRO_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      if (electionDataRef.current) {
        applyDeptColors(map, electionDataRef.current)
        const parties = partyByName(electionDataRef.current.candidates)
        for (const dept of electionDataRef.current.communes) {
          const color = getCandidateColor(dept.leadingCandidate, 0, parties.get(dept.leadingCandidate))
          map.setFeatureState({ source: 'overseas', id: dept.inseeCode }, { color })
        }
      }
      if (choroplethRef.current) {
        applyChoroplethColors(map, choroplethRef.current)
        const isCirco = choroplethRef.current.granularity === 'circonscription'
        if (isCirco) {
          map.setLayoutProperty('circo-fill', 'visibility', 'visible')
          map.setLayoutProperty('circo-outline', 'visibility', 'visible')
        } else {
          map.setLayoutProperty('communes-fill', 'visibility', 'visible')
        }
      }
    })

    // ── Hover handlers — one per fill layer ──────────────────────────────────
    const makeMouseMoveHandler = (sourceLayer: SourceLayer, source: 'admin' | 'circo') =>
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        map.getCanvas().style.cursor = 'pointer'
        const id = String(e.features?.[0]?.id ?? '')
        if (!id) return
        if (prevHoveredRef.current?.id === id && prevHoveredRef.current?.sourceLayer === sourceLayer) return

        if (prevHoveredRef.current) {
          map.setFeatureState(
            { source: prevHoveredRef.current.source, sourceLayer: prevHoveredRef.current.sourceLayer, id: prevHoveredRef.current.id },
            { hover: false },
          )
        }
        prevHoveredRef.current = { id, sourceLayer, source }
        map.setFeatureState({ source, sourceLayer, id }, { hover: true })
        setHoveredCommune(id)
      }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      if (prevHoveredRef.current) {
        map.setFeatureState(
          { source: prevHoveredRef.current.source, sourceLayer: prevHoveredRef.current.sourceLayer, id: prevHoveredRef.current.id },
          { hover: false },
        )
        prevHoveredRef.current = null
        setHoveredCommune(null)
      }
    }

    map.on('mousemove', 'dept-fill', makeMouseMoveHandler('departements', 'admin'))
    map.on('mousemove', 'communes-fill', makeMouseMoveHandler('communes', 'admin'))
    map.on('mousemove', 'circo-fill', makeMouseMoveHandler('circonscriptions', 'circo'))
    map.on('mousemove', 'overseas-fill', makeMouseMoveHandler('departements', 'admin'))
    map.on('mouseleave', 'dept-fill', handleMouseLeave)
    map.on('mouseleave', 'communes-fill', handleMouseLeave)
    map.on('mouseleave', 'circo-fill', handleMouseLeave)
    map.on('mouseleave', 'overseas-fill', handleMouseLeave)

    // ── Click handlers ────────────────────────────────────────────────────────
    const makeClickHandler = (sourceLayer: SourceLayer, source: 'admin' | 'circo') =>
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const id = String(e.features?.[0]?.id ?? '')
        if (id) {
          clickedSourceLayerRef.current = { sourceLayer, source }
          setClickedCommune(id)
        }
      }

    map.on('click', 'dept-fill', makeClickHandler('departements', 'admin'))
    map.on('click', 'communes-fill', makeClickHandler('communes', 'admin'))
    map.on('click', 'circo-fill', makeClickHandler('circonscriptions', 'circo'))
    map.on('click', 'overseas-fill', makeClickHandler('departements', 'admin'))

    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['dept-fill', 'communes-fill', 'circo-fill'] })
      if (!hits.length) setClickedCommune(null)
    })

    return () => { map.remove(); mapRef.current = null }
  }, [setHoveredCommune, setClickedCommune])

  // ── Sync election/choropleth data → feature state colors + layer visibility ─
  useEffect(() => {
    electionDataRef.current = electionData
    choroplethRef.current = choroplethData
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (electionData) {
      applyDeptColors(map, electionData)
      // Mirror dept colors onto the overseas GeoJSON source
      const parties = partyByName(electionData.candidates)
      for (const dept of electionData.communes) {
        const color = getCandidateColor(dept.leadingCandidate, 0, parties.get(dept.leadingCandidate))
        map.setFeatureState({ source: 'overseas', id: dept.inseeCode }, { color })
      }
    }

    const isCirco = choroplethData?.granularity === 'circonscription'
    const isCommune = choroplethData?.granularity === 'commune' && !!choroplethData

    map.setLayoutProperty('communes-fill',    'visibility', isCommune ? 'visible' : 'none')
    map.setLayoutProperty('communes-outline', 'visibility', isCommune ? 'visible' : 'none')
    map.setLayoutProperty('circo-fill',       'visibility', isCirco   ? 'visible' : 'none')
    map.setLayoutProperty('circo-outline',    'visibility', isCirco   ? 'visible' : 'none')

    if (choroplethData) applyChoroplethColors(map, choroplethData)
  }, [choroplethData, electionData])

  // ── Fly to focused overseas territory ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (focusedTerritory && OVERSEAS_BOUNDS[focusedTerritory]) {
      map.fitBounds(OVERSEAS_BOUNDS[focusedTerritory], { padding: 40, duration: 800 })
    } else if (!focusedTerritory) {
      map.fitBounds(METRO_BOUNDS, { padding: 40, duration: 800 })
    }
  }, [focusedTerritory])

  // ── Sync Zustand selected → MapLibre feature state ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (prevSelectedRef.current) {
      map.setFeatureState(
        { source: prevSelectedRef.current.source, sourceLayer: prevSelectedRef.current.sourceLayer, id: prevSelectedRef.current.id },
        { selected: false },
      )
    }
    if (clickedCommune) {
      const { sourceLayer, source } = clickedSourceLayerRef.current
      map.setFeatureState({ source, sourceLayer, id: clickedCommune }, { selected: true })
      prevSelectedRef.current = { id: clickedCommune, sourceLayer, source }
    } else {
      prevSelectedRef.current = null
    }
  }, [clickedCommune])

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="h-full w-full" />
      <OverseasInsets electionData={electionData} />
      {focusedTerritory && (
        <button
          className="absolute top-3 left-3 z-20 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 shadow-sm"
          onClick={() => setFocusedTerritory(null)}
        >
          ← France métropolitaine
        </button>
      )}
      {clickedCommune && (
        <button
          className="absolute top-3 right-14 z-10 text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded px-2 py-1 shadow-sm"
          onClick={() => setClickedCommune(null)}
        >
          ✕ Désélectionner
        </button>
      )}
    </div>
  )
}
