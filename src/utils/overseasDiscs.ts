import { useEffect, useMemo, useState } from 'react'
import type { CommuneResult, Palette, RoundData } from '../types/election'
import type { ChoroplethData } from '../hooks/useElectionData'
import { useElectionStore } from '../store/electionStore'
import { computeNationalTotals } from './nationalResults'
import { getCandidateColor, partyByName } from './partyColors'
import { territoryColor, partyCodeSet } from './territoryColor'
import { abstentionShade, decidedAtR1Shade } from './gradient'
import { ELIMINATED_LIGHT, ELIMINATED_DARK, type SeatContext } from './partySeats'
import { dataUrl } from './dataUrl'
import { ALL_SLOT_CODES } from './orbitGeometry'
import type { GeoFeature, SilhouettePart } from '../components/overseas/discParts'

/**
 * The colour model behind every overseas disc, in one place.
 *
 * Three surfaces draw these discs now — the desktop orbit, the phone's aggregate
 * button and the phone's overlay ring (M6) — and all three have to agree with the
 * map, which means running every colour through the same mode-aware path
 * (`territoryColor`) rather than re-deriving it per surface.
 *
 * Split in two on purpose: `useOverseasDiscs` needs no geometry at all, while
 * `useOverseasShapes` fetches two GeoJSON files. The phone's button is pure
 * colour — a globe glyph and a ring — so it must not pay for shapes it never
 * draws; only the overlay and the desktop orbit mount the second hook.
 */

export const ABROAD = '99'

export type CircoEntry = ChoroplethData['communes'][number]

export interface OverseasDiscs {
  /** Per-territory aggregate colour, mode-aware. */
  fillByCode: Map<string, string>
  /** Territories the selected force leads (party view) — highlighted ring. */
  wonByCode: Set<string>
  circosByTerritory: Map<string, CircoEntry[]>
  circoNames: Map<string, string>
  circoColor: (c: CircoEntry) => string
  /** Ring segments for one territory: one arc per circonscription. */
  segmentsFor: (code: string) => string[]
  /**
   * The eleven territories taken together — colour and an 11-arc ring, one arc
   * per TERRITORY. This is what the phone's single button stands for: lucas
   * asked that its shares "reflect the 10 overseas territories and the one
   * french abroad political color", so the button pre-displays the balance it
   * replaces instead of just hiding it.
   */
  aggregate: { color: string; segments: string[]; entry: CommuneResult | null }
  /** The surface's no-data fill for the active theme. */
  neutral: string
  isCirco: boolean
}

interface Args {
  electionData: RoundData | undefined
  circoChoro: ChoroplethData | null
  circoData: RoundData | null
  /** Full per-territory data for the active granularity — feeds the gradient. */
  fullData: RoundData | null
  palette: Palette | null
}

export function useOverseasDiscs({
  electionData,
  circoChoro,
  circoData,
  fullData,
  palette,
}: Args): OverseasDiscs {
  const granularity = useElectionStore((s) => s.granularity)
  const colorMode = useElectionStore((s) => s.colorMode)
  const isDark = useElectionStore((s) => s.isDark)
  const selected = useElectionStore((s) => s.selected)

  const neutral = isDark ? '#334155' : '#e2e8f0'
  const isCirco = granularity === 'circonscription'

  // C1: the ring's per-circo segments read as SEATS on the circo tab of a
  // legislative, matching the map. Only `circoColor` takes it — the disc fill
  // and the aggregate button are département-level sums, which have no seat.
  const seats: SeatContext | undefined =
    isCirco && selected.type === 'legislative'
      ? {
          round: selected.round,
          eliminated: isDark ? ELIMINATED_DARK : ELIMINATED_LIGHT,
          absent: neutral,
        }
      : undefined

  const national = useMemo(
    () => (electionData ? computeNationalTotals(electionData) : null),
    [electionData],
  )

  const fillByCode = useMemo(() => {
    const m = new Map<string, string>()
    if (!electionData || !national) return m
    for (const c of electionData.communes) {
      m.set(c.inseeCode, territoryColor(c, colorMode, palette, national, undefined, neutral))
    }
    return m
  }, [electionData, national, palette, colorMode, neutral])

  const wonByCode = useMemo(() => {
    const s = new Set<string>()
    if (!electionData || colorMode.kind !== 'party') return s
    const parties = partyByName(electionData.candidates)
    const codes = partyCodeSet(colorMode.party, palette)
    for (const c of electionData.communes) {
      if (codes.has(parties.get(c.leadingCandidate) ?? '')) s.add(c.inseeCode)
    }
    return s
  }, [electionData, palette, colorMode])

  /**
   * Circonscriptions grouped under their territory. Code shapes make this
   * unambiguous: métropole is a 2-char dept + 2 digits (`3401`, `2A01`), the
   * overseas ones are a 3-char dept + 2 digits (`97401`), and the abroad circos
   * are `9901`–`9911`. So length 5 ⇒ overseas, and 4-with-`99` ⇒ abroad.
   */
  const circosByTerritory = useMemo(() => {
    const m = new Map<string, CircoEntry[]>()
    for (const code of ALL_SLOT_CODES) m.set(code, [])
    for (const c of circoChoro?.communes ?? []) {
      const code = c.inseeCode
      if (code.length === 4 && code.startsWith(ABROAD)) m.get(ABROAD)?.push(c)
      else if (code.length === 5) m.get(code.slice(0, 3))?.push(c)
    }
    for (const list of m.values()) list.sort((a, b) => a.inseeCode.localeCompare(b.inseeCode))
    return m
  }, [circoChoro])

  const circoNames = useMemo(
    () => new Map((circoData?.communes ?? []).map((c) => [c.inseeCode, c.name])),
    [circoData],
  )
  const fullByCode = useMemo(
    () => new Map((fullData?.communes ?? []).map((e) => [e.inseeCode, e])),
    [fullData],
  )
  const circoParties = useMemo(
    () => partyByName(circoChoro?.candidates ?? electionData?.candidates ?? []),
    [circoChoro, electionData],
  )

  /** Palette key order is authored left→right, same basis the hemicycle uses. */
  const spectrum = useMemo(() => (palette?.parties ? Object.keys(palette.parties) : []), [palette])
  const spIdx = (party?: string) => {
    const i = party ? spectrum.indexOf(party) : -1
    return i < 0 ? spectrum.length : i
  }

  /** Colour for one circo, mirroring the map's mode handling. */
  const circoColor = (c: CircoEntry) => {
    if (colorMode.kind === 'leader') {
      const color = getCandidateColor(
        c.leadingCandidate,
        0,
        circoParties.get(c.leadingCandidate),
        palette,
      )
      return c.decidedAtR1 ? decidedAtR1Shade(color, neutral) : color
    }
    if (colorMode.kind === 'abstention')
      return c.abstention != null ? abstentionShade(c.abstention) : neutral
    const entry = fullByCode.get(c.inseeCode)
    return entry
      ? territoryColor(entry, colorMode, palette, national, undefined, neutral, seats)
      : neutral
  }

  /**
   * CIRCO TAB ONLY (backlog B4, lucas: "on Communes view → do not show the
   * different circonscription colors on the circle"). The découpage the user
   * picked is the unit everything else on screen is drawn in, so a ring split by
   * a different one contradicts the map next to it.
   */
  const segmentsFor = (code: string): string[] => {
    const list = isCirco ? (circosByTerritory.get(code) ?? []) : []
    if (!list.length) return [fillByCode.get(code) ?? neutral]
    return [...list]
      .sort(
        (a, b) =>
          spIdx(circoParties.get(a.leadingCandidate)) -
            spIdx(circoParties.get(b.leadingCandidate)) || a.inseeCode.localeCompare(b.inseeCode),
      )
      .map(circoColor)
  }

  /** Palette colours in authored (left→right) order — the aggregate sort key. */
  const spectrumColors = useMemo(
    () => (palette?.parties ? Object.values(palette.parties).map((p) => p.color) : []),
    [palette],
  )

  /**
   * The eleven-territory aggregate. Its figures are a real sum — the ten
   * overseas départements/collectivités plus the Français de l'étranger entry,
   * every one of which has a full dept-level row — so it goes through
   * `territoryColor` like any other territory and is therefore correct in all
   * three colour modes, not just leader.
   *
   * The ring's arcs are sorted by palette spectrum, the same rule the per-circo
   * rings use: identical colours contiguous, so eleven arcs read as "seven of
   * these, four of those" rather than as a barcode. Sorting is by the COLOUR's
   * position in the authored palette, since that is all a hex string carries
   * here; equal colours compare equal and stay adjacent either way.
   */
  const aggregate = useMemo(() => {
    const rank = (c: string) => {
      const i = spectrumColors.indexOf(c)
      return i < 0 ? spectrumColors.length : i
    }
    const segments = ALL_SLOT_CODES.map((code) => fillByCode.get(code) ?? neutral).sort(
      (a, b) => rank(a) - rank(b),
    )
    const codes = new Set<string>(ALL_SLOT_CODES)
    const subset = (electionData?.communes ?? []).filter((c) => codes.has(c.inseeCode))
    if (!electionData || !subset.length || !national) {
      return { color: neutral, segments, entry: null }
    }

    const t = computeNationalTotals({ ...electionData, communes: subset })
    const entry: CommuneResult = {
      inseeCode: 'om',
      name: "Outre-mer et Français de l'étranger",
      registeredVoters: t.registeredVoters,
      turnout: t.turnout,
      blankVotes: t.blankVotes,
      nullVotes: t.nullVotes,
      expressedVotes: t.expressedVotes,
      leadingCandidate: t.candidates[0]?.name ?? '',
      candidates: t.candidates.map((c) => ({
        name: c.name,
        party: c.party,
        votes: c.votes,
        percentage: c.percentage,
      })),
    }
    return {
      color: territoryColor(entry, colorMode, palette, national, undefined, neutral),
      segments,
      entry,
    }
  }, [electionData, fillByCode, national, colorMode, palette, neutral, spectrumColors])

  return {
    fillByCode,
    wonByCode,
    circosByTerritory,
    circoNames,
    circoColor,
    segmentsFor,
    aggregate,
    neutral,
    isCirco,
  }
}

/**
 * Settling one overseas territory, shared by every surface that offers them.
 *
 * `settleDept`, not `setFocusedTerritory`: every overseas territory — including
 * the collectivités (St-Pierre, St-Martin, Wallis, Polynésie, Nouvelle-Calédonie)
 * — has a full DÉPARTEMENT-level entry in the data, so the results panel resolves
 * it directly. Français de l'étranger's equivalent is the '99' aggregate, which
 * isn't a real dept to fly to.
 */
export function useSelectOverseas() {
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const settleDept = useElectionStore((s) => s.settleDept)
  return (code: string) => {
    if (code === ABROAD) setClickedCommune(ABROAD)
    else settleDept(code)
  }
}

/**
 * The two GeoJSON files the silhouettes need. Only mounted by surfaces that
 * actually draw a territory's shape — the phone's button is a globe and a ring,
 * so it never pays for these.
 */
export function useOverseasShapes() {
  const [features, setFeatures] = useState<Map<string, GeoFeature>>(new Map())
  const [circoShapes, setCircoShapes] = useState<Map<string, GeoFeature>>(new Map())

  // One silhouette per territory — the source the retired insets column used.
  useEffect(() => {
    fetch(dataUrl('/data/geo/overseas.geojson'))
      .then((r) => r.json())
      .then((fc) => {
        const m = new Map<string, GeoFeature>()
        for (const f of fc.features) m.set(f.properties.code, f)
        setFeatures(m)
      })
      .catch(console.error)
  }, [])

  // Per-CIRCO outlines (scripts/build-overseas-circo-shapes.mjs) so a territory
  // can be split by circo rather than painted one winner's colour. DOM only —
  // the COM circos have no polygons in the tileset, so Polynésie and
  // Nouvelle-Calédonie fall back to the whole-territory shape.
  useEffect(() => {
    fetch(dataUrl('/data/geo/overseas-circos.geojson'))
      .then((r) => (r.ok ? r.json() : null))
      .then((fc) => {
        if (!fc) return
        const m = new Map<string, GeoFeature>()
        for (const f of fc.features) m.set(f.properties.code, f)
        setCircoShapes(m)
      })
      .catch(() => {
        /* optional enrichment — the dept outline still renders without it */
      })
  }, [])

  return { features, circoShapes }
}

/**
 * What to draw inside each disc: one path per CIRCO when we have per-circo
 * geometry AND the territory has more than one, otherwise the single
 * whole-territory outline. Split on the CIRCO TAB ONLY, same rule as the ring.
 */
export function useSilhouettes(
  discs: OverseasDiscs,
  shapes: { features: Map<string, GeoFeature>; circoShapes: Map<string, GeoFeature> },
) {
  const { circosByTerritory, circoColor, fillByCode, neutral, isCirco } = discs
  const { features, circoShapes } = shapes
  return useMemo(() => {
    const m = new Map<string, SilhouettePart[]>()
    for (const code of ALL_SLOT_CODES) {
      const circos = isCirco ? (circosByTerritory.get(code) ?? []) : []
      if (circos.length > 1) {
        const parts = circos
          .map((c) => ({ feature: circoShapes.get(c.inseeCode), color: circoColor(c) }))
          .filter((p): p is SilhouettePart => !!p.feature)
        // All-or-nothing: a partial split would silently misrepresent the
        // territory as smaller than it is.
        if (parts.length === circos.length) {
          m.set(code, parts)
          continue
        }
      }
      const whole = features.get(code)
      if (whole) m.set(code, [{ feature: whole, color: fillByCode.get(code) ?? neutral }])
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circosByTerritory, circoShapes, features, fillByCode, neutral, isCirco])
}
