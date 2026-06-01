import { useElectionIndex } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import type { ElectionType } from '../types/election'

const TYPE_LABELS: Record<string, string> = {
  presidential: 'Présidentielle',
  legislative: 'Législatives',
  european: 'Européennes',
}

export function ElectionSelector() {
  const { data: index } = useElectionIndex()
  const { selected, setSelected } = useElectionStore()

  const elections = index?.elections ?? []

  // Unique election types present in the index
  const types = [...new Set(elections.map((e) => e.type))]

  // Years for the selected type
  const years = elections
    .filter((e) => e.type === selected.type)
    .map((e) => e.year)
    .sort((a, b) => b - a)

  // Rounds for the selected type+year
  const rounds =
    elections.find((e) => e.type === selected.type && e.year === selected.year)
      ?.rounds ?? 1

  return (
    <div className="flex items-center gap-3 p-3 bg-white border-b border-gray-200">
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        Élection
      </span>

      {/* Type selector */}
      <select
        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={selected.type}
        onChange={(e) =>
          setSelected({ type: e.target.value as ElectionType, year: years[0] ?? selected.year, round: 1 })
        }
      >
        {types.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t] ?? t}
          </option>
        ))}
      </select>

      {/* Year selector */}
      <select
        className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={selected.year}
        onChange={(e) =>
          setSelected({ ...selected, year: Number(e.target.value), round: 1 })
        }
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {/* Round selector — hidden when only one round */}
      {rounds > 1 && (
        <select
          className="text-sm border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={selected.round}
          onChange={(e) =>
            setSelected({ ...selected, round: Number(e.target.value) })
          }
        >
          {Array.from({ length: rounds }, (_, i) => i + 1).map((r) => (
            <option key={r} value={r}>
              Tour {r}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
