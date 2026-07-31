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
