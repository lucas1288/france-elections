import type { Palette, RoundData } from '../../types/election'
import { useElectionStore } from '../../store/electionStore'
import {
  countSeatStates,
  seatCodeSet,
  seatStateColor,
  ELIMINATED_LIGHT,
  ELIMINATED_DARK,
  type SeatContext,
  type SeatState,
} from '../../utils/partySeats'
import type { RowDensity } from './ForceRows'

interface Props {
  /** Full per-circo data for the active round. Absent → nothing to count. */
  circoData: RoundData | null | undefined
  palette: Palette | null
  density: RowDensity
}

/**
 * The key for the SEAT view of party mode (C1) — one row per state, with the
 * number of circonscriptions in it.
 *
 * The counts are the point, not decoration: the map shows a pattern, and
 * without figures the reader can see that a force won "a lot" of seats without
 * being able to say how many. Le Monde's legend does the same, and it is the
 * reference lucas gave.
 *
 * Renders only where the seat view is actually active — party mode, on the
 * circonscriptions tab, of a legislative election. That test is duplicated from
 * FranceMap's `seatContext` on purpose: the two answer for different surfaces
 * and neither should render a key for a view the other isn't showing.
 */
export function SeatLegend({ circoData, palette, density }: Props) {
  const colorMode = useElectionStore((s) => s.colorMode)
  const granularity = useElectionStore((s) => s.granularity)
  const selected = useElectionStore((s) => s.selected)
  const isDark = useElectionStore((s) => s.isDark)

  if (
    colorMode.kind !== 'party' ||
    granularity !== 'circonscription' ||
    selected.type !== 'legislative' ||
    !circoData
  ) {
    return null
  }

  const ctx: SeatContext = {
    round: selected.round,
    eliminated: isDark ? ELIMINATED_DARK : ELIMINATED_LIGHT,
    absent: isDark ? '#334155' : '#e2e8f0',
  }
  // Nuance only — seats are official counts, not alliance sums (see seatCodeSet).
  const codes = seatCodeSet(colorMode.party)
  const base = palette?.parties?.[colorMode.party]?.color ?? '#94a3b8'
  const label = palette?.parties?.[colorMode.party]?.label ?? colorMode.party
  const counts = countSeatStates(circoData.communes, codes, ctx.round)

  // At round 2 nobody is "qualifié" — the runoff is what's being shown. The row
  // is dropped rather than shown as zero so the key matches the map exactly.
  const rows: Array<{ state: SeatState; text: string }> = [
    { state: 'elected', text: 'élu' },
    ...(ctx.round === 1
      ? [{ state: 'qualified' as SeatState, text: 'qualifié pour le 2nd tour' }]
      : []),
    { state: 'eliminated', text: ctx.round === 1 ? 'éliminé' : 'éliminé au 2nd tour' },
    { state: 'absent', text: 'pas de candidat' },
  ]

  const touch = density === 'touch'
  return (
    <div className={`px-2 ${touch ? 'pt-2 pb-1' : 'pt-1.5 pb-0.5'}`}>
      <p className="pb-1 text-xs text-gray-400 dark:text-gray-500">
        Circonscriptions — <span className="font-medium">{label}</span>
      </p>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li
            key={r.state}
            className={`flex items-center gap-2 ${touch ? 'text-sm' : 'text-xs'} text-gray-600 dark:text-gray-300`}
          >
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-black/10 dark:ring-white/10"
              style={{ background: seatStateColor(r.state, base, ctx) }}
            />
            <span className="flex-1">{r.text}</span>
            <span className="tabular-nums font-medium text-gray-700 dark:text-gray-200">
              {counts[r.state]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
