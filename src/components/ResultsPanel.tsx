import { useMemo } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor } from '../utils/partyColors'
import { resolveTerritory, makeNationalPctLookup } from '../utils/territoryDetail'
import { isDeptCode, parentDeptCode } from '../utils/deptInsight'
import { TOP_CITIES } from '../utils/topCities'
import { NationalSummary } from './NationalSummary'
import { DeptInsight } from './DeptInsight'
import { DeptHistory } from './DeptHistory'

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

/** Common sidebar shell: fixed width, "Résultats" header (with optional extra header content). */
function PanelShell({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) {
  return (
    <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-700 overflow-y-auto">
      <div className="p-4 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Résultats</h2>
        {header}
      </div>
      {children}
    </aside>
  )
}

/** Candidate line: color dot + truncated name on the left, custom value(s) on the right, bar below. */
function CandidateRow({ name, color, right, bar }: {
  name: string
  color: string
  right: React.ReactNode
  bar: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{name}</span>
        </div>
        <div className="flex items-center ml-2 shrink-0">{right}</div>
      </div>
      {bar}
    </div>
  )
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}

function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

export function ResultsPanel({ electionData, communeData, communeDataMissing, communeChoro, circoData, circoChoro, granularity, palette }: Props) {
  const { hoveredCommune, clickedCommune, setClickedCommune, setFlyTarget, settleDept } = useElectionStore()

  const nationalPct = useMemo(() => makeNationalPctLookup(electionData), [electionData])

  const activeCode = clickedCommune ?? hoveredCommune
  const { commune, isOverseasFallback, isRoundFallback } = resolveTerritory(activeCode, granularity, {
    electionData,
    communeData,
    circoData,
    communeDataMissing,
  })

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

    // ── Circo / hemicycle idle: national summary only — the per-circo won/1st/2nd
    // counts live in NationalSummary's Pourcentages/Sièges switch (July 2026,
    // shared with the mobile national sheet via computeCircoCounts).
    if (granularity !== 'commune') {
      return (
        <PanelShell>
          <NationalSummary
            electionData={electionData}
            palette={palette}
            circoChoro={circoChoro}
            circoData={circoData}
          />
          <DeptHistory deptCode="FR" />
          <p className="px-4 pt-3 pb-1 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{hint}</p>
        </PanelShell>
      )
    }

    // ── Dept / commune mode: city list ─────────────────────────────────────────
    // Build fast lookups for candidate colors per city
    const fullCityMap = new Map(communeData?.communes.map(c => [c.inseeCode, c]))
    const choroCityMap = new Map(communeChoro?.communes.map(c => [c.inseeCode, c.leadingCandidate]))
    const choroParty = new Map(communeChoro?.candidates.map(c => [c.name, c.party]))

    return (
      <PanelShell>
        <NationalSummary
          electionData={electionData}
          palette={palette}
          circoChoro={circoChoro}
          circoData={circoData}
        />
        <DeptHistory deptCode="FR" />
        <p className="px-4 pt-3 pb-2 text-xs text-gray-400 dark:text-gray-500 leading-relaxed">{hint}</p>
        <div className="border-t border-gray-100 dark:border-slate-800 px-3 pt-3 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-2 mb-1">
            30 plus grandes villes
          </p>
          {TOP_CITIES.map((city, i) => {
            // Resolve 1st and 2nd candidate colors for this city
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
                className="w-full flex items-center gap-2 px-2 py-1 text-left rounded hover:bg-blue-50 transition-colors group"
                onClick={() => {
                  setClickedCommune(city.inseeCode)
                  setFlyTarget({ lng: city.lng, lat: city.lat, zoom: city.zoom })
                }}
              >
                <span className="w-5 text-right text-xs text-gray-300 dark:text-gray-600 shrink-0">{i + 1}</span>
                {/* Candidate dots */}
                <span className="flex items-center gap-0.5 shrink-0">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: dot1 ?? '#e2e8f0' }}
                  />
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: dot2 ?? '#e2e8f0', opacity: dot2 ? 0.45 : 0.2 }}
                  />
                </span>
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 group-hover:text-blue-700 truncate">{city.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {city.population >= 1_000_000
                    ? `${(city.population / 1_000_000).toFixed(1)}M`
                    : `${Math.round(city.population / 1000)}k`}
                </span>
              </button>
            )
          })}
        </div>
      </PanelShell>
    )
  }

  const turnoutPct = (commune.turnout / commune.registeredVoters) * 100
  const blankPct = (commune.blankVotes / commune.registeredVoters) * 100

  // Département insight (two-axis P2): only for a SETTLED dept selection —
  // hover previews and dept-fallback resolutions stay on the plain detail view.
  const isDeptSelection = !!clickedCommune && isDeptCode(clickedCommune) && commune.inseeCode === clickedCommune
  // Hierarchy breadcrumb: one click up from a commune/circo to its département.
  const parentCode = activeCode ? parentDeptCode(activeCode) : null
  const parentDept =
    parentCode && parentCode !== commune.inseeCode
      ? electionData?.communes.find((c) => c.inseeCode === parentCode) ?? null
      : null

  return (
    <PanelShell
      header={
        <>
          <p className="mt-0.5 text-base font-bold text-gray-900 dark:text-gray-100">{commune.name}</p>
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
      {/* Round fallback notice: no full commune file for this round */}
      {isRoundFallback && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-100">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Les données par commune n'ont pas été rendues disponibles par le ministère de
            l'Intérieur pour ce tour. Résultats affichés au niveau du département.
          </p>
        </div>
      )}

      {/* Overseas fallback notice */}
      {isOverseasFallback && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-100">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            Les données par commune pour les départements et territoires d'outre-mer n'ont pas été
            rendues disponibles par le ministère de l'Intérieur. Résultats affichés au niveau du département.
          </p>
        </div>
      )}

      {/* Turnout */}
      <div className="p-4 border-b border-gray-100 dark:border-slate-800 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Participation
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {fmt(turnoutPct)}%
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({fmtInt(commune.turnout)} / {fmtInt(commune.registeredVoters)} inscrits)
          </span>
        </div>
        {/* Turnout bar */}
        <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 mt-1">
          <div
            className="bg-blue-500 h-1.5 rounded-full"
            style={{ width: `${turnoutPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Blancs&nbsp;: {fmt(blankPct)}% — Nuls&nbsp;:{' '}
          {fmt((commune.nullVotes / commune.registeredVoters) * 100)}%
        </p>
      </div>

      {/* Annulled ballots: no expressed votes to show */}
      {commune.annulled && (
        <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-100">
          <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            L'ensemble des suffrages de cette commune a été annulé par le Conseil
            constitutionnel (irrégularités constatées lors du scrutin). Aucun suffrage exprimé.
          </p>
        </div>
      )}

      {/* Candidate results */}
      {!commune.annulled && <div className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Candidats
        </p>
        {commune.candidates
          .slice()
          .sort((a, b) => b.percentage - a.percentage)
          .map((cand, i) => {
            const color = getCandidateColor(cand.name, i, cand.party, palette)
            const natPct = nationalPct?.(cand.name, cand.party) ?? null
            return (
              <CandidateRow
                key={cand.name}
                name={cand.name}
                color={color}
                right={
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {fmt(cand.percentage)}%
                  </span>
                }
                bar={
                  <>
                    {/* Local score bar */}
                    <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${cand.percentage}%`, background: color }}
                      />
                    </div>
                    {/* National "reminder" bar — same colour, faded, below the local bar */}
                    {natPct != null && (
                      <div className="w-full bg-gray-50 dark:bg-slate-800/60 rounded-full h-1 mt-0.5">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(natPct, 100)}%`, background: color, opacity: 0.35 }}
                        />
                      </div>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmtInt(cand.votes)} voix
                      {natPct != null && (
                        <span className="text-gray-300 dark:text-gray-600"> · national {fmt(natPct)}%</span>
                      )}
                    </p>
                  </>
                }
              />
            )
          })}
      </div>}

      {/* Département insight sections (two-axis P2) */}
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
    </PanelShell>
  )
}
