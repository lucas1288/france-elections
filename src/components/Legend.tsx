import type { RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'

interface Props {
  electionData: RoundData | undefined
}

export function Legend({ electionData }: Props) {
  if (!electionData) return null

  return (
    <div className="absolute top-4 right-14 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm p-3 space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
        En tête
      </p>
      {electionData.candidates.map((cand, i) => (
        <div key={cand.name} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ background: getCandidateColor(cand.name, i, cand.party) }}
          />
          <span className="text-xs text-gray-700">{cand.name}</span>
          <span className="text-xs text-gray-400">({cand.party})</span>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
        <span className="w-3 h-3 rounded-sm shrink-0 bg-gray-200" />
        <span className="text-xs text-gray-400">Données manquantes</span>
      </div>
    </div>
  )
}
