import { useEffect } from 'react'
import { useElectionStore } from './store/electionStore'
import { useElectionData, useChoroplethData, useCircoChoroplethData, useFullCommuneData, useFullCircoData, useElectionIndex, usePalette } from './hooks/useElectionData'
import { useIsMobile } from './hooks/useIsMobile'
import { DesktopLayout } from './components/DesktopLayout'
import { MobileLayout } from './components/MobileLayout'
import type { LayoutProps } from './components/layoutProps'

export default function App() {
  const { selected, granularity, setGranularity } = useElectionStore()
  const isMobile = useIsMobile()
  const indexQuery = useElectionIndex()
  const electionRef = indexQuery.data?.elections.find(
    (e) => e.type === selected.type && e.year === selected.year,
  )
  // Availability comes from the manifest; while it loads, assume available so
  // the initial (presidential 2022) queries start without waiting.
  const communeAvailable = electionRef?.granularities.includes('commune') ?? true
  const circoAvailable = electionRef?.granularities.includes('circonscription') ?? true
  const availableGranularities = electionRef?.granularities ?? ['commune', 'circonscription']

  // If the selected election doesn't offer the active granularity, switch.
  useEffect(() => {
    if (!electionRef) return
    if (!electionRef.granularities.includes(granularity)) {
      setGranularity(electionRef.granularities[0])
    }
  }, [electionRef, granularity, setGranularity])

  const electionQuery = useElectionData(selected.type, selected.year, selected.round)
  const paletteQuery = usePalette(selected.type, selected.year)
  const choroplethQuery = useChoroplethData(selected.type, selected.year, selected.round, communeAvailable)
  const circoQuery = useCircoChoroplethData(selected.type, selected.year, selected.round, circoAvailable)
  const fullCommuneQuery = useFullCommuneData(
    selected.type, selected.year, selected.round,
    communeAvailable && granularity === 'commune',
  )
  // Full circo files are small (~0.2–0.6 MB), so they load whenever available —
  // the national sheet's seats/circo-counts view needs them on every tab.
  const fullCircoQuery = useFullCircoData(selected.type, selected.year, selected.round, circoAvailable)
  const palette = paletteQuery.data ?? null

  const effectiveChoropleth =
    granularity === 'commune' ? (choroplethQuery.data ?? null) : (circoQuery.data ?? null)
  const fullData =
    granularity === 'commune' ? (fullCommuneQuery.data ?? null) : (fullCircoQuery.data ?? null)

  const layoutProps: LayoutProps = {
    electionData: electionQuery.data,
    communeData: fullCommuneQuery.data ?? null,
    // Resolved-but-absent (404 → null), as opposed to still loading — drives
    // the département fallback for rounds with no full commune file (prés T2).
    communeDataMissing: fullCommuneQuery.isSuccess && fullCommuneQuery.data === null,
    communeChoro: choroplethQuery.data ?? null,
    circoData: fullCircoQuery.data ?? null,
    circoChoro: circoQuery.data ?? null,
    effectiveChoropleth,
    fullData,
    palette,
    geometry: electionRef?.geometry,
    availableGranularities,
    circoAvailable,
    electionLabel: electionRef?.label ?? '',
    rounds: electionRef?.rounds ?? 1,
    isLoading: electionQuery.isLoading,
    error: electionQuery.error,
  }

  return isMobile ? <MobileLayout {...layoutProps} /> : <DesktopLayout {...layoutProps} />
}
