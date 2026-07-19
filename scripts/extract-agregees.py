#!/usr/bin/env python3
"""Extract per-election slices from data.gouv's consolidated "Données des
élections agrégées" parquet files into data-sources/agregees/ CSVs consumed by
scripts/parse-agregees.mjs.

The consolidated dataset (harmonized, bureau-de-vote level, 1999→today) is the
preferred source for pre-2017 elections: one format for every vintage, INSEE
commune codes already normalized, PLM arrondissements derivable from the AABB
bureau codes. Verified against our per-election ingestions: 2017/2022/2024
inscrits match to the voter; 2012 presidential candidate totals match the
official figures exactly.

Requires: pip install duckdb. Parquet inputs (put in data-sources/agregees/):
  general.parquet  = resource ff16d511-10c0-405e-9b35-511723948fce
  candidat.parquet = resource 4d3b35f6-0b22-4415-a24c-419a676312e2

Usage: python3 scripts/extract-agregees.py 2012_pres_t1 2012_pres_t2 ...
"""
import sys, os
import duckdb

ROOT = os.path.join(os.path.dirname(__file__), '..')
DIR = os.path.join(ROOT, 'data-sources', 'agregees')
GEN = os.path.join(DIR, 'general.parquet')
CAN = os.path.join(DIR, 'candidat.parquet')

for id_election in sys.argv[1:]:
    out_g = os.path.join(DIR, f'{id_election}-general.csv')
    out_c = os.path.join(DIR, f'{id_election}-candidat.csv')
    duckdb.sql(f"""
      COPY (
        SELECT code_departement, libelle_departement, code_commune,
               libelle_commune, code_circonscription, libelle_circonscription,
               code_bv, inscrits, votants,
               coalesce(blancs, 0) AS blancs, nuls, exprimes
        FROM '{GEN}' WHERE id_election = '{id_election}'
        ORDER BY code_departement, code_commune, code_bv
      ) TO '{out_g}' (HEADER, DELIMITER ';')
    """)
    duckdb.sql(f"""
      COPY (
        SELECT code_departement, code_commune, code_bv,
               nom, prenom, Nuance, voix
        FROM '{CAN}' WHERE id_election = '{id_election}'
        ORDER BY code_departement, code_commune, code_bv, voix DESC
      ) TO '{out_c}' (HEADER, DELIMITER ';')
    """)
    print(f'{id_election}: wrote {os.path.basename(out_g)}, {os.path.basename(out_c)}')
