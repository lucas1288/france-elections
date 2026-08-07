import type { Palette } from '../../types/election'
import type { NationalPctLookup } from '../../utils/territoryDetail'
import { getCandidateColor } from '../../utils/partyColors'

interface Candidate {
  name: string
  party: string
  votes: number
  percentage: number
}

interface Props {
  candidates: Candidate[]
  palette: Palette | null
  /** National baseline for the faded "reminder" bar under each local score. */
  nationalPct: NationalPctLookup | null
}

function fmt(n: number) {
  return n.toFixed(1).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * The party/nuance code to show after a name, or null when it would just repeat
 * it (B3, Aug 2026 — lucas: "show in parenthesis the party of the candidate,
 * even within an alliance").
 *
 * The test is data-driven rather than election-type-driven: a row whose `name`
 * IS the palette's label for its own code is already a party row — that's every
 * legislative dept/commune entry, which the parsers key by NUANCE — so
 * "Ensemble (ENS)" would say the same thing twice. Rows whose name is a person
 * (per-circo legislative entries, and every presidential row) get the code.
 *
 * LIMIT worth knowing: for alliance years the ministry's nuance IS the alliance
 * (`UG` 2024, `NUP` 2022), and the member party of an individual candidate is
 * not published in these files. So an NFP candidate reads "(UG)", not "(PS)" —
 * closing that gap needs a source we don't have, not a UI change.
 */
function partyTag(name: string, party: string, palette: Palette | null): string | null {
  if (!party) return null
  const entry = palette?.parties?.[party]
  if (entry && entry.label === name) return null
  return party
}

/**
 * The candidate/nuance result rows of a selected territory: local score bar, the
 * faded national "reminder" bar behind it, and the votes + national caption.
 *
 * Rendered identically on both platforms — the desktop sidebar and the mobile
 * detail sheet used to carry byte-equivalent copies of this markup. Callers own
 * the surrounding container (their paddings differ), this owns a row.
 */
export function CandidateRows({ candidates, palette, nationalPct }: Props) {
  return (
    <>
      {candidates
        .slice()
        .sort((a, b) => b.percentage - a.percentage)
        .map((cand, i) => {
          const color = getCandidateColor(cand.name, i, cand.party, palette)
          const natPct = nationalPct?.(cand.name, cand.party) ?? null
          const tag = partyTag(cand.name, cand.party, palette)
          return (
            <div key={cand.name}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {cand.name}
                  </span>
                  {tag && (
                    <span
                      className="shrink-0 text-xs text-gray-400 dark:text-gray-500"
                      title={palette?.parties?.[cand.party]?.label}
                    >
                      ({tag})
                    </span>
                  )}
                </div>
                <span className="ml-2 shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {fmt(cand.percentage)}%
                </span>
              </div>
              {/* Local score */}
              <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${cand.percentage}%`, background: color }}
                />
              </div>
              {/* National baseline — same colour, faded, below the local bar */}
              {natPct != null && (
                <div className="w-full bg-gray-50 dark:bg-slate-800/60 rounded-full h-1 mt-0.5">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(natPct, 100)}%`, background: color, opacity: 0.35 }}
                  />
                </div>
              )}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {fmtInt(cand.votes)} voix
                {natPct != null && (
                  <span className="text-gray-300 dark:text-gray-600">
                    {' '}
                    · national {fmt(natPct)}%
                  </span>
                )}
              </p>
            </div>
          )
        })}
    </>
  )
}
