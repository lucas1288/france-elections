import { useElectionStore } from '../store/electionStore'
import { useDeptHistory, useFamilies } from '../hooks/useElectionData'

/**
 * Whether `<DeptHistory>` would render anything for this territory — the same
 * test as its own guard (both files loaded + ≥2 elections of the selected
 * type). The panel tab model asks first, so an empty "Historique" tab is never
 * offered.
 *
 * Lives outside `DeptHistory.tsx` so that file keeps exporting only its
 * component (a mixed component/hook module breaks Fast Refresh).
 */
export function useHasDeptHistory(deptCode: string | null): boolean {
  const selectedType = useElectionStore((s) => s.selected.type)
  const { data: history } = useDeptHistory()
  const { data: registry } = useFamilies()
  if (!deptCode || !history || !registry) return false
  const dept = history.depts[deptCode]
  if (!dept) return false
  return dept.series.filter((p) => p.t === selectedType && p.r === 1).length >= 2
}
