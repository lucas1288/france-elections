# Two-axis navigation — design doc

**Status**: direction agreed (July 2026); UI mockups reviewed and approved July 2026 —
search-bar-as-geo-axis (variant B) chosen. **P1 shipped July 2026** (search pill +
territory navigator, both platforms). **P2 shipped July 2026** (département insight
sections + surrounding-dept dimming + `↑ dept` breadcrumb). **P3 shipped July 2026**
(families.json registry + palette memberships + validation script).
**Présidentielle 2017 + Législatives 2017 ingested July 2026** (5 elections live —
the timeline strip has 2 presidential + 3 legislative stops). **P4 shipped July
2026** (`TimelineStrip`: desktop bottom-of-map card, mobile top-bar slot replacing
the chip + T1/T2; tap-only v1). **P5 v1 shipped July 2026** (dept-level history:
`build-dept-history.mjs` precompute → `history/depts.json`, per-family sparkline
"Historique" section in the dept insight panel, both platforms). ALL PHASES
SHIPPED — remaining follow-ups: drag-scrub, commune-level history, the full
history screen (proposal D — pending the desktop results-layout rethink), and
more elections to deepen the series.
**Owner**: lucas. **Origin**: UI-rework discussion, July 2026.
**Mockups**: visual UI ideas artifact (top bar variants, navigator, dept mode,
timeline strip, history screen) — https://claude.ai/code/artifact/e668b182-c326-4772-bdbd-24701fce7214

---

## The idea

The app answers one question: *what were the election results for a given territory at
a given moment?* Every screen is therefore a point on two axes:

- **Time axis** — which election (and round): Présidentielle 2022 T2, Législatives 2024 T1…
- **Geo axis** — which territory: national, département, commune, circonscription.

The navigation principle: **once the user settles one axis, they can freely move along
the other without losing the first.** Two canonical journeys:

1. *Settle time, explore space* — "I want Législatives 2024": move between territory
   levels, zoom, click around. **Mostly achieved today.**
2. *Settle space, explore time* — "I want the Hérault": move between elections and
   rounds while staying focused on that territory, with département-level insights.
   **The gap this rework addresses.**

## Why the state model already fits

The Zustand store is secretly two-axis already:

- `selected` (type/year/round) **is** the time axis.
- `clickedCommune` + `focusedTerritory` **are** the geo axis.
- The July 2026 fix making `clickedCommune` survive `setSelected` was exactly a
  "moving on the time axis must not reset the settled geo axis" repair.

So journey 2 *functions* today at a basic level (select Hérault → switch election →
panel re-resolves it). What's missing is not state — it's that **the UI makes only the
time axis visible and manipulable** (election chip, T1/T2 toggle). The geo axis is
invisible: no persistent "you are focused on Hérault" affordance, no way to see it,
set it without the map, or navigate up/down the territory hierarchy.

**Reframed goal: promote the geo axis to a first-class, visible, persistent control —
symmetric with the election chip.**

## Constraints that shape the design

### 1. The axes are not equally stable over time

| Level | Stability across decades | Time-scrub semantics |
|---|---|---|
| National | perfect | always meaningful |
| Département | stable since well before 1958 | always meaningful — the flagship level |
| Commune | drifts (mergers/défusions — we already fight 2022↔2024 COG drift) | meaningful with care; needs cross-vintage code mapping |
| Circonscription | **redrawn in 2010** (and earlier) | comparing "the same" circo across the 2010 boundary is misleading |

Design implications:
- The time axis is **fully unlocked at national + département** level.
- At commune level it works with a caveat (and the merged-commune mapping machinery).
- At circo level, either snap the focus up to the département when crossing a
  redistricting boundary, or render an explicit **break in the timeline** ("boundaries
  changed in 2010"). Do NOT silently pretend continuity.
- Don't design the flagship interaction around the least stable level.

### 2. Chronology within an election type is the strong story

Présidentielle → législatives of the same year is a fine hop, but the compelling
narrative is *same type across decades* ("Hérault at every presidential since 1981").
The timeline should default to filtering/laning by type (the picker's existing filter
chips are the precedent).

### 3. No "région" level (v1 decision)

No region geometry in the tiles, no region rows in the data, and the 2016 region
reform makes the level itself time-unstable. Département is the natural insight
altitude. Revisit only if a concrete need appears.

### 4. Party continuity across decades (data prerequisite)

Cross-election series ("this force over time in this territory") need a **political
family mapping** — UMP→LR, FN→RN, PS/NUPES/NFP-left, UDF/MoDem/Ensemble-centre… —
authored in the palette data (e.g. a `family` key per party/nuance, with a
family-level label + colour). Without it, a sparkline across elections is unreadable.
The 2017+ ingestion will need the same mapping, so it should be built once, early,
as data modelling (not UI).

## Proposals

### A. Search-bar-as-geo-axis + territory navigator (cheap, high leverage — do first)

**Decided (July 2026, UI mockup review): the search bar IS the geo-axis control**
(Google-Maps pattern), not a separate chip. The top bar holds a prominent search
field + the election chip. The field plays three roles: empty → search prompt;
territory settled → displays it ("Hérault ✕"); ✕ → un-settles the geo axis.
One control per axis, no redundant chip. (A "France ▾" chip variant was mocked up
and rejected in favour of this.)

Tapping/focusing the field opens the **territory navigator**: federated search
(communes / départements / circos in one query, results grouped by type with badges)
+ hierarchy browsing with a breadcrumb (France → départements → communes/circos)
+ recents. Selecting sets the geo axis (flyTo + selection), exactly like the
election chip sets the time axis. Communes/départements come from geo.api.gouv.fr;
circos from a small local name index (577 entries).

- Makes the second axis visible, persistent, and settable **without touching the map**.
- **Absorbs the "prominent search bar" backlog item** — search is the front door of
  the geo axis. The sidebar `CommuneSearch` and the mobile SearchSheet fold
  into this (SearchSheet's row format was already designed to extend to dept/circo).
- Breadcrumb semantics: from a commune, one tap up to its département; from a dept,
  up to France.

### B. Département insight view (existing backlog item — this is its purpose)

**SHIPPED July 2026** (`DeptInsight.tsx` + `utils/deptInsight.ts`; docs in CLAUDE.md).
Settling on a département gives a real "you are here" mode, not just a zoom level:

- Dept-level totals + ranked forces (already in `roundN.json` — no new data). ✅
- Circos won within the dept (from full circo data, already always loaded) — leader
  per circo, click = jump to that circo. ✅
- Top/bottom communes (participation) + largest communes + communes-led-per-force
  counts. ✅ (full-commune sections appear when that file is loaded — commune tab)
- Visual treatment: **dim surrounding départements** (fill-opacity paint expressions,
  crossfade) — the chosen answer to open question 3's dept case. ✅
- Also shipped alongside: `↑ département` breadcrumb in the detail panels (the
  navigator breadcrumb semantics from proposal A, hierarchy-up in one tap) and a
  shared `settleDept` store action.
- NOT shipped (deliberately): dept-scoped force *filtering* — the global
  single-party view covers most of it; revisit on demand.

### C. Timeline scrubber (adjacent moves on the time axis)

A **strip, not a modal**: election dots on a horizontal time axis — winner-coloured,
laned or filtered by type, current one highlighted. Tap/drag to an adjacent election:
map recolors in place, panel updates, **territory stays settled**. Rounds are
sub-stops (T1/T2) of each election dot.

- The existing full-screen picker remains the "browse the whole history" jump list;
  the strip is for *adjacent* movement and for reading the timeline as content.
- On mobile it can take over the top-bar slot currently held by the chip + T1/T2
  (the chip could open the strip, or the strip could replace the toggle).
- Renders the circo-redistricting break (constraint 1) visibly when a circo is
  settled.
- Honest caveat: with only 3 elections (2022–2024) the strip is an empty stage — it
  debuts properly once 2017 (and earlier) land. Sequence accordingly.

### D. Territory time-series (the payoff feature)

With a territory settled, the detail panel gains a **history section**: per political
family, a sparkline/series of its score across elections in *this* territory
(+ participation series). This is what makes "settle space, explore time" *worth it*.

Data engineering:
- **Département level: cheap.** Dept files are small; either fetch all rounds on
  demand or precompute per-dept history files at build time. Precompute preferred
  (one `history/{dept}.json` or one file for all depts — tiny either way).
- **Commune level: precompute only** (34 MB × N elections is not fetchable on
  demand). Later phase; per-commune history shards or a keyed lookup file.
- Depends on the family mapping (constraint 4).

### E. Transitions (feel)

Axis moves should feel spatial and continuous:
- Geo settle/unsettle → flyTo (exists today).
- Time move → recolor in place; feature-state makes a short colour crossfade nearly
  free and would sell the "same place, different moment" effect.
- Avoid full-screen modal hops for adjacent moves (that's what makes today's picker
  feel like teleporting rather than travelling).

## Suggested phasing

| Phase | What | Depends on | Notes |
|---|---|---|---|
| P1 | Search-bar-as-geo-axis + navigator (+ absorb search) | — | **SHIPPED July 2026** — `TerritorySearchBar` + `TerritoryNavigator`, bbox index from tiles |
| P2 | Département insight view | P1 (focus semantics) | **SHIPPED July 2026** — insight sections + dept dimming + breadcrumb |
| P3 | Political family mapping in palette data | — | **SHIPPED July 2026** — families.json (14 families / 5 blocs) + palette `family` keys + validate-families.mjs |
| P4 | Timeline scrubber | better with 2017+ ingested | **SHIPPED July 2026** — `TimelineStrip.tsx`, tap-only v1 (drag-scrub later) |
| P5 | Territory time-series panel | P3 + precomputed history files | **v1 SHIPPED July 2026** — dept level (`DeptHistory.tsx`); communes + full history screen later |

Recommended order: **P1 → P2 → P3 → (2017 ingestion) → P4 → P5.**

## Open questions (to pressure-test next)

1. **Timeline interaction details** — MOSTLY ANSWERED by the P4 build (July 2026):
   tap-to-switch v1 (stops preserve the round, unlike the picker which resets to T1);
   desktop = floating bottom-of-map card (top-bar chip + T1/T2 kept, per mockup);
   mobile = the strip lives in the top-bar slot (second header row), so it never
   conflicts with the detail sheet — the mockup's "collapse to a mini-chip" was
   unneeded. Still open: drag-scrub gesture (v2), and colouring stops by the winner
   IN the settled territory rather than nationally (the mockup's "c'est là que ça
   devient fort" idea — needs cross-election data for the settled territory, kin
   to P5's history files).
2. **Family mapping authoring** — ANSWERED (P3, July 2026): hybrid — a global
   `families.json` registry (14 families + 5 blocs, colors, left→right order) with
   `family: <id>` memberships in each election's `palette.json`. Alliances are a
   family of their own (`union-gauche`) and blocs give continuity across alliance
   years. Macronisme merged into `centre`; Reconquête its own family (bloc
   extrême droite); PCF separate. Taxonomy is fixed; memberships grow per
   ingestion (`scripts/validate-families.mjs` gates them).
3. **Focus-mode visual language** — ANSWERED for départements (P2): dimming
   (fill-opacity 0.35 outside the settled dept, everything stays interactive).
   Still open for commune/circo-level focus if we ever want it there.
4. **Does the geo chip replace `focusedTerritory`** (overseas focus) or generalise it?
   Likely: `focusedTerritory` becomes a special case of the settled geo axis.
5. **URL/deep-linking** — ANSWERED (July 2026): `src/hooks/useUrlSync.ts`.
   `?election=leg-2024-t2&territory=34&view=circo&party=RN` / `mode=abstention`.
   Params → store at load (election held until the manifest validates it;
   territory restored with the navigator's selection semantics — 5-char
   circo-vs-commune ambiguity resolved by `view`); store → URL afterwards via
   `history.replaceState` (no history entries — back leaves the app). Not
   captured: camera position beyond the territory, overseas focus without a
   selection.
