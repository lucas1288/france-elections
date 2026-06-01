import { useQuery } from '@tanstack/react-query'
import type { RoundData } from '../types/election'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json() as Promise<T>
}

/** Fetches département-level election results (sidebar data). */
export function useElectionData(type: string, year: number, round: number) {
  return useQuery<RoundData>({
    queryKey: ['election', type, year, round],
    queryFn: () => fetchJson(`/data/elections/${type}/${year}/round${round}.json`),
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetches the compact commune-level choropleth data used to colour the map.
 * Contains only inseeCode + leadingCandidate per commune (~2 MB).
 * Returns null when no commune data exists for this round (map falls back
 * to département-level colours automatically).
 */
export interface ChoroplethData {
  granularity: 'commune' | 'circonscription'
  year: number
  round: number
  candidates: Array<{ name: string; party: string }>
  communes: Array<{ inseeCode: string; leadingCandidate: string }>
}

export function useChoroplethData(type: string, year: number, round: number) {
  return useQuery<ChoroplethData | null>({
    queryKey: ['election-choropleth', type, year, round],
    queryFn: async () => {
      const url = `/data/elections/${type}/${year}/round${round}-communes-choropleth.json`
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json() as Promise<ChoroplethData>
    },
    retry: false,
    staleTime: Infinity,
  })
}

export function useCircoChoroplethData(type: string, year: number, round: number) {
  return useQuery<ChoroplethData | null>({
    queryKey: ['election-circo', type, year, round],
    queryFn: async () => {
      const url = `/data/elections/${type}/${year}/round${round}-circ-choropleth.json`
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json() as Promise<ChoroplethData>
    },
    retry: false,
    staleTime: Infinity,
  })
}

/** Fetches full circonscription-level results (sidebar detail) on demand. */
export function useFullCircoData(type: string, year: number, round: number, enabled: boolean) {
  return useQuery<RoundData | null>({
    queryKey: ['election-circo-full', type, year, round],
    queryFn: async () => {
      const url = `/data/elections/${type}/${year}/round${round}-circ.json`
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json() as Promise<RoundData>
    },
    enabled,
    retry: false,
    staleTime: Infinity,
  })
}

/**
 * Fetches the full commune-level election data (≈34 MB) on demand.
 * Only enabled when the caller passes `enabled: true` (i.e. commune granularity is active).
 * Cached indefinitely after the first load.
 */
export function useFullCommuneData(type: string, year: number, round: number, enabled: boolean) {
  return useQuery<RoundData | null>({
    queryKey: ['election-communes-full', type, year, round],
    queryFn: async () => {
      const url = `/data/elections/${type}/${year}/round${round}-communes.json`
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json() as Promise<RoundData>
    },
    enabled,
    retry: false,
    staleTime: Infinity,
  })
}

/** Fetches the elections index manifest. */
export function useElectionIndex() {
  return useQuery({
    queryKey: ['election-index'],
    queryFn: () =>
      fetchJson<{ elections: Array<{ type: string; year: number; rounds: number; label: string }> }>(
        '/data/elections/index.json'
      ),
    staleTime: Infinity,
  })
}
