import { useEffect, useRef, useState } from 'react'
import type { Granularity } from '../store/electionStore'

/**
 * The découpage control (redesign R3). lucas: "it might not sit in a toggle,
 * because there might be other views at some point (regions, cantons)" — so
 * this is a LAYERS BUTTON opening a menu, not a segmented switch that would
 * have to grow a new segment per level.
 *
 * The button carries the stacked-sheets glyph with the CURRENT level's name
 * under it, so the active découpage stays readable without opening anything —
 * that was the one thing the old segmented toggle did well.
 *
 * Hémicycle sits below a divider under its own heading: it is not a découpage
 * (it drops geography entirely), it's another representation of the same
 * result. It remains a `granularity` value in the store for now — moving it out
 * of that field touches the panel's circo-resolution path and is its own change.
 */

interface Level {
  id: Granularity
  label: string
  hint: string
}

const DECOUPAGES: Level[] = [
  { id: 'commune', label: 'Communes', hint: '~35 000 communes' },
  { id: 'circonscription', label: 'Circonscriptions', hint: '577 circonscriptions législatives' },
]

/** Levels we intend to support but have no geometry/data for yet. */
const UPCOMING = ['Régions', 'Cantons']

const SHORT: Record<Granularity, string> = {
  commune: 'Communes',
  circonscription: 'Circos',
  hemicycle: 'Hémicycle',
}

interface Props {
  value: Granularity
  onChange: (g: Granularity) => void
  available: Granularity[]
  /** Positioning classes — the caller places this on the map. */
  className?: string
  /** Positioning that can't be a Tailwind class (e.g. a shared calc() offset). */
  style?: React.CSSProperties
  /**
   * Where the popover opens, relative to the button. Desktop sits bottom-left of
   * the map so the menu goes up-and-right; mobile sits top-right, where that
   * direction would run straight off the screen edge.
   */
  placement?: 'right-up' | 'left-down'
}

const MENU_POSITION: Record<NonNullable<Props['placement']>, string> = {
  'right-up': 'bottom-0 left-full ml-2',
  'left-down': 'right-0 top-full mt-2',
}

export function LayersMenu({
  value,
  onChange,
  available,
  className = '',
  style,
  placement = 'right-up',
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape, and return focus to the button on Escape
  // so keyboard users aren't dropped at the top of the document.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        rootRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Move focus into the menu when it opens (first enabled item).
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
  }, [open])

  /** ↑/↓ roving focus between the menu's enabled items. */
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    )
    if (!items.length) return
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next].focus()
  }

  const pick = (g: Granularity) => {
    onChange(g)
    setOpen(false)
  }

  const row = (id: Granularity, label: string, hint: string) => {
    const ok = available.includes(id)
    const active = value === id
    return (
      <button
        key={id}
        type="button"
        role="menuitemradio"
        aria-checked={active}
        disabled={!ok}
        onClick={() => pick(id)}
        className={`flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
          !ok
            ? 'cursor-not-allowed opacity-40'
            : active
              ? 'bg-blue-50 dark:bg-blue-500/10'
              : 'hover:bg-gray-100 dark:hover:bg-slate-800'
        }`}
      >
        <span
          className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ring-1 ${
            active
              ? 'bg-blue-600 ring-blue-600'
              : 'bg-transparent ring-gray-300 dark:ring-slate-600'
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0">
          <span
            className={`block text-sm leading-tight ${
              active
                ? 'font-semibold text-blue-700 dark:text-blue-300'
                : 'font-medium text-gray-800 dark:text-gray-200'
            }`}
          >
            {label}
          </span>
          <span className="block text-[11px] leading-tight text-gray-400 dark:text-gray-500">
            {ok ? hint : 'Données non disponibles'}
          </span>
        </span>
      </button>
    )
  }

  // Two wrappers on purpose: the OUTER one takes the caller's positioning
  // (`absolute bottom-4 left-4`…), the INNER one anchors the popover. Merging
  // them would put `relative` and `absolute` on the same element, and Tailwind's
  // source order silently makes `relative` win — which drops the caller's
  // offsets and lets the button fall out of the layout entirely.
  return (
    <div ref={rootRef} className={className} style={style}>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Découpage : ${SHORT[value]}. Changer de découpage`}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-[5.5rem] flex-col items-center gap-1 rounded-xl bg-white/90 px-2 py-2 shadow-lg ring-1 backdrop-blur-sm transition-colors hover:bg-white dark:bg-slate-900/90 dark:hover:bg-slate-900 ${
            open ? 'ring-blue-500 dark:ring-blue-400' : 'ring-black/5 dark:ring-white/10'
          }`}
        >
          <LayersIcon />
          <span className="w-full truncate text-center text-[11px] font-medium leading-none text-gray-600 dark:text-gray-300">
            {SHORT[value]}
          </span>
        </button>

        {open && (
          <div
            ref={menuRef}
            role="menu"
            aria-label="Découpage"
            onKeyDown={onMenuKeyDown}
            className={`absolute z-10 w-64 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10 ${MENU_POSITION[placement]}`}
          >
            <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Découpage
            </p>
            {DECOUPAGES.map((l) => row(l.id, l.label, l.hint))}
            {UPCOMING.map((label) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 opacity-40"
                aria-hidden="true"
              >
                <span className="h-2 w-2 shrink-0 rounded-full ring-1 ring-gray-300 dark:ring-slate-600" />
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {label}
                </span>
                <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  à venir
                </span>
              </div>
            ))}

            {available.includes('hemicycle') && (
              <>
                <div className="my-1 h-px bg-gray-100 dark:bg-slate-800" />
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  Autre représentation
                </p>
                {row('hemicycle', 'Hémicycle', "Les 577 sièges de l'Assemblée")}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Stacked sheets — the conventional "layers" glyph. */
function LayersIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-gray-700 dark:text-gray-200"
      aria-hidden="true"
    >
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
      <path d="M3 17.5l9 5 9-5" />
    </svg>
  )
}
