import { useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import type { Palette, RoundData } from '../types/election'
import { useElectionStore } from '../store/electionStore'
import { computeNationalTotals } from '../utils/nationalResults'
import { territoryColor } from '../utils/territoryColor'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
}

interface Territory {
  code: string
  label: string
}

// DOM then COM, matching the desktop OverseasInsets order.
const TERRITORIES: Territory[] = [
  { code: '971', label: 'Guadeloupe' },
  { code: '972', label: 'Martinique' },
  { code: '973', label: 'Guyane' },
  { code: '974', label: 'La Réunion' },
  { code: '976', label: 'Mayotte' },
  { code: '975', label: 'St-Pierre-et-Miquelon' },
  { code: '977', label: 'St-Martin / St-Barth' },
  { code: '986', label: 'Wallis-et-Futuna' },
  { code: '987', label: 'Polynésie française' },
  { code: '988', label: 'Nouvelle-Calédonie' },
]

// Français à l'étranger — a low-key entry at the bottom of the sheet.
const ABROAD_CODE = '99'

/**
 * Mobile overseas entry (Phase 5). Replaces the desktop OverseasInsets column
 * with a single glanceable cluster of winner-colored dots — no names at rest,
 * one tap target → a sheet listing territories by name. Tapping a row focuses
 * that territory's real map (`setFocusedTerritory` → FranceMap flyTo), so
 * overseas is explorable at the same granularity as the mainland. Dots follow
 * the active `colorMode` via the shared `territoryColor`.
 */
export function MobileOverseasCluster({ electionData, palette }: Props) {
  const [open, setOpen] = useState(false)
  const colorMode = useElectionStore((s) => s.colorMode)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const setFocusedTerritory = useElectionStore((s) => s.setFocusedTerritory)

  const fillByCode = useMemo(() => {
    const m = new Map<string, string>()
    if (!electionData) return m
    const national = computeNationalTotals(electionData)
    for (const c of electionData.communes) {
      m.set(c.inseeCode, territoryColor(c, colorMode, palette, national))
    }
    return m
  }, [electionData, palette, colorMode])

  const getFill = (code: string) => fillByCode.get(code) ?? '#e2e8f0'

  // Hidden while a territory is focused (the map is showing it full-screen).
  if (!electionData || focusedTerritory) return null

  const focus = (code: string) => {
    setClickedCommune(code)
    setFocusedTerritory(code)
    setOpen(false)
  }

  const abroad = electionData.communes.find((c) => c.inseeCode === ABROAD_CODE)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Outre-mer"
        className="absolute bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-4 z-20 flex flex-col items-center gap-1 rounded-xl bg-white/90 px-2.5 py-2 shadow-lg backdrop-blur-sm ring-1 ring-black/5"
      >
        <span className="grid grid-cols-5 gap-[3px]">
          {TERRITORIES.map((t) => (
            <span
              key={t.code}
              className="h-[7px] w-[7px] rotate-45 rounded-[1px]"
              style={{ background: getFill(t.code) }}
            />
          ))}
        </span>
        <span className="text-[10px] font-medium leading-none text-gray-500">Outre-mer</span>
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <Drawer.Content
            className="fixed inset-x-0 bottom-0 z-40 flex max-h-[80%] flex-col rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.16)] outline-none"
            aria-describedby={undefined}
          >
            <div className="mx-auto mt-2.5 mb-1 h-1.5 w-10 shrink-0 rounded-full bg-gray-300" />

            <div className="flex items-center px-4 pb-2 pt-1">
              <Drawer.Title className="text-base font-bold text-gray-900">Outre-mer</Drawer.Title>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-full p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-8">
              {TERRITORIES.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => focus(t.code)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors active:bg-gray-100"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: getFill(t.code) }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{t.label}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-300" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}

              {/* Français à l'étranger — aggregate results, no dedicated map. */}
              {abroad && (
                <button
                  type="button"
                  onClick={() => { setClickedCommune(ABROAD_CODE); setOpen(false) }}
                  className="mt-1 flex w-full items-center gap-3 rounded-lg border-t border-gray-100 px-3 py-3 pt-4 text-left transition-colors active:bg-gray-100"
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: getFill(ABROAD_CODE) }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-500">Français à l'étranger</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-gray-300" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}
