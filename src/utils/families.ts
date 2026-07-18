import type { FamiliesRegistry, FamilyDef, Palette } from '../types/election'

/**
 * Political-family resolution (two-axis P3). The registry lives in
 * public/data/elections/families.json (fetched via useFamilies); each
 * election's palette maps its party/nuance codes to a family id. Family/bloc
 * colors are for CROSS-ELECTION surfaces (time-series, timeline strip) —
 * per-election views keep their own palettes.
 */

/** Family id of a party/nuance code in this election, or null when unmapped. */
export function familyIdOfParty(party: string | undefined, palette: Palette | null): string | null {
  if (!party || !palette?.parties) return null
  return palette.parties[party]?.family ?? null
}

/** Full family definition for a party/nuance code, or null. */
export function familyOfParty(
  party: string | undefined,
  palette: Palette | null,
  registry: FamiliesRegistry | null,
): (FamilyDef & { id: string }) | null {
  const id = familyIdOfParty(party, palette)
  if (!id || !registry) return null
  const def = registry.families[id]
  return def ? { id, ...def } : null
}

/** Family ids in spectrum order (left → right) — chart lanes, hemicycle order. */
export function familiesInOrder(registry: FamiliesRegistry): Array<FamilyDef & { id: string }> {
  return Object.entries(registry.families)
    .map(([id, def]) => ({ id, ...def }))
    .sort((a, b) => a.order - b.order)
}
