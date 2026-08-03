/**
 * Geometry shared by the overseas orbit and the map's own "fit métropole" call.
 *
 * Layout (R4, third pass — lucas): the overseas territories bracket métropole
 * like PARENTHESES — five discs curving down the left side, five down the right,
 * with Français de l'étranger lifted out of the arc entirely and floated in the
 * top-right corner. lucas traded away the perfect circle of the previous pass
 * ("we might lose the perfect circle position but keep a curved way of
 * displaying the items") to get the bracketing shape.
 *
 * THE DERIVATION RUNS MÉTROPOLE-FIRST, which is the whole point of this pass.
 * Earlier versions sized the arc from the window and gave métropole whatever was
 * left, so on some window shapes the discs came out huge next to a small France
 * and on others the reverse. Now:
 *
 *   1. métropole takes all the vertical room the chrome leaves;
 *   2. the disc DIAMETER is a fixed fraction of métropole's on-screen height, so
 *      the two always read at the same relative scale;
 *   3. the column spans CONTINENTAL France's north–south extent — lucas: the
 *      discs must sit neither above its north coast nor below its southern edge
 *      — which fixes `ry`;
 *   4. each column sits one gap out from the land nearest it: the continent on
 *      the west, Corsica on the east;
 *   5. only if the window is too narrow for 4 does métropole shrink to fit.
 *
 * Steps 3 and 4 measure against CONTINENTAL France, not the bounding box the map
 * is fitted to. See CONT below for why that is not the same thing.
 *
 * The map's fitBounds padding comes from the same numbers, so the arc and the
 * mainland it brackets cannot drift apart.
 */

/** Label height under a disc — two lines at 10px/tight, plus its 4px offset. */
const LABEL_H = 30

// Bands of the map area owned by the R3 floating chrome: the search pill north,
// the timeline strip south. Unlike previous passes these now bound MÉTROPOLE
// itself, not the disc rows — the discs are inside its span by construction.
const TOP_CHROME = 60
const BOTTOM_CHROME = 76

/**
 * Disc diameter as a fraction of métropole's HALF-height, then clamped.
 *
 * This is what lucas asked for in so many words: "I would like these item and
 * ellipse shape and size to be relative to the position and size of the
 * displayed metropolitan France… so we don't end up with oversized circles
 * compared to continental france on some screen formats or the contrary."
 */
const DISC_OVER_HALF_H = 0.204
const DISC_MIN = 36
// Only a sanity rail, not a design size. Every px it clips is a px where the
// proportional rule above stops holding, so keep it generous — it should bite
// on a 4K desktop and nowhere else.
const DISC_MAX = 78
/** Cell width as a multiple of the disc — the extra is room for wrapped labels. */
const CELL_OVER_DISC = 1.45
/** Clearance between the nearest French land and the nearest disc edge, ditto. */
const GAP_OVER_DISC = 0.35
/**
 * Where the free-floating Français de l'étranger disc sits, in px from the map
 * area's top-right corner. `FE_RIGHT` clears FranceMap's zoom/theme stack
 * (`right-3`, ~44px wide) with room to breathe.
 */
export const FE_RIGHT = 64
export const FE_TOP = 12

export interface Arc {
  /** Centre of the métropole BOUNDING BOX — what the map is fitted to. */
  cx: number
  cy: number
  /** Centre of CONTINENTAL France — what the arc is built around. */
  arcCx: number
  arcCy: number
  /** Column radii. They differ: west clears the continent, east clears Corsica. */
  rxW: number
  rxE: number
  ry: number
  /** métropole's projected half-width / half-height, in px. */
  halfW: number
  halfH: number
  /** Disc diameter and cell width for this size — both scale with métropole. */
  disc: number
  cellW: number
}

/**
 * Angular step between adjacent discs on a column, measured from the horizontal
 * axis. Five discs at steps -2…+2 therefore span ±30°, giving each column its
 * "(" shape: the middle territory reaches furthest out and the top and bottom
 * ones curl back toward métropole.
 *
 * This is the CURVATURE dial, and it is not free. The column's height is fixed
 * (métropole's own band), so a shallower arc costs nothing vertically — but the
 * bulge is `rx·(1 − cos ext)`, and everything the column takes horizontally is
 * taken from métropole. At ±45° the bulge was 29% of `rx` and it was the width,
 * not the height, that capped the map on every window tested. At ±30° it is 13%
 * and the height budget binds instead, so métropole is meaningfully larger —
 * lucas asked for "less curved" and got a bigger map with it.
 */
const STEP_DEG = 15
/** sin of the extreme step — relates column height to `ry`. */
const SIN_EXT = Math.sin((2 * STEP_DEG * Math.PI) / 180)
/**
 * cos of the extreme step — sets how wide métropole can be.
 *
 * The extreme discs are the ones furthest IN horizontally, and since this pass
 * pins the whole column inside France's own north–south band, they are level
 * with it rather than clear above and below it. So they, not an intermediate
 * pair, decide the width. (Before the column was pinned to the band the
 * opposite was true, because the extreme discs then sat outside it entirely.)
 */
const COS_EXT = Math.cos((2 * STEP_DEG * Math.PI) / 180)

/**
 * Métropole's bounding box aspect (width / height) once projected — 15.2° of
 * longitude against 10° of latitude in Web Mercator at ~46°N. Confirmed against
 * the live projection at 1.0478.
 */
const ASPECT = 1.048

/**
 * CONTINENTAL France inside the métropole bounding box, as fractions of that
 * box (0 = its north/west edge, 1 = its south/east edge). Measured against the
 * live projection, not estimated: Ouessant, Lauterbourg, Bray-Dunes, Cerbère.
 *
 * The arc is positioned against THIS rect, not the bounding box — lucas: "these
 * items should be placed relatively to continental france (corsica excluded)".
 * It matters because the box is not a snug fit: Corsica alone stretches it out
 * to 0.991 east and 0.988 south, so measuring the columns from the box left a
 * band of empty sea on the west that had nothing to do with where France
 * actually is. Note the box's own west edge carries slack too (Ouessant is at
 * 0.024, not 0), which is more of the same gap.
 */
const CONT = { left: 0.024, right: 0.904, top: 0.012, bottom: 0.895 }
/**
 * Corsica's eastern edge, same units. The east column has to clear THIS rather
 * than the continental edge — its lowest disc sits squarely in Corsica's
 * latitude band (0.83–0.99), so measuring that side from the continent would
 * park a disc on top of the island.
 */
const CORSICA_RIGHT = 0.991

// The same rect expressed about the box's CENTRE, in units of halfW / halfH,
// which is the form the geometry below actually uses.
const contOffX = CONT.left + CONT.right - 1 // arc centre vs box centre
const contOffY = CONT.top + CONT.bottom - 1
const contHalfWFrac = CONT.right - CONT.left
const contHalfHFrac = CONT.bottom - CONT.top
/** Corsica's east edge measured from the ARC's centre. */
const corsicaReach = 2 * CORSICA_RIGHT - 1 - contOffX

const clampDisc = (d: number) => Math.max(DISC_MIN, Math.min(DISC_MAX, d))

/**
 * The arc, métropole's box inside it, and the disc size, for a map area `w × h`.
 */
export function orbitArc(w: number, h: number): Arc {
  const build = (topChrome: number): Arc => {
    const cx = w / 2
    const halfHByHeight = Math.max(80, (h - topChrome - BOTTOM_CHROME) / 2)

    // Disc size. Two candidates — one from the height budget, one from the
    // width — because the disc feeds back into how wide métropole may be (a
    // bigger disc eats the margin it needs). The width case below is a closed
    // form, so no iteration is needed.
    //
    // Width is decided by the EAST column: it reaches furthest, having to clear
    // Corsica rather than the continent. Whatever fits there fits on the west.
    const perDisc = CELL_OVER_DISC / 2 + (0.5 + GAP_OVER_DISC) / COS_EXT
    const perHalfH = ASPECT * (corsicaReach / COS_EXT + contOffX)
    const dByWidth = (DISC_OVER_HALF_H * cx) / (perHalfH + DISC_OVER_HALF_H * perDisc)
    const disc = clampDisc(Math.min(DISC_OVER_HALF_H * halfHByHeight, dByWidth))
    const cellW = disc * CELL_OVER_DISC
    const gap = GAP_OVER_DISC * disc

    // métropole: whichever of height and width binds.
    const halfH = Math.max(80, Math.min(halfHByHeight, (cx - perDisc * disc) / perHalfH))
    const halfW = halfH * ASPECT
    const cy = topChrome + halfH

    // The arc centres on CONTINENTAL France, which sits north-west of the box's
    // centre once Corsica's pull is taken out.
    const arcCx = cx + contOffX * halfW
    const arcCy = cy + contOffY * halfH

    // The column spans continental France's own north–south extent: the extreme
    // discs sit at ±(contHalfH − disc/2), so their outer edges land exactly on
    // its north coast and its Pyrenean south. That is lucas's pair of red lines.
    const ry = Math.max(80, (contHalfHFrac * halfH - disc / 2) / SIN_EXT)

    // Each column hugs the land nearest it — the continent on the west, Corsica
    // on the east — so the two sit at different radii but leave the SAME visible
    // gap, which is what reads as balanced.
    const reach = (d: number) => (d + disc / 2 + gap) / COS_EXT
    const rxW = reach(contHalfWFrac * halfW)
    const rxE = reach(corsicaReach * halfW)

    return { cx, cy, arcCx, arcCy, rxW, rxE, ry, halfW, halfH, disc, cellW }
  }

  const arc = build(TOP_CHROME)
  // Français de l'étranger owns the top-right corner, and on a narrow desktop
  // the east column's top disc swings right underneath it. Detected rather than
  // reserved unconditionally: paying for FE's height on every window would cost
  // métropole real size at the widths where the two never meet.
  const eastTopX = arc.arcCx + arc.rxE * COS_EXT
  const feX = w - FE_RIGHT - arc.cellW / 2
  const feClash =
    Math.abs(eastTopX - feX) < arc.cellW + 8 &&
    arc.arcCy - arc.ry * SIN_EXT - arc.disc / 2 < FE_TOP + arc.disc + LABEL_H
  return feClash ? build(FE_TOP + arc.disc + LABEL_H + 10) : arc
}

/**
 * fitBounds padding that lands métropole between the two columns. Recomputed
 * from the live container size (FranceMap re-fits on resize), which is what
 * keeps the bracketing true at any window size.
 */
export function metroPadding(w: number, h: number) {
  const { cx, cy, halfW, halfH } = orbitArc(w, h)
  // Never let a pair of paddings exceed its own axis: MapLibre answers padding
  // it cannot fit by logging a warning and DECLINING the fit, which leaves the
  // map wherever it was — an empty canvas, with nothing to retry it.
  const fit = (a: number, b: number, extent: number) => {
    const room = extent * 0.9
    const total = a + b
    const k = total > room ? room / total : 1
    return [Math.max(8, a * k), Math.max(8, b * k)] as const
  }
  const [top, bottom] = fit(cy - halfH, h - cy - halfH, h)
  const [left, right] = fit(cx - halfW, w - cx - halfW, w)
  return { top, bottom, left, right }
}

export interface ArcSlot {
  code: string
  label: string
  side: 'west' | 'east'
  /** -2 (top) … +2 (bottom) along the column. */
  step: -2 | -1 | 0 | 1 | 2
}

/**
 * The ten territories that ride the arc, top to bottom on each side.
 *
 * True bearings are gone (lucas: "forget a bit more about accurate bearings"),
 * but the ordering still carries geography rather than being arbitrary: the west
 * column runs down the Atlantic by LATITUDE (St-Pierre in the north Atlantic
 * down to Guyane on the equator), the east column runs out from the Indian Ocean
 * into the Pacific by LONGITUDE (Mayotte → La Réunion → Nouvelle-Calédonie →
 * Wallis → Polynésie).
 */
export const ARC_SLOTS: ArcSlot[] = [
  { code: '975', label: 'St-Pierre-et-Miquelon', side: 'west', step: -2 },
  { code: '977', label: 'St-Martin / St-Barth', side: 'west', step: -1 },
  { code: '971', label: 'Guadeloupe', side: 'west', step: 0 },
  { code: '972', label: 'Martinique', side: 'west', step: 1 },
  { code: '973', label: 'Guyane', side: 'west', step: 2 },
  { code: '987', label: 'Polynésie française', side: 'east', step: -2 },
  { code: '986', label: 'Wallis-et-Futuna', side: 'east', step: -1 },
  { code: '988', label: 'Nouvelle-Calédonie', side: 'east', step: 0 },
  { code: '974', label: 'La Réunion', side: 'east', step: 1 },
  { code: '976', label: 'Mayotte', side: 'east', step: 2 },
]

/**
 * Français de l'étranger. NOT on the arc: the arc's order encodes geography and
 * FE has no location at all, so lucas floated it out of the composition into the
 * top-right corner. Its broken ring already says "no bearing"; sitting outside
 * the brackets says it more plainly.
 */
export const ABROAD_SLOT = { code: '99', label: "Français de l'étranger" }

/** Every disc, arc plus FE — for the data loops that need all eleven codes. */
export const ALL_SLOT_CODES = [...ARC_SLOTS.map((s) => s.code), ABROAD_SLOT.code]

/** Screen position of an arc slot's DISC CENTRE. */
export function slotPoint(arc: Arc, slot: ArcSlot) {
  const t = (slot.step * STEP_DEG * Math.PI) / 180
  const east = slot.side === 'east'
  const rx = east ? arc.rxE : arc.rxW
  return { x: arc.arcCx + (east ? 1 : -1) * rx * Math.cos(t), y: arc.arcCy + arc.ry * Math.sin(t) }
}
