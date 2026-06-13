import { useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore, useIsOverview } from '../store/electionStore'
import { getCandidateColor, partyByName } from '../utils/partyColors'
import { OverseasInsets } from './OverseasInsets'
import { TOP_CITIES, TOP_CITY_CODES } from '../utils/topCities'
import { ADMIN_CENTERS } from '../utils/adminCenters'
import { MERGED_COMMUNE_TO_CURRENT } from '../utils/mergedCommunes'

interface Props {
  electionData: RoundData | undefined
  choroplethData: ChoroplethData | null | undefined
  palette: Palette | null
  /** Geometry version ids from the election manifest. */
  geometry?: { admin: string; circo: string }
}

// Geometry version id → PMTiles file. New entries appear here as historical
// tilesets are added (e.g. 'circo-1988', 'admin-seine-1965').
const TILE_SOURCES: Record<string, string> = {
  'admin-2022': '/data/tiles/france-admin.pmtiles',
  'circo-2010': '/data/tiles/circonscriptions.pmtiles',
}
const DEFAULT_GEOMETRY = { admin: 'admin-2022', circo: 'circo-2010' }

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

// Symbol layer for préfecture / sous-préfecture name labels.
function adminLabelLayer(
  id: string,
  centerType: 'prefecture' | 'sous-prefecture',
): maplibregl.SymbolLayerSpecification {
  return {
    id, type: 'symbol', source: 'admin-centers',
    minzoom: 8,
    filter: ['all',
      ['==', ['get', 'type'], centerType],
      ['!', ['in', ['get', 'inseeCode'], ['literal', TOP_CITY_CODES]]],
    ],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 13],
      'text-anchor': 'center',
      'text-allow-overlap': true,
      visibility: 'none',
    },
    paint: {
      'text-color': '#1e293b',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.5,
    },
  }
}

function makeStyle(geometry: { admin: string; circo: string }): maplibregl.StyleSpecification {
  const adminUrl = `pmtiles://${window.location.origin}${TILE_SOURCES[geometry.admin] ?? TILE_SOURCES[DEFAULT_GEOMETRY.admin]}`
  const circoUrl = `pmtiles://${window.location.origin}${TILE_SOURCES[geometry.circo] ?? TILE_SOURCES[DEFAULT_GEOMETRY.circo]}`

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
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
      'admin-centers': {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: ADMIN_CENTERS.map((c) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [c.lng, c.lat] },
            properties: { name: c.name, type: c.type, inseeCode: c.inseeCode },
          })),
        },
      },
      'top-cities-points': {
        type: 'geojson',
        promoteId: 'inseeCode',
        data: {
          type: 'FeatureCollection',
          features: TOP_CITIES.map((city) => ({
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [city.lng, city.lat] },
            properties: { name: city.name, population: city.population, inseeCode: city.inseeCode },
          })),
        },
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
        paint: {
          'line-color': '#000000',
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 10, 0.8, 13, 1.5],
          'line-opacity': 0.35,
        } },

      // Top-30 city boundaries — white halo + black line so it reads on any election color
      { id: 'top-cities-highlight-bg', type: 'line', source: 'admin', 'source-layer': 'communes',
        filter: ['match', ['id'], TOP_CITY_CODES, true, false],
        minzoom: 5,
        paint: {
          'line-color': '#ffffff',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 9],
          'line-opacity': 0.6,
        } },
      { id: 'top-cities-highlight', type: 'line', source: 'admin', 'source-layer': 'communes',
        filter: ['match', ['id'], TOP_CITY_CODES, true, false],
        minzoom: 5,
        paint: {
          'line-color': '#000000',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 2.5, 12, 5],
          'line-opacity': 0.9,
        } },

      // Département outlines — always visible as reference, slightly thicker than sub-layers
      { id: 'dept-outline', type: 'line', source: 'admin', 'source-layer': 'departements',
        paint: outlinePaint(1.4) },

      // Circonscription outlines — shown when circo layer is active
      { id: 'circo-outline', type: 'line', source: 'circo', 'source-layer': 'circonscriptions',
        layout: { visibility: 'none' }, paint: outlinePaint(0.7) },

      // Top-30 city dots — colored by leading candidate, visible only at low zoom in commune mode
      { id: 'city-dots', type: 'circle', source: 'top-cities-points',
        maxzoom: 8,
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 5, 7, 9],
          'circle-color': ['coalesce', ['feature-state', 'color'], '#e2e8f0'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 8, 0],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 6, 1, 8, 0],
        } },

      // Admin-center labels — commune mode, zoom ≥ 8; exclude top-30 cities (already labelled by top-cities-labels)
      adminLabelLayer('prefecture-labels', 'prefecture'),
      adminLabelLayer('sous-prefecture-labels', 'sous-prefecture'),

      // Top-30 city labels — on top of everything for orientation at any zoom
      { id: 'top-cities-labels', type: 'symbol', source: 'top-cities-points',
        minzoom: 8,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 10, 14],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'symbol-sort-key': ['*', -1, ['get', 'population']],
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
        } },
    ],
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Colors départements and mirrors the same colors onto the overseas GeoJSON source.
function applyDeptColors(map: maplibregl.Map, electionData: RoundData, palette: Palette | null) {
  const parties = partyByName(electionData.candidates)
  for (const dept of electionData.communes) {
    const color = getCandidateColor(dept.leadingCandidate, 0, parties.get(dept.leadingCandidate), palette)
    map.setFeatureState({ source: 'admin', sourceLayer: 'departements', id: dept.inseeCode }, { color })
    map.setFeatureState({ source: 'overseas', id: dept.inseeCode }, { color })
  }
}

// Our CIRLG parser produces INSEE-derived codes (e.g. '97101') but the circo PMTiles
// uses the original Z-codes from the data.gouv.fr GeoJSON (e.g. 'ZA01'). We need
// both directions: INSEE→Zcode for setFeatureState (coloring), Zcode→INSEE for clicks
// (so ResultsPanel can find results in the JSON data).
const INSEE_TO_CIRCO_ZCODE: Record<string, string> = {
  '97101': 'ZA01', '97102': 'ZA02', '97103': 'ZA03', '97104': 'ZA04',
  '97201': 'ZB01', '97202': 'ZB02', '97203': 'ZB03', '97204': 'ZB04',
  '97301': 'ZC01', '97302': 'ZC02',
  '97401': 'ZD01', '97402': 'ZD02', '97403': 'ZD03', '97404': 'ZD04',
  '97405': 'ZD05', '97406': 'ZD06', '97407': 'ZD07',
  '97501': 'ZS01',
  '97601': 'ZM01', '97602': 'ZM02',
}
const CIRCO_ZCODE_TO_INSEE: Record<string, string> = Object.fromEntries(
  Object.entries(INSEE_TO_CIRCO_ZCODE).map(([insee, zcode]) => [zcode, insee])
)

function applyChoroplethColors(map: maplibregl.Map, choropleth: ChoroplethData, palette: Palette | null) {
  const parties = partyByName(choropleth.candidates)
  const isCirco = choropleth.granularity === 'circonscription'
  const colorByCode = new Map<string, string>()
  for (const c of choropleth.communes) {
    const color = getCandidateColor(c.leadingCandidate, 0, parties.get(c.leadingCandidate), palette)
    if (isCirco) {
      const featureId = INSEE_TO_CIRCO_ZCODE[c.inseeCode] ?? c.inseeCode
      map.setFeatureState({ source: 'circo', sourceLayer: 'circonscriptions', id: featureId }, { color })
    } else {
      colorByCode.set(c.inseeCode, color)
      map.setFeatureState({ source: 'admin', sourceLayer: 'communes', id: c.inseeCode }, { color })
    }
  }
  if (!isCirco) {
    // The tile geometry predates some commune mergers: color the obsolete
    // polygons with their absorbing commune's result.
    for (const [oldCode, currentCode] of Object.entries(MERGED_COMMUNE_TO_CURRENT)) {
      const color = colorByCode.get(currentCode)
      if (color) {
        map.setFeatureState({ source: 'admin', sourceLayer: 'communes', id: oldCode }, { color })
      }
    }
  }
}

// Colors the top-30 city dots by each city's leading candidate.
function applyCityDotColors(map: maplibregl.Map, choropleth: ChoroplethData, palette: Palette | null) {
  const parties = partyByName(choropleth.candidates)
  const byCode = new Map(choropleth.communes.map((c) => [c.inseeCode, c]))
  for (const city of TOP_CITIES) {
    const entry = byCode.get(city.inseeCode)
    const color = entry
      ? getCandidateColor(entry.leadingCandidate, 0, parties.get(entry.leadingCandidate), palette)
      : '#e2e8f0'
    map.setFeatureState({ source: 'top-cities-points', id: city.inseeCode }, { color })
  }
}

// Single source of truth for data → map sync: feature-state colors and layer
// visibility. Called both on initial map load and whenever the data changes.
function syncMapData(
  map: maplibregl.Map,
  electionData: RoundData | undefined,
  choroplethData: ChoroplethData | null | undefined,
  palette: Palette | null,
) {
  if (electionData) applyDeptColors(map, electionData, palette)

  const isCirco = choroplethData?.granularity === 'circonscription'
  const isCommune = choroplethData?.granularity === 'commune'
  const layerVisibility: Record<string, boolean> = {
    'communes-fill': isCommune,
    'communes-outline': isCommune,
    'circo-fill': isCirco,
    'circo-outline': isCirco,
    'city-dots': isCommune,
    'prefecture-labels': isCommune,
    'sous-prefecture-labels': isCommune,
  }
  for (const [layer, visible] of Object.entries(layerVisibility)) {
    map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
  }

  if (choroplethData) {
    applyChoroplethColors(map, choroplethData, palette)
    if (isCommune) applyCityDotColors(map, choroplethData, palette)
  }
}

function getFeatureBounds(geometry: GeoJSON.Geometry): maplibregl.LngLatBoundsLike | null {
  const coords: number[][] = []
  if (geometry.type === 'Polygon') {
    geometry.coordinates[0].forEach((c) => coords.push(c))
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.forEach((poly) => poly[0].forEach((c) => coords.push(c)))
  }
  if (!coords.length) return null
  const lngs = coords.map((c) => c[0])
  const lats = coords.map((c) => c[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}

// ── Types ──────────────────────────────────────────────────────────────────────

type SourceLayer = 'communes' | 'departements' | 'circonscriptions'
interface HoverTarget { id: string; sourceLayer: SourceLayer; source: 'admin' | 'circo' }

// ── Component ──────────────────────────────────────────────────────────────────
export function FranceMap({ electionData, choroplethData, palette, geometry }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const electionDataRef = useRef(electionData)
  const choroplethRef = useRef(choroplethData)
  const paletteRef = useRef(palette)
  const geom = geometry ?? DEFAULT_GEOMETRY
  const geometryRef = useRef(geom)
  const appliedGeometryRef = useRef(geom)

  const prevHoveredRef = useRef<HoverTarget | null>(null)
  const prevSelectedRef = useRef<HoverTarget | null>(null)
  // featureId is the raw tile feature id of the last map click (may differ from
  // clickedCommune for Z-coded circos and obsolete merged-commune polygons)
  const clickedSourceLayerRef = useRef<{ sourceLayer: SourceLayer; source: 'admin' | 'circo'; featureId?: string }>({
    sourceLayer: 'departements', source: 'admin',
  })

  const { setHoveredCommune, setClickedCommune, clickedCommune, focusedTerritory, setFocusedTerritory, flyTarget, setFlyTarget } = useElectionStore()
  const isOverview = useIsOverview()

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    ensurePMTiles()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(geometryRef.current),
      bounds: METRO_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current)
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
        // Obsolete merged-commune polygons resolve to their absorbing commune
        setHoveredCommune(sourceLayer === 'communes' ? (MERGED_COMMUNE_TO_CURRENT[id] ?? id) : id)
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
    const makeClickHandler = (sourceLayer: SourceLayer, source: 'admin' | 'circo', zoomOnClick = false) =>
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const feature = e.features?.[0]
        const rawId = String(feature?.id ?? '')
        if (rawId) {
          // Circo PMTiles uses Z-codes (e.g. 'ZA01') but our JSON data uses INSEE codes
          // (e.g. '97101'). Obsolete merged-commune polygons resolve to their absorbing
          // commune. Translate so ResultsPanel can find the results.
          const id = source === 'circo'
            ? (CIRCO_ZCODE_TO_INSEE[rawId] ?? rawId)
            : sourceLayer === 'communes'
            ? (MERGED_COMMUNE_TO_CURRENT[rawId] ?? rawId)
            : rawId
          clickedSourceLayerRef.current = { sourceLayer, source, featureId: rawId }
          setClickedCommune(id)
          if (zoomOnClick && feature?.geometry) {
            const bounds = getFeatureBounds(feature.geometry)
            if (bounds) map.fitBounds(bounds, { padding: 60, duration: 800, maxZoom: 12 })
          }
        }
      }

    map.on('click', 'dept-fill', makeClickHandler('departements', 'admin', true))
    map.on('click', 'communes-fill', makeClickHandler('communes', 'admin', true))
    map.on('click', 'circo-fill', makeClickHandler('circonscriptions', 'circo'))

    // overseas-fill covers the same area as circo/commune polygons when zoomed in.
    // Only handle it when no more specific layer was also hit at this point.
    map.on('click', 'overseas-fill', (e) => {
      const moreSpecific = map.queryRenderedFeatures(e.point, { layers: ['circo-fill', 'communes-fill'] })
      if (moreSpecific.length > 0) return
      const rawId = String(e.features?.[0]?.id ?? '')
      if (rawId) {
        clickedSourceLayerRef.current = { sourceLayer: 'departements', source: 'admin' }
        setClickedCommune(rawId)
      }
    })

    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['dept-fill', 'communes-fill', 'circo-fill'] })
      if (!hits.length) setClickedCommune(null)
    })

    return () => { map.remove(); mapRef.current = null }
  }, [setHoveredCommune, setClickedCommune])

  // ── Geometry version change (era switch) → rebuild style, then re-sync ─────
  useEffect(() => {
    geometryRef.current = geom
    const map = mapRef.current
    if (!map) return
    const applied = appliedGeometryRef.current
    if (geom.admin === applied.admin && geom.circo === applied.circo) return
    appliedGeometryRef.current = geom
    map.setStyle(makeStyle(geom))
    map.once('styledata', () => {
      syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current)
    })
  }, [geom])

  // ── Sync election/choropleth data → feature state colors + layer visibility ─
  useEffect(() => {
    electionDataRef.current = electionData
    choroplethRef.current = choroplethData
    paletteRef.current = palette
    const map = mapRef.current
    if (!map) return
    if (!map.isStyleLoaded()) {
      // Cold load: the data can arrive before the style finishes. Don't drop the
      // sync — defer it until the map settles, reading the latest data from refs.
      const onReady = () => syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current)
      map.once('idle', onReady)
      return () => { map.off('idle', onReady) }
    }
    syncMapData(map, electionData, choroplethData, palette)
  }, [choroplethData, electionData, palette])

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

  // ── Fly to programmatic target (e.g. city list click) ────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTarget) return
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom, duration: 800 })
    setFlyTarget(null)
  }, [flyTarget, setFlyTarget])

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
      const { sourceLayer, source, featureId } = clickedSourceLayerRef.current
      // clickedCommune holds an INSEE code; the PMTiles circo layer uses Z-codes and
      // merged-commune polygons carry obsolete codes. Prefer the raw feature id of the
      // click when it still resolves to clickedCommune, else translate.
      const clickedFeatureMatches =
        featureId !== undefined &&
        (source === 'circo'
          ? (CIRCO_ZCODE_TO_INSEE[featureId] ?? featureId)
          : (MERGED_COMMUNE_TO_CURRENT[featureId] ?? featureId)) === clickedCommune
      const mapId = clickedFeatureMatches
        ? (featureId as string)
        : source === 'circo'
        ? (INSEE_TO_CIRCO_ZCODE[clickedCommune] ?? clickedCommune)
        : clickedCommune
      map.setFeatureState({ source, sourceLayer, id: mapId }, { selected: true })
      prevSelectedRef.current = { id: mapId, sourceLayer, source }
    } else {
      prevSelectedRef.current = null
    }
  }, [clickedCommune])

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="h-full w-full" />
      <div
        className="transition-opacity duration-300"
        style={{ opacity: isOverview ? 1 : 0, pointerEvents: isOverview ? 'auto' : 'none' }}
      >
        <OverseasInsets electionData={electionData} palette={palette} />
      </div>
      {!isOverview && (
        <button
          className="absolute top-3 left-3 z-20 text-xs text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded px-2 py-1 shadow-sm"
          onClick={() => {
            setFocusedTerritory(null)
            setClickedCommune(null)
            mapRef.current?.fitBounds(METRO_BOUNDS, { padding: 40, duration: 800 })
          }}
        >
          ← Vue générale
        </button>
      )}
    </div>
  )
}
