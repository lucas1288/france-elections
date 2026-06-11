# CLAUDE.md — AI context for france-elections

This file gives an AI assistant full technical context for the `france-elections` project so it can contribute effectively from the first message of any session.

---

## Project summary

A React + MapLibre GL JS interactive choropleth map of French presidential election results (currently: Présidentielle 2022, rounds 1 & 2). Users can view results at commune or circonscription granularity, click geographic units to see detailed results in a sidebar, zoom into overseas territories, and explore Français à l'étranger results on a small world map.

**Owner**: lucas (lucas1288 on GitHub, lucas.riveill@gmail.com)
**Stack**: React 19, TypeScript, Vite 6, Tailwind CSS 3, MapLibre GL JS 5, PMTiles 4, Zustand 5, TanStack Query 5, D3-geo, topojson-client

---

## Key architectural decisions

### 1. Feature state coloring (not data-driven styling)
Map colors are applied via `map.setFeatureState(...)` after data loads, not via MapLibre data-driven paint expressions reading from tile properties. This avoids re-building the style on data change and enables instant re-coloring when the election/round changes.

### 2. Two separate PMTiles files
- `france-admin.pmtiles` — communes (`promoteId: code`) + départements (`promoteId: code`). The dept layer is **always visible** as the base layer at all zoom levels. Commune layer has `minzoom: 7`.
- `circonscriptions.pmtiles` — 577 circos (`promoteId: codeCirconscription`). Overseas circos use Z-codes as feature IDs (`ZA01`…`ZM02`).

### 3. Z-code / INSEE bidirectional translation
The circo PMTiles uses Z-codes for overseas features (`ZA01` = Guadeloupe 1ère) but the parsed election JSON uses INSEE-derived codes (`97101`). Two lookup tables in `FranceMap.tsx` handle translation:
- `INSEE_TO_CIRCO_ZCODE` — used when calling `setFeatureState` (map coloring)
- `CIRCO_ZCODE_TO_INSEE` — used in click handlers (so `clickedCommune` holds the INSEE code that `ResultsPanel` can look up)

### 4. Lazy loading of full data
The département-level (`round1.json`, ~107 entries) and circo choropleth (`round1-circ-choropleth.json`) load eagerly. Full commune data (~34 MB) and full circo data are loaded on demand via TanStack Query's `enabled` flag when the relevant tab is active.

### 5. `clickedCommune` is the universal selection key
The Zustand store field `clickedCommune` stores the INSEE code of whatever is selected, regardless of granularity. `ResultsPanel` resolves it against the appropriate dataset based on `granularity`. Code `'99'` is reserved for the Français à l'étranger aggregate; codes `'9901'`–`'9911'` are the 11 overseas French circos.

### 6. Click event priority on overlapping layers
`overseas-fill` (GeoJSON, always visible) overlaps `circo-fill` and `communes-fill` geographically. The `overseas-fill` click handler calls `map.queryRenderedFeatures` to detect if a more-specific layer was also hit and skips if so. This prevents the dept code from overwriting a circo or commune code.

### 7. `flyTarget` for programmatic zoom
When the user clicks a city from the sidebar list, the component calls `setFlyTarget({ lng, lat, zoom })`. `FranceMap` watches this field and calls `map.flyTo(...)`, then clears it. This avoids passing callbacks between components.

---

## File-by-file reference

### `src/App.tsx`
- Root layout: top bar (ElectionSelector + GranularityToggle) + map area + sidebar
- Orchestrates all data queries and passes data down as props
- Renders `FranceMap`, `Legend`, `AbroadMap`, `ResultsPanel` 
- `Legend` and `AbroadMap` are stacked in an `absolute top-4 right-14` flex column
- `AbroadMap` fades out (`opacity-0 pointer-events-none`) when `clickedCommune` is set (non-'99') or `focusedTerritory` is set

### `src/store/electionStore.ts`
Zustand store. Fields:
- `selected: { type, year, round }` — active election
- `granularity: 'commune' | 'circonscription'`
- `hoveredCommune: string | null` — hovered feature INSEE code
- `clickedCommune: string | null` — selected feature INSEE code (toggles to null on re-click)
- `focusedTerritory: string | null` — overseas territory dept code (e.g. '971')
- `flyTarget: { lng, lat, zoom } | null` — consumed by FranceMap, cleared after use

### `src/hooks/useElectionData.ts`
TanStack Query hooks:
- `useElectionData(type, year, round)` — dept-level `round{N}.json` (always enabled)
- `useChoroplethData(type, year, round)` — commune choropleth (always enabled, returns null if 404)
- `useCircoChoroplethData(type, year, round)` — circo choropleth (always enabled)
- `useFullCommuneData(type, year, round, enabled)` — full commune JSON (~34 MB), only when commune tab active
- `useFullCircoData(type, year, round, enabled)` — full circo JSON, only when circo tab active

### `src/components/FranceMap.tsx`
The most complex component. Key responsibilities:
- Initialises MapLibre map once (cleanup on unmount)
- `makeStyle()` — builds the full MapLibre style spec: sources + all layers. Called once; style never rebuilt.
- `applyChoroplethColors()` — iterates choropleth communes, calls `setFeatureState`. Handles Z-code translation for circos.
- `applyDeptColors()` — applies dept-level colors from `electionData`
- Hover handlers — per layer, track `prevHoveredRef` to clear previous hover
- Click handlers — per layer, translate Z-codes, call `setClickedCommune`. `overseas-fill` handler guards against overwriting circo/commune clicks.
- `getFeatureBounds()` — extracts `LngLatBoundsLike` from a GeoJSON Polygon/MultiPolygon for zoom-to-feature
- Effects:
  - `[setHoveredCommune, setClickedCommune]` — map init, runs once
  - `[choroplethData, electionData]` — syncs colors + layer visibility; also updates city dot feature states
  - `[focusedTerritory]` — flies to overseas territory or back to METRO_BOUNDS
  - `[flyTarget, setFlyTarget]` — handles programmatic fly-to from city list clicks
  - `[clickedCommune]` — syncs selected feature highlight; translates INSEE→Zcode for circos

**Layer visibility management**: commune/circo layers are toggled via `setLayoutProperty` in the choropleth effect. `city-dots`, `prefecture-labels`, `sous-prefecture-labels` are also toggled there (commune mode only). The `← Vue générale` button shows when `focusedTerritory || (clickedCommune && clickedCommune !== '99')` and calls `setFocusedTerritory(null)` + `setClickedCommune(null)` + `fitBounds(METRO_BOUNDS)`.

### `src/components/ResultsPanel.tsx`
Sidebar. Three states:
1. **Idle + commune granularity** — city list with candidate dots + fly-to on click + `setClickedCommune`
2. **Idle + circo granularity** — ranked bar chart of candidates by circos won (1st from choropleth, 2nd from full circo data when loaded)
3. **Active** — full results for `clickedCommune ?? hoveredCommune`

Overseas fallback: `overseasDeptCode(code)` detects 5-digit overseas codes (starting with '97'/'98'), looks up the 3-digit département code in `electionData`, and shows an amber notice banner.

### `src/components/AbroadMap.tsx`
D3 Natural Earth 1 world map (210×107px SVG). Fetches `land-110m.json` on mount and renders continent outlines via topojson. Shows 11 circo dots colored by leading candidate (always visible, all tabs). Click behavior differs by granularity:
- Commune tab: whole SVG is clickable → `setClickedCommune('99')`
- Circo tab: each dot is individually clickable → `setClickedCommune('9901'…'9911')`

Selected dot: larger radius + thicker stroke. Selected aggregate: SVG outline border.

### `src/components/Legend.tsx`
Simple candidate color key, top-right floating panel. No state. Receives only `electionData`.

### `src/components/OverseasInsets.tsx`
D3-geo SVG thumbnails for overseas territories. Clicking a thumbnail calls `setFocusedTerritory(code)`. Wrapped in a fading div in `FranceMap.tsx` that hides when zoomed in.

### `src/utils/partyColors.ts`
`getCandidateColor(name, index, party)` — returns hex color for a candidate. Macron → orange, Le Pen → navy, Mélenchon → red, etc. Falls back to a D3 categorical scale by index.

### `src/utils/topCities.ts`
`TOP_CITIES: TopCity[]` — 30 most populated communes (INSEE 2023 populations légales, pub. déc. 2025). Each entry has `{ name, inseeCode, population, lng, lat, zoom }`. `TOP_CITY_CODES` is the derived inseeCode array used for the map highlight filter.

Notable: includes Saint-Denis La Réunion (`97411`) and Saint-Denis Seine-Saint-Denis (`93066`).

### `src/utils/adminCenters.ts`
`ADMIN_CENTERS: AdminCenter[]` — ~101 préfectures + ~229 sous-préfectures. Coordinates sourced from `geo.api.gouv.fr` API. Each entry: `{ name, inseeCode, type: 'prefecture' | 'sous-prefecture', lng, lat }`. Used as a static GeoJSON source in `makeStyle()` for the `prefecture-labels` and `sous-prefecture-labels` symbol layers.

---

## Data format reference

### `round1.json` / `round2.json` (département level)
```typescript
{
  election: { type: 'presidential', year: 2022, round: 1 },
  candidates: [{ name: string, party: string }],
  communes: [{
    inseeCode: string,   // dept code: '01'…'95', '971'…'977', '986'…'988', '99' (abroad)
    name: string,
    registeredVoters: number,
    turnout: number,
    blankVotes: number,
    nullVotes: number,
    expressedVotes: number,
    leadingCandidate: string,
    candidates: [{ name, party, votes, percentage }]
  }]
}
```
Note: `round2.json` is missing the `'99'` (Français à l'étranger) entry.

### `round1-communes-choropleth.json` (commune choropleth)
```typescript
{
  granularity: 'commune',
  year: 2022, round: 1,
  candidates: [{ name, party }],
  communes: [{ inseeCode: string, leadingCandidate: string }]   // ~35,000 entries
}
```
Only metropolitan France + Corsica. Overseas communes absent.

### `round1-circ-choropleth.json` (circo choropleth)
```typescript
{
  granularity: 'circonscription',
  year: 2022, round: 1,
  candidates: [{ name, party }],
  communes: [{ inseeCode: string, leadingCandidate: string }]   // 577 metro + 11 abroad (9901–9911)
}
```

### `round1-circ.json` (full circo)
Same shape as `round1.json` but with `~588` commune entries (577 metro circos with full candidate breakdown + 11 abroad circos `9901`–`9911`).

---

## INSEE / Z-code mapping for overseas circos

| Dept | Z-code prefix | INSEE prefix | Example |
|------|--------------|--------------|---------|
| Guadeloupe (971) | ZA | 971 | ZA01 ↔ 97101 |
| Martinique (972) | ZB | 972 | ZB01 ↔ 97201 |
| Guyane (973) | ZC | 973 | ZC01 ↔ 97301 |
| La Réunion (974) | ZD | 974 | ZD01 ↔ 97401 |
| Saint-Pierre-et-Miquelon (975) | ZS | 975 | ZS01 ↔ 97501 |
| Mayotte (976) | ZM | 976 | ZM01 ↔ 97601 |

Français à l'étranger circos: `9901`–`9911` (INSEE codes used throughout; no Z-code mapping needed).

---

## Zoom levels and layer visibility

| Zoom range | What's visible |
|---|---|
| 0–5 | Background, overseas-fill, dept-fill (colored), dept-outline |
| 5–7 | + top-cities-highlight (city boundary outlines), city-dots (commune mode) |
| 7–8 | + communes-fill (commune mode), communes-outline |
| 8+ | city-dots fade out; top-cities-labels + prefecture-labels appear (commune mode) |
| 10+ | sous-prefecture-labels appear (commune mode) |

---

## Common gotchas

1. **`makeStyle()` is called once** — never rebuilt. Layer visibility is toggled via `setLayoutProperty`, not by rebuilding the style.
2. **`promoteId` keeps the property** — for vector tile sources with `promoteId`, the promoted property stays accessible via `['get', 'code']` in filter/paint expressions AND becomes the feature ID.
3. **`communes-fill` minzoom is 7** — below zoom 7, tippecanoe has dropped most commune features. The dept fill provides color continuity. Don't rely on commune features being present below zoom 7.
4. **`setClickedCommune` toggles** — calling it with the same code that's already set will clear it (null), because the store uses `s.clickedCommune === inseeCode ? null : inseeCode`.
5. **Overseas commune data is absent** — `round1-communes.json` has zero overseas entries. The `overseasDeptCode()` function in `ResultsPanel.tsx` handles the fallback.
6. **`flyTarget` is consumed once** — FranceMap sets it to null after use. Don't depend on it persisting.
7. **AbroadMap is always shown** — it fades out visually when zoomed in but stays mounted. The `opacity` + `pointer-events-none` approach avoids remounting the D3 map.
8. **`circoQuery` is always loaded** — `useCircoChoroplethData` has no `enabled` guard. It always fetches, so the abroad circo results are always available regardless of active tab.

---

## Development notes

- `npm run dev` — starts Vite dev server at `http://localhost:5173`
- `npx tsc --noEmit` — type-check without building (zero errors expected)
- Map glyph source: `https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf` (used for all text labels; font: `Open Sans Bold`)
- World land data: `public/data/geo/land-110m.json` (copied from `node_modules/world-atlas/land-110m.json` at setup time)
