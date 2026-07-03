import { useMemo } from 'react'
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

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * Mobile detail sheet. A plain fixed bottom panel (NOT vaul) that slides up when
 * a territory (or hemicycle seat) is selected — the touch equivalent of the
 * desktop sidebar's active view. Plain-panel on purpose: vaul's snap mode locked
 * `body { pointer-events: none }` even when non-modal, which froze the map + the
 * back button + all chrome while open. A plain panel keeps the background fully
 * interactive (tap the map to reselect, tap the back button to zoom out). Shares
 * selection resolution + national baseline with ResultsPanel via territoryDetail.
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

  const turnoutPct = commune ? (commune.turnout / commune.registeredVoters) * 100 : 0
  const blankPct = commune ? (commune.blankVotes / commune.registeredVoters) * 100 : 0
  const nullPct = commune ? (commune.nullVotes / commune.registeredVoters) * 100 : 0

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex max-h-[72%] flex-col rounded-t-2xl bg-white dark:bg-slate-900 shadow-[0_-4px_24px_rgba(0,0,0,0.16)] transition-transform duration-300 ${
        open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
      aria-hidden={!open}
    >
      {!commune ? (
        <div className="px-4 pb-8 pt-5">
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">Chargement…</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">Chargement des données…</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          {/* Header */}
          <div className="flex items-start gap-2 px-4 pt-4">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">{commune.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">INSEE {commune.inseeCode}</p>
            </div>
            <button
              type="button"
              aria-label="Fermer"
              onClick={close}
              className="shrink-0 rounded-full p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {isOverseasFallback && (
            <div className="mx-4 mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 px-3 py-2">
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                Données par commune indisponibles pour l'outre-mer (ministère de l'Intérieur).
                Résultats affichés au niveau du département.
              </p>
            </div>
          )}

          {/* Participation */}
          <div className="mt-3 border-y border-gray-100 dark:border-slate-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Participation</p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{fmt(turnoutPct)}%</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({fmtInt(commune.turnout)} / {fmtInt(commune.registeredVoters)} inscrits)
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
              <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${turnoutPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Blancs&nbsp;: {fmt(blankPct)}% — Nuls&nbsp;: {fmt(nullPct)}%
            </p>
          </div>

          {/* Candidates */}
          <div className="space-y-3 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Candidats</p>
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
                        <span className="truncate text-sm text-gray-800 dark:text-gray-200">{cand.name}</span>
                      </div>
                      <span className="ml-2 shrink-0 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {fmt(cand.percentage)}%
                      </span>
                    </div>
                    {/* Local score bar */}
                    <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                      <div className="h-full rounded-full" style={{ width: `${cand.percentage}%`, background: color }} />
                    </div>
                    {/* National reminder bar */}
                    {natPct != null && (
                      <div className="mt-0.5 h-1 w-full rounded-full bg-gray-50 dark:bg-slate-800/60">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(natPct, 100)}%`, background: color, opacity: 0.35 }}
                        />
                      </div>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      {fmtInt(cand.votes)} voix
                      {natPct != null && <span className="text-gray-300 dark:text-gray-600"> · national {fmt(natPct)}%</span>}
                    </p>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
