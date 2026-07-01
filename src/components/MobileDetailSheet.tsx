import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { useElectionStore } from '../store/electionStore'
import type { RoundData, Palette } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { resolveTerritory, makeNationalPctLookup } from '../utils/territoryDetail'

interface Props {
  electionData: RoundData | undefined
  communeData: RoundData | null
  circoData: RoundData | null
  palette: Palette | null
}

// Peek (header + participation glanceable) → expanded (full candidate list).
// Fractions of the viewport; the higher one matches the Content's h-[92%].
const PEEK = 0.5
const SNAP_POINTS = [PEEK, 0.92]

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * Mobile detail sheet (Phase 2). A non-modal vaul bottom sheet that rises when a
 * territory (or hemicycle seat) is selected — the touch equivalent of the
 * desktop sidebar's active view. Shares selection resolution + national baseline
 * with ResultsPanel via utils/territoryDetail.
 */
export function MobileDetailSheet({ electionData, communeData, circoData, palette }: Props) {
  const granularity = useElectionStore((s) => s.granularity)
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)

  const nationalPct = useMemo(() => makeNationalPctLookup(electionData), [electionData])
  const { commune, isOverseasFallback } = resolveTerritory(clickedCommune, granularity, {
    electionData,
    communeData,
    circoData,
  })

  const open = !!clickedCommune
  const close = () => setClickedCommune(null)

  // Each time a different territory is selected, start at the peek snap. Uses
  // React's "adjust state during render" pattern (prev-value in state, not a ref
  // or effect) to satisfy the react-hooks lint rules (see P2/P6 notes).
  const [snap, setSnap] = useState<number | string | null>(PEEK)
  const [prevKey, setPrevKey] = useState<string | null>(clickedCommune)
  if (clickedCommune !== prevKey) {
    setPrevKey(clickedCommune)
    if (clickedCommune) setSnap(PEEK)
  }

  const turnoutPct = commune ? (commune.turnout / commune.registeredVoters) * 100 : 0
  const blankPct = commune ? (commune.blankVotes / commune.registeredVoters) * 100 : 0
  const nullPct = commune ? (commune.nullVotes / commune.registeredVoters) * 100 : 0

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(o) => { if (!o) close() }}
      modal={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          className="fixed inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.16)] outline-none"
          aria-describedby={undefined}
        >
          <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-gray-300" />

          {!commune ? (
            <div className="px-4 pb-8 pt-2">
              <Drawer.Title className="text-base font-bold text-gray-900">Chargement…</Drawer.Title>
              <p className="mt-1 text-sm text-gray-400">Chargement des données…</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">
              {/* Header */}
              <div className="flex items-start gap-2 px-4 pt-1">
                <div className="min-w-0 flex-1">
                  <Drawer.Title className="truncate text-lg font-bold text-gray-900">
                    {commune.name}
                  </Drawer.Title>
                  <p className="text-xs text-gray-500">INSEE {commune.inseeCode}</p>
                </div>
                <button
                  type="button"
                  aria-label="Fermer"
                  onClick={close}
                  className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {isOverseasFallback && (
                <div className="mx-4 mt-3 rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-xs leading-relaxed text-amber-700">
                    Données par commune indisponibles pour l'outre-mer (ministère de l'Intérieur).
                    Résultats affichés au niveau du département.
                  </p>
                </div>
              )}

              {/* Participation */}
              <div className="mt-3 border-y border-gray-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Participation</p>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">{fmt(turnoutPct)}%</span>
                  <span className="text-xs text-gray-500">
                    ({fmtInt(commune.turnout)} / {fmtInt(commune.registeredVoters)} inscrits)
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100">
                  <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${turnoutPct}%` }} />
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Blancs&nbsp;: {fmt(blankPct)}% — Nuls&nbsp;: {fmt(nullPct)}%
                </p>
              </div>

              {/* Candidates */}
              <div className="space-y-3 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Candidats</p>
                {commune.candidates
                  .slice()
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((cand, i) => {
                    const color = getCandidateColor(cand.name, i, cand.party, palette)
                    const natPct = nationalPct?.(cand.name, cand.party) ?? null
                    return (
                      <div key={cand.name}>
                        <div className="mb-0.5 flex items-center justify-between">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                            <span className="truncate text-sm text-gray-800">{cand.name}</span>
                          </div>
                          <span className="ml-2 shrink-0 text-sm font-semibold text-gray-900">
                            {fmt(cand.percentage)}%
                          </span>
                        </div>
                        {/* Local score bar */}
                        <div className="h-1.5 w-full rounded-full bg-gray-100">
                          <div className="h-full rounded-full" style={{ width: `${cand.percentage}%`, background: color }} />
                        </div>
                        {/* National reminder bar */}
                        {natPct != null && (
                          <div className="mt-0.5 h-1 w-full rounded-full bg-gray-50">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.min(natPct, 100)}%`, background: color, opacity: 0.35 }}
                            />
                          </div>
                        )}
                        <p className="mt-0.5 text-xs text-gray-400">
                          {fmtInt(cand.votes)} voix
                          {natPct != null && <span className="text-gray-300"> · national {fmt(natPct)}%</span>}
                        </p>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
