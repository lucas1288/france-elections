import { useQuery } from '@tanstack/react-query'
import type { ElectionRef, Palette, RoundData } from '../types/election'
import { dataUrl } from '../utils/dataUrl'

async function fetchJson<T>(path: string): Promise<T> {
  const url = dataUrl(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json() as Promise<T>
}

/**
 * Shared shape of the compact choropleth files used to colour the map.
 * Contains only inseeCode + leadingCandidate per geographic unit.
 */
export interface ChoroplethData {
  granularity: 'commune' | 'circonscription'
  year: number
  round: number
  candidates: Array<{ name: string; party: string }>
  /** `abstention` (percent) is added by scripts/add-choropleth-abstention.mjs. */
  communes: Array<{ inseeCode: string; leadingCandidate: string; abstention?: number }>
}

/**
 * Fetches a JSON data file that may legitimately not exist for a given
 * election/round (returns null on 404 instead of erroring). Cached forever.
 */
function useOptionalJson<T>(queryKey: unknown[], path: string, enabled = true) {
  return useQuery<T | null>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(dataUrl(path))
      if (!res.ok) return null
      return res.json() as Promise<T>
    },
    enabled,
    retry: false,
    staleTime: Infinity,
  })
}

/** Fetches département-level election results (sidebar data). */
export function useElectionData(type: string, year: number, round: number) {
  return useQuery<RoundData>({
    queryKey: ['election', type, year, round],
    queryFn: () => fetchJson(`/data/elections/${type}/${year}/round${round}.json`),
    staleTime: 5 * 60 * 1000,
  })
}

/** Compact commune choropleth — null when no commune data exists for this round. */
export function useChoroplethData(type: string, year: number, round: number, enabled = true) {
  return useOptionalJson<ChoroplethData>(
    ['election-choropleth', type, year, round],
    `/data/elections/${type}/${year}/round${round}-communes-choropleth.json`,
    enabled,
  )
}

/** Compact circonscription choropleth. */
export function useCircoChoroplethData(type: string, year: number, round: number, enabled = true) {
  return useOptionalJson<ChoroplethData>(
    ['election-circo', type, year, round],
    `/data/elections/${type}/${year}/round${round}-circ-choropleth.json`,
    enabled,
  )
}

/** Per-election color palette (small, cached forever; null when absent). */
export function usePalette(type: string, year: number) {
  return useOptionalJson<Palette>(
    ['election-palette', type, year],
    `/data/elections/${type}/${year}/palette.json`,
  )
}

/** Full circonscription-level results (sidebar detail), loaded on demand. */
export function useFullCircoData(type: string, year: number, round: number, enabled: boolean) {
  return useOptionalJson<RoundData>(
    ['election-circo-full', type, year, round],
    `/data/elections/${type}/${year}/round${round}-circ.json`,
    enabled,
  )
}

/** Full commune-level results (≈34 MB), loaded on demand when the commune tab is active. */
export function useFullCommuneData(type: string, year: number, round: number, enabled: boolean) {
  return useOptionalJson<RoundData>(
    ['election-communes-full', type, year, round],
    `/data/elections/${type}/${year}/round${round}-communes.json`,
    enabled,
  )
}

/** Fetches the elections index manifest. */
export function useElectionIndex() {
  return useQuery({
    queryKey: ['election-index'],
    queryFn: () => fetchJson<{ elections: ElectionRef[] }>('/data/elections/index.json'),
    staleTime: Infinity,
  })
}
