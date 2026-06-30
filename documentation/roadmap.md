# Roadmap & vision

Agreed direction for where `france-elections` is going. Split into: the data-expansion
plan, the longer-term interactivity vision, and the near-term backlog. For the
deep technical state of what's already built, see [`../CLAUDE.md`](../CLAUDE.md).

## Long-term goal

A complete interactive history of French national elections: **all direct-suffrage
presidentials (1965–present)** and **all legislatives (1958–present)**, explorable at
commune and circonscription granularity, with consistent alliance-aware coloring.

## Expansion plan (data)

Walk backwards from the most recent elections.

- **Scope**: presidentials 1965→2022, then legislatives 1958→2022 (incl. the 1986
  proportional special case).
- **Presidential results at circo level** are wanted (legislatives are natively per-circo;
  presidentials are per-commune). Computed by aggregating communes via era
  correspondence tables — exact from bureau-de-vote data post-2002, proportional
  apportionment with an "estimated results" notice before. Purpose: compare
  presidential vs legislative potential per circonscription.
- **Geometry trade-off accepted**: modern commune polygons + harmonized historical data
  (Cagé–Piketty dataset preferred, CDSP fallback), BUT per-era *département* layers are
  required (Seine / Seine-et-Oise pre-1968, single Corsica pre-1976) — dissolved from
  communes. Geometry is versioned per election in the manifest (`geometry: {admin, circo}`).
- **Legislative coloring**: bloc/alliance-first — pre-electoral alliance color when one
  exists, party color otherwise. Encoded per-election in `palette.json` (parties +
  alliances with members).

### Status

- **Shipped**: Présidentielle 2022, Législatives 2022, Législatives 2024 (rounds 1 & 2),
  commune + circonscription granularity, alliance coloring, hemicycle view, gradient /
  party / abstention color modes, overseas territories, Français à l'étranger, PLM
  arrondissements. Numbers validated against official results.
- **Next up**: Législatives 2017, Présidentielle 2017.
- **Open design question**: build a config-driven pipeline for adding elections (what
  varies: source file format, geometry vintage, palette/nuances, granularities) before
  adding many more — worth doing ahead of the pre-2017 backlog.

## Interactivity vision (longer-term, not yet specified)

Ideas lucas wants to keep in mind. None require a backend up front; they mostly need
**granular, versioned data** (see "Design principles" below). Hosting is chosen to make
each reachable incrementally — see [`hosting-and-deployment.md`](hosting-and-deployment.md).

1. **Compare a party / candidate / alliance over time** — small aggregate data;
   precompute tiny per-entity time-series files at build time, fetch statically.
2. **Compare two or more entities on a given election** — needs the ability to fetch
   one entity without loading the ~34 MB full-commune file → split heavy data into small
   per-entity files. Still static.
3. **Live election-night updates** ("dream big") — a pipeline polls official results,
   regenerates affected files, writes them to object storage, and bumps a version so
   clients refetch. Serverless functions + cron/queue + object storage; still not a DB.
4. **Ad-hoc queries** (far off) — e.g. "every commune where party X grew >5 pts between
   two elections." This is what finally justifies a query engine (Cloudflare D1 / a small
   Postgres+PostGIS behind a Worker). Not built until it's a real need.

### Design principles (cheap insurance to apply as elections are added)

- **Granular data**: prefer many small per-entity / per-commune files over monolithic
  blobs, so comparison features fetch kilobytes, not tens of megabytes.
- **Versioned manifest**: extend `public/data/elections/index.json` with `version` /
  `updatedAt`, enabling a refresh signal for live updates and cache-busting.
- **Don't provision ahead of need**: no Workers / D1 / DB until a concrete feature
  requires it; each slots into the chosen hosting without re-platforming.

## Near-term backlog (smaller items)

- Config-driven election-ingestion pipeline (see above).
- Known minor gaps: round-2 presidential commune has no abstention field (no full-commune
  source); abroad circo dots show neutral in party mode on the commune tab.
- Deployment: choose starting path + domain, then move heavy data to R2.
