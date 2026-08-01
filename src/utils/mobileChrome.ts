/**
 * Mobile chrome geometry (redesign R3), in one place.
 *
 * The floating mobile controls have to agree on where the bands are: the header
 * at the top, the pinned timeline strip at the bottom, and everything that must
 * clear them (the layers menu, FranceMap's back button + zoom stack, the detail
 * sheet, the national snippet card). Before this those offsets were repeated as
 * literals across four files — which is how the old two-row header's `8.25rem`
 * ended up hard-coded in FranceMap and went stale the moment the header changed
 * height. Change a band here and every surface follows.
 *
 * Values are CSS `calc` strings including the safe-area insets, so they're used
 * via `style={{ … }}` rather than Tailwind classes (arbitrary-value classes
 * can't be composed from a constant — Tailwind scans literal text).
 */

/** Bottom of the header (search pill row) — where the top-right rail starts. */
export const UNDER_HEADER = 'calc(4.25rem + env(safe-area-inset-top))'

/** Top of FranceMap's zoom/theme stack: below the layers menu in the same rail. */
export const UNDER_LAYERS = 'calc(9.5rem + env(safe-area-inset-top))'

/**
 * Height reserved at the bottom for the pinned timeline strip. Everything that
 * sits above the strip (detail sheet, national snippet) starts here.
 */
export const ABOVE_STRIP = 'calc(5.75rem + env(safe-area-inset-bottom))'

/**
 * Transform that fully hides a panel anchored at `bottom: ABOVE_STRIP`.
 * `translateY(100%)` alone only moves it down by its own height, leaving the
 * bottom offset's worth still on screen — the offset has to be added.
 */
export const HIDE_BELOW_STRIP = 'translateY(calc(100% + 5.75rem + env(safe-area-inset-bottom)))'
