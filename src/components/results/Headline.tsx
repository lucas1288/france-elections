import type { CommuneResult, Palette } from '../../types/election'
import { getCandidateColor } from '../../utils/partyColors'
import type { RowDensity } from './ForceRows'

interface Props {
  commune: CommuneResult
  palette: Palette | null
  density: RowDensity
}

function fmt(n: number) {
  return n.toFixed(1).replace('.', ',')
}

/**
 * Tier 1 of the panel hierarchy: the one-glance answer to "who won here",
 * above the full candidate list.
 *
 * Two shapes, chosen from the DATA rather than the election type:
 *  - exactly two candidates → a **duel**: one split bar, both names, the margin
 *    between them. This is the présidentielle T2 treatment lucas asked for, and
 *    it falls out correctly for two-candidate legislative runoffs as well;
 *    triangulaires (3+) keep the ranked shape, which is the honest reading.
 *  - otherwise → winner + score + lead over the runner-up.
 *
 * Annulled territories have no expressed votes, so the caller skips this.
 */
export function Headline({ commune, palette, density }: Props) {
  const touch = density === 'touch'
  const sorted = [...commune.candidates].sort((a, b) => b.votes - a.votes)
  const [first, second] = sorted
  if (!first) return null

  const colorOf = (c: { name: string; party: string }, i: number) =>
    getCandidateColor(c.name, i, c.party, palette)
  const firstColor = colorOf(first, 0)

  // ── Duel: two candidates, one shared bar ──────────────────────────────────
  if (sorted.length === 2 && second) {
    const secondColor = colorOf(second, 1)
    const margin = first.percentage - second.percentage
    return (
      <div className={touch ? 'px-4 pt-3' : 'px-4 pt-3'}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p
              className={`truncate font-bold text-gray-900 dark:text-gray-100 ${touch ? 'text-base' : 'text-sm'}`}
            >
              {first.name}
            </p>
            <p
              className={`font-bold text-gray-900 dark:text-gray-100 ${touch ? 'text-2xl' : 'text-xl'}`}
            >
              {fmt(first.percentage)}%
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p
              className={`truncate text-gray-500 dark:text-gray-400 ${touch ? 'text-base' : 'text-sm'}`}
            >
              {second.name}
            </p>
            <p
              className={`font-semibold text-gray-500 dark:text-gray-400 ${touch ? 'text-2xl' : 'text-xl'}`}
            >
              {fmt(second.percentage)}%
            </p>
          </div>
        </div>
        {/* One bar shared by the two, so the gap between them IS the picture. */}
        <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
          <div style={{ width: `${first.percentage}%`, background: firstColor }} />
          <div style={{ width: `${second.percentage}%`, background: secondColor }} />
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Écart&nbsp;: {fmt(margin)} point{margin >= 2 ? 's' : ''}
        </p>
      </div>
    )
  }

  // ── Ranked: winner + lead over the runner-up ──────────────────────────────
  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: firstColor }} />
        <p
          className={`min-w-0 flex-1 truncate font-bold text-gray-900 dark:text-gray-100 ${touch ? 'text-base' : 'text-sm'}`}
        >
          {first.name}
        </p>
        <p
          className={`shrink-0 font-bold text-gray-900 dark:text-gray-100 ${touch ? 'text-2xl' : 'text-xl'}`}
        >
          {fmt(first.percentage)}%
        </p>
      </div>
      {second && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          +{fmt(first.percentage - second.percentage)} pts devant {second.name}
        </p>
      )}
    </div>
  )
}
