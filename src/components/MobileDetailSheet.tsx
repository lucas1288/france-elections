import { useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import { ABOVE_STRIP, HIDE_BELOW_STRIP } from '../utils/mobileChrome'
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
import { MobileSnippetCard } from './results/MobileSnippetCard'
import { getCandidateColor } from '../utils/partyColors'

function fmtPct(n: number) {
  return n.toFixed(1).replace('.', ',')
}

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
export function MobileDetailSheet({
  electionData,
  communeData,
  communeDataMissing,
  communeChoro,
  circoData,
  circoChoro,
  palette,
}: Props) {
  const granularity = useElectionStore((s) => s.granularity)
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const settleDept = useElectionStore((s) => s.settleDept)

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
  /**
   * M7 (Aug 6 2026, lucas): a selected territory shows a PREVIEW first — the
   * same snippet card the national view has always used — and the full sheet
   * only on "Détails". "The consequence is that the map still takes enough space
   * and is still more visible to the user."
   *
   * The full sheet covers ~72% of the screen, so selecting anything used to bury
   * the map right at the moment you'd want to look at where you are. The
   * national view already answered this (snippet → tap → sheet); this makes the
   * territory view behave the same way, which also means one card component
   * serves all three surfaces rather than a fourth layout appearing.
   */
  const [expanded, setExpanded] = useState(false)
  const subject = commune?.inseeCode ?? ''
  const [prevSubject, setPrevSubject] = useState(subject)
  if (subject !== prevSubject) {
    setPrevSubject(subject)
    setTab('results')
    // A new territory starts collapsed: picking one off the map is a navigation
    // step, not a request to read everything about it.
    setExpanded(false)
  }
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'results'

  const selected = !!clickedCommune
  const open = selected && expanded
  // Collapsing, NOT deselecting: the territory stays picked on the map, which is
  // what the preview is for. Clearing the selection outright is the search bar's
  // ✕ and the back chip, both of which are on screen in exactly this state.
  const close = () => setExpanded(false)

  // Top three, ordered and coloured exactly as `CandidateRows` does it below, so
  // the preview can't disagree with the sheet it opens.
  const topThree = (commune?.candidates ?? [])
    .slice()
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, 3)

  /** One compact line when the figures need a caveat before they're read. */
  const caveat = commune?.decidedAtR1
    ? 'Résultats du 1er tour — pas de second tour ici'
    : isRoundFallback && isSameAsDept
      ? 'Détail par arrondissement indisponible pour ce tour'
      : isRoundFallback || isOverseasFallback
        ? 'Données par commune indisponibles — résultats du département'
        : commune?.annulled
          ? 'Suffrages annulés par le Conseil constitutionnel'
          : null

  return (
    <>
      {selected && !expanded && (
        <MobileSnippetCard
          title={commune?.name ?? 'Chargement…'}
          ariaLabel={
            commune ? `Voir le détail des résultats — ${commune.name}` : 'Chargement des résultats'
          }
          onOpen={() => setExpanded(true)}
          meta={
            commune && (
              <>
                {caveat && (
                  <p className="mb-1 text-[11px] leading-tight text-amber-700 dark:text-amber-400">
                    {caveat}
                  </p>
                )}
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="text-gray-500 dark:text-gray-400">Participation</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {fmtPct(turnoutPct)}%
                  </span>
                  <span className="ml-auto truncate text-gray-400 dark:text-gray-500">
                    Blancs&nbsp;{fmtPct(blankPct)}% · Nuls&nbsp;{fmtPct(nullPct)}%
                  </span>
                </div>
                <div className="mt-1 h-1 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className="h-1 rounded-full bg-blue-500"
                    style={{ width: `${turnoutPct}%` }}
                  />
                </div>
              </>
            )
          }
          rows={topThree.map((c, i) => ({
            key: c.name,
            label: c.name,
            party: c.party,
            value: `${fmtPct(c.percentage)}%`,
            pct: c.percentage,
            color: getCandidateColor(c.name, i, c.party, palette),
          }))}
        />
      )}

      {/* The full sheet. Stays MOUNTED while collapsed (translated off-screen)
          so closing it slides down instead of vanishing under the card that
          replaces it. Stops ABOVE the pinned timeline strip (R3) rather than at
          the viewport floor, so the time axis stays usable while it's open — you
          can switch election/round and watch it update in place. */}
      <div
        style={{ bottom: ABOVE_STRIP, transform: open ? undefined : HIDE_BELOW_STRIP }}
        className={`fixed inset-x-2 z-40 flex max-h-[72%] flex-col rounded-2xl bg-white dark:bg-slate-900 shadow-[0_-4px_24px_rgba(0,0,0,0.16)] transition-transform duration-300 ${
          open ? '' : 'pointer-events-none'
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
                <h2 className="truncate text-lg font-bold text-gray-900 dark:text-gray-100">
                  {commune.name}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  INSEE {commune.inseeCode}
                </p>
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
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-2">
              <PanelTabs tabs={tabs} active={activeTab} onChange={setTab} density="touch" />
            </div>

            {activeTab === 'results' && (
              <>
                {isRoundFallback && isSameAsDept && (
                  <Notice density="touch">
                    Paris étant commune et département, ces résultats sont bien ceux de la commune.
                    Le détail par arrondissement est indisponible pour ce tour.
                  </Notice>
                )}
                {isRoundFallback && !isSameAsDept && (
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
                  <DecidedAtR1Notice
                    density="touch"
                    granularity={granularity}
                    code={commune.inseeCode}
                  />
                )}

                {/* Tier 1 — who won here, at a glance */}
                {!commune.annulled && (
                  <Headline commune={commune} palette={palette} density="touch" />
                )}

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
                    constitutionnel (irrégularités constatées lors du scrutin). Aucun suffrage
                    exprimé.
                  </Notice>
                )}

                {/* Tier 2 — the full field */}
                {!commune.annulled && (
                  <div className="space-y-3 px-4 py-3">
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
          </div>
        )}
      </div>
    </>
  )
}
