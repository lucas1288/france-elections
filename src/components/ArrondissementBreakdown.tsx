import { useMemo } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor, partyByName } from '../utils/partyColors'
import { arrondissementsMeta } from '../utils/deptInsight'

interface Props {
  /** Whole-city commune code: 75056 (Paris) / 69123 (Lyon) / 13055 (Marseille). */
  cityCode: string
  communeChoro: ChoroplethData | null
  communeData: RoundData | null
  palette: Palette | null
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}

/**
 * Per-arrondissement breakdown for the three PLM cities. The commune data holds
 * BOTH the whole-city aggregate and one entry per arrondissement (751xx / 6938x
 * / 132xx), so this lists each arrondissement's leader + winning share, ordered
 * by arrondissement number, each row selecting that arrondissement (which has a
 * real polygon in the tiles + its own commune-level results). Rendered under a
 * PLM whole-city selection (ResultsPanel + MobileDetailSheet) and in place of
 * Paris's degenerate "en tête par commune" sections (DeptInsight). Leaders come
 * from the choropleth (always loaded on the commune tab); the winning % is
 * filled in from the full commune file once it loads.
 */
export function ArrondissementBreakdown({ cityCode, communeChoro, communeData, palette }: Props) {
  const { granularity, setGranularity, selectTerritory } = useElectionStore()
  const meta = arrondissementsMeta(cityCode)

  const rows = useMemo(() => {
    if (!meta) return []
    const choroLeader = new Map(communeChoro?.communes.map((c) => [c.inseeCode, c.leadingCandidate]))
    const choroParties = communeChoro ? partyByName(communeChoro.candidates) : new Map<string, string>()
    const fullByCode = new Map(communeData?.communes.map((c) => [c.inseeCode, c]))

    const codes = new Set<string>()
    for (const c of communeChoro?.communes ?? []) if (c.inseeCode.startsWith(meta.prefix)) codes.add(c.inseeCode)
    for (const c of communeData?.communes ?? []) if (c.inseeCode.startsWith(meta.prefix)) codes.add(c.inseeCode)

    return [...codes]
      .map((code) => {
        const full = fullByCode.get(code)
        const top = full && !full.annulled
          ? [...full.candidates].sort((a, b) => b.votes - a.votes)[0]
          : undefined
        const choroName = choroLeader.get(code)
        const leader = top?.name ?? choroName ?? null
        const party = top?.party ?? (choroName ? choroParties.get(choroName) : undefined)
        return {
          code,
          num: parseInt(code, 10) - meta.base,
          leader,
          pct: top?.percentage ?? null,
          color: leader ? getCandidateColor(leader, 0, party, palette) : '#cbd5e1',
        }
      })
      .sort((a, b) => a.num - b.num)
  }, [meta, communeChoro, communeData, palette])

  if (!meta || rows.length === 0) return null

  const jumpToArrondissement = (code: string) => {
    if (granularity !== 'commune') setGranularity('commune')
    selectTerritory(code)
  }

  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Résultats par arrondissement ({rows.length})
      </p>
      <div className="-mx-2">
        {rows.map((r) => (
          <button
            key={r.code}
            className="w-full flex items-center gap-2 px-2 py-1 text-left rounded hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
            onClick={() => jumpToArrondissement(r.code)}
          >
            <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-gray-500">
              {r.num === 1 ? '1er' : `${r.num}e`}
            </span>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
            <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">
              {r.leader ?? '—'}
            </span>
            {r.pct != null && (
              <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                {fmt(r.pct)}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
