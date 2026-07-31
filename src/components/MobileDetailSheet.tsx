import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import { usePanelTabs, type PanelTabId } from '../utils/panelTabs'
import { PanelTabs } from './results/PanelTabs'
import { Headline } from './results/Headline'
import { DeptHistory } from './DeptHistory'
import type { RoundData, Palette } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useTerritoryView } from '../utils/territoryDetail'
import { isPlmCity } from '../utils/deptInsight'
import { DeptInsight } from './DeptInsight'
import { ArrondissementBreakdown } from './ArrondissementBreakdown'
import { CandidateRows } from './results/CandidateRows'
import { Participation } from './results/Participation'
import { Notice } from './results/Notice'
import { DecidedAtR1Notice } from './results/DecidedAtR1Notice'

interface Props {
  electionData: RoundData | undefined
  communeData: RoundData | null
  communeDataMissing: boolean
  communeChoro: ChoroplethData | null
  circoData: RoundData | null
  circoChoro: ChoroplethData | null
  palette: Palette | null
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
export function MobileDetailSheet({ electionData, communeData, communeDataMissing, communeChoro, circoData, circoChoro, palette }: Props) {
  const granularity = useElectionStore((s) => s.granularity)
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const settleDept = useElectionStore((s) => s.settleDept)

  const {
    commune, isOverseasFallback, isRoundFallback,
    nationalPct, isDeptSelection, parentDept, turnoutPct, blankPct, nullPct,
  } = useTerritoryView(clickedCommune, clickedCommune, granularity, {
    electionData,
    communeData,
    circoData,
    communeDataMissing,
  })

  // Tabs (redesign R2) — same model and order as the desktop sidebar.
  const tabs = usePanelTabs({
    scope: 'territory',
    code: commune?.inseeCode ?? null,
    isDeptSelection,
  })
  const [tab, setTab] = useState<PanelTabId>('results')
  const subject = commune?.inseeCode ?? ''
  const [prevSubject, setPrevSubject] = useState(subject)
  if (subject !== prevSubject) {
    setPrevSubject(subject)
    setTab('results')
  }
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'results'

  const open = !!clickedCommune
  const close = () => setClickedCommune(null)

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
              {parentDept && (
                <button
                  type="button"
                  className="mt-0.5 text-xs text-blue-600 dark:text-blue-400"
                  onClick={() => settleDept(parentDept.inseeCode)}
                >
                  ↑ {parentDept.name}
                </button>
              )}
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

          <div className="mt-2">
            <PanelTabs tabs={tabs} active={activeTab} onChange={setTab} density="touch" />
          </div>

          {activeTab === 'results' && (
            <>
              {isRoundFallback && (
                <Notice density="touch">
                  Données par commune indisponibles pour ce tour (ministère de l'Intérieur).
                  Résultats affichés au niveau du département.
                </Notice>
              )}

              {isOverseasFallback && (
                <Notice density="touch">
                  Données par commune indisponibles pour l'outre-mer (ministère de l'Intérieur).
                  Résultats affichés au niveau du département.
                </Notice>
              )}

              {/* Round-1-decided: the T2 figures below are actually the T1 ones */}
              {commune.decidedAtR1 && (
                <DecidedAtR1Notice density="touch" granularity={granularity} code={commune.inseeCode} />
              )}

              {/* Tier 1 — who won here, at a glance */}
              {!commune.annulled && <Headline commune={commune} palette={palette} density="touch" />}

              {/* Participation */}
              <div className="mt-3 border-y border-gray-100 dark:border-slate-800 px-4 py-3 space-y-1">
                <Participation
                  turnout={commune.turnout}
                  registeredVoters={commune.registeredVoters}
                  turnoutPct={turnoutPct}
                  blankPct={blankPct}
                  nullPct={nullPct}
                />
              </div>

              {/* Annulled ballots: no expressed votes to show */}
              {commune.annulled && (
                <Notice density="touch">
                  L'ensemble des suffrages de cette commune a été annulé par le Conseil
                  constitutionnel (irrégularités constatées lors du scrutin). Aucun suffrage exprimé.
                </Notice>
              )}

              {/* Tier 2 — the full field */}
              {!commune.annulled && (
                <div className="space-y-3 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Candidats</p>
                  <CandidateRows candidates={commune.candidates} palette={palette} nationalPct={nationalPct} />
                </div>
              )}
            </>
          )}

          {activeTab === 'territories' && (
            <>
              {/* PLM whole-city (Paris via city dot, Lyon, Marseille) */}
              {isPlmCity(commune.inseeCode) && (
                <ArrondissementBreakdown
                  cityCode={commune.inseeCode}
                  communeChoro={communeChoro}
                  communeData={communeData}
                  palette={palette}
                />
              )}

              {/* Département breakdown (two-axis P2) */}
              {isDeptSelection && (
                <DeptInsight
                  deptCode={commune.inseeCode}
                  circoChoro={circoChoro}
                  circoData={circoData}
                  communeChoro={communeChoro}
                  communeData={communeData}
                  palette={palette}
                />
              )}
            </>
          )}

          {activeTab === 'history' && <DeptHistory deptCode={commune.inseeCode} />}
        </div>
      )}
    </div>
  )
}
