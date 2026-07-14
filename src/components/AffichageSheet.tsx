import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor } from '../utils/partyColors'
import { computeNationalTotals } from '../utils/nationalResults'
import { computeCircoCounts } from '../utils/circoCounts'
import { useElectionStore } from '../store/electionStore'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
  electionLabel?: string
  round?: number
  /** Circo choropleth + full data — feed the per-force 1st/2nd circo counts
   *  shown in the sheet when the circonscriptions tab is active. */
  circoChoro?: ChoroplethData | null
  circoData?: RoundData | null
}

function roundLabel(round: number | undefined) {
  if (round === 1) return '1er tour'
  if (round === 2) return '2nd tour'
  return round ? `${round}e tour` : ''
}

function fmtPct(n: number) {
  return n.toFixed(1).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

const ABSTENTION_GRADIENT = 'linear-gradient(90deg, #e5e7eb, #111827)'

/**
 * Mobile "Résultats nationaux" sheet. A bottom-left chip opens a sheet listing
 * the national vote share (candidates for presidentials, nuances/alliances for
 * legislatives) + abstention. Every row is a map control: tapping one colours
 * the choropleth by that force's score-vs-national ratio (or the abstention
 * ramp) and closes the sheet so the map is visible; tapping the active row again
 * returns to the default winner view. Replaces the old Vainqueur/Un parti/
 * Abstention segment — the mode is implied by which result you tap.
 */
export function AffichageSheet({ electionData, palette, electionLabel, round, circoChoro, circoData }: Props) {
  const colorMode = useElectionStore((s) => s.colorMode)
  // '%' = national vote share; 'circos' = seats won / arrived 1st / arrived 2nd
  // across circonscriptions (a switch in the sheet toggles the two).
  const [viewMode, setViewMode] = useState<'pct' | 'circos'>('pct')
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const zoomedAway = useElectionStore((s) => s.zoomedAway)
  const [open, setOpen] = useState(false)

  const totals = useMemo(
    () => (electionData ? computeNationalTotals(electionData) : null),
    [electionData],
  )

  // Per-force won/1st/2nd circo counts — feeds the "Sièges"/"Circos" view of the
  // sheet (any tab; the full circo file is small and always loaded).
  const circoCounts = useMemo(
    () => (circoChoro && circoData ? computeCircoCounts(circoChoro, circoData) : null),
    [circoChoro, circoData],
  )
  // "En tête (pas encore gagné)" bucket exists only when some lead isn't a win
  // (round 1 of legislatives; always for presidentials). At T2 every lead IS the
  // seat winner, so the bucket would be 0 for everyone — hide it.
  const showLeadBucket =
    !!circoCounts &&
    [...circoCounts.counts1st].some(([name, n]) => n > (circoCounts.countsWon.get(name) ?? 0))
  const hasSeats = !!circoCounts && circoCounts.countsWon.size > 0

  if (!electionData || !totals || !totals.registeredVoters) return null

  const activeParty = colorMode.kind === 'party' ? colorMode.party : null
  const abstentionActive = colorMode.kind === 'abstention'

  const turnoutPct = (totals.turnout / totals.registeredVoters) * 100
  const blankPct = (totals.blankVotes / totals.registeredVoters) * 100
  const nullPct = (totals.nullVotes / totals.registeredVoters) * 100

  // Chip swatch mirrors the active map view.
  const activeName = electionData.candidates.find((c) => c.party === activeParty)?.name ?? ''
  const chipColor =
    colorMode.kind === 'party'
      ? getCandidateColor(activeName, electionData.candidates.findIndex((c) => c.party === activeParty), activeParty ?? '', palette)
      : null

  const pickParty = (party: string) => { togglePartyMode(party); setOpen(false) }
  const pickAbstention = () => { toggleAbstentionMode(); setOpen(false) }

  // National snippet — shown only in the unzoomed overview (no selection, no
  // focused territory, and not zoomed in by any amount), so it disappears the
  // moment the user zooms in and returns when back to the overview.
  const showSnippet = !clickedCommune && !focusedTerritory && !zoomedAway
  const topThree = totals.candidates.slice(0, 3)
  const title = [electionLabel, roundLabel(round)].filter(Boolean).join(' — ')

  return (
    <>
      {showSnippet && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Voir les résultats nationaux"
          className="absolute inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 rounded-2xl bg-white/95 dark:bg-slate-900/95 px-4 py-3 text-left shadow-lg ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-sm"
        >
          {title && <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>}

          {/* Participation — mirrors the full sheet's block (big %, inscrits, bar, Blancs/Nuls). */}
          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Participation</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtPct(turnoutPct)}%</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({fmtInt(totals.turnout)} / {fmtInt(totals.registeredVoters)} inscrits)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${turnoutPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Blancs&nbsp;: {fmtPct(blankPct)}% — Nuls&nbsp;: {fmtPct(nullPct)}%
            </p>
          </div>

          {/* Top 3 candidates/forces — same row layout + score bar as the full sheet. */}
          <div className="mt-3 space-y-2">
            {topThree.map((c, i) => {
              const color = getCandidateColor(c.name, i, c.party, palette)
              return (
                <div key={c.name}>
                  <div className="flex items-center gap-2.5">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{c.name}</span>
                    <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{c.party}</span>
                    <span className="w-12 shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {fmtPct(c.percentage)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                    <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, background: color }} />
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
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Résultats nationaux"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 dark:bg-slate-900/90 text-gray-600 dark:text-gray-300 shadow-lg backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10"
      >
        {abstentionActive ? (
          <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: ABSTENTION_GRADIENT }} />
        ) : chipColor ? (
          <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: chipColor }} />
        ) : (
          <PaletteIcon />
        )}
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
              <Drawer.Title className="text-base font-bold text-gray-900 dark:text-gray-100">Résultats nationaux</Drawer.Title>
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
              Cliquez sur la participation, un candidat ou un parti/alliance pour voir le détail de
              ses résultats sur la carte interactive.
            </p>

            <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              {/* Participation — same block as the local detail sheet; clicking it
                  drives the abstention map view (abstention = the inverse ramp). */}
              <button
                type="button"
                onClick={pickAbstention}
                className={`mb-1 w-full rounded-lg px-2 py-2.5 text-left transition-colors ${
                  abstentionActive ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-800' : 'active:bg-gray-100 dark:active:bg-slate-800'
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Participation</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmtPct(turnoutPct)}%</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({fmtInt(totals.turnout)} / {fmtInt(totals.registeredVoters)} inscrits)
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                  <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${turnoutPct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Blancs&nbsp;: {fmtPct(blankPct)}% — Nuls&nbsp;: {fmtPct(nullPct)}%
                </p>
              </button>

              {/* View switch: national vote share vs circo counts (seats won /
                  arrived 1st / arrived 2nd). Only when circo data is available. */}
              {circoCounts && (
                <div className="px-2 pb-1 pt-1.5">
                  <div className="flex w-full rounded-lg bg-gray-100 p-0.5 text-sm dark:bg-slate-800">
                    {([
                      ['pct', 'Pourcentages'],
                      ['circos', hasSeats ? 'Sièges' : 'Circonscriptions'],
                    ] as const).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`flex-1 rounded-md px-2 py-1.5 font-medium transition-colors ${
                          viewMode === mode ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {viewMode === 'circos' && (
                    <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
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

              {(viewMode === 'circos' && circoCounts
                ? [...totals.candidates].sort((a, b) => {
                    const k = (n: string) => {
                      const won = circoCounts.countsWon.get(n) ?? 0
                      const lead = (circoCounts.counts1st.get(n) ?? 0) - won
                      return won * 1e6 + lead * 1e3 + (circoCounts.counts2nd.get(n) ?? 0)
                    }
                    return k(b.name) - k(a.name)
                  })
                : totals.candidates
              ).map((c, i) => {
                const color = getCandidateColor(c.name, i, c.party, palette)
                const active = activeParty === c.party
                // Exclusive buckets: seats won are excluded from "en tête".
                const won = circoCounts?.countsWon.get(c.name) ?? 0
                const lead1st = Math.max(0, (circoCounts?.counts1st.get(c.name) ?? 0) - won)
                const n2 = circoCounts?.counts2nd.get(c.name) ?? 0
                const pctOf = (n: number) => (circoCounts ? (n / circoCounts.total) * 100 : 0)
                const showCircos = viewMode === 'circos' && !!circoCounts
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => pickParty(c.party)}
                    className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${
                      active ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-800' : 'active:bg-gray-100 dark:active:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">{c.name}</span>
                      <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{c.party}</span>
                      <span className="shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                      <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                        {won > 0 && <div className="h-full" style={{ width: `${pctOf(won)}%`, background: color }} />}
                        {lead1st > 0 && <div className="h-full" style={{ width: `${pctOf(lead1st)}%`, background: color, opacity: 0.55 }} />}
                        {n2 > 0 && <div className="h-full" style={{ width: `${pctOf(n2)}%`, background: color, opacity: 0.25 }} />}
                      </div>
                    ) : (
                      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                        <div className="h-full rounded-full" style={{ width: `${c.percentage}%`, background: color }} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2C6.5 2 2 6 2 11c0 4 3 7 7 7 1 0 2-1 2-2 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.3 0-1 .8-1.8 1.8-1.8H14c3.3 0 6-2.7 6-6 0-3.9-3.6-6.9-8-6.9z" />
    </svg>
  )
}
