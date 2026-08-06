/**
 * Mobile chrome geometry (R3 → M6), in one place.
 *
 * The floating mobile controls have to agree on where the bands are. Before this
 * those offsets were repeated as literals across four files — which is how the
 * old two-row header's `8.25rem` ended up hard-coded in FranceMap and went stale
 * the moment the header changed height. Change a band here and every surface
 * follows.
 *
 * Values are CSS `calc` strings including the safe-area insets, so they're used
 * via `style={{ … }}` rather than Tailwind classes (arbitrary-value classes
 * can't be composed from a constant — Tailwind scans literal text).
 *
 * THE LAYOUT SINCE M6 (Aug 6 2026, lucas) is two rows at the top, Google-Maps
 * style:
 *
 *   TOP_RAIL   the search bar, FULL WIDTH
 *   CHIP_ROW   back-to-overview on the left (only when away), layers on the right
 *   bottom-left  the overseas aggregate button, sitting on the national snippet
 *   bottom       the timeline strip, pinned
 *
 * Only the SEARCH BAR is reserved out of the map (see mobileMetroPadding). The
 * chip row floats over it — opaque content needs a band, translucent chrome does
 * not, and that distinction is what makes a two-row top affordable at all.
 */

/** Top row: the full-width search bar. */
export const TOP_RAIL = 'calc(0.75rem + env(safe-area-inset-top))'

/**
 * Second row: back-to-overview (left, conditional) and the layers button
 * (right). 12px inset + the 44px search bar + an 8px gutter.
 *
 * (M1–M5's `LEFT_RAIL_SECOND` — the back button sitting BESIDE the search
 * magnifier — is gone with the magnifier: the bar takes the full width, so the
 * second control goes below it rather than next to it.)
 *
 * lucas asked for the search "same level as layer selection" in M5 and then, in
 * M6, for the search to go full width — which forces the layers button off that
 * line. Below it on the right is where Google Maps puts its own layers control,
 * and it keeps the top line reading as one thing.
 */
export const CHIP_ROW = 'calc(4rem + env(safe-area-inset-top))'

/**
 * Clear of the WHOLE top chrome — used by surfaces that cover the map
 * (`Hemicycle`'s title, `HemicycleSheet`'s seats chip). 64 + the 51px layers
 * button + a gutter. Mobile only since M6: the desktop floating row is far
 * shorter, so `Hemicycle` applies this only when it is on a phone.
 */
export const BELOW_TOP_CHROME = 'calc(7.75rem + env(safe-area-inset-top))'

/**
 * Height reserved at the bottom for the pinned timeline strip. Everything that
 * sits above the strip (detail sheet, national snippet) starts here. Retuned
 * 5.75rem → 4rem by M3, which collapsed the strip from 80px to 52px — leave it
 * stale and the surfaces above float on 28px of dead space.
 */
export const ABOVE_STRIP = 'calc(4rem + env(safe-area-inset-bottom))'

/**
 * CSS variable carrying the national snippet card's measured height.
 *
 * `MobileSnippetCard` publishes it on `<html>`; the overseas button (M6) sits
 * directly above the card and reads it to place itself. A variable rather than a
 * shared constant because the height is a rendering outcome — a constant would
 * go stale the first time the card's contents change, and the failure mode is
 * the two surfaces overlapping. The fallback below matches the card as it
 * renders today, so the button is placed sanely on the very first frame.
 */
export const SNIPPET_H_VAR = '--fe-snippet-h'

/** Floor of the band above the national snippet — where the overseas button sits. */
export const ABOVE_SNIPPET = `calc(4rem + env(safe-area-inset-bottom) + var(${SNIPPET_H_VAR}, 196px) + 0.5rem)`

/**
 * Transform that fully hides a panel anchored at `bottom: ABOVE_STRIP`.
 * `translateY(100%)` alone only moves it down by its own height, leaving the
 * bottom offset's worth still on screen — the offset has to be added.
 */
export const HIDE_BELOW_STRIP = 'translateY(calc(100% + 4rem + env(safe-area-inset-bottom)))'
