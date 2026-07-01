import { useMemo, useState } from 'react'
import { useElectionIndex } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import type { ElectionRef, ElectionType } from '../types/election'

const TYPE_LABELS: Record<string, string> = {
  presidential: 'Présidentielle',
  legislative: 'Législatives',
  european: 'Européennes',
}
const TYPE_LABELS_PLURAL: Record<string, string> = {
  presidential: 'Présidentielles',
  legislative: 'Législatives',
  european: 'Européennes',
}

// Approximate month within a year, so same-year elections sort chronologically
// (e.g. June législatives above April présidentielle in a shared year).
const TYPE_MONTH: Record<string, number> = { presidential: 4, legislative: 6, european: 6 }

interface Props {
  open: boolean
  onClose: () => void
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

/**
 * Full-screen election picker (Phase 3): a filterable, newest-first
 * chronological timeline of every election in the manifest, each row carrying a
 * winner dot. Selecting one switches the election (round resets to 1). A plain
 * slide-up overlay — full takeover, no drag needed.
 */
export function ElectionPicker({ open, onClose }: Props) {
  const { data: index } = useElectionIndex()
  const { selected, setSelected } = useElectionStore()
  const [filter, setFilter] = useState<ElectionType | 'all'>('all')

  const elections = useMemo(() => index?.elections ?? [], [index])
  const types = useMemo(() => [...new Set(elections.map((e) => e.type))], [elections])

  const sorted = useMemo(
    () =>
      [...elections].sort((a, b) => b.year - a.year || (TYPE_MONTH[b.type] ?? 0) - (TYPE_MONTH[a.type] ?? 0)),
    [elections],
  )
  const rows = sorted.filter((e) => filter === 'all' || e.type === filter)

  const isSelected = (e: ElectionRef) => e.type === selected.type && e.year === selected.year

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col bg-white transition-transform duration-300 ${
        open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
      aria-hidden={!open}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-bold text-gray-900">Choisir une élection</h2>
        <button
          type="button"
          aria-label="Fermer"
          onClick={onClose}
          className="ml-auto rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 border-b border-gray-100 px-4 pb-3">
        <FilterChip label="Toutes" active={filter === 'all'} onClick={() => setFilter('all')} />
        {types.map((t) => (
          <FilterChip
            key={t}
            label={TYPE_LABELS_PLURAL[t] ?? t}
            active={filter === t}
            onClick={() => setFilter(t)}
          />
        ))}
      </div>

      {/* Chronological list, newest first */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((e) => {
          const active = isSelected(e)
          return (
            <button
              key={`${e.type}-${e.year}`}
              type="button"
              onClick={() => {
                setSelected({ type: e.type, year: e.year, round: 1 })
                onClose()
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left ${active ? 'bg-blue-50' : ''}`}
            >
              <span className={`w-11 shrink-0 text-lg font-medium ${active ? 'text-blue-700' : 'text-gray-900'}`}>
                {e.year}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${active ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
                  {TYPE_LABELS[e.type] ?? e.type}
                </span>
                {e.winner && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.winner.color }} />
                    <span className="truncate">{e.winner.name}</span>
                  </span>
                )}
              </span>
              {active ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-600" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-300" aria-hidden="true">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </button>
  )
}
