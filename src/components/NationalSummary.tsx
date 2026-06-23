import { useState } from 'react'
import type { Palette, RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
}

function fmtPct(n: number) {
  return n.toFixed(1).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * Collapsible national-results summary shown at the top of the idle sidebar.
 * Participation/abstention + ranked national vote share (candidates for
 * presidentials, nuances for legislatives). Derived from dept-level data,
 * which sums exactly to the national totals.
 */
export function NationalSummary({ electionData, palette }: Props) {
  const [open, setOpen] = useState(true)
  if (!electionData) return null

  const t = computeNationalTotals(electionData)
  if (!t.registeredVoters) return null

  const turnoutPct = (t.turnout / t.registeredVoters) * 100
  const abstentionPct = (t.abstention / t.registeredVoters) * 100

  return (
    <div className="border-b border-gray-100">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Résultats nationaux
        </span>
        <span className="text-gray-300 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-3">
          {/* Participation / abstention */}
          <div className="flex items-baseline gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400">Participation</p>
              <p className="text-lg font-bold text-gray-900 leading-tight">{fmtPct(turnoutPct)}%</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400">Abstention</p>
              <p className="text-lg font-bold text-gray-500 leading-tight">{fmtPct(abstentionPct)}%</p>
            </div>
            <p className="text-[11px] text-gray-400 self-end ml-auto">
              {fmtInt(t.registeredVoters)} inscrits
            </p>
          </div>

          {/* Ranked vote share */}
          <div className="space-y-2">
            {t.candidates.map((c) => {
              const color = getCandidateColor(c.name, 0, c.party, palette)
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-sm text-gray-800 truncate">{c.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-2 shrink-0">
                      {fmtPct(c.percentage)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${c.percentage}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
