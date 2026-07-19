# data-sources/ — raw ministry inputs (not tracked in git)

These are the **build-time inputs** consumed by `scripts/parse-*.mjs` and
`scripts/build-*.mjs`. They are never served to the browser — the scripts parse
them into the small/served files under `public/data/`. They are large (~258 MB
total) and re-downloadable, so the directory is git-ignored (only this README is
tracked). Re-fetch them here to regenerate the published data.

All files come from the Ministère de l'Intérieur results, published on
data.gouv.fr / elections.interieur.gouv.fr.

## `legislatives-2024/` — Législatives 2024, "résultats définitifs"
One CSV per level, per round (UTF-8, CRLF, `;`-separated; round-2 files quote
text/code fields). Naming here: `t{1,2}-{circo,communes,bureau,dpt}.csv`.
- Source: data.gouv.fr — "Élections législatives 2024 - Résultats définitifs".
- Consumed by: `scripts/parse-legislatives-2024.mjs`.

## `legislatives-2022/` — Législatives 2022
`resultats-par-niveau-{cirlg,dpt,subcom}-t{1,2}-france-entiere.txt`
(latin1, `;`-separated). `subcom` = per commune×circo (used for commune-level
aggregation); `cirlg` = circonscription; `dpt` = département.
- Source: data.gouv.fr — "Élections législatives 2022 - Résultats".
- Consumed by: `scripts/parse-legislatives-2022.mjs`.

## `legislatives-2017/` — Législatives 2017 (11/18 juin), "résultats définitifs"
`leg2017-t{1,2}-multi.xlsx` (Departements TN sheet = nuance blocks 5-wide with
Sièges; Circo. leg. TN sheet = candidate blocks 9-wide with Sièges-as-elected),
`leg2017-t{1,2}-communes.xlsx` (one row per commune×circo, candidate blocks
8-wide with Nuance), `leg2017-t{1,2}-bv.txt` (latin1, `;`, 21 fixed cols +
8-wide blocks — same layout as burvot-2022 legis).
- Source: data.gouv.fr — "Elections législatives des 11 et 18 juin 2017 —
  Résultats {du 1er tour, du 2nd tour, par communes…, par bureaux de vote…}".
- Consumed by: `scripts/parse-legislatives-2017.mjs` +
  `scripts/build-plm-arrondissements.mjs` (era `2017-leg`).

## `presidentielle-2017/` — Présidentielle 2017 (23 avril / 7 mai)
`pres2017-t{1,2}-multi.xls` (Départements + Circo. Leg. sheets),
`pres2017-t{1,2}-communes.xls`, `pres2017-t{1,2}-bv.txt` (2022 BV layout).
Legacy BIFF .xls — read via the `xlsx` devDependency.
- Source: data.gouv.fr — "Election présidentielle des 23 avril et 7 mai 2017 —
  Résultats définitifs…" datasets.
- Consumed by: `scripts/parse-presidential-2017.mjs` +
  `scripts/build-plm-arrondissements.mjs` (era `2017`).

## `burvot-2022/` — bureau-de-vote results, 2022
`burvot-{pres,legis}-t{1,2}.txt` — per-polling-station results. Used only to
aggregate Paris/Lyon/Marseille **arrondissements** (BV code `AABB`, AA = arr).
- Source: data.gouv.fr — 2022 présidentielle / législatives "résultats par
  bureau de vote".
- Consumed by: `scripts/build-plm-arrondissements.mjs`.

## `presidentielle-2017/` — Présidentielle 2017 (legacy BIFF .xls + BV .txt)
`pres2017-t{1,2}-{multi,communes}.xls` + `pres2017-t{1,2}-bv.txt`.
- Consumed by: `scripts/parse-presidential-2017.mjs`.

## `legislatives-2017/` — Législatives 2017 (.xlsx + BV .txt)
`leg2017-t{1,2}-{multi,communes}.xlsx` + `leg2017-t{1,2}-bv.txt`. NOTE: the T2
BV file has no ministry dataset on data.gouv (third-party re-exports only) —
don't delete it, it can't be auto-refetched.

## `cog/` — INSEE communes movements table
`v_mvt_commune_2025.csv` (insee.fr) — drives the 2017 COG-drift aggregation.

> **Machine-readable provenance lives in `scripts/elections.config.mjs`** —
> per-election data.gouv resource URLs; `node scripts/ingest.mjs <type> <year>`
> auto-downloads missing files here. When adding an election, register its
> sources there (and note any non-refetchable file in this README).
> GOTCHA: the ministry silently revises old files on data.gouv (légis 2022
> re-download differed by ±1 voter in 72 dépts vs the June 2026 ingestion).

## `agregees/` — consolidated "Données des élections agrégées" (data.gouv)
`general.parquet` + `candidat.parquet` (harmonized BV-level results,
1999→today) and the per-election CSV slices (`{year}_{pres|legi}_t{N}-*.csv`)
produced by `scripts/extract-agregees.py` (requires `pip install duckdb`).
Preferred source for pre-2017 vintages — consumed by
`scripts/parse-agregees.mjs`. Parquet URLs live in `elections.config.mjs`.
