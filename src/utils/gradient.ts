/**
 * Color ramps for the gradient map views.
 *
 * Party view: each territory is shaded within the party's own hue by how its
 * local score compares to the party's NATIONAL score (ratio anchoring, per the
 * agreed design) — pale when well below average, full hue at ~2× the national
 * average and above.
 *
 * Abstention view: a neutral grey ramp, light at low abstention, dark at high.
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
}

function rgbToHex(rgb: number[]): string {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** Linear blend between two hex colors. t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A.map((v, i) => v + (B[i] - v) * t))
}

const GRADIENT_FLOOR = '#ffffff'
// Lowest tint kept above zero so weak scores still read as a faint hue
// ("light pink"), not a blank near-white that vanishes against the map.
const FLOOR_T = 0.14

/**
 * Shade for a territory in single-party view. `ratio = local / national`:
 * ratio 0 → faint hue, ratio 1 (national average) → ~half hue, ratio ≥ 2 → full hue.
 */
export function partyRatioShade(localPct: number, nationalPct: number, baseColor: string): string {
  const ratio = nationalPct > 0 ? localPct / nationalPct : 0
  const t = FLOOR_T + (1 - FLOOR_T) * Math.max(0, Math.min(1, ratio / 2))
  return mixHex(GRADIENT_FLOOR, baseColor, t)
}

const ABSTENTION_LOW = '#e5e7eb'  // light grey — low abstention
const ABSTENTION_HIGH = '#111827' // near-black — high abstention
const ABSTENTION_MIN = 15
const ABSTENTION_MAX = 60

/** Grey shade for abstention view; higher abstention → darker. */
export function abstentionShade(abstentionPct: number): string {
  const t = Math.max(0, Math.min(1, (abstentionPct - ABSTENTION_MIN) / (ABSTENTION_MAX - ABSTENTION_MIN)))
  return mixHex(ABSTENTION_LOW, ABSTENTION_HIGH, t)
}
