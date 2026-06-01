import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import type { RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'

interface Props {
  electionData: RoundData | undefined
  communeData: RoundData | null
  circoData: RoundData | null
  granularity: Granularity
  circoAvailable: boolean
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}

function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

export function ResultsPanel({ electionData, communeData, circoData, granularity, circoAvailable }: Props) {
  const { hoveredCommune, clickedCommune } = useElectionStore()

  const activeCode = clickedCommune ?? hoveredCommune

  const commune = (() => {
    if (!activeCode) return null
    if (granularity === 'commune' && communeData) {
      return communeData.communes.find((c) => c.inseeCode === activeCode)
        ?? electionData?.communes.find((c) => c.inseeCode === activeCode)
        ?? null
    }
    if (granularity === 'circonscription' && circoData) {
      return circoData.communes.find((c) => c.inseeCode === activeCode) ?? null
    }
    return electionData?.communes.find((c) => c.inseeCode === activeCode) ?? null
  })()

  if (!commune) {
    return (
      <aside className="w-72 shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Résultats</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-gray-400 leading-relaxed">
          {granularity === 'commune' && !communeData
            ? 'Chargement des données communales…'
            : granularity === 'circonscription' && !circoData
            ? 'Chargement des données par circonscription…'
            : granularity === 'circonscription'
            ? 'Survolez ou cliquez sur une circonscription pour afficher ses résultats'
            : `Survolez ou cliquez sur un${granularity === 'commune' ? 'e commune' : ' département'} pour afficher ses résultats`}
        </div>
      </aside>
    )
  }

  const turnoutPct = (commune.turnout / commune.registeredVoters) * 100
  const blankPct = (commune.blankVotes / commune.registeredVoters) * 100

  return (
    <aside className="w-72 shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700">Résultats</h2>
        <p className="mt-0.5 text-base font-bold text-gray-900">{commune.name}</p>
        <p className="text-xs text-gray-500">INSEE {commune.inseeCode}</p>
      </div>

      {/* Turnout */}
      <div className="p-4 border-b border-gray-100 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Participation
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {fmt(turnoutPct)}%
          </span>
          <span className="text-xs text-gray-500">
            ({fmtInt(commune.turnout)} / {fmtInt(commune.registeredVoters)} inscrits)
          </span>
        </div>
        {/* Turnout bar */}
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
          <div
            className="bg-blue-500 h-1.5 rounded-full"
            style={{ width: `${turnoutPct}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">
          Blancs&nbsp;: {fmt(blankPct)}% — Nuls&nbsp;:{' '}
          {fmt((commune.nullVotes / commune.registeredVoters) * 100)}%
        </p>
      </div>

      {/* Candidate results */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Candidats
        </p>
        {commune.candidates
          .slice()
          .sort((a, b) => b.percentage - a.percentage)
          .map((cand, i) => (
            <div key={cand.name}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: getCandidateColor(cand.name, i, cand.party) }}
                  />
                  <span className="text-sm text-gray-800 truncate">{cand.name}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 ml-2 shrink-0">
                  {fmt(cand.percentage)}%
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${cand.percentage}%`,
                    background: getCandidateColor(cand.name, i, cand.party),
                  }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {fmtInt(cand.votes)} voix
              </p>
            </div>
          ))}
      </div>
    </aside>
  )
}
