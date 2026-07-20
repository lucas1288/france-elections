import { useMemo } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { getCandidateColor, partyByName } from '../utils/partyColors'
import { circoInDept, communeInDept, isPlmArrondissement, circoNumber, plmCityOfDept } from '../utils/deptInsight'
import { DeptHistory } from './DeptHistory'
import { ArrondissementBreakdown } from './ArrondissementBreakdown'
import { CIRCO_BBOXES } from '../utils/territoryBBoxes'
import { TOP_CITIES } from '../utils/topCities'

interface Props {
  deptCode: string
  circoChoro: ChoroplethData | null
  circoData: RoundData | null
  communeChoro: ChoroplethData | null
  communeData: RoundData | null
  palette: Palette | null
}

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
      {children}
    </p>
  )
}

/**
 * Département insight sections (two-axis P2): shown under the dept-level
 * results when a département is the settled selection, in both the desktop
 * sidebar and the mobile detail sheet. Everything renders from data that is
 * already loaded: circo leaders from the circo choropleth/full file (always
 * loaded when the election has circos), commune stats from the commune
 * choropleth, and the commune rankings from the full commune file (commune
 * tab only — the sections appear once it loads).
 */
export function DeptInsight({ deptCode, circoChoro, circoData, communeChoro, communeData, palette }: Props) {
  const { granularity, setGranularity, selectTerritory, setFlyBounds, setFlyTarget } = useElectionStore()

  // ── Circonscriptions of the dept: leader (person when full data is in) + % ──
  const circos = useMemo(() => {
    const codes = (circoChoro?.communes ?? circoData?.communes ?? [])
      .map((c) => c.inseeCode)
      .filter((code) => circoInDept(code, deptCode))
    const choroParties = circoChoro ? partyByName(circoChoro.candidates) : new Map<string, string>()
    const choroByCode = new Map(circoChoro?.communes.map((c) => [c.inseeCode, c]))
    const fullByCode = new Map(circoData?.communes.map((c) => [c.inseeCode, c]))
    return codes
      .map((code) => {
        const full = fullByCode.get(code)
        const top = full && !full.annulled
          ? [...full.candidates].sort((a, b) => b.votes - a.votes)[0]
          : undefined
        const choroLeader = choroByCode.get(code)?.leadingCandidate
        return {
          code,
          num: circoNumber(code, deptCode),
          leader: top?.name ?? choroLeader ?? null,
          pct: top?.percentage ?? null,
          color: top
            ? getCandidateColor(top.name, 0, top.party, palette)
            : choroLeader
            ? getCandidateColor(choroLeader, 0, choroParties.get(choroLeader), palette)
            : null,
        }
      })
      .sort((a, b) => a.num - b.num)
  }, [circoChoro, circoData, deptCode, palette])

  // ── Communes led per force (choropleth counts; PLM counted once via the city) ──
  const communeStats = useMemo(() => {
    if (!communeChoro) return null
    const parties = partyByName(communeChoro.candidates)
    const counts = new Map<string, number>()
    let total = 0
    for (const c of communeChoro.communes) {
      if (!communeInDept(c.inseeCode, deptCode) || isPlmArrondissement(c.inseeCode)) continue
      total++
      if (c.leadingCandidate) counts.set(c.leadingCandidate, (counts.get(c.leadingCandidate) ?? 0) + 1)
    }
    if (!total) return null
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
    return { ranked, total, parties }
  }, [communeChoro, deptCode])

  // ── Rankings from the full commune file (loads on the commune tab) ──────────
  const communeDetail = useMemo(() => {
    if (!communeData) return null
    const inDept = communeData.communes.filter(
      (c) => communeInDept(c.inseeCode, deptCode) && !isPlmArrondissement(c.inseeCode),
    )
    if (!inDept.length) return null
    const largest = [...inDept].sort((a, b) => b.registeredVoters - a.registeredVoters).slice(0, 5)
    // Participation extremes: ≥ 1000 inscrits so hamlet-sized outliers don't
    // drown the signal; skipped for small/mono-commune départements.
    const eligible = inDept.filter((c) => c.registeredVoters >= 1000 && !c.annulled)
    const byTurnout = [...eligible].sort(
      (a, b) => b.turnout / b.registeredVoters - a.turnout / a.registeredVoters,
    )
    return {
      largest,
      top: eligible.length >= 6 ? byTurnout.slice(0, 3) : [],
      bottom: eligible.length >= 6 ? byTurnout.slice(-3).reverse() : [],
    }
  }, [communeData, deptCode])

  // A département that IS a single PLM commune (Paris only): the commune-level
  // sections degenerate to one row, so show an arrondissement breakdown instead.
  const plmCity = plmCityOfDept(deptCode)

  const jumpToCirco = (code: string) => {
    if (granularity !== 'circonscription') setGranularity('circonscription')
    selectTerritory(code)
    const bbox = CIRCO_BBOXES[code]
    if (bbox) setFlyBounds(bbox)
  }

  const jumpToCommune = (code: string) => {
    if (granularity !== 'commune') setGranularity('commune')
    selectTerritory(code)
    const city = TOP_CITIES.find((c) => c.inseeCode === code)
    if (city) setFlyTarget({ lng: city.lng, lat: city.lat, zoom: city.zoom })
  }

  const communeRow = (c: { inseeCode: string; name: string; leadingCandidate: string; annulled?: boolean; candidates: { name: string; party: string; votes: number }[] }, right: React.ReactNode) => {
    const top = !c.annulled ? [...c.candidates].sort((a, b) => b.votes - a.votes)[0] : undefined
    const color = top ? getCandidateColor(top.name, 0, top.party, palette) : '#cbd5e1'
    return (
      <button
        key={c.inseeCode}
        className="w-full flex items-center gap-2 px-2 py-1 text-left rounded hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
        onClick={() => jumpToCommune(c.inseeCode)}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
        <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">{c.name}</span>
        <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{right}</span>
      </button>
    )
  }

  return (
    <>
      {/* Historique — cross-election family series (P5; hidden until the
          history file + families registry are loaded) */}
      <DeptHistory deptCode={deptCode} />

      {/* Circonscriptions */}
      {circos.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
          <SectionLabel>Circonscriptions ({circos.length})</SectionLabel>
          <div className="-mx-2">
            {circos.map((c) => (
              <button
                key={c.code}
                className="w-full flex items-center gap-2 px-2 py-1 text-left rounded hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                onClick={() => jumpToCirco(c.code)}
              >
                <span className="w-8 shrink-0 text-xs text-gray-400 dark:text-gray-500">
                  {c.num === 1 ? '1ère' : `${c.num}e`}
                </span>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color ?? '#cbd5e1' }} />
                <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-300 truncate">
                  {c.leader ?? '—'}
                </span>
                {c.pct != null && (
                  <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {fmt(c.pct)}%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Paris: arrondissement breakdown in place of the one-commune sections */}
      {plmCity && (
        <ArrondissementBreakdown
          cityCode={plmCity}
          communeChoro={communeChoro}
          communeData={communeData}
          palette={palette}
        />
      )}

      {/* Communes en tête par force */}
      {!plmCity && communeStats && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-2">
          <SectionLabel>En tête par commune ({fmtInt(communeStats.total)} communes)</SectionLabel>
          {communeStats.ranked.slice(0, 6).map(([name, count]) => {
            const color = getCandidateColor(name, 0, communeStats.parties.get(name), palette)
            const pct = (count / communeStats.total) * 100
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{name}</span>
                  </div>
                  <span className="ml-2 shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {fmtInt(count)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rankings from the full commune file */}
      {!plmCity && communeDetail && (
        <>
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
            <SectionLabel>Plus grandes communes</SectionLabel>
            <div className="-mx-2">
              {communeDetail.largest.map((c) => communeRow(c, `${fmtInt(c.registeredVoters)} inscrits`))}
            </div>
          </div>
          {communeDetail.top.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-800 space-y-1">
              <SectionLabel>Participation la plus forte</SectionLabel>
              <div className="-mx-2">
                {communeDetail.top.map((c) => communeRow(c, `${fmt((c.turnout / c.registeredVoters) * 100)}%`))}
              </div>
              <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Participation la plus faible
              </p>
              <div className="-mx-2">
                {communeDetail.bottom.map((c) => communeRow(c, `${fmt((c.turnout / c.registeredVoters) * 100)}%`))}
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
                Communes de 1 000 inscrits ou plus.
              </p>
            </div>
          )}
        </>
      )}
    </>
  )
}
