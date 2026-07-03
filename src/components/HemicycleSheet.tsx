import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import type { Palette, RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { useElectionStore } from '../store/electionStore'

interface Props {
  circoData: RoundData | null
  palette: Palette | null
  electionLabel?: string
  round?: number
}

interface SeatRow {
  party: string
  label: string
  seats: number
}

function roundLabel(round: number | undefined) {
  if (round === 1) return '1er tour'
  if (round === 2) return '2nd tour'
  return round ? `${round}e tour` : ''
}

function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}
function seatsLabel(n: number) {
  return `${fmtInt(n)} ${n > 1 ? 'sièges' : 'siège'}`
}

/**
 * Hemicycle "Répartition des sièges" sheet — the seat-based twin of AffichageSheet
 * (commune/circo use national vote %; the Assemblée view counts seats). A bottom
 * snippet card lists the top 3 forces by seat count; a chip / "Détails" opens the
 * full sheet with every force (+ unattributed seats in round 1). Seats come from
 * the elected MP's nuance in the full circo data (one seat per circo). Rows are
 * informational (no map recolor — the hemicycle isn't a choropleth).
 */
export function HemicycleSheet({ circoData, palette, electionLabel, round }: Props) {
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const [open, setOpen] = useState(false)

  const data = useMemo(() => {
    if (!circoData) return null
    const counts = new Map<string, number>()
    let attributed = 0
    for (const circo of circoData.communes) {
      const winner = circo.candidates.find((c) => c.elected)
      if (!winner) continue
      counts.set(winner.party, (counts.get(winner.party) ?? 0) + 1)
      attributed++
    }
    const rows: SeatRow[] = [...counts.entries()]
      .map(([party, seats]) => ({ party, seats, label: palette?.parties?.[party]?.label ?? party }))
      .sort((a, b) => b.seats - a.seats)
    return { rows, attributed, total: circoData.communes.length }
  }, [circoData, palette])

  // The detail sheet is open (selected seat) → hide the snippet so they don't stack.
  if (!data || !data.rows.length || clickedCommune) return null

  const { rows, attributed, total } = data
  const unattributed = total - attributed
  const topThree = rows.slice(0, 3)
  const title = [electionLabel, roundLabel(round)].filter(Boolean).join(' — ')
  const majorityLine =
    round === 1
      ? `${fmtInt(attributed)} / ${fmtInt(total)} sièges attribués`
      : `${fmtInt(total)} sièges — majorité absolue : ${Math.floor(total / 2) + 1}`

  return (
    <>
      {/* Snippet card — top 3 forces by seats, same footprint as the national snippet. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir la répartition des sièges"
        className="absolute inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white/95 dark:bg-slate-900/95 px-4 py-3 text-left shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-sm"
      >
        {title && <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>}

        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Répartition des sièges
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{majorityLine}</p>

        <div className="mt-2.5 space-y-2">
          {topThree.map((r, i) => {
            const color = getCandidateColor(r.label, i, r.party, palette)
            return (
              <div key={r.party}>
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{r.label}</span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{r.party}</span>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {seatsLabel(r.seats)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${(r.seats / total) * 100}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-2.5 flex items-center justify-end gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
          <span>Détails</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </button>

      {/* Chip — bottom-left, same slot as the AffichageSheet palette chip. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Répartition des sièges"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 dark:bg-slate-900/90 text-gray-600 dark:text-gray-300 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10"
      >
        <SeatIcon />
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-40 flex max-h-[82%] flex-col rounded-t-2xl bg-white dark:bg-slate-900 shadow-[0_-4px_24px_rgba(0,0,0,0.16)] outline-none"
            aria-describedby={undefined}
          >
            <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-gray-300 dark:bg-slate-600" />

            <div className="flex items-center px-4 pb-1 pt-1">
              <Drawer.Title className="text-base font-bold text-gray-900 dark:text-gray-100">Répartition des sièges</Drawer.Title>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-full p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mt-1 border-t border-gray-100 dark:border-slate-800 px-4 pt-2.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {majorityLine}
            </p>

            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {rows.map((r, i) => {
                const color = getCandidateColor(r.label, i, r.party, palette)
                return (
                  <div key={r.party} className="w-full rounded-lg px-2 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{r.label}</span>
                      <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{r.party}</span>
                      <span className="w-20 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {seatsLabel(r.seats)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${(r.seats / total) * 100}%`, background: color }} />
                    </div>
                  </div>
                )
              })}

              {unattributed > 0 && (
                <div className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-gray-100 dark:border-slate-800 px-2 py-2.5 pt-3">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-slate-300" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500 dark:text-gray-400">Sièges non attribués</span>
                  <span className="w-20 shrink-0 text-right text-sm font-semibold text-gray-500 dark:text-gray-400">
                    {seatsLabel(unattributed)}
                  </span>
                </div>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

function SeatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 18v-6a2 2 0 012-2h12a2 2 0 012 2v6" />
      <path d="M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3" />
      <path d="M4 18h16" />
    </svg>
  )
}
