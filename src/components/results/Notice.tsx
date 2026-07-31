import type { RowDensity } from './ForceRows'

interface Props {
  density: RowDensity
  children: React.ReactNode
}

/**
 * Amber advisory band used for the three "these aren't the numbers you'd
 * expect" cases: no commune file for this round, overseas commune falling back
 * to its département, and ballots annulled by the Conseil constitutionnel.
 *
 * The container styling is shared (it was drifting); the wording stays at the
 * call site because the two platforms deliberately phrase these differently —
 * the sidebar spells the ministry out, the sheet abbreviates for width.
 */
export function Notice({ density, children }: Props) {
  return (
    <div
      className={
        density === 'touch'
          ? 'mx-4 mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/50 px-3 py-2'
          : 'px-4 py-2.5 bg-amber-50 dark:bg-amber-950/50 border-b border-amber-100'
      }
    >
      <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">{children}</p>
    </div>
  )
}
