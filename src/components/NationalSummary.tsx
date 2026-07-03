import { useState } from 'react'
import type { Palette, RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'
import { useElectionStore } from '../store/electionStore'

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
 * Collapsible national-results summary at the top of the idle sidebar — now the
 * desktop MAP CONTROL too (mobile model, replacing the old floating "En tête"
 * legend): clicking a candidate/party/alliance row colours the choropleth by
 * that force's score-vs-national ratio, clicking the participation block shows
 * the abstention ramp, and re-clicking the active one returns to the winner
 * view. The active row is highlighted. Figures derive from dept-level data,
 * which sums exactly to the national totals.
 */
export function NationalSummary({ electionData, palette }: Props) {
  const [open, setOpen] = useState(true)
  const colorMode = useElectionStore((s) => s.colorMode)
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)
  if (!electionData) return null

  const t = computeNationalTotals(electionData)
  if (!t.registeredVoters) return null

  const turnoutPct = (t.turnout / t.registeredVoters) * 100
  const abstentionPct = (t.abstention / t.registeredVoters) * 100
  const activeParty = colorMode.kind === 'party' ? colorMode.party : null
  const abstentionActive = colorMode.kind === 'abstention'

  return (
    <div className="border-b border-gray-100 dark:border-slate-800">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Résultats nationaux
        </span>
        <span className="text-gray-300 dark:text-gray-600 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-2 pb-3 space-y-1">
          <p className="px-2 pb-1 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
            Cliquez sur la participation, un candidat ou un parti/alliance pour voir le
            détail de ses résultats sur la carte.
          </p>

          {/* Participation / abstention — clicking it drives the abstention map view */}
          <button
            className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
              abstentionActive
                ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-800'
                : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
            }`}
            onClick={toggleAbstentionMode}
          >
            <div className="flex items-baseline gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Participation</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">{fmtPct(turnoutPct)}%</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">Abstention</p>
                <p className="text-lg font-bold text-gray-500 dark:text-gray-400 leading-tight">{fmtPct(abstentionPct)}%</p>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 self-end ml-auto">
                {fmtInt(t.registeredVoters)} inscrits
              </p>
            </div>
          </button>

          {/* Ranked vote share — each row is a map control (single-force view) */}
          <div className="space-y-0.5">
            {t.candidates.map((c) => {
              const color = getCandidateColor(c.name, 0, c.party, palette)
              const active = activeParty === c.party
              return (
                <button
                  key={c.name}
                  className={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${
                    active
                      ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-800'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
                  }`}
                  onClick={() => togglePartyMode(c.party)}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 ml-2 shrink-0">
                      {fmtPct(c.percentage)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full" style={{ width: `${c.percentage}%`, background: color }} />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
