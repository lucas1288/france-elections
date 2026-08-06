import { GlobeGlyph, SegmentedRing } from './overseas/discParts'
import type { OverseasDiscs } from '../utils/overseasDiscs'
import { MOBILE_BUTTON_DISC } from '../utils/orbitGeometry'

/**
 * The phone's overseas control (M6) — ONE button standing for all eleven
 * territories, opening the overlay ring.
 *
 * lucas: "I'd rather hide them on mobile behind a single button, that could
 * actually reuse the current symbol of french abroad… Ideally as well, I would
 * like all the shares of the circle to reflect the 10 overseas territories and
 * the one french abroad political color for every election. That would be the
 * way to pre-display some kind of detailed results and also to incite the user
 * to click on it."
 *
 * So the ring is the whole point, not decoration. Collapsing eleven discs into
 * one button removes eleven results from the screen; the ring puts the BALANCE
 * of those results back — eleven equal arcs, one per territory, each in that
 * territory's own winner colour, sorted so identical colours group. You lose
 * which-is-which, which is exactly what a tap is for.
 *
 * The globe is Français de l'étranger's own glyph, promoted: "everywhere that
 * isn't the mainland" is precisely what it says. It is filled with the eleven
 * territories' AGGREGATE colour, so disc and ring stand in the same relation as
 * they do on every territory disc — silhouette = who won here, ring = how it
 * breaks down.
 */
export function OverseasButton({
  discs,
  onOpen,
  style,
  className = '',
}: {
  discs: OverseasDiscs
  onOpen: () => void
  style?: React.CSSProperties
  className?: string
}) {
  const d = MOBILE_BUTTON_DISC
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Outre-mer et Français de l'étranger — voir les 11 territoires"
      style={{ ...style, width: d, height: d }}
      className={`relative rounded-full transition-transform active:scale-95 ${className}`}
    >
      <span className="absolute inset-0 rounded-full bg-white shadow-lg dark:bg-slate-900" />
      {/* `broken` — the same edge treatment the FE disc has always had. It says
          "no bearing", which is true of this button too: it stands for eleven
          places at once, so there is nowhere to point it. */}
      <SegmentedRing colors={discs.aggregate.segments} broken d={d} />
      <GlobeGlyph fill={discs.aggregate.color} d={d} />
    </button>
  )
}
