interface Props {
  turnout: number
  registeredVoters: number
  turnoutPct: number
  blankPct: number
  nullPct: number
}

function fmt(n: number) {
  return n.toFixed(1).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * Turnout block for a selected territory: headline percentage, the raw
 * voted/registered pair, the blue bar, and the blancs/nuls line.
 *
 * Identical on both platforms; the callers own the container because their
 * paddings and borders differ (sidebar section vs sheet band).
 */
export function Participation({ turnout, registeredVoters, turnoutPct, blankPct, nullPct }: Props) {
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        Participation
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {fmt(turnoutPct)}%
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ({fmtInt(turnout)} / {fmtInt(registeredVoters)} inscrits)
        </span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${turnoutPct}%` }} />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Blancs&nbsp;: {fmt(blankPct)}% — Nuls&nbsp;: {fmt(nullPct)}%
      </p>
    </>
  )
}
