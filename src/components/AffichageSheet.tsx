import { useState } from 'react'
import { Drawer } from 'vaul'
import type { Palette, RoundData } from '../types/election'
import { getCandidateColor } from '../utils/partyColors'
import { useElectionStore } from '../store/electionStore'

interface Props {
  electionData: RoundData | undefined
  palette: Palette | null
}

/**
 * Mobile "Affichage" sheet (Phase 4). A bottom-left chip surfaces the current
 * color mode; tapping it opens a vaul sheet grouping the color-mode switch
 * (Vainqueur / Un parti / Abstention) with the color key. Mirrors the desktop
 * Legend: tapping a force drives the single-party view, so "Un parti" is chosen
 * by picking a force from the list rather than being a bare segment.
 */
export function AffichageSheet({ electionData, palette }: Props) {
  const colorMode = useElectionStore((s) => s.colorMode)
  const togglePartyMode = useElectionStore((s) => s.togglePartyMode)
  const toggleAbstentionMode = useElectionStore((s) => s.toggleAbstentionMode)
  const setLeaderMode = useElectionStore((s) => s.setLeaderMode)
  const [open, setOpen] = useState(false)

  if (!electionData) return null

  const activeParty = colorMode.kind === 'party' ? colorMode.party : null
  const activeName =
    colorMode.kind === 'party'
      ? electionData.candidates.find((c) => c.party === activeParty)?.name ?? 'Un parti'
      : colorMode.kind === 'abstention'
        ? 'Abstention'
        : 'Vainqueur'

  // Swatch for the chip reflects the active mode.
  const chipColor =
    colorMode.kind === 'party'
      ? getCandidateColor(
          activeName,
          electionData.candidates.findIndex((c) => c.party === activeParty),
          activeParty ?? '',
          palette,
        )
      : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Affichage : ${activeName}`}
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white/90 text-gray-600 shadow-lg backdrop-blur-sm ring-1 ring-black/5"
      >
        {colorMode.kind === 'abstention' ? (
          <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: 'linear-gradient(90deg, #e5e7eb, #111827)' }} />
        ) : chipColor ? (
          <span className="h-4 w-4 shrink-0 rounded-sm" style={{ background: chipColor }} />
        ) : (
          <PaletteIcon />
        )}
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
              <Drawer.Title className="text-base font-bold text-gray-900">Affichage</Drawer.Title>
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

            {/* Color-mode segment */}
            <div className="flex gap-1.5 px-4 pb-3">
              <ModeChip label="Vainqueur" active={colorMode.kind === 'leader'} onClick={setLeaderMode} />
              <ModeChip label="Un parti" active={colorMode.kind === 'party'} onClick={() => { /* pick a force below */ }} disabled />
              <ModeChip label="Abstention" active={colorMode.kind === 'abstention'} onClick={toggleAbstentionMode} />
            </div>

            {/* Color key — tapping a force drives the single-party view */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-gray-100 px-2 py-2 pb-8">
              <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
                {colorMode.kind === 'party' ? 'Score par territoire' : 'En tête'}
              </p>
              {electionData.candidates.map((cand, i) => {
                const active = activeParty === cand.party
                const dimmed = activeParty !== null && !active
                return (
                  <button
                    key={cand.name}
                    type="button"
                    onClick={() => togglePartyMode(cand.party)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                      active ? 'bg-blue-50 ring-1 ring-blue-200' : 'active:bg-gray-100'
                    } ${dimmed ? 'opacity-50' : ''}`}
                  >
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-sm"
                      style={{ background: getCandidateColor(cand.name, i, cand.party, palette) }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{cand.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{cand.party}</span>
                  </button>
                )
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  )
}

function ModeChip({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : disabled
            ? 'bg-gray-100 text-gray-400'
            : 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </button>
  )
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="13.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2C6.5 2 2 6 2 11c0 4 3 7 7 7 1 0 2-1 2-2 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.3 0-1 .8-1.8 1.8-1.8H14c3.3 0 6-2.7 6-6 0-3.9-3.6-6.9-8-6.9z" />
    </svg>
  )
}
