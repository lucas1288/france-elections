# CLAUDE.md — AI context for france-elections

This file gives an AI assistant full technical context for the `france-elections` project so it can contribute effectively from the first message of any session.

**Companion docs**: this file is the canonical **technical** reference. Planning,
strategy, and operational context live in [`documentation/`](documentation/) — start at
[`documentation/README.md`](documentation/README.md) for the index, plus
[`hosting-and-deployment.md`](documentation/hosting-and-deployment.md) and
[`roadmap.md`](documentation/roadmap.md). Keep both in sync: code-level facts here,
decisions/strategy there.

---

## Project summary

A React + MapLibre GL JS interactive choropleth map of French election results (currently: Présidentielles 2017 & 2022, Législatives 2017, 2022 and 2024, rounds 1 & 2 each). Users can view results at commune or circonscription granularity (per the election's manifest entry), click geographic units to see detailed results in a sidebar, zoom into overseas territories, and explore Français à l'étranger results on a small world map. Long-term goal: all presidential elections since 1965 and all legislatives since 1958 (see "Expansion roadmap" notes in conversation history / README).

**Owner**: lucas (lucas1288 on GitHub, lucas.riveill@gmail.com)
**Stack**: React 19, TypeScript, Vite 6, Tailwind CSS 3, MapLibre GL JS 5, PMTiles 4, Zustand 5, TanStack Query 5, D3-geo, topojson-client

---

## Key architectural decisions

### 0. Manifest-driven elections (`public/data/elections/index.json`)
Each election declares: `type`, `year`, `rounds`, `label`, `granularities` (which tabs exist), and `geometry` (version ids `{ admin, circo }` resolved to PMTiles URLs via `TILE_SOURCES` in `FranceMap.tsx`). Granularity availability comes from the manifest, NOT from 404 sniffing. When the selected election lacks the active granularity, an App effect switches to the first available one. A geometry-version change triggers `map.setStyle(makeStyle(geom))` + re-sync (path exists but is dormant while all elections share `admin-2022`/`circo-2010`).

### 0c. Color modes (`colorMode` in the store)
The choropleth can be colored three ways (Zustand `colorMode`): `leader` (winning candidate/nuance — default), `party` (single force, territories shaded by score-vs-national RATIO — `utils/gradient.ts` `partyRatioShade`), `abstention` (grey ramp). `utils/territoryColor.ts` is the shared per-territory color function used by FranceMap (dept + gradient layers), OverseasInsets, and AbroadMap so every surface stays consistent. Leader rides the lightweight choropleth; abstention rides the choropleth's `abstention` field; the party gradient needs the full per-territory data (loaded per tab) + the national baseline from `utils/nationalResults.ts` `computeNationalTotals` (dept data sums to national exactly). Triggers: on desktop the sidebar `NationalSummary` rows (click a force → its party view via `togglePartyMode`, click again → leader; the participation block toggles the abstention ramp); on mobile the "Résultats nationaux" sheet rows (`AffichageSheet`) — same model on both.

### 0b. Palette-in-data (`palette.json` per election)
Each election ships a small `palette.json`: `byName` (candidate → hex, presidentials) and/or `parties` (party/nuance code → `{label, color, alliance?, members?, family?}`, legislatives).

**Political families (two-axis P3, July 2026)**: `public/data/elections/families.json` is the GLOBAL cross-election registry — `blocs` (gauche/centre/droite/extrême droite/autres) + `families` (14 lineages, each `{label, color, bloc, order}`, order = left→right spectrum). Every palette `parties` entry carries `family: <id>` (presidentials too — their `parties` map covers all candidates' party codes, so no byName annotation is needed). Decisions (lucas): Macronisme merged into `centre` (continuity of the independent centre — Bayrou 2007/2012, UDF); Reconquête its own family (far-right split: bloc `extreme-droite`, own color); PCF its own family — alliance years are absorbed by the `union-gauche` family (NUPES/NUP, NFP/UG) + the bloc level, whose series stay continuous. Family colors are canonical for CROSS-ELECTION surfaces only (future time-series/timeline, P4–P5) — per-election views keep their palettes. App side: `useFamilies()` hook + `src/utils/families.ts` (`familyOfParty`, `familiesInOrder`) — loaded but not yet consumed by any UI. **`node scripts/validate-families.mjs`** checks every party/nuance code in every manifest election resolves to a defined family+bloc — run it after adding an election or editing a palette (gates future ingestions). `getCandidateColor(name, index, party, palette)` resolves palette first, then the legacy built-in 2022 tables, then a categorical fallback. For legislatives, the "candidates" of dept-level AND commune-level data and all choropleth leaders are NUANCE labels (the ministry's 2022 nuance codes already encode pre-electoral alliances: NUP, ENS); per-circo full data keeps real candidate names with nuance as `party` (+ `elected: true` for seat winners — feeds a future hemicycle view). Commune-level legislative results come from the ministry's `subcom` file (one row per commune×circo); `scripts/parse-legislatives-2022.mjs` aggregates them to the commune by nuance (summing across the circos a commune spans — Paris/Lyon/Marseille), so a commune split across circonscriptions still has a well-defined leading nuance.

**Législatives 2024** (`scripts/parse-legislatives-2024.mjs`, sources in `data-sources/legislatives-2024/`) emits the identical file set but parses a *different* ministry format: the 2024 "résultats définitifs" CSVs are one file per level (circo / commune / bureau / dpt), labeled headers, UTF-8/CRLF, with candidate columns in repeating 9-wide blocks `[Panneau;Nuance;Nom;Prénom;Sexe;Voix;%Ins;%Exp;Elu]`. Two format gotchas: (1) **round-2 files quote text/code fields** (`"01";"0101"`) while round-1 files don't — `readRows` strips wrapping quotes per cell or round-2 codes come out garbage; (2) codes are normalised to match the existing `circo-2010`/`admin-2022` tiles exactly (`ZZ`→`99`, `ZX`→`977`, DOM `971`–`988` already dept-prefixed, métropole+Corse `dept.pad2 + circoNum`; commune codes pad 1-digit-dept rows to 5). Geometry is unchanged from 2022 (no new tiles). PLM arrondissements are aggregated from the 2024 bureau file inside the same script (arr = `floor(codeBV/100)`) and injected into the commune outputs. **Dept, commune AND arrondissement outputs are keyed by NUANCE** (`name` = nuance label, `party` = code), like 2022 — only the per-circo `-circ.json` keeps real candidate names. This matters for coloring: the whole choropleth/dot/dept color path resolves a nuance LABEL → code → palette, so a commune whose `leadingCandidate` is a person name (the bug we hit: `readCandidates` builds `"Prénom NOM"`) silently fails the palette lookup and renders a fallback colour. Keep `parseCommunes` grouping by nuance. 2024 nuances differ: `UG` = Nouveau Front populaire (alliance), `UXD` = Union de l'extrême droite, `ENS`/`RN`/`LR` as before. Validated: 577 circo codes == 2022 set; R2 seat composition (UG 178, ENS 150, RN 125, …, total 577) and R1 national shares (RN 29.3 / NFP 28.0 / ENS 20.0) match official results.

### 0d. Présidentielle 2017 (first historical ingestion, July 2026)
Sources are the ministry's legacy BIFF **.xls** files (no CSV published in 2017; read via the `xlsx` devDependency) in `data-sources/presidentielle-2017/`: `pres2017-t{N}-multi.xls` (Départements + Circo. Leg. sheets) + `pres2017-t{N}-communes.xls` (~35,719 rows) + `pres2017-t{N}-bv.txt` (bureaux de vote, same 21-column layout as 2022). `scripts/parse-presidential-2017.mjs` emits the full standard file set for BOTH rounds (2017 has a real R2 commune file, unlike prés 2022). Format notes: header row starts with 'Code du département'; candidate blocks are located by the 'Nom' header positions (dept sheets are 6-wide, circo/commune 7-wide with N°Panneau); candidates are RANK-ORDERED per row; overseas Z-codes have per-dept numeric offsets baked into commune codes (ZA 101→97101, ZM 501→97601, ZP 11→98711, ZW 1→98601, ZX 701/801→97701/97801, ZZ→99001…).

**COG drift 2017→current tiles is large** (~640 communes merged since): `scripts/aggregate-2017-merged-communes.mjs` reshapes the commune files onto the current tile geometry — INSEE's movements table (`data-sources/cog/v_mvt_commune_2025.csv`) resolves post-vote COM→COM chains (MOD 31/32/33/34/41/50) and the constituents' results are SUMMED under the tile's code (absorbed originals removed → 35,178 entries; national totals unchanged, verified exact). 8 défusion/partial-split cases are copied instead (Neussargues ×4, Essarts ×2, Sannerville, Les Hauts-Talican 60694↔60054). It owns ALL 2017 COG handling — inject-merged-commune-results.mjs does NOT cover 2017. The 6 destroyed WWI Meuse villages (55039/55050/55139/55189/55239/55307) are intentionally blank (no 2017 entries at all — the 2022 files only lack 4 of them). Zero other blank polygons, both rounds.

**Pipeline order (2017)**: `parse-presidential-2017.mjs` → `aggregate-2017-merged-communes.mjs` → `build-plm-arrondissements.mjs 2017` (the script now takes per-job source/ref paths + an era filter argv; 2017 BV files share the 2022 layout — Paris arr Σ inscrits == whole-city figure, verified exact) → `mark-annulled-communes.mjs` (auto-discovers 2017: 6 communes R1, 13 R2). Validated against official national totals to the exact figure (R1 Macron 24.01/Le Pen 21.30/Fillon 20.01/Mélenchon 19.58; R2 66.10/33.90; 47,582,183 inscrits). Palette: 11 candidates, `parties` keyed EM/FN/LR/LFI/PS/DLF/RES/NPA/UPR/LO/SP with families (EM→centre, FN→extreme-droite, UPR→souverainistes…).

### 0e. Législatives 2017 (July 2026 — 5th election, completes the 2017 pair)
Sources are .xlsx this time (`data-sources/legislatives-2017/`, see data-sources/README.md): `leg2017-t{N}-multi.xlsx` (sheet `Departements TN` = **already aggregated by nuance**, 5-wide blocks `Code Nuance/Voix/%Ins/%Exp/Sièges`; sheet `Circo. leg. TN` = 9-wide candidate blocks with **`Sièges` = the string `'Elu'`** marking the elected MP — not a number) + `leg2017-t{N}-communes.xlsx` (one row per commune×circo like 2022's subcom, 8-wide blocks with Nuance — aggregated to the commune by nuance) + `leg2017-t{N}-bv.txt` (identical layout to burvot-2022 legis, so the PLM 'legis' mode applies unchanged, era `2017-leg`). `scripts/parse-legislatives-2017.mjs` emits the standard legislative file set; it **carries the 4 R1-decided circos into the round-2 circ outputs itself** (dept/commune T2 holes are filled by carry-r1-into-round2.mjs, which now covers 2017: +1 dept, +332 communes). 17 nuances (REM/MDM/UDI/LR/DVD/DLF/FN/EXD/EXG/COM/FI/SOC/RDG/DVG/ECO/REG/DIV), palette authored left→right with families (REM+MDM+UDI→centre, FN→extreme-droite…). COG drift: `aggregate-2017-merged-communes.mjs legislative` (script now takes an election-type argv; legislative cutoff `2017-06-19`). **Gotcha**: the ministry's legis file still lists two pre-election cross-dept merges separately (Gernicourt 02344→51664, Le Fresne-sur-Loire 44060→49382 — merged communes keep voting in their original circo until redistricting), left as data-only orphans (no polygon, ~750 inscrits). Validated EXACT vs official: T1 inscrits 47 570 988, REM 28.21/LR 15.77/FN 13.20/FI 11.03/SOC 7.44; T2 participation 42.6%, seats REM 308/LR 112/MDM 42/SOC 30/UDI 18/FI 17/DVG 12/COM 10/FN 8, total 577; hemicycle renders 577/577 colored; circo code set == 2022's; zero blank polygons.

### 1. Feature state coloring (not data-driven styling)
Map colors are applied via `map.setFeatureState(...)` after data loads, not via MapLibre data-driven paint expressions reading from tile properties. This avoids re-building the style on data change and enables instant re-coloring when the election/round changes.

### 2. Two separate PMTiles files
- `france-admin.pmtiles` — communes (`promoteId: code`) + départements (`promoteId: code`). The dept layer is **always visible** as the base layer at all zoom levels. Commune layer has `minzoom: 7`. **Both layers come from one source**: `scripts/build-departements.mjs` fetches all metro + overseas commune contours from geo.api.gouv.fr, tiles them as `communes`, AND dissolves them by département (mapshaper `-dissolve2 fields=dept`, topology-preserving) into the `departements` layer — so every dept boundary is, by construction, a shared commune arc (fixes the old sliver mismatch at the Paris↔petite-couronne boundary, where dept geometry used to come from a different source/vintage). The communes and départements layers are tiled in **separate** tippecanoe runs and `tile-join`ed together (with the PLM arrondissement contours overlaid into `communes`). Separate runs matter: the `communes` run uses `--drop-densest-as-needed` (fine — they're hidden below z7 by the style), but the **`departements` run must NOT** drop features (`--no-feature-limit --no-tile-size-limit`, no drop-densest) — it's the always-visible base layer and must keep all 102 features at every zoom. Mixing both into one drop-densest run silently discarded ~half the dept polygons at overview zooms (z4–z6), blanking ~2/3 of metropolitan France. Re-run with `node scripts/build-departements.mjs` (keeps a `.bak`); the tileset is ~82 MB at full geo.api resolution — don't independently simplify the two layers or the slivers come back.
- `circonscriptions.pmtiles` — 577 circos (`promoteId: codeCirconscription`). Overseas circos use Z-codes as feature IDs (`ZA01`…`ZM02`).

### 3. Z-code / INSEE bidirectional translation
The circo PMTiles uses Z-codes for overseas features (`ZA01` = Guadeloupe 1ère) but the parsed election JSON uses INSEE-derived codes (`97101`). Two lookup tables in `FranceMap.tsx` handle translation:
- `INSEE_TO_CIRCO_ZCODE` — used when calling `setFeatureState` (map coloring)
- `CIRCO_ZCODE_TO_INSEE` — used in click handlers (so `clickedCommune` holds the INSEE code that `ResultsPanel` can look up)

### 4. Lazy loading of full data
The département-level (`round1.json`, ~107 entries) and circo choropleth (`round1-circ-choropleth.json`) load eagerly. Full commune data (~34 MB) is loaded on demand via TanStack Query's `enabled` flag when the commune tab is active. Full circo data (~0.2–0.6 MB) loads whenever the election has the circo granularity, regardless of tab (July 2026 — the national sheet's Sièges/Circonscriptions view needs it everywhere).

### 5. `clickedCommune` is the universal selection key
The Zustand store field `clickedCommune` stores the INSEE code of whatever is selected, regardless of granularity. `ResultsPanel` resolves it against the appropriate dataset based on `granularity`. Code `'99'` is reserved for the Français à l'étranger aggregate; codes `'9901'`–`'9911'` are the 11 overseas French circos.

### 6. Click event priority on overlapping layers
`overseas-fill` (GeoJSON, always visible) overlaps `circo-fill` and `communes-fill` geographically. The `overseas-fill` click handler calls `map.queryRenderedFeatures` to detect if a more-specific layer was also hit and skips if so. This prevents the dept code from overwriting a circo or commune code.

### 7. `flyTarget` for programmatic zoom
When the user clicks a city from the sidebar list, the component calls `setFlyTarget({ lng, lat, zoom })`. `FranceMap` watches this field and calls `map.flyTo(...)`, then clears it. This avoids passing callbacks between components.

---

## File-by-file reference

### `src/App.tsx`
- Pure DATA ORCHESTRATOR: runs all queries, splits presentation by `useIsMobile()` into `DesktopLayout` / `MobileLayout`, both fed one `LayoutProps` bundle
- Calls `useUrlSync(elections)` (`src/hooks/useUrlSync.ts`) — URL deep-linking: `?election=leg-2024-t2&territory=34&view=circo` + `party=X`/`mode=abstention`. Params→store at load (election waits for the manifest, invalid ones dropped; territory restored via the navigator's settle semantics; 5-char circo/commune ambiguity resolved by `view`; colorMode applied AFTER setSelected since setSelected resets party mode); store→URL afterwards via `history.replaceState` (no history spam). Writes are suppressed until the initial params are applied so defaults never clobber a shared link.
- DesktopLayout top bar: election chip (opens the shared `ElectionPicker`, a centered modal on desktop) + T1/T2 round toggle + GranularityToggle + `TerritorySearchBar` (geo-axis pill, opens `TerritoryNavigator`) + ThemeToggle. The old three-`<select>` `ElectionSelector` was REMOVED (July 2026) in favour of the mobile-style picker. Desktop also floats the `TimelineStrip` (P4) bottom-centre of the map area. Mobile top bar is TWO rows: search pill above, `TimelineStrip` below (the strip REPLACED the mobile election chip + T1/T2 row, July 2026 — the full picker opens from the strip's list icon)
- DesktopLayout renders `FranceMap`, `AbroadMap` (top-right, `absolute top-4 right-14`), `ResultsPanel`. The old floating `Legend` ("En tête") was REMOVED (July 2026) — force selection lives in the sidebar's `NationalSummary` (mobile model)
- `AbroadMap` fades out (`opacity-0 pointer-events-none`) when `clickedCommune` is set (non-'99') or `focusedTerritory` is set

### `src/store/electionStore.ts`
Zustand store. Fields:
- `selected: { type, year, round }` — active election
- `granularity: 'commune' | 'circonscription'`
- `hoveredCommune: string | null` — hovered feature INSEE code
- `clickedCommune: string | null` — selected feature INSEE code (toggles to null on re-click). Deliberately SURVIVES `setSelected` (round/election switches) — it's an INSEE code valid across datasets, so the detail panels re-resolve the same territory in the new data (July 2026 fix; only `hoveredCommune` is cleared).
- `focusedTerritory: string | null` — overseas territory dept code (e.g. '971')
- `flyTarget: { lng, lat, zoom } | null` — consumed by FranceMap, cleared after use
- `flyBounds: [w,s,e,n] | 'overview' | null` — bbox fly request (territory navigator); `'overview'` re-fits metro France with the layout-aware padding. Consumed by FranceMap like `flyTarget`
- `selectTerritory(code)` — sets `clickedCommune` WITHOUT the map-click toggle semantics (navigator/search selections must never deselect)
- `settleDept(code)` — settle the geo axis on a département: selection + camera in one action (overseas 97x/98x → `focusedTerritory`, metro → `DEPT_BBOXES` via `flyBounds`; stale overseas focus cleared). Used by the territory navigator's dept rows and the detail panels' `↑ département` breadcrumb
- `mapZoomedIn: boolean` — true once the map passes `ZOOM_HIDE_OVERLAYS` (8). FranceMap's `map.on('zoom')` flips it only on threshold crossing (no per-frame store churn). Drives the auto-hide (opacity 0 + `pointer-events:none`) of the top-right overlay (AbroadMap, in DesktopLayout) and the OverseasInsets column (FranceMap), so the floating panels stop intercepting clicks on communes/arrondissements beneath them once the user zooms in to inspect.

- `theme: 'system' | 'light' | 'dark'` + `isDark: boolean` — dark mode. `theme` is the persisted preference (localStorage `fe-theme`); `isDark` is the resolved flag. `setTheme` toggles the Tailwind `dark` class on `<html>` (all chrome uses `dark:` variants; `darkMode: 'class'` in tailwind.config) and a module-level `matchMedia('prefers-color-scheme: dark')` listener tracks live OS changes while in `system`. `ThemeToggle.tsx` cycles system→dark→light (desktop top bar; mobile bottom-right chip). The MAP is themed at runtime via `applyMapTheme(map, isDark)` in FranceMap (the style is built once — dark is a `setPaintProperty` pass over background/labels/strokes/fallback-fills, NOT a style rebuild; re-applied after geometry `setStyle` via `isDarkRef`, and `syncMapData` re-runs so the theme-dependent `DEFAULT_COLOR` fallback updates). D3 surfaces (OverseasInsets, AbroadMap, Hemicycle) read `isDark` for their inline SVG colors; the hover tooltip is themed via `.dark .hover-tip` CSS. Data colors (party palettes, gradients) are deliberately theme-invariant.

Also exports `useIsOverview()` — derived selector, true when showing the full-France overview (no selection except the '99' aggregate, no focused territory). Drives the fade-out of OverseasInsets (FranceMap), the AbroadMap panel (App), and the `← Vue générale` button.

### `src/hooks/useElectionData.ts`
TanStack Query hooks. All "optional" files (may 404 for a given round) go through a shared `useOptionalJson` helper (null on 404, `retry: false`, `staleTime: Infinity`):
- `useElectionData(type, year, round)` — dept-level `round{N}.json` (always enabled)
- `useElectionIndex()` — the manifest (typed `ElectionRef[]`)
- `usePalette(type, year)` — per-election `palette.json` (null when absent)
- `useChoroplethData(type, year, round, enabled)` — commune choropleth (enabled per manifest)
- `useCircoChoroplethData(type, year, round, enabled)` — circo choropleth (enabled per manifest)
- `useFullCommuneData(type, year, round, enabled)` — full commune JSON (~34 MB), only when commune tab active
- `useFullCircoData(type, year, round, enabled)` — full circo JSON (small; enabled whenever the election has circos, any tab)

### `src/components/FranceMap.tsx`
The most complex component. Key responsibilities:
- Initialises MapLibre map once (cleanup on unmount)
- `makeStyle()` — builds the full MapLibre style spec: sources + all layers. Called once; style never rebuilt. Préfecture/sous-préfecture label layers come from the `adminLabelLayer()` factory.
- `syncMapData()` — single source of truth for data → map sync (feature-state colors + layer visibility). Called from both the `map.on('load')` handler and the data-change effect, so the two can't drift.
- `applyChoroplethColors()` — iterates choropleth communes, calls `setFeatureState`. Handles Z-code translation for circos.
- `applyDeptColors()` — applies dept-level colors from `electionData` and mirrors them onto the `overseas` GeoJSON source
- `applyCityDotColors()` — colors the top-30 city dots from the commune choropleth
- Hover handlers — per layer, track `prevHoveredRef` to clear previous hover; also drive the hover tooltip (a MapLibre `Popup`, class `hover-tip`, repositioned per-mousemove with no React re-render) showing name + top-3 + participation, resolved via `lookupRef` (a code→`CommuneResult` Map of dept + `fullData`)
- Click handlers — per layer, translate Z-codes, call `setClickedCommune`. `overseas-fill` handler guards against overwriting circo/commune clicks.
- `getFeatureBounds()` — extracts `LngLatBoundsLike` from a GeoJSON Polygon/MultiPolygon for zoom-to-feature
- Effects:
  - `[setHoveredCommune, setClickedCommune]` — map init, runs once
  - `[choroplethData, electionData]` — syncs colors + layer visibility; also updates city dot feature states
  - `[focusedTerritory]` — flies to overseas territory or back to METRO_BOUNDS
  - `[flyTarget, setFlyTarget]` — handles programmatic fly-to from city list clicks
  - `[clickedCommune]` — syncs selected feature highlight; translates INSEE→Zcode for circos

**Layer visibility management**: all granularity-dependent layers (commune/circo fills+outlines, `city-dots`, `prefecture-labels`, `sous-prefecture-labels`) are toggled via `setLayoutProperty` inside `syncMapData()`. The `← Vue générale` button shows when `!useIsOverview()` and calls `setFocusedTerritory(null)` + `setClickedCommune(null)` + `fitBounds(METRO_BOUNDS)`.

### `src/components/ResultsPanel.tsx`
Sidebar. Three states:
1. **Idle + commune granularity** — city list with candidate dots + fly-to on click + `setClickedCommune`
2. **Idle + circo/hemicycle granularity** — NationalSummary + hint only (the old "En tête par circonscription" ranked list was absorbed July 2026 into NationalSummary's Pourcentages/Sièges switch — see below)
3. **Active** — full results for `clickedCommune ?? hoveredCommune`

Overseas fallback: `overseasDeptCode(code)` detects 5-digit overseas codes (starting with '97'/'98'), looks up the 3-digit département code in `electionData`, and shows an amber notice banner.

Dept insight (P2): settled dept selections append the `DeptInsight` sections, and commune/circo selections get an `↑ département` breadcrumb — see the `DeptInsight.tsx` section (MobileDetailSheet mirrors both).

Round fallback (`isRoundFallback` from `resolveTerritory`): when the full commune file is confirmed absent for a round (404 → `communeDataMissing` in LayoutProps, e.g. présidentielle 2022 T2 which the ministry never published), a selected commune resolves to its DÉPARTEMENT entry (`2A065`→`2A`, `75056`→`75`) with an amber "données par commune indisponibles pour ce tour" notice — in both ResultsPanel and MobileDetailSheet. Related gotcha: `useOptionalJson` treats a non-JSON content-type as "file absent" too, because the Vite dev server answers missing `public/` files with the SPA fallback (200 + index.html), which otherwise left the query in error state and the panel on "Chargement…" forever.

### `src/components/TerritorySearchBar.tsx` + `TerritoryNavigator.tsx` (two-axis P1, July 2026)
The geo-axis control (design: `documentation/two-axis-navigation.md`, "variant B"). `TerritorySearchBar` is a pill in the top bar of BOTH layouts (desktop: right side; mobile: own row above the timeline strip — the mobile header is two rows, so FranceMap's under-header offsets use `8.25rem`): empty it opens the navigator; with a territory selected it shows its resolved name (via `resolveTerritory`) + a ✕ that clears `clickedCommune`+`focusedTerritory` and sets `flyBounds: 'overview'`. `TerritoryNavigator` (presentation-adaptive like ElectionPicker: mobile full-screen, desktop centered modal) is a federated search: communes via geo.api.gouv.fr (debounced 250 ms, `boost=population`), départements + circonscriptions filtered locally (accent-insensitive) from `electionData` dept entries and `circoData` names; grouped results with C/D/Ci badges. Empty state = recents (localStorage `fe-recent-territories`, max 6) + `TOP_CITIES` + the dept list. Selection semantics: commune → switch granularity to commune + `selectTerritory` + `setFlyTarget` (zoom 11, past `COMMUNE_MIN_ZOOM`); dept → `selectTerritory` + `setFlyBounds(DEPT_BBOXES)` (overseas depts use `setFocusedTerritory` instead, riding the existing focus machinery); circo → switch to circo granularity + `selectTerritory` + `setFlyBounds(CIRCO_BBOXES)` (abroad circos 99xx have no geometry — select only). REPLACED the old `CommuneSearch.tsx` (desktop sidebar field) and `SearchSheet.tsx` (mobile full-screen search), both deleted. `src/utils/territoryBBoxes.ts` is GENERATED by `scripts/build-territory-bboxes.mjs` (decodes the shipped PMTiles via tippecanoe-decode; re-run after any tile rebuild; 102 depts + 559 circos — COM circos 977/986/987/988 have never had polygons in the circo tileset). Store additions: `flyBounds` (bbox or `'overview'`, consumed by FranceMap like `flyTarget`) and `selectTerritory` (non-toggling `setClickedCommune`).

### `src/components/TimelineStrip.tsx` (two-axis P4, July 2026)
The timeline scrubber — adjacent moves on the TIME axis (per the approved mockup, proposal C). Self-contained: reads the manifest via `useElectionIndex()` (TanStack dedupe) + store `selected`/`setSelected`; callers only pass positioning/chrome via `className` and an `onOpenPicker` callback (list icon → the full `ElectionPicker`, which stays the "browse the whole history" jump list). One lane per election TYPE (tabs: Présidentielles/Législatives — never mixed on one line; switching lanes jumps to the temporally NEAREST election of that type, tie → newer); stops are winner-coloured dots (manifest `winner.color`) positioned proportionally by year, current one enlarged + blue-ringed; T1/T2 ride as pills in the strip header. Tapping a stop `setSelected`s **preserving the round** (`min(round, e.rounds)` — unlike the picker, which resets to T1) and the settled territory survives (store semantics: `clickedCommune` survives `setSelected`). Placement: desktop = floating card bottom-centre of the map area (`z-30`, above the Hemicycle cover so the time axis stays reachable; the top-bar chip + T1/T2 remain, per mockup); mobile = the header's second row (REPLACED the election chip + T1/T2 — design doc: the strip "takes over the top-bar slot"; header grew, hence the `8.25rem` under-header offsets in FranceMap). v1 is tap-only (no drag-scrub yet); the 2010 circo-redistricting dashed break is designed but unrenderable until a pre-2010 election is ingested.

### `src/components/DeptInsight.tsx` + `src/utils/deptInsight.ts` (two-axis P2, July 2026)
Département insight view. When a département is the SETTLED selection (`clickedCommune` IS a dept code — hover previews and the overseas/round dept-fallbacks don't qualify), both detail panels (ResultsPanel sidebar + MobileDetailSheet) append insight sections under the dept results:
- **Historique (P5, July 2026 — BLOC-level v2 per lucas)** — FIRST section: `DeptHistory.tsx`, ONE combined multi-line chart of the 5 political BLOCS (gauche/centre/droite/extrême droite/autres) across every ingested election of the CURRENT type (follows the timeline strip's lane), on a SHARED 0-based scale (dashed 25/50/75% gridlines) so magnitude differences read true; legend rows with latest values + a participation sparkline (fixed 0–100). Round 1 only (the comparable round). Blocs, not families: family series are discontinuous across alliance years (NUPES/NFP absorb socialistes/LFI/…), blocs stay continuous — lucas chose blocs for BOTH types (July 17); the family detail is future work tied to the desktop results-layout rethink. Data: `public/data/elections/history/depts.json` — GENERATED by `scripts/build-dept-history.mjs` (manifest-driven, FAMILY-level in the file — blocs are summed client-side via `families.json`; includes an `FR` national entry; ~180 KB; **re-run after any election ingestion or palette/families edit**, then R2-sync it). Self-fetching (`useDeptHistory()` + `useFamilies()`). Also rendered NATIONALLY as `<DeptHistory deptCode="FR" />` in the idle views: desktop ResultsPanel (both idle branches, under NationalSummary) + mobile AffichageSheet (bottom of the Résultats nationaux sheet). Hides until the files load or when <2 elections of the type exist.
- **Circonscriptions (N)** — leader per circo of the dept (person name + % from `circoData` once loaded, else the choropleth's nuance/candidate label); click → switch to circo granularity + `selectTerritory` + fly `CIRCO_BBOXES`. Works on every tab (circo files always load when the election has them).
- **En tête par commune** — communes-led counts per force from the commune choropleth. PLM: arrondissements are excluded (`isPlmArrondissement` — the data carries BOTH the city aggregate and the arrondissements; the aggregate counts once).
- **Plus grandes communes + participation extremes** — only when the full commune file is loaded (commune tab; absent for prés 2022 T2). Extremes filter ≥ 1000 inscrits and hide below 6 eligible communes (mono-commune depts like Paris). Row click → select commune (+ fly when it's in `TOP_CITIES`).

Both panels also show an **`↑ {département}` breadcrumb** on commune/circo selections (`parentDeptCode` maps '3401'→'34', '2A004'→'2A', '97101'→'971') calling `settleDept`.

**Map focus mode**: FranceMap dims everything outside the settled dept — `applyDeptFocus` sets `fill-opacity` PAINT EXPRESSIONS keyed on the feature's code prefix (`['slice', ['get','code'], …]`; overseas circos via the dept→Z-code prefix map) on dept/overseas/communes/circo fills. One `setPaintProperty` per layer (no feature-state iteration), MapLibre's default 300ms opacity transition gives the crossfade; reset to 1 on unsettle, re-applied after a geometry `setStyle`. Related: the selected-outline effect infers the target layer for selections that did NOT come from a map click via `inferSelectionTarget` (code shape; ambiguous 5-char overseas codes disambiguated by granularity).

### `src/components/AbroadMap.tsx`
D3 Natural Earth 1 world map (210×107px SVG). Fetches `land-110m.json` on mount and renders continent outlines via topojson. Shows 11 circo dots colored by leading candidate (always visible, all tabs). Click behavior differs by granularity:
- Commune tab: whole SVG is clickable → `setClickedCommune('99')`
- Circo tab: each dot is individually clickable → `setClickedCommune('9901'…'9911')`

Selected dot: larger radius + thicker stroke. Selected aggregate: SVG outline border.

### `src/components/Hemicycle.tsx`
Legislative-only "Assemblée" view — a third granularity (`hemicycle`) that **replaces the map** (rendered as an absolute cover over the still-mounted FranceMap). 577 seat dots in a parliament arch (`seatLayout()` distributes seats across concentric rows, proportional to radius, ordered left→right). Seats are arranged by the leading candidate's nuance in **palette spectrum order** (`Object.keys(palette.parties)` is authored left→right). Each dot = the elected MP's alliance color, or grey (`#cbd5e1`) for seats not yet attributed (round 1: only ~5 colored). Hover → MP name + circo name + alliance label; click → `setClickedCommune(circoCode)` so `ResultsPanel` shows that circo. Needs the full circo data (`fullCircoData` is enabled for `hemicycle` too); `ResultsPanel` treats `granularity !== 'commune'` as the circo path so clicks resolve.

### `src/components/Legend.tsx`
REMOVED July 2026 (with `ElectionSelector.tsx`). The color key + force selection moved into `NationalSummary.tsx` (top of the idle sidebar): each national-result row is a clickable map control (`togglePartyMode`), the participation block drives the abstention view, the active row is highlighted, and a helper line explains the interaction — same model as the mobile "Résultats nationaux" sheet. NationalSummary also carries the **Pourcentages/Sièges segmented switch** (July 2026, ported from `AffichageSheet`): fed `circoChoro`+`circoData` by ResultsPanel, it swaps the vote-share rows for per-force circo counts — sièges remportés | en tête | 2e, via shared `utils/circoCounts.ts` — with rows re-sorted by seats and a stacked tri-opacity bar. Buckets adapt: presidentials have no seats (label "Circonscriptions", two buckets); at légis T2 every lead is a win so "en tête" is hidden. Works on every tab (the full circo file loads regardless of tab). This absorbed ResultsPanel's old idle-circo "En tête par circonscription" list.

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
Note: presidential 2022 `round2.json` was REBUILT July 2026 by `scripts/rebuild-dept-from-circ.mjs` (aggregates `round2-circ.json` circos → départements). The original file was corrupt — 101 scrambled entries, 22.7M of 48.7M inscrits, national Macron 71.7% vs official 58.55% — which silently skewed the T2 national summary + dept-level map colors. The rebuilt file matches official totals exactly and includes the previously missing `'99'` (Français à l'étranger) entry. The circo file is the trusted source for that round; re-run the script if it ever regenerates.

### `round1-communes-choropleth.json` (commune choropleth)
```typescript
{
  granularity: 'commune',
  year: 2022, round: 1,
  candidates: [{ name, party }],
  communes: [{ inseeCode: string, leadingCandidate: string, abstention?: number }]   // ~35,000 entries
}
```
`abstention` (percent) is added by `scripts/add-choropleth-abstention.mjs` (joins the full-data sibling by inseeCode); it lets the abstention map view render from the ~2 MB choropleth without loading the ~34 MB full commune file. All of France: metropolitan + Corsica + overseas communes (INSEE codes `971xx`–`988xx`, converted from the ministry's Z-codes by `scripts/fix-overseas-codes.mjs`) + consular "communes" of Français à l'étranger (`99001`–`99210`). Overseas communes have no polygons in the tiles, so their entries only serve sidebar lookups (e.g. via the territory navigator), not map coloring.

### `round1-circ-choropleth.json` (circo choropleth)
```typescript
{
  granularity: 'circonscription',
  year: 2022, round: 1,
  candidates: [{ name, party }],
  communes: [{ inseeCode: string, leadingCandidate: string, abstention?: number }]   // 577 metro + 11 abroad (9901–9911)
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
5. **Overseas commune polygons live in the `admin` tileset too** — `france-admin.pmtiles`'s `communes` layer includes DOM/COM communes (INSEE codes `971xx`–`988xx`), tile-joined in from `scripts/build-overseas-communes.mjs` output (geo.api.gouv.fr contours → tippecanoe → `tile-join` into the existing tileset). They use plain INSEE codes (no Z-codes — those are circos only), so all the existing commune coloring/hover/click paths work unchanged; you must be focused on the territory (zoom ≥ 7) to see them. The `overseasDeptCode()` fallback in `ResultsPanel.tsx` still covers any code that misses commune data.
6. **Tile geometry vs election-data COG drift** — two mechanisms keep every commune polygon resolvable:
   (a) `src/utils/mergedCommunes.ts` (generated by `scripts/build-merged-communes.mjs`) maps obsolete tile codes to their absorbing commune; coloring, hover, click, and selection all translate through it. NOTE: since the June 2026 tile rebuild fetches **current** geo.api contours, the tiles now follow the current COG (not "admin-2022"), so most of those ~406 entries are stale-but-harmless.
   (b) The current-COG tiles instead drift the OTHER way vs the 2022/2024 ministry files: code migrations (Conques-en-Rouergue = COG 12218 vs data 12076) and post-vote défusions (ex-Neussargues villages 15031/…, restored 2025; L'Oie/Sainte-Florence, restored 2024). `scripts/inject-merged-commune-results.mjs` fixes these **data-side** (copies the entry holding the votes under the tile's code, per election — a static map can't express per-election direction). Run it after any parser re-run; it reports still-blank polygons.
   The destroyed WWI villages of the Meuse (55039 etc.) are intentionally blank — they genuinely have no election data.
6. **`flyTarget` is consumed once** — FranceMap sets it to null after use. Don't depend on it persisting.
7. **AbroadMap is always shown** — it fades out visually when zoomed in but stays mounted. The `opacity` + `pointer-events-none` approach avoids remounting the D3 map.
8. **`circoQuery` is always loaded** — `useCircoChoroplethData` has no `enabled` guard. It always fetches, so the abroad circo results are always available regardless of active tab.
9. **`maplibre-gl.css` is `@import`ed at the TOP of `index.css`** — before the `@tailwind` directives. A CSS `@import` after any other rule is dropped per spec; with it dropped, the map canvas still renders (WebGL) but popups/controls lose their styles (popups fall back to `position:static` and render off-screen). Keep the import first.
10. **Paris/Lyon/Marseille arrondissements** — the `communes` tileset carries the 45 arrondissement polygons (Paris `751xx`, Lyon `693xx`, Marseille `132xx`), tile-joined from `scripts/build-plm-contours.mjs` (geo.api.gouv.fr contours). The whole-city polygons (`75056`/`69123`/`13055`) are kept in the tiles but **hidden at commune zoom** by `NOT_PLM_CITY` (a `filter` on `communes-fill`/`-outline`/`-won`) so exactly one polygon renders per area. Arrondissement *results* come from bureau-de-vote files (`data-sources/burvot-2022/`): the BV code is `AABB` (AA = arrondissement), so `scripts/build-plm-arrondissements.mjs` aggregates bureaux by arrondissement (no REU mapping) and injects entries into the commune full + choropleth files for all rounds. Arrondissements use plain INSEE codes, so all coloring/hover/click/selection paths work unchanged. **Gotcha**: the filter must test `['get','code']`, NOT `['id']` — MapLibre filter expressions evaluate `['id']` against the raw tile feature id (unset; `promoteId` only feeds `setFeatureState` + query results, not filter-time eval), so an `['id']`-based filter silently never matches.
11. **`france-admin.pmtiles` is cache-busted with a `?v=N` query in `TILE_SOURCES` (`FranceMap.tsx`)** — a PMTiles archive is read via byte-range requests against the header + directory at offset 0. When the file is rebuilt (`build-departements.mjs`) the byte layout changes, but the URL is the same, so a browser that cached the old header/directory computes **stale offsets** and reads garbage tile data → metro France renders blank or partial even though the new tiles are correct. **Bump `?v=N` whenever you regenerate `france-admin.pmtiles`** (and likewise if `circonscriptions.pmtiles` is ever rebuilt). Symptom of forgetting: the southern/denser half of France is blank at overview while the north renders — looks identical to a tile-drop bug but is purely client cache.

---

## Development notes

- `npm run dev` — starts Vite dev server at `http://localhost:5173`
- `npx tsc -b` — type-check (zero errors expected). **Do NOT use `npx tsc --noEmit`**: the root tsconfig is solution-style (project references only), so `--noEmit` checks NOTHING and exits 0 — it silently passed a missing-import crash in July 2026. `npm run build` runs `tsc -b` too.
- Map glyph source: **self-hosted** at `public/fonts/Open Sans Bold/{range}.pbf` (referenced as `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf` in `FranceMap.tsx` `makeStyle()`; font: `Open Sans Bold`; Latin + punctuation ranges 0-255, 256-511, 512-767, 768-1023, 8192-8447 downloaded from fonts.openmaptiles.org). Ships with the static build, NOT R2. Replaced the old `demotiles.maplibre.org/font/...` endpoint which started 404-ing and silently killed all map labels. To add glyph ranges: download more `{range}.pbf` into that dir.
- World land data: `public/data/geo/land-110m.json` (copied from `node_modules/world-atlas/land-110m.json` at setup time)
- **Legislative data pipeline order**: `parse-legislatives-{2017,2022,2024}.mjs` (+ for 2017: `aggregate-2017-merged-communes.mjs legislative`, then `build-plm-arrondissements.mjs 2017-leg`; for 2022: `build-plm-arrondissements.mjs`) → `carry-r1-into-round2.mjs` (carries R1 results into round-2 files for territories with no T2 vote — circos decided at R1; e.g. Saint-Denis 93066, all of Wallis 986 in 2024) → `inject-merged-commune-results.mjs` (COG-drift fixes, see gotcha 6) → `mark-annulled-communes.mjs` (flags communes whose ballots were entirely annulled by the Conseil constitutionnel — turnout > 0 but expressedVotes = 0; sets `annulled: true` + `leadingCandidate: ''` in full + choropleth files so the map colors them neutral and the detail panels show a notice instead of a bogus 0%-leader; applies to ALL elections, not just legislatives — 14 communes in présidentielle 2022 R1 incl. Dénipaire 88128/Cargèse 2A065, 1 in légis 2024 R1 Saint-Cyr-la-Lande 79244). All post-steps are idempotent. FINAL step for any ingestion/regen: `node scripts/build-dept-history.mjs` (rebuilds `history/depts.json` — the P5 cross-election series — from the final dept round files; errors on unmapped party codes, so run `validate-families.mjs` first). After any data regen, re-upload to R2 (`scripts/deploy/sync-r2.sh`).
