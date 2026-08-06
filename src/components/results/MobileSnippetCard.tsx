import { useEffect, useRef, type ReactNode } from 'react'
import { ABOVE_STRIP, SNIPPET_H_VAR } from '../../utils/mobileChrome'

/**
 * The mobile overview snippet — the card that floats above the timeline strip
 * and opens a full sheet when tapped.
 *
 * ONE implementation for both surfaces (`AffichageSheet`'s national results and
 * `HemicycleSheet`'s seat split). They were byte-equivalent copies of the same
 * markup, which is the drift the R2 unification exists to prevent: the M2
 * compaction below would otherwise have had to be done — and kept in step —
 * twice.
 *
 * M2 (Aug 3 2026, lucas: "we need to make it more compact… the numbers about
 * Participation do not need to be that big"). The card went 278px → ~180px on a
 * 375×812 phone. What was cut, and why it's safe: the oversized turnout figure
 * dropped from `text-2xl` to `text-sm`, the inscrits count and the standalone
 * Blancs/Nuls line collapsed into one secondary line, and the uppercase section
 * labels went entirely — every one of those is still in the full sheet, one tap
 * away, which is the whole point of a snippet.
 */

export interface SnippetRow {
  key: string
  label: string
  /** Nuance / party code shown small before the value. */
  party?: string
  /** Formatted figure — "27,8%" or "178 sièges". */
  value: string
  /** Bar fill, 0–100. */
  pct: number
  color: string
}

interface Props {
  title: string
  /** Compact secondary block: one line, optionally its own thin bar. */
  meta?: ReactNode
  rows: SnippetRow[]
  /** Widen when values are long ("178 sièges") so the column still aligns. */
  valueWidth?: string
  ariaLabel: string
  onOpen: () => void
}

export function MobileSnippetCard({
  title,
  meta,
  rows,
  valueWidth = 'w-12',
  ariaLabel,
  onOpen,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  // Publish the card's height as a CSS variable so surfaces stacked ABOVE it
  // (the mobile overseas rows, M4) can clear it without importing its layout.
  // Measured rather than hard-coded: the row count is stable today but the
  // height is a rendering outcome, and a stale constant here would silently
  // overlap the two.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const publish = () => root.style.setProperty(SNIPPET_H_VAR, `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty(SNIPPET_H_VAR)
    }
  }, [])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={ariaLabel}
      style={{ bottom: ABOVE_STRIP }}
      className="absolute inset-x-4 z-20 rounded-2xl bg-white/95 px-4 py-2.5 text-left shadow-lg ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-900/95 dark:ring-white/10"
    >
      {title && (
        <p className="truncate text-sm font-bold text-gray-900 dark:text-gray-100">{title}</p>
      )}

      {meta && <div className="mt-1.5">{meta}</div>}

      <div className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                {r.label}
              </span>
              {r.party && (
                <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">{r.party}</span>
              )}
              <span
                className={`${valueWidth} shrink-0 text-right text-sm font-semibold text-gray-900 dark:text-gray-100`}
              >
                {r.value}
              </span>
            </div>
            <div className="mt-0.5 h-1 w-full rounded-full bg-gray-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${r.pct}%`, background: r.color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-end gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
        <span>Détails</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </button>
  )
}
