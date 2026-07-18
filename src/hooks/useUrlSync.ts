import { useEffect, useRef } from 'react'
import { useElectionStore } from '../store/electionStore'
import type { ColorMode, Granularity } from '../store/electionStore'
import type { ElectionRef, ElectionType } from '../types/election'
import { isDeptCode, parentDeptCode } from '../utils/deptInsight'
import { CIRCO_BBOXES, DEPT_BBOXES } from '../utils/territoryBBoxes'

/**
 * URL deep-linking (two-axis design doc, open question 5): the two settled
 * axes — election (time) and territory (geo) — plus the view tab and color
 * mode round-trip through the query string, so every app state is a shareable
 * link. `?election=leg-2024-t2&territory=34&view=circo&party=RN`
 *
 * Sync is one-way-in at load (params → store; the election waits for the
 * manifest so unknown elections are ignored rather than wedging the app) and
 * one-way-out afterwards (store → history.replaceState — no history entries,
 * the back button leaves the app, not the selection).
 */

const TYPE_SLUG: Record<ElectionType, string> = {
  presidential: 'pres',
  legislative: 'leg',
  european: 'euro',
}
const SLUG_TYPE = Object.fromEntries(
  Object.entries(TYPE_SLUG).map(([t, s]) => [s, t as ElectionType]),
)

const VIEW_SLUG: Partial<Record<Granularity, string>> = {
  circonscription: 'circo',
  hemicycle: 'hemicycle',
}
const SLUG_VIEW = Object.fromEntries(
  Object.entries(VIEW_SLUG).map(([g, s]) => [s as string, g as Granularity]),
)

interface UrlState {
  election?: { type: ElectionType; year: number; round: number }
  territory?: string
  view?: Granularity
  colorMode?: ColorMode
}

function parseUrl(search: string): UrlState {
  const p = new URLSearchParams(search)
  const out: UrlState = {}

  const el = p.get('election')?.match(/^(pres|leg|euro)-(\d{4})-t(\d)$/)
  if (el && SLUG_TYPE[el[1]]) {
    out.election = { type: SLUG_TYPE[el[1]], year: +el[2], round: +el[3] }
  }

  const territory = p.get('territory')
  if (territory && /^[0-9AB]{2,5}$/i.test(territory)) out.territory = territory.toUpperCase()

  const view = p.get('view')
  if (view && SLUG_VIEW[view]) out.view = SLUG_VIEW[view]

  const party = p.get('party')
  const mode = p.get('mode')
  if (party && /^[A-Za-z0-9-]{1,12}$/.test(party)) {
    out.colorMode = { kind: 'party', party: party.toUpperCase() }
  } else if (mode === 'abstention') {
    out.colorMode = { kind: 'abstention' }
  }
  return out
}

function serialize(): string {
  const s = useElectionStore.getState()
  const p = new URLSearchParams()
  p.set('election', `${TYPE_SLUG[s.selected.type]}-${s.selected.year}-t${s.selected.round}`)
  if (s.clickedCommune) p.set('territory', s.clickedCommune)
  const view = VIEW_SLUG[s.granularity]
  if (view) p.set('view', view)
  if (s.colorMode.kind === 'party') p.set('party', s.colorMode.party)
  if (s.colorMode.kind === 'abstention') p.set('mode', 'abstention')
  return `${window.location.pathname}?${p.toString()}`
}

/** Territory restore mirrors the navigator's selection semantics. */
function applyTerritory(code: string, view: Granularity | undefined) {
  const store = useElectionStore.getState()
  if (isDeptCode(code)) {
    store.settleDept(code)
    return
  }
  if (code === '99') {
    store.selectTerritory('99')
    return
  }
  // 4-char codes are always circos ('3401', abroad '9901'); 5-char codes are
  // ambiguous (overseas circo '97101' vs commune '34172') — the view param
  // decides, defaulting to commune.
  const isCirco = code.length === 4 || view === 'circonscription' || view === 'hemicycle'
  if (isCirco) {
    if (store.granularity === 'commune') store.setGranularity('circonscription')
    store.selectTerritory(code)
    const bbox = CIRCO_BBOXES[code]
    if (bbox) store.setFlyBounds(bbox)
  } else {
    store.setGranularity('commune')
    store.selectTerritory(code)
    const parent = parentDeptCode(code)
    if (parent && DEPT_BBOXES[parent]) store.setFlyBounds(DEPT_BBOXES[parent])
    else if (parent) store.setFocusedTerritory(parent) // overseas: ride the focus machinery
  }
}

export function useUrlSync(elections: ElectionRef[] | undefined) {
  // Parsed once; election stays pending until the manifest can validate it.
  const pendingRef = useRef<UrlState | null>(null)
  if (pendingRef.current === null) pendingRef.current = parseUrl(window.location.search)
  const appliedRef = useRef(false)

  // Mount: apply view + territory immediately (they don't need the manifest;
  // selection survives a later election switch by design).
  useEffect(() => {
    const pending = pendingRef.current
    if (!pending || appliedRef.current) return
    if (pending.view) useElectionStore.getState().setGranularity(pending.view)
    if (pending.territory) applyTerritory(pending.territory, pending.view)
    if (!pending.election && pending.colorMode) {
      useElectionStore.setState({ colorMode: pending.colorMode })
    }
  }, [])

  // Manifest arrival: validate + apply the election, then the color mode
  // (setSelected resets party mode, so order matters). Unknown elections are
  // dropped. From here on the URL is written, not read.
  useEffect(() => {
    if (!elections || appliedRef.current) return
    const pending = pendingRef.current
    const el = pending?.election
    if (el) {
      const ref = elections.find((e) => e.type === el.type && e.year === el.year)
      if (ref) {
        useElectionStore.getState().setSelected({
          type: el.type,
          year: el.year,
          round: Math.min(Math.max(el.round, 1), ref.rounds),
        })
      }
      if (pending?.colorMode) useElectionStore.setState({ colorMode: pending.colorMode })
    }
    appliedRef.current = true
    window.history.replaceState(null, '', serialize())
  }, [elections])

  // Store → URL. replaceState is cheap; one write per relevant state change.
  const selected = useElectionStore((s) => s.selected)
  const clickedCommune = useElectionStore((s) => s.clickedCommune)
  const granularity = useElectionStore((s) => s.granularity)
  const colorMode = useElectionStore((s) => s.colorMode)
  useEffect(() => {
    if (!appliedRef.current) return // don't clobber params before restore
    window.history.replaceState(null, '', serialize())
  }, [selected, clickedCommune, granularity, colorMode])
}
