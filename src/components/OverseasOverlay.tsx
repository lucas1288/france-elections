import { useEffect, useRef, useState } from 'react'
import { useElectionStore } from '../store/electionStore'
import { GlobeGlyph, SegmentedRing, Silhouette } from './overseas/discParts'
import {
  ABROAD,
  useOverseasShapes,
  useSelectOverseas,
  useSilhouettes,
  type OverseasDiscs,
} from '../utils/overseasDiscs'
import { overlayRing, ringPoint, RING_SLOTS, type Ring } from '../utils/orbitGeometry'

/**
 * The phone's overseas ring (M6) — what the aggregate button opens.
 *
 * lucas: "I would like a kind of transparent overlay to appear (we still see the
 * map in the BG but with some opacity) that displays a circle of the 11 overseas
 * territories."
 *
 * The circle finally works here, and only here: on the map screen a ring would
 * have to be arranged AROUND métropole, which is what forced the desktop's
 * parentheses and the phone's rows. With the mainland only a dimmed backdrop,
 * the brackets can close into a loop — and the loop reads in the same order,
 * east down the right, west up the left, FE at the apex (see RING_SLOTS).
 *
 * It is also the first overseas surface on a phone with ROOM FOR THE NAMES,
 * which is the real answer to "which one is which" that the button's ring can't
 * give. That is what the ellipse is for.
 */
export function OverseasOverlay({ discs, onClose }: { discs: OverseasDiscs; onClose: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [ring, setRing] = useState<Ring | null>(null)
  const [shown, setShown] = useState(false)

  const shapes = useOverseasShapes()
  const silhouettes = useSilhouettes(discs, shapes)
  const select = useSelectOverseas()
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const focusedTerritory = useElectionStore((s) => s.focusedTerritory)
  const isDark = useElectionStore((s) => s.isDark)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => setRing(overlayRing(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Fade in on mount. The overlay UNMOUNTS on close (so its two GeoJSON fetches
  // only happen once someone opens it), which is why there's no exit transition
  // to match — the scrim vanishing instantly reads fine, a fade-in does not.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    closeRef.current?.focus()
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const pick = (code: string) => {
    select(code)
    onClose()
  }

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label="Outre-mer et Français de l'étranger"
      // z-[55]: above the detail sheet (z-40) and the layers menu (z-50), below
      // the full-screen takeovers (z-[60]).
      className="absolute inset-0 z-[55] transition-opacity duration-200"
      style={{ opacity: shown ? 1 : 0 }}
    >
      {/* The scrim is translucent on purpose (lucas: "we still see the map in the
          BG but with some opacity") — the map staying visible is what says the
          overlay is a detour, not a different screen. Tapping it closes. */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-white/80 backdrop-blur-[2px] dark:bg-slate-950/80"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
        <div className="pointer-events-none pt-1">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Outre-mer et Français de l'étranger
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            11 territoires — touchez pour ouvrir
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="pointer-events-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow ring-1 ring-black/5 active:bg-gray-100 dark:bg-slate-900/90 dark:text-gray-300 dark:ring-white/10"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {ring &&
        RING_SLOTS.map((slot, i) => {
          const { x, y } = ringPoint(ring, i)
          const abroad = slot.code === ABROAD
          const selected = abroad
            ? clickedCommune === ABROAD || !!clickedCommune?.startsWith('99')
            : focusedTerritory === slot.code || clickedCommune === slot.code
          return (
            <div
              key={slot.code}
              className="absolute flex flex-col items-center"
              style={{
                left: x - ring.labelW / 2,
                top: y - ring.disc / 2,
                width: ring.labelW,
              }}
            >
              <button
                type="button"
                onClick={() => pick(slot.code)}
                aria-label={slot.label}
                className="relative shrink-0 rounded-full transition-transform active:scale-95"
                style={{ width: ring.disc, height: ring.disc }}
              >
                <span
                  className="absolute inset-0 rounded-full bg-white shadow-lg dark:bg-slate-900"
                  style={{
                    outline: selected
                      ? `2px solid ${isDark ? '#f8fafc' : '#0f172a'}`
                      : discs.wonByCode.has(slot.code)
                        ? `2px solid ${isDark ? '#e2e8f0' : '#334155'}`
                        : 'none',
                    outlineOffset: 2,
                  }}
                />
                <SegmentedRing
                  colors={discs.segmentsFor(slot.code)}
                  broken={abroad}
                  d={ring.disc}
                />
                {abroad ? (
                  <GlobeGlyph fill={discs.fillByCode.get(ABROAD) ?? discs.neutral} d={ring.disc} />
                ) : (
                  <Silhouette parts={silhouettes.get(slot.code) ?? []} d={ring.disc} />
                )}
              </button>
              <span className="mt-1 w-full text-center text-[10px] font-medium leading-tight text-gray-600 dark:text-gray-300">
                {slot.label}
              </span>
            </div>
          )
        })}
    </div>
  )
}
