import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor } from '../utils/partyColors'
import { useTerritoryView } from '../utils/territoryDetail'
import { isPlmCity } from '../utils/deptInsight'
import { usePanelTabs, type PanelTabId } from '../utils/panelTabs'
import { CandidateRows } from './results/CandidateRows'
import { Participation } from './results/Participation'
import { Notice } from './results/Notice'
import { DecidedAtR1Notice } from './results/DecidedAtR1Notice'
import { Headline } from './results/Headline'
import { PanelTabs } from './results/PanelTabs'
import { TOP_CITIES } from '../utils/topCities'
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

export function ResultsPanel({ electionData, communeData, communeDataMissing, communeChoro, circoData, circoChoro, granularity, palette }: Props) {
  const { hoveredCommune, clickedCommune, setGranularity, selectTerritory, setFlyTarget, settleDept } = useElectionStore()

  const activeCode = clickedCommune ?? hoveredCommune
  const {
    commune, isOverseasFallback, isRoundFallback,
    nationalPct, isDeptSelection, parentDept, turnoutPct, blankPct, nullPct,
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

  const jumpToCity = (city: (typeof TOP_CITIES)[number]) => {
    if (granularity !== 'commune') setGranularity('commune')
    selectTerritory(city.inseeCode)
    setFlyTarget({ lng: city.lng, lat: city.lat, zoom: city.zoom })
  }

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

    // Fast lookups for the city list's leader dots.
    const fullCityMap = new Map(communeData?.communes.map((c) => [c.inseeCode, c]))
    const choroCityMap = new Map(communeChoro?.communes.map((c) => [c.inseeCode, c.leadingCandidate]))
    const choroParty = new Map(communeChoro?.candidates.map((c) => [c.name, c.party]))

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
            <p className="px-4 pt-3 pb-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{hint}</p>
          </>
        )}

        {activeTab === 'territories' && (
          <div className="px-3 pt-3 pb-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-1">
              30 plus grandes villes
            </p>
            {TOP_CITIES.map((city, i) => {
              // 1st and 2nd colors for this city (full data when loaded, else the choropleth leader)
              const full = fullCityMap.get(city.inseeCode)
              let dot1: string | null = null
              let dot2: string | null = null
              if (full && !full.annulled) {
                const sorted = [...full.candidates].sort((a, b) => b.votes - a.votes)
                if (sorted[0]) dot1 = getCandidateColor(sorted[0].name, 0, sorted[0].party, palette)
                if (sorted[1]) dot2 = getCandidateColor(sorted[1].name, 0, sorted[1].party, palette)
              } else {
                const leader = choroCityMap.get(city.inseeCode)
                if (leader) dot1 = getCandidateColor(leader, 0, choroParty.get(leader), palette)
              }

              return (
                <button
                  key={city.inseeCode}
                  className="w-full flex items-center gap-2 px-2 py-1 text-left rounded hover:bg-blue-50 dark:hover:bg-slate-800/60 transition-colors group"
                  onClick={() => jumpToCity(city)}
                >
                  <span className="w-5 text-right text-xs text-gray-300 dark:text-gray-600 shrink-0">{i + 1}</span>
                  <span className="flex items-center gap-0.5 shrink-0">
                    <span className="w-2 h-2 rounded-full" style={{ background: dot1 ?? '#e2e8f0' }} />
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: dot2 ?? '#e2e8f0', opacity: dot2 ? 0.45 : 0.2 }}
                    />
                  </span>
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-700 truncate">
                    {city.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {city.population >= 1_000_000
                      ? `${(city.population / 1_000_000).toFixed(1)}M`
                      : `${Math.round(city.population / 1000)}k`}
                  </span>
                </button>
              )
            })}
          </div>
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
          {/* Round fallback notice: no full commune file for this round */}
          {isRoundFallback && (
            <Notice density="compact">
              Les données par commune n'ont pas été rendues disponibles par le ministère de
              l'Intérieur pour ce tour. Résultats affichés au niveau du département.
            </Notice>
          )}

          {/* Overseas fallback notice */}
          {isOverseasFallback && (
            <Notice density="compact">
              Les données par commune pour les départements et territoires d'outre-mer n'ont pas été
              rendues disponibles par le ministère de l'Intérieur. Résultats affichés au niveau du département.
            </Notice>
          )}

          {/* Round-1-decided: the T2 figures below are actually the T1 ones */}
          {commune.decidedAtR1 && (
            <DecidedAtR1Notice density="compact" granularity={granularity} code={commune.inseeCode} />
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
              L'ensemble des suffrages de cette commune a été annulé par le Conseil
              constitutionnel (irrégularités constatées lors du scrutin). Aucun suffrage exprimé.
            </Notice>
          )}

          {/* Tier 2 — the full field */}
          {!commune.annulled && (
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Candidats
              </p>
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
    </PanelShell>
  )
}
