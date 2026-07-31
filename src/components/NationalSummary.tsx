import { useState } from 'react'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useNationalSummary, type NationalViewMode } from '../utils/nationalSummary'
import { useElectionStore } from '../store/electionStore'
import { ForceRows } from './results/ForceRows'
import { ViewModeSwitch } from './results/ViewModeSwitch'

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
  // '%' = national vote share; 'circos' = seats won / arrived 1st / arrived 2nd
  // across circonscriptions (same switch as the mobile national sheet).
  const [viewMode, setViewMode] = useState<NationalViewMode>('pct')
  const colorMode = useElectionStore((s) => s.colorMode)
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)

  const model = useNationalSummary(electionData, circoChoro, circoData)
  if (!model) return null

  const { totals: t, turnoutPct, abstentionPct } = model
  const activeParty = colorMode.kind === 'party' ? colorMode.party : null
  const abstentionActive = colorMode.kind === 'abstention'

  return (
    <div className="border-b border-gray-100 dark:border-slate-800">
      {/* No section heading / collapse toggle any more: since the panel gained
          tabs, the header already names the subject ("France entière") and the
          active tab already says "Résultats" — a third "Résultats nationaux"
          label plus a collapse control was pure chrome. */}
      <div className="px-2 pt-3 pb-3 space-y-1">
        <p className="px-2 pb-1 text-xs leading-relaxed text-gray-400 dark:text-gray-500">
          Cliquez sur la participation, un candidat ou un parti/alliance pour voir le détail de ses
          résultats sur la carte.
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
              <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Participation
              </p>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 leading-tight">
                {fmtPct(turnoutPct)}%
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Abstention
              </p>
              <p className="text-lg font-bold text-gray-500 dark:text-gray-400 leading-tight">
                {fmtPct(abstentionPct)}%
              </p>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 self-end ml-auto">
              {fmtInt(t.registeredVoters)} inscrits
            </p>
          </div>
        </button>

        {/* View switch: national vote share vs circo counts (seats won /
              arrived 1st / arrived 2nd). Only when circo data is available. */}
        {model.circoCounts && (
          <ViewModeSwitch model={model} mode={viewMode} onChange={setViewMode} density="compact" />
        )}

        {/* Ranked vote share — each row is a map control (single-force view) */}
        <div className="space-y-0.5">
          <ForceRows
            model={model}
            mode={viewMode}
            palette={palette}
            density="compact"
            activeParty={activeParty}
            onPick={togglePartyMode}
          />
        </div>
      </div>
    </div>
  )
}
