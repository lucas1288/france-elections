import type { Palette, RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { useElectionStore } from '../store/electionStore'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
}

/**
 * Candidate/nuance color key, also the entry point for the gradient views:
 * clicking a row toggles that force's single-party view; the abstention button
 * toggles the abstention ramp. The active mode is highlighted; the heading
 * reflects it ("En tête" / "Score" / "Abstention").
 */
export function Legend({ electionData, palette }: Props) {
  const colorMode = useElectionStore((s) => s.colorMode)
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)
  if (!electionData) return null

  const activeParty = colorMode.kind === 'party' ? colorMode.party : null
  const heading =
    colorMode.kind === 'party' ? 'Score par territoire' : colorMode.kind === 'abstention' ? 'Abstention' : 'En tête'

  return (
    <div className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm p-3 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{heading}</p>

      {electionData.candidates.map((cand, i) => {
        const active = activeParty === cand.party
        const dimmed = activeParty !== null && !active
        return (
          <button
            key={cand.name}
            onClick={() => togglePartyMode(cand.party)}
            title={active ? 'Revenir à la vue par vainqueur' : `Voir le score de ${cand.name}`}
            className={`w-full flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors
              ${active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-100'} ${dimmed ? 'opacity-50' : ''}`}
          >
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ background: getCandidateColor(cand.name, i, cand.party, palette) }}
            />
            <span className="text-xs text-gray-700 truncate">{cand.name}</span>
            <span className="text-xs text-gray-400 shrink-0 ml-auto">{cand.party}</span>
          </button>
        )
      })}

      <button
        onClick={toggleAbstentionMode}
        className={`w-full flex items-center gap-2 rounded px-1 py-0.5 text-left transition-colors mt-1 border-t border-gray-100 pt-1.5
          ${colorMode.kind === 'abstention' ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-100'}`}
      >
        <span
          className="w-3 h-3 rounded-sm shrink-0"
          style={{ background: 'linear-gradient(90deg, #e5e7eb, #111827)' }}
        />
        <span className="text-xs text-gray-700">Abstention</span>
      </button>

      {colorMode.kind === 'leader' && (
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <span className="w-3 h-3 rounded-sm shrink-0 bg-gray-200" />
          <span className="text-xs text-gray-400">Données manquantes</span>
        </div>
      )}
    </div>
  )
}
