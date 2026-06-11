import { useElectionStore } from '../store/electionStore'
import type { Granularity } from '../store/electionStore'
import type { RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor } from '../utils/partyColors'
import { TOP_CITIES } from '../utils/topCities'

interface Props {
  electionData: RoundData | undefined
  communeData: RoundData | null
  communeChoro: ChoroplethData | null
  circoData: RoundData | null
  circoChoro: ChoroplethData | null
  granularity: Granularity
  circoAvailable: boolean
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}

function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

// Overseas commune codes: 5 digits starting with 97x or 98x.
// The corresponding département code is the first 3 digits.
function overseasDeptCode(code: string): string | null {
  if (code.length === 5 && (code.startsWith('97') || code.startsWith('98'))) {
    return code.slice(0, 3)
  }
  return null
}

export function ResultsPanel({ electionData, communeData, communeChoro, circoData, circoChoro, granularity, circoAvailable }: Props) {
  const { hoveredCommune, clickedCommune, setClickedCommune, setFlyTarget } = useElectionStore()

  const activeCode = clickedCommune ?? hoveredCommune

  const commune = (() => {
    if (!activeCode) return null
    if (granularity === 'commune' && communeData) {
      const direct = communeData.communes.find((c) => c.inseeCode === activeCode)
        ?? electionData?.communes.find((c) => c.inseeCode === activeCode)
      if (direct) return direct
      // Overseas commune fallback: use département-level data
      const deptCode = overseasDeptCode(activeCode)
      return deptCode ? (electionData?.communes.find((c) => c.inseeCode === deptCode) ?? null) : null
    }
    if (granularity === 'circonscription' && circoData) {
      return circoData.communes.find((c) => c.inseeCode === activeCode) ?? null
    }
    return electionData?.communes.find((c) => c.inseeCode === activeCode) ?? null
  })()

  // True when we're showing département-level data as a fallback for an overseas commune click
  const isOverseasFallback =
    commune !== null &&
    activeCode !== null &&
    overseasDeptCode(activeCode) !== null &&
    commune.inseeCode !== activeCode

  if (!commune) {
    const hint =
      granularity === 'commune' && !communeData
        ? 'Chargement des données communales…'
        : granularity === 'circonscription' && !circoData
        ? 'Chargement des données par circonscription…'
        : granularity === 'circonscription'
        ? 'Survolez ou cliquez sur une circonscription pour afficher ses résultats'
        : 'Survolez ou cliquez sur une commune pour afficher ses résultats'

    // ── Circo mode: ranked list of candidates by number of circos won ──────────
    if (granularity === 'circonscription' && circoChoro) {
      const partyByName = new Map(circoChoro.candidates.map(c => [c.name, c.party]))

      // First-place counts from lightweight choropleth
      const counts1st = new Map<string, number>()
      for (const c of circoChoro.communes) {
        counts1st.set(c.leadingCandidate, (counts1st.get(c.leadingCandidate) ?? 0) + 1)
      }

      // Second-place counts from full circo data (loaded on demand)
      const counts2nd = new Map<string, number>()
      if (circoData) {
        for (const circo of circoData.communes) {
          const second = [...circo.candidates].sort((a, b) => b.votes - a.votes)[1]?.name
          if (second) counts2nd.set(second, (counts2nd.get(second) ?? 0) + 1)
        }
      }

      const ranked = [...counts1st.entries()]
        .sort((a, b) => b[1] - a[1])
        .filter(([, n]) => n > 0)
      const total = circoChoro.communes.length

      return (
        <aside className="w-72 shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Résultats</h2>
          </div>
          <p className="px-4 pt-3 pb-1 text-xs text-gray-400 leading-relaxed">{hint}</p>
          <div className="px-4 pt-2 pb-4 space-y-3">
            {/* Column headers */}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                En tête par circonscription
              </p>
              <div className="flex gap-3 text-xs text-gray-400 shrink-0 ml-2">
                <span>1er</span>
                {circoData && <span>2e</span>}
              </div>
            </div>

            {ranked.map(([name, count1st]) => {
              const color = getCandidateColor(name, 0, partyByName.get(name))
              const count2nd = counts2nd.get(name) ?? 0
              const pct1st = (count1st / total) * 100
              const pct2nd = (count2nd / total) * 100
              return (
                <div key={name}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-sm text-gray-800 truncate">{name}</span>
                    </div>
                    <div className="flex items-center gap-3 ml-2 shrink-0">
                      <span className="text-sm font-semibold" style={{ color }}>
                        {fmtInt(count1st)}
                      </span>
                      {circoData && (
                        <span className="text-sm text-gray-400 w-7 text-right">
                          {count2nd > 0 ? fmtInt(count2nd) : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Stacked bar: solid = 1st place, faded = 2nd place */}
                  <div className="w-full bg-gray-100 rounded-full h-1.5 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 h-full"
                      style={{ width: `${pct1st}%`, background: color, borderRadius: '9999px 0 0 9999px' }}
                    />
                    {circoData && count2nd > 0 && (
                      <div
                        className="absolute inset-y-0 h-full"
                        style={{
                          left: `${pct1st}%`,
                          width: `${Math.min(pct2nd, 100 - pct1st)}%`,
                          background: color,
                          opacity: 0.35,
                          borderRadius: '0 9999px 9999px 0',
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>
      )
    }

    // ── Dept / commune mode: city list ─────────────────────────────────────────
    // Build fast lookups for candidate colors per city
    const fullCityMap = new Map(communeData?.communes.map(c => [c.inseeCode, c]))
    const choroCityMap = new Map(communeChoro?.communes.map(c => [c.inseeCode, c.leadingCandidate]))
    const choroParty = new Map(communeChoro?.candidates.map(c => [c.name, c.party]))

    return (
      <aside className="w-72 shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Résultats</h2>
        </div>
        <p className="px-4 pt-3 pb-2 text-xs text-gray-400 leading-relaxed">{hint}</p>
        <div className="border-t border-gray-100 px-3 pt-3 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-2 mb-1">
            30 plus grandes villes
          </p>
          {TOP_CITIES.map((city, i) => {
            // Resolve 1st and 2nd candidate colors for this city
            const full = fullCityMap.get(city.inseeCode)
            let dot1: string | null = null
            let dot2: string | null = null
            if (full) {
              const sorted = [...full.candidates].sort((a, b) => b.votes - a.votes)
              if (sorted[0]) dot1 = getCandidateColor(sorted[0].name, 0, sorted[0].party)
              if (sorted[1]) dot2 = getCandidateColor(sorted[1].name, 0, sorted[1].party)
            } else {
              const leader = choroCityMap.get(city.inseeCode)
              if (leader) dot1 = getCandidateColor(leader, 0, choroParty.get(leader))
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
                <span className="w-5 text-right text-xs text-gray-300 shrink-0">{i + 1}</span>
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
                <span className="flex-1 text-sm text-gray-700 group-hover:text-blue-700 truncate">{city.name}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {city.population >= 1_000_000
                    ? `${(city.population / 1_000_000).toFixed(1)}M`
                    : `${Math.round(city.population / 1000)}k`}
                </span>
              </button>
            )
          })}
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

      {/* Overseas fallback notice */}
      {isOverseasFallback && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100">
          <p className="text-xs text-amber-700 leading-relaxed">
            Les données par commune pour les départements et territoires d'outre-mer n'ont pas été
            rendues disponibles par le ministère de l'Intérieur. Résultats affichés au niveau du département.
          </p>
        </div>
      )}

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
