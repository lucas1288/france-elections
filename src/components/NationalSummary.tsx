import { useMemo, useState } from 'react'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'
import { computeCircoCounts } from '../utils/circoCounts'
import { useElectionStore } from '../store/electionStore'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
  /** Circo choropleth + full data — feed the Pourcentages/Sièges switch
   *  (per-force won / 1st / 2nd circo counts). Absent → switch hidden. */
  circoChoro?: ChoroplethData | null
  circoData?: RoundData | null
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
 *
 * A Pourcentages/Sièges segmented switch (same model as the mobile national
 * sheet) swaps the vote-share rows for per-force circo counts — seats won |
 * en tête | 2e — with a stacked tri-opacity bar, rows re-sorted by seats.
 */
export function NationalSummary({ electionData, palette, circoChoro, circoData }: Props) {
  const [open, setOpen] = useState(true)
  // '%' = national vote share; 'circos' = seats won / arrived 1st / arrived 2nd
  // across circonscriptions (same switch as the mobile national sheet).
  const [viewMode, setViewMode] = useState<'pct' | 'circos'>('pct')
  const colorMode = useElectionStore((s) => s.colorMode)
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)

  const circoCounts = useMemo(
    () => (circoChoro && circoData ? computeCircoCounts(circoChoro, circoData) : null),
    [circoChoro, circoData],
  )

  if (!electionData) return null

  const t = computeNationalTotals(electionData)
  if (!t.registeredVoters) return null

  // "En tête (pas encore gagné)" bucket exists only when some lead isn't a win
  // (round 1 of legislatives; always for presidentials). At T2 every lead IS
  // the seat winner, so the bucket would be 0 for everyone — hide it.
  const showLeadBucket =
    !!circoCounts &&
    [...circoCounts.counts1st].some(([name, n]) => n > (circoCounts.countsWon.get(name) ?? 0))
  const hasSeats = !!circoCounts && circoCounts.countsWon.size > 0
  const showCircos = viewMode === 'circos' && !!circoCounts

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

          {/* View switch: national vote share vs circo counts (seats won /
              arrived 1st / arrived 2nd). Only when circo data is available. */}
          {circoCounts && (
            <div className="px-2 pb-1 pt-1">
              <div className="flex w-full rounded-lg bg-gray-100 p-0.5 text-xs dark:bg-slate-800">
                {([
                  ['pct', 'Pourcentages'],
                  ['circos', hasSeats ? 'Sièges' : 'Circonscriptions'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`flex-1 rounded-md px-2 py-1 font-medium transition-colors ${
                      viewMode === mode
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-gray-100'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {showCircos && (
                <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                  Sur {fmtInt(circoCounts.total)} circonscriptions —{' '}
                  {[
                    hasSeats && 'sièges remportés',
                    showLeadBucket && 'en tête',
                    '2e position',
                  ].filter(Boolean).join(' | ')}
                </p>
              )}
            </div>
          )}

          {/* Ranked vote share — each row is a map control (single-force view) */}
          <div className="space-y-0.5">
            {(showCircos && circoCounts
              ? [...t.candidates].sort((a, b) => {
                  const k = (n: string) => {
                    const won = circoCounts.countsWon.get(n) ?? 0
                    const lead = (circoCounts.counts1st.get(n) ?? 0) - won
                    return won * 1e6 + lead * 1e3 + (circoCounts.counts2nd.get(n) ?? 0)
                  }
                  return k(b.name) - k(a.name)
                })
              : t.candidates
            ).map((c) => {
              const color = getCandidateColor(c.name, 0, c.party, palette)
              const active = activeParty === c.party
              // Exclusive buckets: seats won are excluded from "en tête".
              const won = circoCounts?.countsWon.get(c.name) ?? 0
              const lead1st = Math.max(0, (circoCounts?.counts1st.get(c.name) ?? 0) - won)
              const n2 = circoCounts?.counts2nd.get(c.name) ?? 0
              const pctOf = (n: number) => (circoCounts ? (n / circoCounts.total) * 100 : 0)
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
                      {showCircos
                        ? [
                            hasSeats ? fmtInt(won) : null,
                            showLeadBucket ? fmtInt(lead1st) : null,
                            fmtInt(n2),
                          ].filter((v) => v !== null).join(' | ')
                        : `${fmtPct(c.percentage)}%`}
                    </span>
                  </div>
                  {showCircos ? (
                    /* Stacked circo bar — seats won (full colour), arrived 1st
                       (medium), arrived 2nd (faint), scaled to all circos */
                    <div className="flex w-full h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                      {won > 0 && <div className="h-full" style={{ width: `${pctOf(won)}%`, background: color }} />}
                      {lead1st > 0 && <div className="h-full" style={{ width: `${pctOf(lead1st)}%`, background: color, opacity: 0.55 }} />}
                      {n2 > 0 && <div className="h-full" style={{ width: `${pctOf(n2)}%`, background: color, opacity: 0.25 }} />}
                    </div>
                  ) : (
                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${c.percentage}%`, background: color }} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
