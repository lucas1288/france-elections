/**
 * Election ingestion registry (config-driven pipeline, July 2026): one
 * descriptor per election — sources (data.gouv resource URLs, fetched on
 * demand), the parse + post-step chain in order, and the official national
 * figures that gate every (re)generation. Driven by scripts/ingest.mjs.
 *
 * Palettes + family memberships are authored by hand (political judgment) —
 * never generated. `legacy: true` = the outputs include hand-repairs that a
 * re-parse would clobber (prés 2022's corrupt-source round2.json was rebuilt
 * from the circo file); ingest refuses to re-run those and only validates.
 *
 * `expected.shares` are % of expressed votes (2 dp) summed from the dept-level
 * round file, keyed by party/nuance code; `inscrits` is exact. `seats` (R2,
 * legislatives) are exact counts of `elected` flags in round2-circ.json.
 */
const R = (id) => `https://www.data.gouv.fr/fr/datasets/r/${id}`

export const ELECTIONS = {
  'presidential-2022': {
    type: 'presidential',
    year: 2022,
    legacy: true, // round2.json rebuilt from circos (corrupt ministry dept file) — validate only
    expected: {
      1: { inscrits: 48747876, shares: { LREM: 27.85, RN: 23.15, LFI: 21.95, REC: 7.07 } },
      2: { inscrits: 48752339, shares: { LREM: 58.55, RN: 41.45 } },
    },
  },

  'presidential-2017': {
    type: 'presidential',
    year: 2017,
    sources: {
      dir: 'presidentielle-2017',
      files: {
        'pres2017-t1-multi.xls': R('2776519f-a940-46f0-99f4-1a3a1374193b'),
        'pres2017-t2-multi.xls': R('0e50ba6a-8175-4455-9e4a-09a7783dc547'),
        'pres2017-t1-communes.xls': R('77ed6b2f-c48f-4037-8479-50af74fa5c7a'),
        'pres2017-t2-communes.xls': R('be8faff4-dedf-44be-92c7-e77feb9df335'),
        'pres2017-t1-bv.txt': R('8fdb0926-ea9d-4fb4-a136-7767cd97e30b'),
        'pres2017-t2-bv.txt': R('2e3e44de-e584-4aa2-8148-670daf5617e1'),
      },
    },
    steps: [
      ['parse-presidential-2017.mjs'],
      ['aggregate-2017-merged-communes.mjs'],
      ['build-plm-arrondissements.mjs', '2017'],
      ['mark-annulled-communes.mjs'],
    ],
    expected: {
      1: { inscrits: 47582183, shares: { EM: 24.01, FN: 21.3, LR: 20.01, LFI: 19.58 } },
      2: { inscrits: 47568693, shares: { EM: 66.1, FN: 33.9 } },
    },
  },

  'legislative-2017': {
    type: 'legislative',
    year: 2017,
    sources: {
      dir: 'legislatives-2017',
      files: {
        'leg2017-t1-multi.xlsx': R('3eb503cd-49cf-4e04-9efd-7262580f7fc7'),
        'leg2017-t2-multi.xlsx': R('41483dcf-4c61-4e30-b7f8-d10396d28040'),
        'leg2017-t1-communes.xlsx': R('7b613086-b5f5-4745-82e8-11b7397f9334'),
        'leg2017-t2-communes.xlsx': R('a6df654f-11ad-4dcc-872c-d3fd94ca3e49'),
        'leg2017-t1-bv.txt': R('80cb1309-9147-4bae-b6e2-79877d549b50'),
        // t2 BV has no ministry dataset on data.gouv (only third-party
        // re-exports, e.g. 'elections-legislatives-2017-resultats-bureaux-vote-
        // tour-2') — the on-disk leg2017-t2-bv.txt is documented in
        // data-sources/README.md; null = ingest.mjs can't auto-fetch it.
        'leg2017-t2-bv.txt': null,
      },
    },
    steps: [
      ['parse-legislatives-2017.mjs'],
      ['aggregate-2017-merged-communes.mjs', 'legislative'],
      ['build-plm-arrondissements.mjs', '2017-leg'],
      ['carry-r1-into-round2.mjs'],
      ['mark-annulled-communes.mjs'],
    ],
    expected: {
      1: { inscrits: 47570988, shares: { REM: 28.21, LR: 15.77, FN: 13.2, FI: 11.03, SOC: 7.44 } },
      2: {
        inscrits: 47301583,
        shares: { REM: 43.04, LR: 22.22, FN: 8.75 },
        seats: { REM: 308, LR: 112, MDM: 42, SOC: 30, UDI: 18, FI: 17, DVG: 12, COM: 10, FN: 8 },
        seatTotal: 577,
      },
    },
  },

  'legislative-2022': {
    type: 'legislative',
    year: 2022,
    sources: {
      dir: 'legislatives-2022',
      files: {
        'resultats-par-niveau-cirlg-t1-france-entiere.txt': R('626d173f-5c89-42f5-9350-403559f1a3e8'),
        'resultats-par-niveau-cirlg-t2-france-entiere.txt': R('a84f1483-a191-4187-ad40-404105bb9bf0'),
        'resultats-par-niveau-dpt-t1-france-entiere.txt': R('7249a9eb-7476-4401-8acf-1bb9b56518de'),
        'resultats-par-niveau-dpt-t2-france-entiere.txt': R('8fca53d1-5f1f-4a22-8895-440eea405522'),
        'resultats-par-niveau-subcom-t1-france-entiere.txt': R('87d3701e-4d5d-4963-89f4-b402cb1c4403'),
        'resultats-par-niveau-subcom-t2-france-entiere.txt': R('3b43be76-1b94-4f0e-b9d6-d85981c975bd'),
      },
      extra: {
        dir: 'burvot-2022',
        files: {
          'burvot-legis-t1.txt': R('2632e5e7-8deb-49f7-bebf-e6ea0ec3d253'),
          'burvot-legis-t2.txt': R('cada247a-6528-44e7-8308-30c0c335a4b2'),
        },
      },
    },
    steps: [
      ['parse-legislatives-2022.mjs'],
      ['build-plm-arrondissements.mjs', '2022-leg'],
      ['carry-r1-into-round2.mjs'],
      ['inject-merged-commune-results.mjs'],
      ['mark-annulled-communes.mjs'],
    ],
    expected: {
      // Ministry-revised figures (July 2026 re-download: ±1-voter corrections
      // vs the June 2026 ingestion — shares unchanged at 2 dp).
      1: { inscrits: 48953891, shares: { ENS: 25.75, NUP: 25.66, RN: 18.68, LR: 10.42 } },
      2: {
        inscrits: 48589390,
        shares: { ENS: 38.57, NUP: 31.6, RN: 17.3 },
        seats: { ENS: 245, NUP: 131, RN: 89, LR: 61 },
        seatTotal: 577,
      },
    },
  },

  'legislative-2024': {
    type: 'legislative',
    year: 2024,
    sources: {
      dir: 'legislatives-2024',
      files: {
        't1-circo.csv': R('5163f2e3-1362-4c35-89a0-1934bb74f2d9'),
        't1-communes.csv': R('bd32fcd3-53df-47ac-bf1d-8d8003fe23a1'),
        't1-bureau.csv': R('6813fb28-7ec0-42ff-a528-2bc3d82d7dcd'),
        't1-dpt.csv': R('78c708c5-5bc5-438d-8379-f432beae3f2b'),
        't2-circo.csv': R('41ed46cd-77c2-4ecc-b8eb-374aa953ca39'),
        't2-communes.csv': R('5a8088fd-8168-402a-9f40-c48daab88cd1'),
        't2-bureau.csv': R('ca974f04-cfd9-4da8-8554-4a868a09c6c2'),
        't2-dpt.csv': R('8d4a6927-c96f-4cf5-b757-ea745eca26bd'),
      },
    },
    steps: [
      ['parse-legislatives-2024.mjs'],
      ['carry-r1-into-round2.mjs'],
      ['inject-merged-commune-results.mjs'],
      ['mark-annulled-communes.mjs'],
    ],
    expected: {
      1: { inscrits: 49332709, shares: { RN: 29.26, UG: 27.99, ENS: 20.04, LR: 6.57 } },
      2: {
        inscrits: 43337539,
        shares: { RN: 32.05, UG: 25.67, ENS: 23.15 },
        seats: { UG: 178, ENS: 150, RN: 125 },
        seatTotal: 577,
      },
    },
  },
}
