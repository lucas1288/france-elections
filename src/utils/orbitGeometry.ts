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
 * area's top-right corner — hard into it, aligned with the zoom/theme stack's
 * own `right-3`.
 *
 * It used to sit at `right: 64`, dodging that stack sideways, which parked it
 * exactly on the east column's outer envelope: it read as a sixth item in that
 * column, and — worse — it tripped the collision rule below and pushed the whole
 * arc down, costing métropole 70px of height (7%) at a 1620×1140 map area. FE
 * and the stack swapped instead (lucas): FE owns the corner, the stack starts
 * below it at UTIL_STACK_TOP. In the corner FE is ~159px clear of the column, so
 * the arc keeps its full height.
 */
export const FE_RIGHT = 12
export const FE_TOP = 12

/**
 * Where FranceMap's zoom/theme stack starts, in px from the top of the map area
 * — clear of FE's cell, which now owns the corner above it.
 *
 * Derived from the LARGEST disc rather than the live one on purpose: the stack
 * is chrome and exists at every zoom, while FE only shows at the overview, so a
 * live-derived offset would shift it around as the window resizes and leave it
 * anchored to something that isn't on screen half the time.
 */
export const UTIL_STACK_TOP = FE_TOP + DISC_MAX + LABEL_H + 8

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
  // Français de l'étranger owns the top-right corner, and on a narrow window the
  // east column's top disc can still swing underneath it. Detected rather than
  // reserved unconditionally: paying for FE's height on every window would cost
  // métropole real size at the widths where the two never meet — which, since FE
  // moved into the corner proper, is every ordinary desktop size.
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

// ── Mobile (M6) ───────────────────────────────────────────────────────────────
/**
 * The phone does NOT lay the territories out around métropole. It hides them
 * behind ONE button, and opens them as a ring in an overlay.
 *
 * lucas, Aug 6 2026: "I don't think there's any easy solution on mobile for
 * displaying all overseas territories at once. So I'd rather hide them on mobile
 * behind a single button, that could actually reuse the current symbol of french
 * abroad." M4/M5 had tried the other answer — two rows bracketing the mainland —
 * and the arithmetic never got good: eleven touch-sized discs cost ~90px of a
 * budget where métropole was already the thing being squeezed, and the rows had
 * to dodge every floating control on the way.
 *
 * What replaces them has to carry the information the rows carried, or the trade
 * is just a deletion. That is what the button's ring is for: eleven equal arcs,
 * one per territory, in each territory's own winner colour (see `aggregate` in
 * utils/overseasDiscs). You still read the overseas balance from the map screen;
 * you tap only to find out WHICH territory is which.
 *
 * The freed budget goes straight back to the map: with no disc rows to clear,
 * the only band reserved above métropole is the search bar's.
 */

/** Diameter of the aggregate button on the map screen. */
export const MOBILE_BUTTON_DISC = 52
/** Its inset from the map area's bottom-left corner. */
export const MOBILE_BUTTON_LEFT = 12
/** Clearance between the button and the national snippet it sits on top of. */
export const MOBILE_BUTTON_GAP = 8

/**
 * Bands the phone's chrome takes out of the map, for `fitBounds`.
 *
 * Only the SEARCH BAR is reserved at the top. Everything else up there — the
 * back chip, the layers button — floats over the map the way Google Maps'
 * controls do, which is the model lucas asked for ("a bit like in google maps
 * again"). That distinction is what makes his two-row top layout affordable:
 * opaque CONTENT needs a reserved band, translucent CHROME does not.
 */
const MOBILE_SEARCH_BAND = 64
/** Strip band + its margin, mirroring ABOVE_STRIP in utils/mobileChrome. */
const MOBILE_STRIP_BAND = 64
/**
 * Nominal height of the national snippet card, used ONLY to derive the map's
 * fitBounds padding. The live value is measured and published as a CSS variable
 * (see SNIPPET_H_VAR) for the surfaces that stack on the card; the map fit is
 * computed once at init, before the card has rendered, so it uses this instead.
 * Both are the same number today — keep them in step.
 */
const MOBILE_SNIPPET_NOMINAL = 196
const MOBILE_MARGIN = 8

/**
 * fitBounds padding for the phone. Deliberately NOT recomputed on resize (the
 * re-fit effect is desktop-only): a phone viewport only changes on rotation, and
 * a re-fit would fight the camera.
 */
export function mobileMetroPadding() {
  return {
    top: MOBILE_SEARCH_BAND,
    bottom: MOBILE_STRIP_BAND + MOBILE_SNIPPET_NOMINAL + MOBILE_MARGIN,
    left: MOBILE_MARGIN,
    right: MOBILE_MARGIN,
  }
}

/**
 * Order of the eleven discs around the overlay's ring, CLOCKWISE FROM THE TOP.
 *
 * This is the desktop's two parentheses closed into a loop, and it reads the
 * same way: down the right side you get the east column top-to-bottom
 * (Polynésie → Mayotte), and continuing round and up the left side you get the
 * west column bottom-to-top (Guyane → St-Pierre) — so on screen the left half
 * still runs St-Pierre → Guyane downward, exactly as it does on desktop.
 *
 * Français de l'étranger takes the apex. It is the one territory with no
 * location, which is why it sits outside the brackets on desktop; at 12 o'clock
 * it is outside them here too, at the seam where the loop closes.
 */
export const RING_SLOTS: { code: string; label: string }[] = [
  ABROAD_SLOT,
  ...ARC_SLOTS.filter((s) => s.side === 'east').map(({ code, label }) => ({ code, label })),
  ...ARC_SLOTS.filter((s) => s.side === 'west')
    .map(({ code, label }) => ({ code, label }))
    .reverse(),
]

export interface Ring {
  cx: number
  cy: number
  rx: number
  ry: number
  disc: number
  /** Width allotted to a label under a disc — the ring's tightest pitch. */
  labelW: number
}

const RING_DISC = 60
const RING_DISC_MIN = 44
const RING_MARGIN = 10
/** Room under the lowest disc for its label, and above the ring for the title. */
const RING_LABEL_H = 30
/**
 * Floor for the top of the ring — i.e. clearance under the overlay's title.
 *
 * Was 56, which left the apex disc 6px under "11 territoires — touchez pour
 * ouvrir": the globe read as part of the heading rather than as the first item
 * of the ring (lucas: "a bit more padding between the circle of overseas
 * territories and the title"). At 96 the gap is ~46px and the ring's centre
 * moves down with it, closer to the middle of the screen.
 */
const RING_TOP_PAD = 96
/**
 * How much of the bottom the ring keeps clear, PREFERRED and MINIMUM.
 *
 * Preferred is the band the national snippet and the timeline strip occupy under
 * the scrim: keeping off it lands the ring over the MAP, which is the thing it
 * stands in for. But that is an aesthetic preference, and on a short viewport it
 * costs something that isn't — at 375×667 the reserved band left so little
 * height that the labels down the flanks overlapped each other ("St-Martin /
 * St-Barth" ran into "Guadeloupe"). Legibility of eleven names beats not
 * overlapping a card that is dimmed behind a scrim anyway, so the reserve gives
 * way as far as the minimum when the ring needs the room.
 */
const RING_BOTTOM_RESERVE = 268
const RING_BOTTOM_RESERVE_MIN = 88
/** How far from circular the ellipse may get, either way. */
const RING_ASPECT_MIN = 0.85
const RING_ASPECT_MAX = 1.8

/**
 * The overlay's ring. An ELLIPSE, not a circle — the phone is portrait, so a
 * circle inscribed in its width would leave the screen lopsided while cramming
 * the discs together.
 *
 * Stretching it vertically buys the one thing the map screen could never afford:
 * ROOM FOR THE NAMES. On a circle the pitch between discs is uniform, and at
 * 375px wide eleven of them leave only ~85px between centres everywhere;
 * stretched, that tight pitch is confined to the apex and the nadir, and every
 * disc down the sides gets its label space back.
 *
 * The stretch is CLAMPED, though. Left to fill the viewport it reaches an aspect
 * of 2.2 on a tall phone, at which point the discs stop reading as a ring at all
 * and just look scattered down the two edges.
 */
export function overlayRing(w: number, h: number): Ring {
  const n = RING_SLOTS.length
  const disc = Math.max(RING_DISC_MIN, Math.min(RING_DISC, (w - 2 * RING_MARGIN) * 0.16))
  const rx = w / 2 - RING_MARGIN - disc / 2
  // Vertical room left once the apex disc, the nadir disc, its label and the
  // title are accounted for — then clamped to stay recognisably a ring.
  const bandTop = RING_TOP_PAD
  // Height at which the ring stops crowding itself: down the flanks, adjacent
  // centres are ry·sin(Δθ) apart, and a disc plus its label has to fit in that.
  // Solve for the band that yields exactly that ry, then claw back only as much
  // of the bottom reserve as it takes to get there.
  const comfortable =
    (2 * (disc + RING_LABEL_H)) / Math.sin((2 * Math.PI) / n) + disc + RING_LABEL_H
  const reserve = Math.max(
    RING_BOTTOM_RESERVE_MIN,
    Math.min(RING_BOTTOM_RESERVE, h - bandTop - comfortable),
  )
  const bandBottom = h - reserve
  const room = (bandBottom - bandTop - disc - RING_LABEL_H) / 2
  const ry = Math.min(rx * RING_ASPECT_MAX, Math.max(rx * RING_ASPECT_MIN, room))
  // CENTRE the ring in its band rather than hanging it from the top. When the
  // band is the binding constraint the two are the same thing, but when the
  // aspect clamp bites (a very tall viewport) the slack would otherwise all pool
  // at the bottom and leave the ring riding high under the title.
  // `bandTop` stays a floor so a short viewport crowds the snippet, never the title.
  const total = 2 * ry + disc + RING_LABEL_H
  const top = Math.max(bandTop, bandTop + (bandBottom - bandTop - total) / 2)
  const cy = top + disc / 2 + ry
  // The tightest centre-to-centre spacing is at the apex, where the ellipse is
  // flattest: adjacent discs are ~rx·Δθ apart horizontally.
  const labelW = Math.max(disc, rx * ((2 * Math.PI) / n))
  return { cx: w / 2, cy, rx, ry, disc, labelW }
}

/** Screen position of ring slot `i`'s DISC CENTRE. */
export function ringPoint(ring: Ring, i: number, n = RING_SLOTS.length) {
  // −90° puts slot 0 at the top; increasing i turns clockwise on screen, since
  // y grows downward.
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
  return { x: ring.cx + ring.rx * Math.cos(a), y: ring.cy + ring.ry * Math.sin(a) }
}
