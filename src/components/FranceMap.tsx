import { useRef, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { CommuneResult, Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore, useIsOverview } from '../store/electionStore'
import type { ColorMode, Granularity } from '../store/electionStore'
import { isDeptCode } from '../utils/deptInsight'
import { getCandidateColor, partyByName } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'
import type { NationalTotals } from '../utils/nationalResults'
import { pmtilesUrl } from '../utils/dataUrl'
import { territoryColor, partyCodeSet } from '../utils/territoryColor'
import { abstentionShade } from '../utils/gradient'
import { OverseasInsets } from './OverseasInsets'
import { MobileOverseasCluster } from './MobileOverseasCluster'
import { TOP_CITIES, TOP_CITY_CODES } from '../utils/topCities'
import { ADMIN_CENTERS } from '../utils/adminCenters'
import { MERGED_COMMUNE_TO_CURRENT } from '../utils/mergedCommunes'

// Fallback fill for territories without data. Theme-dependent: applyMapTheme
// keeps this module value in sync with the active theme, and the feature-state
// sync paths re-run after a theme flip so already-set defaults update too.
let DEFAULT_COLOR = '#e2e8f0'
const DEFAULT_COLOR_LIGHT = '#e2e8f0'
const DEFAULT_COLOR_DARK = '#334155'

interface Props {
  electionData: RoundData | undefined
  choroplethData: ChoroplethData | null | undefined
  /** Full per-territory data for the active granularity — feeds the gradient views. */
  fullData: RoundData | null
  palette: Palette | null
  colorMode: ColorMode
  /** Geometry version ids from the election manifest. */
  geometry?: { admin: string; circo: string }
  /** Mobile shell: portrait fit + suppress the desktop-only overseas insets
   *  column and "Vue générale" button (mobile provides its own chrome). */
  mobile?: boolean
}

// Geometry version id → PMTiles file. New entries appear here as historical
// tilesets are added (e.g. 'circo-1988', 'admin-seine-1965').
const TILE_SOURCES: Record<string, string> = {
  'admin-2022': '/data/tiles/france-admin.pmtiles?v=2',
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
// Extra padding on the right shifts the metropolitan view left so Corsica (far
// south-east) isn't hidden behind the Legend / Français-à-l'étranger overlays.
const METRO_FIT: maplibregl.FitBoundsOptions = { padding: { top: 40, bottom: 40, left: 50, right: 270 } }
// Mobile portrait: the view is width-constrained (France's ~1.4:1 box in a tall
// phone viewport), so minimal horizontal padding lets France grow as large as
// possible — cutting the inherent vertical whitespace. The floating chrome (top
// bar, bottom switcher, corner buttons) is translucent, so France may sit under
// it like the desktop overlays; only a little top/bottom breathing room is kept.
const METRO_FIT_MOBILE: maplibregl.FitBoundsOptions = { padding: { top: 40, bottom: 380, left: 8, right: 8 } }
// Geo anchor for the mobile overseas inset (MapLibre Marker): the Bay of Biscay,
// south-west of France's coast (≈ Corsica's latitude, left side — lucas's spot).
// Open sea on this map, so the inset reads as part of the map, pans/zooms with
// the terrain, and slides out of view naturally when zooming into the mainland.
const OVERSEAS_INSET_LNGLAT: [number, number] = [-3.4, 42.5]

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
// Past this zoom the user is inspecting communes, so the floating overlays
// (Legend + abroad panel) auto-hide to stop intercepting clicks on the map.
const ZOOM_HIDE_OVERLAYS = 8

// Paris/Lyon/Marseille whole-city polygons. The tiles also carry per-arrondissement
// polygons (751xx/693xx/132xx, tile-joined in), and the data has both the city
// aggregate and the arrondissements. We hide the city polygons on the map so the
// arrondissements are the single clickable/colourable unit there (the city aggregate
// stays reachable in data, e.g. via the top-cities list).
const PLM_CITY_CODES = ['75056', '69123', '13055']
// Hide the whole-city PLM polygons (Paris/Lyon/Marseille) so the arrondissement
// polygons replace them at commune zoom. Filter on the `code` PROPERTY, not
// ['id']: filter expressions evaluate against the raw tile feature id, which is
// unset here (promoteId only feeds setFeatureState + query results, not filters).
const NOT_PLM_CITY: maplibregl.FilterSpecification = ['!', ['match', ['get', 'code'], PLM_CITY_CODES, true, false]]

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
  const adminUrl = pmtilesUrl(TILE_SOURCES[geometry.admin] ?? TILE_SOURCES[DEFAULT_GEOMETRY.admin])
  const circoUrl = pmtilesUrl(TILE_SOURCES[geometry.circo] ?? TILE_SOURCES[DEFAULT_GEOMETRY.circo])

  // Fills are fully opaque: a translucent overlay (circo/commune) would composite
  // over the colored dept-fill beneath it, so the same winner showed slightly
  // different shades depending on the département underneath. Hover/selected
  // feedback comes from the outlines instead.
  const fillPaint = (): maplibregl.FillLayerSpecification['paint'] => ({
    'fill-color': ['coalesce', ['feature-state', 'color'], '#e2e8f0'],
    'fill-opacity': 1,
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

  // "Came 1st" highlight (single-party view): a white border drawn only where the
  // feature-state `won` flag is set — zero width elsewhere, so it's invisible in
  // every other mode without needing layer-visibility toggling.
  const wonPaint = (width: number): maplibregl.LineLayerSpecification['paint'] => ({
    'line-color': '#ffffff',
    'line-width': ['case', ['boolean', ['feature-state', 'won'], false], width, 0],
    'line-opacity': ['case', ['boolean', ['feature-state', 'won'], false], 0.95, 0],
  })

  return {
    version: 8,
    // Self-hosted glyphs (public/fonts/Open Sans Bold/*.pbf) — the old
    // demotiles.maplibre.org endpoint 404s now, which killed all map labels.
    // Shipped with the static build (not R2), so no external runtime dependency.
    glyphs: `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`,
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
      { id: 'overseas-fill', type: 'fill', source: 'overseas', paint: fillPaint() },
      { id: 'overseas-outline', type: 'line', source: 'overseas', paint: outlinePaint(1.4) },

      // Département fill — always the base layer; provides full-France coverage at any zoom
      { id: 'dept-fill', type: 'fill', source: 'admin', 'source-layer': 'departements',
        layout: { visibility: 'visible' }, paint: fillPaint() },

      // Commune fill — rendered ON TOP of dept; only starts appearing where tippecanoe
      // has tiles (around zoom 7+). Starts hidden; shown in commune mode via setLayoutProperty.
      { id: 'communes-fill', type: 'fill', source: 'admin', 'source-layer': 'communes',
        minzoom: COMMUNE_MIN_ZOOM, filter: NOT_PLM_CITY,
        layout: { visibility: 'none' }, paint: fillPaint() },

      // Circonscription fill — separate PMTiles source, hidden by default
      { id: 'circo-fill', type: 'fill', source: 'circo', 'source-layer': 'circonscriptions',
        layout: { visibility: 'none' }, paint: fillPaint() },

      // Commune outlines — shown only in commune mode
      { id: 'communes-outline', type: 'line', source: 'admin', 'source-layer': 'communes',
        minzoom: COMMUNE_MIN_ZOOM, filter: NOT_PLM_CITY,
        layout: { visibility: 'none' },
        // Hover/selected feedback lives here now that the fill is opaque (width is
        // a zoom interpolation, so the emphasis is via colour + opacity only — a
        // zoom expression can't be nested inside a `case`).
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], '#0f172a',
            ['boolean', ['feature-state', 'hover'], false], '#1e293b',
            '#000000',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 10, 0.8, 13, 1.5],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false], 0.95,
            ['boolean', ['feature-state', 'hover'], false], 0.7,
            0.35,
          ],
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

      // "Came 1st" highlight borders — drawn only where feature-state `won` is set
      // (single-party view). Always present; zero-width when not won.
      { id: 'overseas-won', type: 'line', source: 'overseas', paint: wonPaint(1.8) },
      { id: 'dept-won', type: 'line', source: 'admin', 'source-layer': 'departements', paint: wonPaint(1.8) },
      { id: 'communes-won', type: 'line', source: 'admin', 'source-layer': 'communes',
        minzoom: COMMUNE_MIN_ZOOM, filter: NOT_PLM_CITY,
        paint: wonPaint(1.2) },
      { id: 'circo-won', type: 'line', source: 'circo', 'source-layer': 'circonscriptions', paint: wonPaint(1.6) },

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

/**
 * Re-paints the theme-dependent parts of the style at runtime (the style is
 * built once — gotcha #1 — so dark mode is a setPaintProperty pass, not a style
 * rebuild). Data colors (party palettes, gradients) are theme-invariant; only
 * the canvas changes: sea/background, uncolored-territory fallback, boundary
 * and selection strokes, label ink/halo. Also updates the module DEFAULT_COLOR
 * so feature-state defaults follow (callers re-run syncMapData after flipping).
 */
function applyMapTheme(map: maplibregl.Map, isDark: boolean) {
  DEFAULT_COLOR = isDark ? DEFAULT_COLOR_DARK : DEFAULT_COLOR_LIGHT

  map.setPaintProperty('background', 'background-color', isDark ? '#0f172a' : '#f1f5f9')

  // Fallback fill for territories with no feature-state color yet.
  for (const id of ['overseas-fill', 'dept-fill', 'communes-fill', 'circo-fill']) {
    map.setPaintProperty(id, 'fill-color', ['coalesce', ['feature-state', 'color'], DEFAULT_COLOR])
  }
  map.setPaintProperty('city-dots', 'circle-color', ['coalesce', ['feature-state', 'color'], DEFAULT_COLOR])

  // Selection/hover strokes must invert (near-black is invisible on a dark sea).
  const outlineCase = isDark
    ? ['case',
        ['boolean', ['feature-state', 'selected'], false], '#f8fafc',
        ['boolean', ['feature-state', 'hover'], false], '#cbd5e1',
        '#64748b']
    : ['case',
        ['boolean', ['feature-state', 'selected'], false], '#0f172a',
        ['boolean', ['feature-state', 'hover'], false], '#334155',
        '#64748b']
  for (const id of ['overseas-outline', 'dept-outline', 'circo-outline']) {
    map.setPaintProperty(id, 'line-color', outlineCase)
  }
  map.setPaintProperty('communes-outline', 'line-color', isDark
    ? ['case',
        ['boolean', ['feature-state', 'selected'], false], '#f8fafc',
        ['boolean', ['feature-state', 'hover'], false], '#e2e8f0',
        '#000000']
    : ['case',
        ['boolean', ['feature-state', 'selected'], false], '#0f172a',
        ['boolean', ['feature-state', 'hover'], false], '#1e293b',
        '#000000'])

  // Labels: invert ink and halo.
  const ink = isDark ? '#e2e8f0' : '#1e293b'
  const halo = isDark ? '#0f172a' : '#ffffff'
  for (const id of ['prefecture-labels', 'sous-prefecture-labels']) {
    map.setPaintProperty(id, 'text-color', ink)
    map.setPaintProperty(id, 'text-halo-color', halo)
  }
  map.setPaintProperty('top-cities-labels', 'text-color', isDark ? '#f1f5f9' : '#0f172a')
  map.setPaintProperty('top-cities-labels', 'text-halo-color', halo)
}

// Colors départements and mirrors the same colors onto the overseas GeoJSON source.
function applyDeptColors(
  map: maplibregl.Map,
  electionData: RoundData,
  palette: Palette | null,
  mode: ColorMode,
  national: NationalTotals | null,
) {
  const parties = partyByName(electionData.candidates)
  const codes = mode.kind === 'party' ? partyCodeSet(mode.party, palette) : undefined
  for (const dept of electionData.communes) {
    const color = territoryColor(dept, mode, palette, national, codes)
    const won = codes ? codes.has(parties.get(dept.leadingCandidate) ?? '') : false
    map.setFeatureState({ source: 'admin', sourceLayer: 'departements', id: dept.inseeCode }, { color, won })
    map.setFeatureState({ source: 'overseas', id: dept.inseeCode }, { color, won })
  }
}

// ── Département focus mode (two-axis P2) ──────────────────────────────────────
// When a département is the settled selection, everything outside it dims.
// Paint-expression based (fill-opacity keyed on the code property) rather than
// feature-state: one setPaintProperty per layer beats iterating ~35k communes,
// and MapLibre's default 300ms opacity transition gives the crossfade for free.
const FOCUS_DIM_OPACITY = 0.35
const DEPT_TO_CIRCO_ZPREFIX: Record<string, string> = {
  '971': 'ZA', '972': 'ZB', '973': 'ZC', '974': 'ZD', '975': 'ZS', '976': 'ZM',
}

function applyDeptFocus(map: maplibregl.Map, deptCode: string | null) {
  if (!deptCode) {
    for (const id of ['dept-fill', 'overseas-fill', 'communes-fill', 'circo-fill']) {
      map.setPaintProperty(id, 'fill-opacity', 1)
    }
    return
  }
  const focus = (test: maplibregl.ExpressionSpecification): maplibregl.ExpressionSpecification =>
    ['case', test, 1, FOCUS_DIM_OPACITY]
  // Dept layers match on the full code; communes/circos on their dept prefix
  // (overseas circos via their Z-code prefix — the tiles never saw INSEE codes).
  map.setPaintProperty('dept-fill', 'fill-opacity', focus(['==', ['get', 'code'], deptCode]))
  map.setPaintProperty('overseas-fill', 'fill-opacity', focus(['==', ['get', 'code'], deptCode]))
  map.setPaintProperty('communes-fill', 'fill-opacity',
    focus(['==', ['slice', ['get', 'code'], 0, deptCode.length], deptCode]))
  const zprefix = DEPT_TO_CIRCO_ZPREFIX[deptCode] ?? deptCode
  map.setPaintProperty('circo-fill', 'fill-opacity',
    focus(['==', ['slice', ['get', 'codeCirconscription'], 0, zprefix.length], zprefix]))
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

// Computes the color for every territory in the active granularity. In leader
// mode this reads the lightweight choropleth (full coverage, loads first); in a
// gradient mode it reads the full per-territory data (joined by inseeCode), so
// it falls back to a neutral color for territories the full data hasn't covered.
interface TerritoryState { color: string; won: boolean }

function computeActiveColors(
  choropleth: ChoroplethData,
  fullByCode: Map<string, CommuneResult>,
  palette: Palette | null,
  mode: ColorMode,
  national: NationalTotals | null,
): Map<string, TerritoryState> {
  const parties = partyByName(choropleth.candidates)
  const codes = mode.kind === 'party' ? partyCodeSet(mode.party, palette) : undefined
  const byCode = new Map<string, TerritoryState>()
  for (const c of choropleth.communes) {
    let color: string
    if (mode.kind === 'leader') {
      // Empty leader = annulled ballots (Conseil constitutionnel) → neutral.
      color = c.leadingCandidate
        ? getCandidateColor(c.leadingCandidate, 0, parties.get(c.leadingCandidate), palette)
        : DEFAULT_COLOR
    } else if (mode.kind === 'abstention' && c.abstention != null) {
      // Abstention rides on the lightweight choropleth — no full file needed.
      color = abstentionShade(c.abstention)
    } else {
      const entry = fullByCode.get(c.inseeCode)
      color = entry ? territoryColor(entry, mode, palette, national, codes) : DEFAULT_COLOR
    }
    // "Came 1st" in single-party view: the territory's leader belongs to the selected force.
    const won = codes ? codes.has(parties.get(c.leadingCandidate) ?? '') : false
    byCode.set(c.inseeCode, { color, won })
  }
  return byCode
}

// Applies the active-granularity colors + won flags to the polygon layer
// (handling circo Z-codes and obsolete merged-commune polygons).
function applyActiveLayerColors(map: maplibregl.Map, granularity: ChoroplethData['granularity'], byCode: Map<string, TerritoryState>) {
  const isCirco = granularity === 'circonscription'
  for (const [code, state] of byCode) {
    if (isCirco) {
      const id = INSEE_TO_CIRCO_ZCODE[code] ?? code
      map.setFeatureState({ source: 'circo', sourceLayer: 'circonscriptions', id }, state)
    } else {
      map.setFeatureState({ source: 'admin', sourceLayer: 'communes', id: code }, state)
    }
  }
  if (!isCirco) {
    // Tile geometry predates some commune mergers: mirror the absorbing commune's state.
    for (const [oldCode, currentCode] of Object.entries(MERGED_COMMUNE_TO_CURRENT)) {
      const state = byCode.get(currentCode)
      if (state) map.setFeatureState({ source: 'admin', sourceLayer: 'communes', id: oldCode }, state)
    }
  }
}

// Single source of truth for data → map sync: feature-state colors and layer
// visibility. Called both on initial map load and whenever the data changes.
function syncMapData(
  map: maplibregl.Map,
  electionData: RoundData | undefined,
  choroplethData: ChoroplethData | null | undefined,
  palette: Palette | null,
  fullData: RoundData | null,
  colorMode: ColorMode,
) {
  const national = electionData ? computeNationalTotals(electionData) : null
  if (electionData) applyDeptColors(map, electionData, palette, colorMode, national)

  const isCirco = choroplethData?.granularity === 'circonscription'
  const isCommune = choroplethData?.granularity === 'commune'
  const layerVisibility: Record<string, boolean> = {
    'communes-fill': isCommune,
    'communes-outline': isCommune,
    'communes-won': isCommune,   // hide so stale won-state from the other granularity can't draw
    'circo-fill': isCirco,
    'circo-outline': isCirco,
    'circo-won': isCirco,
    'city-dots': isCommune,
    'prefecture-labels': isCommune,
    'sous-prefecture-labels': isCommune,
  }
  for (const [layer, visible] of Object.entries(layerVisibility)) {
    map.setLayoutProperty(layer, 'visibility', visible ? 'visible' : 'none')
  }

  if (choroplethData) {
    const fullByCode = new Map((fullData?.communes ?? []).map((e) => [e.inseeCode, e]))
    const byCode = computeActiveColors(choroplethData, fullByCode, palette, colorMode, national)
    applyActiveLayerColors(map, choroplethData.granularity, byCode)
    if (isCommune) {
      for (const city of TOP_CITIES) {
        map.setFeatureState({ source: 'top-cities-points', id: city.inseeCode }, { color: byCode.get(city.inseeCode)?.color ?? DEFAULT_COLOR })
      }
    }
  }
}

// ── Hover tooltip ────────────────────────────────────────────────────────────
function escapeHTML(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// Compact snippet shown on hover: territory name, top candidates with %, turnout.
function hoverTipHTML(entry: CommuneResult, palette: Palette | null): string {
  const pct = (n: number) => n.toFixed(1).replace('.', ',')
  if (entry.annulled) {
    return `<div style="font-size:12px;min-width:148px;max-width:200px;">
      <div style="font-weight:700;margin-bottom:3px;">${escapeHTML(entry.name)}</div>
      <div style="color:#94a3b8;">Suffrages annulés<br>(Conseil constitutionnel)</div>
    </div>`
  }
  const sorted = [...entry.candidates].sort((a, b) => b.votes - a.votes).slice(0, 3)
  const rows = sorted.map((c) => {
    const color = getCandidateColor(c.name, 0, c.party, palette)
    return `<div style="display:flex;align-items:center;gap:6px;line-height:1.5;">
      <span style="width:8px;height:8px;border-radius:9999px;background:${color};flex:none;"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(c.name)}</span>
      <b style="margin-left:8px;">${pct(c.percentage)}%</b>
    </div>`
  }).join('')
  const turnout = entry.registeredVoters ? (entry.turnout / entry.registeredVoters) * 100 : 0
  return `<div style="font-size:12px;min-width:148px;max-width:200px;">
    <div style="font-weight:700;margin-bottom:3px;">${escapeHTML(entry.name)}</div>
    ${rows}
    <div style="color:#94a3b8;margin-top:3px;">Participation&nbsp;${pct(turnout)}%</div>
  </div>`
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

// Layer of a selection that did NOT come from a map click (navigator,
// breadcrumb, dept-insight rows): derived from the code shape. 5-char codes
// are ambiguous (overseas commune vs overseas circo) — the granularity decides.
function inferSelectionTarget(code: string, granularity: Granularity): { source: 'admin' | 'circo'; sourceLayer: SourceLayer } {
  if (isDeptCode(code)) return { source: 'admin', sourceLayer: 'departements' }
  if (code.length === 4 || (granularity !== 'commune' && code.length === 5)) {
    return { source: 'circo', sourceLayer: 'circonscriptions' }
  }
  return { source: 'admin', sourceLayer: 'communes' }
}

// ── Component ──────────────────────────────────────────────────────────────────
export function FranceMap({ electionData, choroplethData, fullData, palette, colorMode, geometry, mobile = false }: Props) {
  const metroFit = mobile ? METRO_FIT_MOBILE : METRO_FIT
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const electionDataRef = useRef(electionData)
  const choroplethRef = useRef(choroplethData)
  const fullDataRef = useRef(fullData)
  const paletteRef = useRef(palette)
  const colorModeRef = useRef(colorMode)
  const geom = geometry ?? DEFAULT_GEOMETRY
  const geometryRef = useRef(geom)
  const appliedGeometryRef = useRef(geom)

  const prevHoveredRef = useRef<HoverTarget | null>(null)
  const prevSelectedRef = useRef<HoverTarget | null>(null)
  // Hover tooltip: a MapLibre popup (positioned imperatively, no React re-render
  // per mousemove) + an inseeCode→result lookup for fast snippet resolution.
  const tipPopupRef = useRef<maplibregl.Popup | null>(null)
  const tipIdRef = useRef('')
  const lookupRef = useRef<Map<string, CommuneResult>>(new Map())
  // featureId is the raw tile feature id of the last map click (may differ from
  // clickedCommune for Z-coded circos and obsolete merged-commune polygons)
  const clickedSourceLayerRef = useRef<{ sourceLayer: SourceLayer; source: 'admin' | 'circo'; featureId?: string }>({
    sourceLayer: 'departements', source: 'admin',
  })

  const { setHoveredCommune, setClickedCommune, clickedCommune, granularity, focusedTerritory, setFocusedTerritory, flyTarget, setFlyTarget, flyBounds, setFlyBounds, setMapZoomedIn, mapZoomedIn, zoomedAway, setZoomedAway, isDark } = useElectionStore()
  const isOverview = useIsOverview()
  // Overseas insets share the overlay auto-hide: visible only at the overview AND not zoomed in.
  const showInsets = isOverview && !mapZoomedIn
  // `zoomedAway` (store) — whether the map is zoomed in past the overview baseline
  // (any amount). Drives the mobile "back to overview" button AND the national
  // snippet's auto-hide, so both react even to a mild dept-level zoom, unlike the
  // coarser `mapZoomedIn` (fixed z8 threshold, tuned for overlay hiding).
  // `overviewZoomRef` caches the overview's own zoom for the comparison.
  const overviewZoomRef = useRef(0)
  // Mirrors `isDark` for callbacks that outlive renders (geometry-change re-theme).
  const isDarkRef = useRef(false)
  // Portal container for the mobile overseas inset — handed to a MapLibre Marker
  // (geo-anchored at OVERSEAS_INSET_LNGLAT) so the inset moves with the map.
  // Created once per mount via the lazy initializer (detached until the marker
  // adopts it); React renders into it through createPortal below.
  const [overseasInsetEl] = useState(() => document.createElement('div'))

  // Fast lookup for the hover tooltip: département entries + full per-territory data.
  useEffect(() => {
    const m = new Map<string, CommuneResult>()
    if (electionData) for (const c of electionData.communes) m.set(c.inseeCode, c)
    if (fullData) for (const c of fullData.communes) m.set(c.inseeCode, c)
    lookupRef.current = m
  }, [electionData, fullData])

  // ── Map initialisation (runs once) ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    ensurePMTiles()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(geometryRef.current),
      bounds: METRO_BOUNDS,
      fitBoundsOptions: metroFit,
      attributionControl: false,
    })

    // Desktop only: on mobile the top bar occupies the top-right and pinch-zoom
    // replaces the +/- buttons.
    if (!mobile) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // Mobile: geo-anchor the overseas inset in the sea below France, printed-map
    // style — it pans/zooms with the terrain instead of floating over it.
    if (mobile) {
      new maplibregl.Marker({ element: overseasInsetEl, anchor: 'center' })
        .setLngLat(OVERSEAS_INSET_LNGLAT)
        .addTo(map)
    }

    // Auto-hide the floating overlays once zoomed in (only fire on threshold crossing).
    let wasZoomedIn = false
    let wasAway = false
    map.on('zoom', () => {
      const zoomedIn = map.getZoom() >= ZOOM_HIDE_OVERLAYS
      if (zoomedIn !== wasZoomedIn) { wasZoomedIn = zoomedIn; setMapZoomedIn(zoomedIn) }
      // "Away from overview" = zoomed in beyond the overview's own zoom (+ a small
      // margin so a settle wobble doesn't flicker the back button).
      if (!overviewZoomRef.current) {
        overviewZoomRef.current = map.cameraForBounds(METRO_BOUNDS, metroFit)?.zoom ?? map.getZoom()
      }
      const away = map.getZoom() > overviewZoomRef.current + 0.3
      if (away !== wasAway) { wasAway = away; setZoomedAway(away) }
    })
    mapRef.current = map

    const tipPopup = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, className: 'hover-tip', offset: 14, maxWidth: '220px',
    })
    tipPopupRef.current = tipPopup

    // Resolve a hovered feature id to its result entry (handles the overseas
    // commune → département fallback) and show/move the tooltip.
    const showTip = (e: maplibregl.MapMouseEvent, code: string) => {
      if (tipIdRef.current !== code) {
        const m = lookupRef.current
        const entry = m.get(code)
          ?? (code.length === 5 && (code.startsWith('97') || code.startsWith('98')) ? m.get(code.slice(0, 3)) : undefined)
        if (!entry) { tipPopup.remove(); tipIdRef.current = ''; return }
        tipPopup.setHTML(hoverTipHTML(entry, paletteRef.current))
        tipIdRef.current = code
      }
      tipPopup.setLngLat(e.lngLat)
      if (!tipPopup.isOpen()) tipPopup.addTo(map)
    }
    const hideTip = () => { tipPopup.remove(); tipIdRef.current = '' }

    map.on('load', () => {
      syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current, fullDataRef.current, colorModeRef.current)
    })

    // ── Hover handlers — one per fill layer ──────────────────────────────────
    const makeMouseMoveHandler = (sourceLayer: SourceLayer, source: 'admin' | 'circo') =>
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        map.getCanvas().style.cursor = 'pointer'
        const id = String(e.features?.[0]?.id ?? '')
        if (!id) return
        // Resolve to a code our data can look up: merged communes → absorbing
        // commune; circo Z-codes → INSEE.
        const resolved = source === 'circo'
          ? (CIRCO_ZCODE_TO_INSEE[id] ?? id)
          : sourceLayer === 'communes'
          ? (MERGED_COMMUNE_TO_CURRENT[id] ?? id)
          : id
        // Reposition the tooltip every move (cheap — only rebuilds on feature change)
        showTip(e, resolved)

        if (prevHoveredRef.current?.id === id && prevHoveredRef.current?.sourceLayer === sourceLayer) return
        if (prevHoveredRef.current) {
          map.setFeatureState(
            { source: prevHoveredRef.current.source, sourceLayer: prevHoveredRef.current.sourceLayer, id: prevHoveredRef.current.id },
            { hover: false },
          )
        }
        prevHoveredRef.current = { id, sourceLayer, source }
        map.setFeatureState({ source, sourceLayer, id }, { hover: true })
        setHoveredCommune(resolved)
      }

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ''
      hideTip()
      if (prevHoveredRef.current) {
        map.setFeatureState(
          { source: prevHoveredRef.current.source, sourceLayer: prevHoveredRef.current.sourceLayer, id: prevHoveredRef.current.id },
          { hover: false },
        )
        prevHoveredRef.current = null
        setHoveredCommune(null)
      }
    }

    // overseas-fill (always-visible GeoJSON) overlaps circo/commune polygons when
    // zoomed into a territory. Skip its hover when a more specific layer is also
    // under the cursor, else it would overwrite the circo/commune tooltip with the
    // département entry (it's registered last, so it fires last).
    const overseasMove = makeMouseMoveHandler('departements', 'admin')
    const handleOverseasMove = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      const moreSpecific = map.queryRenderedFeatures(e.point, { layers: ['circo-fill', 'communes-fill'] })
      if (moreSpecific.length > 0) return
      overseasMove(e)
    }

    map.on('mousemove', 'dept-fill', makeMouseMoveHandler('departements', 'admin'))
    map.on('mousemove', 'communes-fill', makeMouseMoveHandler('communes', 'admin'))
    map.on('mousemove', 'circo-fill', makeMouseMoveHandler('circonscriptions', 'circo'))
    map.on('mousemove', 'overseas-fill', handleOverseasMove)
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

    return () => { tipPopup.remove(); tipPopupRef.current = null; map.remove(); mapRef.current = null }
  }, [setHoveredCommune, setClickedCommune, setMapZoomedIn, setZoomedAway, metroFit, mobile, overseasInsetEl])

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
      // A style rebuild resets paint props to their light defaults — re-theme first.
      applyMapTheme(map, isDarkRef.current)
      syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current, fullDataRef.current, colorModeRef.current)
      // Re-apply the dept-focus dimming (fill-opacity was reset to 1 too).
      const cc = useElectionStore.getState().clickedCommune
      applyDeptFocus(map, cc && isDeptCode(cc) ? cc : null)
    })
  }, [geom])

  // ── Sync election/choropleth/mode → feature state colors + layer visibility ─
  useEffect(() => {
    electionDataRef.current = electionData
    choroplethRef.current = choroplethData
    fullDataRef.current = fullData
    paletteRef.current = palette
    colorModeRef.current = colorMode
    const map = mapRef.current
    if (!map) return
    if (!map.isStyleLoaded()) {
      // Cold load: the data can arrive before the style finishes. Don't drop the
      // sync — defer it until the map settles, reading the latest data from refs.
      const onReady = () => syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current, fullDataRef.current, colorModeRef.current)
      map.once('idle', onReady)
      return () => { map.off('idle', onReady) }
    }
    syncMapData(map, electionData, choroplethData, palette, fullData, colorMode)
  }, [choroplethData, electionData, fullData, palette, colorMode])

  // ── Theme (dark mode) ──────────────────────────────────────────────────────
  // Re-paints the theme-dependent style props, then re-runs the data sync so
  // feature-state defaults (uncolored territories, city dots) pick up the new
  // DEFAULT_COLOR. Handles the cold path via `once('idle')` like the data sync.
  useEffect(() => {
    isDarkRef.current = isDark
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      applyMapTheme(map, isDark)
      syncMapData(map, electionDataRef.current, choroplethRef.current, paletteRef.current, fullDataRef.current, colorModeRef.current)
    }
    if (!map.isStyleLoaded()) {
      map.once('idle', apply)
      return () => { map.off('idle', apply) }
    }
    apply()
  }, [isDark])

  // ── Fly to focused overseas territory ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (focusedTerritory && OVERSEAS_BOUNDS[focusedTerritory]) {
      map.fitBounds(OVERSEAS_BOUNDS[focusedTerritory], { padding: 40, duration: 800 })
    } else if (!focusedTerritory) {
      map.fitBounds(METRO_BOUNDS, { ...metroFit, duration: 800 })
    }
  }, [focusedTerritory, metroFit])

  // ── Fly to programmatic target (e.g. city list click) ────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyTarget) return
    map.flyTo({ center: [flyTarget.lng, flyTarget.lat], zoom: flyTarget.zoom, duration: 800 })
    setFlyTarget(null)
  }, [flyTarget, setFlyTarget])

  // ── Fly to programmatic bounds (territory navigator: dept/circo bbox, or
  //    'overview' to re-fit metropolitan France with layout-aware padding) ───
  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyBounds) return
    if (flyBounds === 'overview') {
      map.fitBounds(METRO_BOUNDS, { ...metroFit, duration: 800 })
    } else {
      const [w, s, e, n] = flyBounds
      map.fitBounds([[w, s], [e, n]], { padding: 60, duration: 800, maxZoom: 12 })
    }
    setFlyBounds(null)
  }, [flyBounds, setFlyBounds, metroFit])

  // ── Département focus: dim the map outside the settled dept (two-axis P2) ──
  const focusedDept = clickedCommune && isDeptCode(clickedCommune) ? clickedCommune : null
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => applyDeptFocus(map, focusedDept)
    if (!map.isStyleLoaded()) {
      map.once('idle', apply)
      return () => { map.off('idle', apply) }
    }
    apply()
  }, [focusedDept])

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
      const { sourceLayer: clickLayer, source: clickSource, featureId } = clickedSourceLayerRef.current
      // clickedCommune holds an INSEE code; the PMTiles circo layer uses Z-codes and
      // merged-commune polygons carry obsolete codes. Prefer the raw feature id of the
      // click when it still resolves to clickedCommune; otherwise the selection came
      // from elsewhere (navigator, breadcrumb, insight rows) and the click ref may
      // point at the wrong layer — infer the target from the code shape instead.
      const clickedFeatureMatches =
        featureId !== undefined &&
        (clickSource === 'circo'
          ? (CIRCO_ZCODE_TO_INSEE[featureId] ?? featureId)
          : (MERGED_COMMUNE_TO_CURRENT[featureId] ?? featureId)) === clickedCommune
      const { source, sourceLayer } = clickedFeatureMatches
        ? { source: clickSource, sourceLayer: clickLayer }
        : inferSelectionTarget(clickedCommune, granularity)
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
  }, [clickedCommune, granularity])

  return (
    <div className="h-full w-full relative">
      <div ref={containerRef} className="h-full w-full" />
      {!mobile && (
        <div
          className="transition-opacity duration-300"
          style={{ opacity: showInsets ? 1 : 0, pointerEvents: showInsets ? 'auto' : 'none' }}
        >
          <OverseasInsets electionData={electionData} palette={palette} />
        </div>
      )}
      {!mobile && !isOverview && (
        <button
          className="absolute top-3 left-3 z-20 text-xs text-gray-600 hover:text-gray-900 bg-white dark:bg-slate-900 dark:text-gray-300 dark:hover:text-gray-100 border border-gray-200 dark:border-slate-700 rounded px-2 py-1 shadow-sm"
          onClick={() => {
            setFocusedTerritory(null)
            setClickedCommune(null)
            mapRef.current?.fitBounds(METRO_BOUNDS, { ...metroFit, duration: 800 })
          }}
        >
          ← Vue générale
        </button>
      )}
      {/* Mobile: icon-only "back to overview" — shown whenever the map is away from
          the overview (a selection/focus is active OR the user has zoomed in, by
          click or pinch). Lives here (not MobileLayout) so it can fitBounds the map.
          `pointer-events-auto` keeps it tappable even if a sheet locks the body. */}
      {mobile && (zoomedAway || !isOverview) && (
        <button
          type="button"
          aria-label="Revenir à la vue d'ensemble"
          className="pointer-events-auto absolute left-3 top-[calc(6.5rem+env(safe-area-inset-top))] z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:bg-slate-900/90 dark:text-gray-200 dark:ring-white/10"
          onClick={() => {
            setFocusedTerritory(null)
            setClickedCommune(null)
            mapRef.current?.fitBounds(METRO_BOUNDS, { ...metroFit, duration: 800 })
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      {/* Mobile: +/− zoom buttons for users who prefer taps over pinch. Top-right
          under the header (mirrors the back button top-left; the bottom-right is
          taken by the theme chip and the national snippet card spans above it);
          z-10 keeps them under the Hemicycle cover (z-20) so they vanish there. */}
      {mobile && (
        <div className="absolute right-3 top-[calc(6.5rem+env(safe-area-inset-top))] z-10 flex flex-col overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:bg-slate-900/90 dark:ring-white/10">
          <button
            type="button"
            aria-label="Zoomer"
            className="flex h-11 w-11 items-center justify-center text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-slate-800"
            onClick={() => mapRef.current?.zoomIn()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span className="mx-2 h-px bg-gray-200 dark:bg-slate-700" />
          <button
            type="button"
            aria-label="Dézoomer"
            className="flex h-11 w-11 items-center justify-center text-gray-700 active:bg-gray-100 dark:text-gray-200 dark:active:bg-slate-800"
            onClick={() => mapRef.current?.zoomOut()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 12h14" />
            </svg>
          </button>
        </div>
      )}
      {/* Mobile overseas inset — rendered into the geo-anchored Marker's element,
          so it lives ON the map (pans/zooms with it) rather than floating above. */}
      {mobile && createPortal(
        <MobileOverseasCluster electionData={electionData} palette={palette} />,
        overseasInsetEl,
      )}
    </div>
  )
}
