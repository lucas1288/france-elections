import { useMemo } from 'react'
import { useElectionIndex } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import type { ElectionRef, ElectionType } from '../types/election'

const TYPE_LABELS_PLURAL: Record<string, string> = {
  presidential: 'Présidentielles',
  legislative: 'Législatives',
  european: 'Européennes',
}

const NEUTRAL_DOT = '#cbd5e1'

interface Props {
  /** Opens the full ElectionPicker (the "browse the whole history" jump list). */
  onOpenPicker?: () => void
  /** Positioning + card chrome are the caller's: desktop passes a floating
   *  card, mobile passes plain full-width (it lives inside the header). */
  className?: string
}

/**
 * Timeline scrubber (two-axis P4): election stops on a horizontal time lane,
 * one lane per election TYPE (tabs switch — présidentielles and législatives
 * never mix on one line). Each stop is a dot coloured by the national winner
 * (manifest `winner`), positioned proportionally by year; the current election
 * is enlarged + ringed. Tapping a stop moves along the time axis IN PLACE: the
 * map recolors, the settled territory survives (store semantics), and the
 * round is preserved when the target election has it. T1/T2 ride as sub-stop
 * pills in the strip header.
 *
 * Future (pre-2010 ingestions): render the 2010 circo-redistricting break as a
 * dashed rupture in the lane when a circo is settled — all current elections
 * are post-2010, so there is nothing to draw yet.
 */
export function TimelineStrip({ onOpenPicker, className }: Props) {
  const { data: index } = useElectionIndex()
  const selected = useElectionStore((s) => s.selected)
  const setSelected = useElectionStore((s) => s.setSelected)

  const elections = useMemo(() => index?.elections ?? [], [index])
  const types = useMemo(() => [...new Set(elections.map((e) => e.type))], [elections])
  const lane = useMemo(
    () =>
      elections
        .filter((e) => e.type === selected.type)
        .sort((a, b) => a.year - b.year),
    [elections, selected.type],
  )

  if (!elections.length || !lane.length) return null

  const current = lane.find((e) => e.year === selected.year)
  const rounds = current?.rounds ?? 0

  // Year → % position along the lane (padded; single stop sits centred).
  const minY = lane[0].year
  const maxY = lane[lane.length - 1].year
  const PAD = 10
  const x = (year: number) =>
    maxY === minY ? 50 : PAD + ((year - minY) / (maxY - minY)) * (100 - 2 * PAD)

  const pickStop = (e: ElectionRef) =>
    setSelected({ type: e.type, year: e.year, round: Math.min(selected.round, e.rounds) })

  // Switching lanes jumps to the temporally nearest election of that type
  // (tie → the more recent one), keeping the round when it exists there.
  const switchType = (t: ElectionType) => {
    if (t === selected.type) return
    const candidates = elections.filter((e) => e.type === t)
    if (!candidates.length) return
    const nearest = candidates.reduce((best, e) => {
      const d = Math.abs(e.year - selected.year)
      const bd = Math.abs(best.year - selected.year)
      return d < bd || (d === bd && e.year > best.year) ? e : best
    })
    pickStop(nearest)
  }

  return (
    <div className={className}>
      {/* Head: type tabs (lane switch) · round pills · full-picker affordance */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {types.map((t) => {
            const active = t === selected.type
            return (
              <button
                key={t}
                type="button"
                onClick={() => switchType(t)}
                className={`truncate text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  active
                    ? 'text-gray-800 dark:text-gray-200'
                    : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                }`}
              >
                {TYPE_LABELS_PLURAL[t] ?? t}
              </button>
            )
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {rounds > 1 &&
            Array.from({ length: rounds }, (_, i) => i + 1).map((r) => {
              const active = selected.round === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelected({ ...selected, round: r })}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-500 ring-1 ring-inset ring-gray-200 dark:text-gray-400 dark:ring-slate-700'
                  }`}
                >
                  T{r}
                </button>
              )
            })}
          {onOpenPicker && (
            <button
              type="button"
              aria-label="Toutes les élections"
              onClick={onOpenPicker}
              className="ml-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-slate-800 dark:hover:text-gray-300"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Lane: line + winner-coloured stops with year labels */}
      <div className="relative mt-1 h-10">
        <div className="absolute left-2 right-2 top-[9px] h-0.5 rounded bg-gray-200 dark:bg-slate-700" />
        {lane.map((e) => {
          const isCurrent = e.year === selected.year
          return (
            <button
              key={e.year}
              type="button"
              onClick={() => pickStop(e)}
              title={`${e.label}${e.winner ? ` — ${e.winner.name}` : ''}`}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center gap-0.5"
              style={{ left: `${x(e.year)}%` }}
            >
              <span
                className={`rounded-full border-2 border-white shadow dark:border-slate-900 ${
                  isCurrent
                    ? 'h-5 w-5 ring-2 ring-blue-500'
                    : 'mt-[3px] h-3.5 w-3.5 ring-1 ring-black/10 dark:ring-white/20'
                }`}
                style={{ background: e.winner?.color ?? NEUTRAL_DOT }}
              />
              <span
                className={`text-[10px] leading-none ${
                  isCurrent
                    ? 'font-bold text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {e.year}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
