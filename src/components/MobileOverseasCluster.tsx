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

// Français à l'étranger — its own dot in the schematic + a low-key sheet entry.
const ABROAD_CODE = '99'
// All the dots shown in the schematic (10 DOM/COM + Français à l'étranger).
const DOT_CODES = [...TERRITORIES.map((t) => t.code), ABROAD_CODE]

/**
 * Mobile overseas entry (Phase 5, reworked). NOT a nav control — a small
 * schematic inset anchored in the map's lower-left sea margin (≈ Corsica's
 * latitude), the way printed French maps tuck the DOM-TOM into the margins. A
 * grid of winner-colored dots (one per territory + Français à l'étranger) reads
 * as part of the map; tapping it opens a sheet listing the territories. Tapping
 * a row focuses that territory's real map (`setFocusedTerritory` → FranceMap
 * flyTo). Dots follow the active `colorMode` via the shared `territoryColor`.
 */
export function MobileOverseasCluster({ electionData, palette }: Props) {
  const [open, setOpen] = useState(false)
  const colorMode = useElectionStore((s) => s.colorMode)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const mapZoomedIn = useElectionStore((s) => s.mapZoomedIn)
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

  // Hidden while a territory is focused, or once zoomed in (like the desktop
  // insets) so the inset never floats over the communes being inspected.
  if (!electionData || focusedTerritory || mapZoomedIn) return null

  const focus = (code: string) => {
    setClickedCommune(code)
    setFocusedTerritory(code)
    setOpen(false)
  }

  const abroad = electionData.communes.find((c) => c.inseeCode === ABROAD_CODE)

  return (
    <>
      {/* Schematic inset in the map's lower-left margin (≈ Corsica's latitude) —
          reads as part of the map, not a floating nav control. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Outre-mer et Français de l'étranger"
        className="absolute left-2 top-[42%] z-20 flex flex-col items-center gap-1 rounded-md border border-slate-300/70 bg-white/65 px-2 py-1.5 backdrop-blur-[2px]"
      >
        <span className="grid grid-cols-6 gap-[3px]">
          {DOT_CODES.map((code) => (
            <span
              key={code}
              className="h-[7px] w-[7px] rotate-45 rounded-[1px]"
              style={{ background: getFill(code) }}
            />
          ))}
        </span>
        <span className="max-w-[76px] text-center text-[8.5px] font-medium leading-tight text-slate-500">
          Outre-mer et Français de l'étranger
        </span>
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
              <Drawer.Title className="text-base font-bold text-gray-900">Outre-mer et Français de l'étranger</Drawer.Title>
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
