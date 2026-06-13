# France Elections

An interactive map of French election results, built with React, MapLibre GL JS, and PMTiles. Browse results at commune or circonscription level, zoom into overseas territories, and inspect per-candidate vote shares for any geographic unit.

---

## What it does

- **Two-granularity choropleth map** — switch between two levels of detail:
  - **Commune** (~35,000 communes, loads on demand, ~34 MB) — default tab
  - **Circonscription législative** (577 circos, loads on demand)
- **Zoom-in on click** — clicking any commune or circonscription animates the map to fit that unit's bounds. A **← Vue générale** button returns to the full-France view.
- **Overseas territories** — a column of D3-geo SVG insets on the left renders all ten overseas territories. Clicking any inset zooms the main map to that territory. The insets (and the abroad panel) hide automatically when zoomed into a feature, and reappear on return to overview.
- **Results sidebar** — hover or click any geographic unit to see full candidate results: turnout, blank/null votes, and a ranked bar chart of all candidates with vote counts.
- **Election selector** — switch between elections and rounds from the top bar. Currently: Présidentielle 2022 (rounds 1 & 2).
- **Candidate color legend** — top-right overlay showing the leading color for each candidate in the current election.
- **Consistent coloring** — each candidate is assigned an official or conventional party color that is stable across all granularities and views.

### Commune tab features
- **30 biggest cities** (INSEE 2023 data) — listed in the sidebar with 1st and 2nd place candidate dots. Clicking any city zooms to it and shows its results. The list includes Saint-Denis (La Réunion) and Saint-Denis (Seine-Saint-Denis).
- **City dots on map** — at low zoom (< zoom 8), colored dots appear at each city's location, colored by its leading candidate. Fade out as commune polygons become visible.
- **City boundary highlights** — black outlines on the 30 biggest city commune polygons, visible at all zoom levels.
- **Préfecture & sous-préfecture labels** — city names for all ~101 French préfectures appear at zoom ≥ 8; ~229 sous-préfecture names appear at zoom ≥ 10. Both use `geo.api.gouv.fr`-verified coordinates and are only shown in commune mode.

### Circonscription tab features
- **Idle state summary** — when no circo is selected, the sidebar shows a ranked bar chart of candidates by number of circonscriptions won, including 2nd-place counts (stacked bar: solid for 1st, faded for 2nd).

### Français à l'étranger
- A small world map (D3 Natural Earth projection, continent outlines from Natural Earth 110m) is shown below the candidate legend.
- **Commune/circo tabs**: shows colored dots for all 11 overseas French circonscriptions (coded `9901`–`9911`), always visible. In commune tab, clicking the globe shows the aggregate abroad result (`inseeCode: '99'`). In circo tab, each dot is individually clickable.
- Commune-level results exist for all DOM/COM communes (searchable via the sidebar search field), though the map tiles have no commune polygons for them — clicks on overseas territories resolve at département level, with a notice in the sidebar when commune data is unavailable.

---

## Architecture

```
src/
├── App.tsx                  — root layout, election/granularity selectors, data orchestration
├── store/
│   └── electionStore.ts     — Zustand store: selected election, granularity, hover/click/focus/flyTarget state
├── hooks/
│   └── useElectionData.ts   — TanStack Query hooks for all data fetches
├── components/
│   ├── FranceMap.tsx        — MapLibre GL JS map, PMTiles sources, feature state coloring, click/hover handlers
│   ├── OverseasInsets.tsx   — D3-geo SVG insets for overseas territories
│   ├── ResultsPanel.tsx     — sidebar: city list (commune), circo summary (circo), or per-unit results
│   ├── AbroadMap.tsx        — D3 Natural Earth world map for Français à l'étranger results
│   ├── ElectionSelector.tsx — election + round picker
│   └── Legend.tsx           — candidate color key
├── utils/
│   ├── partyColors.ts       — name/party → hex color lookup
│   ├── topCities.ts         — top 30 communes by population (INSEE 2023), with coordinates
│   └── adminCenters.ts      — all French préfectures + sous-préfectures with geo.api.gouv.fr coordinates
└── types/
    └── election.ts          — TypeScript interfaces for all election data

public/data/
├── elections/
│   └── presidential/2022/
│       ├── round1.json                    — département-level results, round 1 (includes code '99' for Français à l'étranger)
│       ├── round2.json                    — département-level results, round 2
│       ├── round1-communes.json           — full commune results, round 1 (~34 MB, metropolitan + Corsica only)
│       ├── round1-communes-choropleth.json — compact choropleth: inseeCode + leader only
│       ├── round2-communes-choropleth.json
│       ├── round1-circ.json               — full circonscription results, round 1 (includes 9901–9911 for abroad)
│       ├── round1-circ-choropleth.json    — compact circo choropleth (includes 9901–9911)
│       ├── round2-circ.json
│       └── round2-circ-choropleth.json
├── geo/
│   ├── overseas.geojson     — boundaries for all 10 overseas territories
│   └── land-110m.json       — Natural Earth 110m land polygons (topojson, for AbroadMap continent outlines)
└── tiles/
    ├── france-admin.pmtiles      — communes + départements as vector tiles
    └── circonscriptions.pmtiles  — 577 circonscriptions as vector tiles
```

---

## Technology stack

| Layer | Library / Tool | Role |
|---|---|---|
| **Framework** | React 19 + TypeScript | Component tree and type safety |
| **Build** | Vite 6 | Dev server and production bundler |
| **Styling** | Tailwind CSS 3 | Utility-class layout and UI chrome |
| **Map renderer** | MapLibre GL JS 5 | WebGL vector tile rendering |
| **Vector tiles** | PMTiles 4 | Single-file, serverless tile archives |
| **Tile generation** | tippecanoe | GeoJSON → PMTiles conversion |
| **Inset maps** | D3-geo | SVG projection for overseas territory thumbnails |
| **World map** | D3-geo + topojson-client | SVG Natural Earth projection for AbroadMap |
| **State** | Zustand 5 | Shared UI state (hover, click, granularity, focusedTerritory, flyTarget) |
| **Data fetching** | TanStack Query 5 | Caching, lazy loading, staleTime management |
| **Data parsing** | Node.js ESM scripts | Ministry fixed-width TXT → structured JSON |

---

## Map rendering approach

The map uses three **MapLibre sources**:

1. **`admin` (PMTiles)** — `france-admin.pmtiles` with two source layers:
   - `communes` — ~35,000 commune polygons (tippecanoe drops small features below zoom 7, so the département fill acts as background at low zoom)
   - `departements` — 96 département polygons, always visible as a base

2. **`circo` (PMTiles)** — `circonscriptions.pmtiles` — 577 circonscription polygons. Overseas circos use Z-codes (`ZA01`–`ZD07`, etc.) as feature IDs.

3. **`overseas` (GeoJSON)** — `overseas.geojson` — polygon boundaries for all 10 overseas territories.

4. **`top-cities-points` (GeoJSON)** — point features for the 30 biggest cities, used for city dots (circle layer) and city name labels (symbol layer).

5. **`admin-centers` (GeoJSON)** — point features for all préfectures and sous-préfectures, used for admin center labels (symbol layers).

**Layer order** (bottom to top):
`background` → `overseas-fill` → `overseas-outline` → `dept-fill` → `communes-fill` (minzoom 7) → `circo-fill` → `top-cities-highlight-bg` → `top-cities-highlight` → `communes-outline` → `dept-outline` → `circo-outline` → `city-dots` (maxzoom 8) → `prefecture-labels` (minzoom 8) → `sous-prefecture-labels` (minzoom 10) → `top-cities-labels` (minzoom 8)

**Coloring** is done entirely through MapLibre's **feature state** system. City dot colors are also set via feature state on the `top-cities-points` source.

**Z-code / INSEE translation** — the circo PMTiles uses Z-codes for overseas feature IDs (`ZA01`…) but the election data JSON uses INSEE-derived codes (`97101`…). `FranceMap.tsx` maintains bidirectional lookup tables (`INSEE_TO_CIRCO_ZCODE` / `CIRCO_ZCODE_TO_INSEE`) and translates at click time (click → INSEE stored in `clickedCommune`) and at feature-state time (INSEE → Zcode for `setFeatureState`).

**Click event priority** — `overseas-fill` overlaps `circo-fill` and `communes-fill` geographically. The `overseas-fill` click handler uses `queryRenderedFeatures` to check for more-specific hits and skips if any circo or commune polygon was also clicked.

---

## Zustand store (`electionStore.ts`)

| Field | Type | Purpose |
|---|---|---|
| `selected` | `{ type, year, round }` | Currently displayed election |
| `granularity` | `'commune' \| 'circonscription'` | Active map granularity tab |
| `hoveredCommune` | `string \| null` | INSEE code of hovered feature |
| `clickedCommune` | `string \| null` | INSEE code of clicked/selected feature |
| `focusedTerritory` | `string \| null` | Overseas territory code being zoomed into |
| `flyTarget` | `{ lng, lat, zoom } \| null` | Programmatic map fly-to target (e.g. city list click) |

---

## Data sources

### Election results

All election data from the **French Ministry of the Interior** (`data.interieur.gouv.fr`) via **data.gouv.fr**:

| File type | Format | Coverage | Used for |
|---|---|---|---|
| `DPT*.txt` | Fixed-width, 1 row/département | 96 depts + DOM + code `ZZ` (→ `99`, Français à l'étranger) | Département-level sidebar and map base |
| `SUBCOM*.txt` | Fixed-width, 1 row/commune | Metropolitan France + Corsica only | Commune-level sidebar and choropleth |
| `CIRLG*.txt` | Fixed-width, 1 row/circonscription | All 577 circos + 11 abroad (`ZZ01`–`ZZ11` → `9901`–`9911`) | Circonscription sidebar and choropleth |

**Code conventions**: The ministry's SUBCOM files use Z-prefixed dept codes for overseas communes (`ZA101` = Les Abymes); `scripts/fix-overseas-codes.mjs` converts them to INSEE codes (`97101`). The commune tile geometry predates some "communes nouvelles" mergers; `scripts/build-merged-communes.mjs` generates `src/utils/mergedCommunes.ts` mapping ~406 obsolete polygon codes to their absorbing commune so they color and resolve correctly.

**Round 2 gap**: `round2.json` is missing the `'99'` aggregate entry for Français à l'étranger (present in round 1). The circo-level data (`round2-circ.json`) does include `9901`–`9911`.

### Geographic boundaries

| Asset | Source | Notes |
|---|---|---|
| `france-admin.pmtiles` | IGN ADMIN-EXPRESS / OSM-derived commune GeoJSON, processed with tippecanoe | Communes + départements |
| `circonscriptions.pmtiles` | data.gouv.fr — Contours géographiques des circonscriptions législatives | 559 features: 539 metropolitan + 20 DOM/COM (Z-coded) |
| `overseas.geojson` | Natural Earth / IGN | Polygon boundaries for 10 overseas territories |
| `land-110m.json` | Natural Earth via `world-atlas` npm package | Land mass topojson for AbroadMap world outline |

### Reference data

| Asset | Source | Notes |
|---|---|---|
| `topCities.ts` | INSEE populations légales au 1er janvier 2023 (pub. déc. 2025) | 30 most populated communes by commune population |
| `adminCenters.ts` | `geo.api.gouv.fr` API (official government commune API) | ~101 préfectures + ~229 sous-préfectures with centroid coordinates |

---

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. All data files are served statically from `public/`.

To rebuild the election data from ministry source files, run the parse scripts in `scripts/` with Node.js (ESM):

```bash
node scripts/parse-round1-2022.mjs        # Présidentielle — département level
node scripts/parse-communes-2022.mjs      # Présidentielle — commune level round 1
node scripts/parse-communes-2022-r2.mjs   # Présidentielle — commune level round 2
node scripts/parse-cirlg-2022.mjs         # Présidentielle — circonscription level (both rounds)
node scripts/parse-legislatives-2022.mjs  # Législatives — circo + département levels (both rounds)
```

Raw ministry source files for the legislatives live in `data-sources/` (checked in so the
pipeline is reproducible). Each election also has a hand-curated `palette.json`
(party/nuance → color, alliance flags) next to its data files, and is declared in
`public/data/elections/index.json` (rounds, available granularities, geometry version).

```bash
```

To rebuild the PMTiles from GeoJSON sources, install [tippecanoe](https://github.com/felt/tippecanoe):

```bash
# Communes + départements
tippecanoe -o public/data/tiles/france-admin.pmtiles \
  --layer=communes --use-attribute-for-id=code communes.geojson \
  --layer=departements --use-attribute-for-id=code departements.geojson

# Circonscriptions
tippecanoe -o public/data/tiles/circonscriptions.pmtiles \
  --use-attribute-for-id=codeCirconscription \
  --layer=circonscriptions \
  circonscriptions-legislatives-p10.geojson
```

---

## Known limitations & future work

- **Overseas commune polygons** — commune-level results exist for DOM/COM communes, but `france-admin.pmtiles` contains no commune geometry for them, so they can't be displayed or clicked on the map (results are reachable via the sidebar search).
- **Round 2 abroad aggregate** — `round2.json` is missing the `'99'` entry for Français à l'étranger. The circo-level abroad data for round 2 is complete.
- **Single election** — only Présidentielle 2022 is loaded. The data pipeline and UI are designed to support multiple elections.
- **No collectivités circos** — Wallis-et-Futuna, Polynésie française, Nouvelle-Calédonie, and Saint-Martin/Saint-Barth have no circo boundary polygons in any public dataset.
- **Français de l'étranger (ZZ01–ZZ11)** — the 11 circos for overseas French voters have no geographic polygon and are not displayed on the main map. They are shown as dots on the AbroadMap world map.
