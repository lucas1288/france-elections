# France Elections

An interactive map of French election results, built with React, MapLibre GL JS, and PMTiles. Browse results at département, commune, or circonscription level, zoom into overseas territories, and inspect per-candidate vote shares for any geographic unit.

---

## What it does

- **Multi-granularity choropleth map** — switch between three levels of detail:
  - **Département** (96 metropolitan + DOM, always available, fast)
  - **Commune** (~35,000 communes, loads on demand, ~34 MB)
  - **Circonscription législative** (577 circos, loads on demand)
- **Overseas territories** — a column of D3-geo SVG insets on the left renders all ten overseas territories (Guadeloupe, Martinique, Guyane, La Réunion, Mayotte, Saint-Pierre-et-Miquelon, Saint-Martin/Saint-Barth, Wallis-et-Futuna, Polynésie française, Nouvelle-Calédonie). Clicking any inset zooms the main map into that territory.
- **Results sidebar** — hover or click any geographic unit to see full candidate results: turnout, blank/null votes, and a ranked bar chart of all candidates with vote counts.
- **Election selector** — switch between elections and rounds from the top bar. Currently: Présidentielle 2022 (rounds 1 & 2).
- **Candidate color legend** — top-right overlay showing the leading color for each candidate in the current election.
- **Consistent coloring** — each candidate is assigned an official or conventional party color (e.g. Macron → orange, Le Pen → navy, Mélenchon → red) that is stable across all granularities and views.

---

## Architecture

```
src/
├── App.tsx                  — root layout, election/granularity selectors, data orchestration
├── store/
│   └── electionStore.ts     — Zustand store: selected election, granularity, hover/click/focus state
├── hooks/
│   └── useElectionData.ts   — TanStack Query hooks for all data fetches
├── components/
│   ├── FranceMap.tsx        — MapLibre GL JS map, PMTiles sources, feature state coloring
│   ├── OverseasInsets.tsx   — D3-geo SVG insets for overseas territories
│   ├── ResultsPanel.tsx     — sidebar with per-unit candidate breakdown
│   ├── ElectionSelector.tsx — election + round picker
│   └── Legend.tsx           — candidate color key
├── utils/
│   └── partyColors.ts       — name/party → hex color lookup
└── types/
    └── election.ts          — TypeScript interfaces for all election data

public/data/
├── elections/
│   └── presidential/2022/
│       ├── round1.json                    — département-level results, round 1
│       ├── round2.json                    — département-level results, round 2
│       ├── round1-communes.json           — full commune results, round 1 (~34 MB)
│       ├── round1-communes-choropleth.json — compact choropleth: inseeCode + leader only
│       ├── round2-communes-choropleth.json
│       ├── round1-circ.json               — full circonscription results, round 1
│       ├── round1-circ-choropleth.json    — compact circo choropleth
│       ├── round2-circ.json
│       └── round2-circ-choropleth.json
├── geo/
│   └── overseas.geojson     — boundaries for all 10 overseas territories
└── tiles/
    ├── france-admin.pmtiles      — communes + départements as vector tiles
    └── circonscriptions.pmtiles  — 577 circonscriptions as vector tiles

scripts/
├── parse-round1-2022.mjs         — parses ministry DPT TXT → round1.json (département level)
├── parse-communes-2022.mjs       — parses ministry SUBCOM TXT → commune-level JSON + choropleth
├── parse-communes-2022-r2.mjs    — same for round 2
├── parse-cirlg-2022.mjs          — parses ministry CIRLG TXT → all four circo JSON files
├── build-circo-results.mjs       — (superseded) earlier circo aggregation script
├── prepare-departements.mjs      — GeoJSON pre-processing utilities
└── generate-placeholder-data.mjs — synthetic data generation for dev/testing
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
| **State** | Zustand 5 | Shared UI state (hover, click, granularity, focused territory) |
| **Data fetching** | TanStack Query 5 | Caching, lazy loading, staleTime management |
| **Data parsing** | Node.js ESM scripts | Ministry fixed-width TXT → structured JSON |

---

## Map rendering approach

The map uses three **MapLibre sources**:

1. **`admin` (PMTiles)** — `france-admin.pmtiles` with two source layers:
   - `communes` — ~35,000 commune polygons (tippecanoe drops small features below zoom 7, so the département fill acts as background at low zoom)
   - `departements` — 96 département polygons, always visible as a base

2. **`circo` (PMTiles)** — `circonscriptions.pmtiles` — 577 circonscription polygons generated from the data.gouv.fr GeoJSON with `--use-attribute-for-id=codeCirconscription`. Overseas circos use Z-codes (`ZA01`–`ZD07`, etc.) as feature IDs.

3. **`overseas` (GeoJSON)** — `overseas.geojson` — polygon boundaries for all 10 overseas territories, colored at département level to match the main map.

**Layer order** (bottom to top): `background` → `overseas-fill` → `overseas-outline` → `dept-fill` → `communes-fill` (minzoom 7) → `circo-fill` → `communes-outline` → `dept-outline` → `circo-outline`

**Coloring** is done entirely through MapLibre's **feature state** system: on data load or granularity change, the app iterates over results and calls `map.setFeatureState({ source, sourceLayer, id }, { color })`. The fill layers read `['feature-state', 'color']` via expressions — no re-render of the React tree is needed to recolor the map.

**Hover and click** tracking stores a `HoverTarget { id, sourceLayer, source }` ref so feature states can be correctly cleared even when the active layer changes between interactions.

---

## Data sources

### Election results

All election data comes from the **French Ministry of the Interior** (`data.interieur.gouv.fr`) via **data.gouv.fr**:

| File type | Format | Coverage | Used for |
|---|---|---|---|
| `DPT*.txt` | Fixed-width, 1 row/département | 96 depts + DOM | Département-level sidebar and map base |
| `SUBCOM*.txt` | Fixed-width, 1 row/commune | Metropolitan + Corsica | Commune-level sidebar and choropleth |
| `CIRLG*.txt` | Fixed-width, 1 row/circonscription, stride-7 per candidate | All 577 circos | Circonscription sidebar and choropleth |

The fixed-width format has 103 columns for the CIRLG files: 9 header fields then blocks of 7 fields per candidate (votes, %, nuance, name, etc.). Overseas department rows in the DPT files use Z-codes (`ZA`–`ZZ`) which are mapped to INSEE codes (`971`–`976`) by the parse scripts. Circo feature IDs in the PMTiles also use Z-codes, so the app translates `97101 → ZA01` etc. when applying feature state colors.

### Geographic boundaries

| Asset | Source | Notes |
|---|---|---|
| `france-admin.pmtiles` | IGN ADMIN-EXPRESS / OpenStreetMap-derived commune GeoJSON, processed with tippecanoe | Communes + départements |
| `circonscriptions.pmtiles` | [data.gouv.fr — Contours géographiques des circonscriptions législatives](https://www.data.gouv.fr/fr/datasets/contours-geographiques-des-circonscriptions-legislatives/) | 559 features: 539 metropolitan + 20 DOM/COM (Z-coded) |
| `overseas.geojson` | Natural Earth / IGN | Polygon boundaries for all 10 overseas territories used for inset thumbnails and zoom targets |

---

## Getting started

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173`. All data files are served statically from `public/`.

To rebuild the election data from ministry source files, run the parse scripts in `scripts/` with Node.js (ESM):

```bash
# Département level
node scripts/parse-round1-2022.mjs

# Commune level
node scripts/parse-communes-2022.mjs
node scripts/parse-communes-2022-r2.mjs

# Circonscription level (requires CIRLG TXT files in scripts/)
node scripts/parse-cirlg-2022.mjs
```

To rebuild the PMTiles from GeoJSON sources, install [tippecanoe](https://github.com/felt/tippecanoe) and run:

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

- **Overseas commune-level data** — the ministry's SUBCOM files cover only metropolitan France and Corsica. Each DOM territory publishes its own separate file; these have not yet been integrated.
- **Single election** — only Présidentielle 2022 is loaded. The data pipeline and UI are designed to support multiple elections (the `index.json` manifest and election selector are already in place).
- **No collectivités circos** — Wallis-et-Futuna, Polynésie française, Nouvelle-Calédonie, and Saint-Martin/Saint-Barth have no circo boundary polygons in any public dataset; they remain département-colored in circo mode.
- **Français de l'étranger** — the 11 circos for overseas French voters (`ZZ01`–`ZZ11`) have no geographic polygon by definition and are not displayed.
