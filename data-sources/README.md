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

## `burvot-2022/` — bureau-de-vote results, 2022
`burvot-{pres,legis}-t{1,2}.txt` — per-polling-station results. Used only to
aggregate Paris/Lyon/Marseille **arrondissements** (BV code `AABB`, AA = arr).
- Source: data.gouv.fr — 2022 présidentielle / législatives "résultats par
  bureau de vote".
- Consumed by: `scripts/build-plm-arrondissements.mjs`.

> If you add a new election, drop its raw files in a new subfolder here and
> document the source + the script that consumes them in this README.
