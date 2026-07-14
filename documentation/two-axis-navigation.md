# Two-axis navigation — design doc

**Status**: draft, direction agreed in principle (July 2026). No implementation started.
**Owner**: lucas. **Origin**: UI-rework discussion, July 2026.

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

### A. Territory chip + navigator (cheap, high leverage — do first)

A geo chip next to the election chip: `France` by default, `Hérault ▾` when settled.
Tapping opens a **territory navigator**: search box + hierarchy browsing
(France → départements → communes/circos). Selecting sets the geo axis (flyTo +
selection), exactly like the election chip sets the time axis.

- Makes the second axis visible, persistent, and settable **without touching the map**.
- **Absorbs the "prominent search bar" backlog item** — search is just the fastest way
  to set the geo axis. The sidebar `CommuneSearch` and the mobile SearchSheet fold
  into this (SearchSheet's row format was already designed to extend to dept/circo).
- Breadcrumb semantics: from a commune, one tap up to its département; from a dept,
  up to France.

### B. Département insight view (existing backlog item — this is its purpose)

Settling on a département gives a real "you are here" mode, not just a zoom level:

- Dept-level totals + ranked forces (already in `roundN.json` — no new data).
- Circos won within the dept (from full circo data, already always loaded).
- Top/bottom communes (participation, force scores).
- Visual treatment: dim/desaturate surrounding départements; clear "focused" state.
- Interactivity ideas from the earlier backlog note (filter by force at this level)
  slot in here.

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
| P1 | Territory chip + navigator (+ absorb search) | — | pure UI, no new data; makes the model visible |
| P2 | Département insight view | P1 (focus semantics) | existing backlog item; data already loaded |
| P3 | Political family mapping in palette data | — | data modelling; also a prereq for 2017+ ingestion |
| P4 | Timeline scrubber | better with 2017+ ingested | interleave the 2017 ingestion before/with this |
| P5 | Territory time-series panel | P3 + precomputed history files | dept first, communes later |

Recommended order: **P1 → P2 → P3 → (2017 ingestion) → P4 → P5.**

## Open questions (to pressure-test next)

1. **Timeline interaction details** — strip placement on mobile vs desktop; how rounds
   nest in election stops; how the type filter/lanes look; how the 2010 circo break
   renders.
2. **Family mapping authoring** — where it lives (per-election `palette.json` vs a
   global `families.json`), who the canonical families are, how to handle forces that
   split/merge asymmetrically (NUPES→NFP easy; UDF diaspora hard).
3. **Focus-mode visual language** — dimming vs masking vs outline for the settled
   territory; how much of the surrounding map stays interactive.
4. **Does the geo chip replace `focusedTerritory`** (overseas focus) or generalise it?
   Likely: `focusedTerritory` becomes a special case of the settled geo axis.
5. **URL/deep-linking** — two settled axes are a natural shareable state
   (`?election=leg-2024-t2&territory=34`). Worth folding in when the axes become
   first-class.
