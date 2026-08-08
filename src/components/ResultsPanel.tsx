import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useTerritoryView } from '../utils/territoryDetail'
import { isPlmCity } from '../utils/deptInsight'
import { usePanelTabs, type PanelTabId } from '../utils/panelTabs'
import { CandidateRows } from './results/CandidateRows'
import { Participation } from './results/Participation'
import { Notice } from './results/Notice'
import { DecidedAtR1Notice } from './results/DecidedAtR1Notice'
import { Headline } from './results/Headline'
import { PanelTabs } from './results/PanelTabs'
import { NationalSummary } from './NationalSummary'
import { DeptInsight } from './DeptInsight'
import { DeptHistory } from './DeptHistory'
import { ArrondissementBreakdown } from './ArrondissementBreakdown'

interface Props {
  electionData: RoundData | undefined
  communeData: RoundData | null
  communeDataMissing: boolean
  communeChoro: ChoroplethData | null
  circoData: RoundData | null
  circoChoro: ChoroplethData | null
  granularity: Granularity
  palette: Palette | null
}

/**
 * Common sidebar shell. The header names the panel's SUBJECT (the territory, or
 * "France entière" nationally) rather than carrying a standing "Résultats"
 * title — since the panel gained tabs, a "Résultats" heading directly above a
 * "Résultats" tab just said the same word twice.
 */
function PanelShell({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 overflow-y-auto">
      <div className="px-4 pt-4 pb-3">{header}</div>
      {children}
    </aside>
  )
}

export function ResultsPanel({
  electionData,
  communeData,
  communeDataMissing,
  communeChoro,
  circoData,
  circoChoro,
  granularity,
  palette,
}: Props) {
  const { hoveredCommune, clickedCommune, settleDept } = useElectionStore()

  const activeCode = clickedCommune ?? hoveredCommune
  const {
    commune,
    isOverseasFallback,
    isRoundFallback,
    nationalPct,
    isDeptSelection,
    isSameAsDept,
    parentDept,
    turnoutPct,
    blankPct,
    nullPct,
  } = useTerritoryView(activeCode, clickedCommune, granularity, {
    electionData,
    communeData,
    circoData,
    communeDataMissing,
  })

  // Tabs (redesign R2). Hooks must run before any early return, so the scope is
  // derived from whether a territory resolved rather than branching first.
  const scope = commune ? 'territory' : 'national'
  const tabs = usePanelTabs({ scope, code: commune?.inseeCode ?? null, isDeptSelection })
  const [tab, setTab] = useState<PanelTabId>('results')

  // Back to "Résultats" whenever the panel changes subject — landing on
  // "Territoires" for a newly picked territory would bury the actual result.
  const subject = `${scope}:${commune?.inseeCode ?? ''}`
  const [prevSubject, setPrevSubject] = useState(subject)
  if (subject !== prevSubject) {
    setPrevSubject(subject)
    setTab('results')
  }
  // The available tabs also shift as data loads; fall back rather than blanking.
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'results'

  // ── National (nothing selected) ─────────────────────────────────────────────
  if (!commune) {
    const hint =
      granularity === 'commune' && !communeData
        ? 'Chargement des données communales…'
        : granularity !== 'commune' && !circoData
          ? 'Chargement des données par circonscription…'
          : granularity === 'hemicycle'
            ? 'Cliquez sur un siège pour afficher les résultats de la circonscription'
            : granularity === 'circonscription'
              ? 'Survolez ou cliquez sur une circonscription pour afficher ses résultats'
              : 'Survolez ou cliquez sur une commune pour afficher ses résultats'

    return (
      <PanelShell
        header={
          <>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100">France entière</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Résultats nationaux</p>
          </>
        }
      >
        <PanelTabs tabs={tabs} active={activeTab} onChange={setTab} density="compact" />

        {activeTab === 'results' && (
          <>
            <NationalSummary
              electionData={electionData}
              palette={palette}
              circoChoro={circoChoro}
              circoData={circoData}
            />
            <p className="px-4 pt-3 pb-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
              {hint}
            </p>
          </>
        )}

        {activeTab === 'history' && <DeptHistory deptCode="FR" />}
      </PanelShell>
    )
  }

  // ── A territory is selected (or hovered) ────────────────────────────────────
  return (
    <PanelShell
      header={
        <>
          <p className="text-base font-bold text-gray-900 dark:text-gray-100">{commune.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">INSEE {commune.inseeCode}</p>
          {parentDept && (
            <button
              className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
              onClick={() => settleDept(parentDept.inseeCode)}
            >
              ↑ {parentDept.name}
            </button>
          )}
        </>
      }
    >
      <PanelTabs tabs={tabs} active={activeTab} onChange={setTab} density="compact" />

      {activeTab === 'results' && (
        <>
          {/* Round fallback notice: no full commune file for this round.
              Paris is the exception — it IS its département, so the figures
              below are its own and only the arrondissement level is missing. */}
          {isRoundFallback && !isSameAsDept && (
            <Notice density="compact">
              Les données par commune n'ont pas été rendues disponibles par le ministère de
              l'Intérieur pour ce tour. Résultats affichés au niveau du département.
            </Notice>
          )}
          {isRoundFallback && isSameAsDept && (
            <Notice density="compact">
              Paris étant à la fois commune et département, les résultats ci-dessous sont bien ceux
              de la commune. Le détail par arrondissement n'a pas été rendu disponible par le
              ministère de l'Intérieur pour ce tour.
            </Notice>
          )}

          {/* Overseas fallback notice */}
          {isOverseasFallback && (
            <Notice density="compact">
              Les données par commune pour les départements et territoires d'outre-mer n'ont pas été
              rendues disponibles par le ministère de l'Intérieur. Résultats affichés au niveau du
              département.
            </Notice>
          )}

          {/* Round-1-decided: the T2 figures below are actually the T1 ones */}
          {commune.decidedAtR1 && (
            <DecidedAtR1Notice
              density="compact"
              granularity={granularity}
              code={commune.inseeCode}
            />
          )}

          {/* Tier 1 — who won here, at a glance */}
          {!commune.annulled && <Headline commune={commune} palette={palette} density="compact" />}

          {/* Turnout */}
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 space-y-1">
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
            <Notice density="compact">
              L'ensemble des suffrages de cette commune a été annulé par le Conseil constitutionnel
              (irrégularités constatées lors du scrutin). Aucun suffrage exprimé.
            </Notice>
          )}

          {/* Tier 2 — the full field */}
          {!commune.annulled && (
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Candidats
              </p>
              <CandidateRows
                candidates={commune.candidates}
                palette={palette}
                nationalPct={nationalPct}
              />
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
    </PanelShell>
  )
}
