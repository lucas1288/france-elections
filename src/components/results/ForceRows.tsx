import type { Palette } from '../../types/election'
import { getCandidateColor } from '../../utils/partyColors'
import {
  bucketCounts,
  type NationalSummaryModel,
  type NationalViewMode,
} from '../../utils/nationalSummary'

/**
 * `compact` = desktop sidebar (pointer, tighter rows, no nuance code shown).
 * `touch`   = mobile sheet (larger hit target, nuance code shown, :active feedback).
 * These are the only real differences between the two surfaces' rows.
 */
export type RowDensity = 'compact' | 'touch'

interface Props {
  model: NationalSummaryModel
  mode: NationalViewMode
  palette: Palette | null
  density: RowDensity
  /** Currently selected force (the single-force map view), or null. */
  activeParty: string | null
  onPick: (party: string) => void
}

function fmtPct(n: number) {
  return n.toFixed(1).replace('.', ',')
}
function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * The national result rows — each one a MAP CONTROL: clicking a force colours
 * the choropleth by its score-vs-national ratio, clicking the active one returns
 * to the winner view. Shows vote share, or the per-force circo buckets
 * (seats won | en tête | 2e) as a stacked tri-opacity bar.
 *
 * Shared by the desktop `NationalSummary` and the mobile `AffichageSheet`, which
 * previously carried two copies of this markup and its bucket arithmetic.
 */
export function ForceRows({ model, mode, palette, density, activeParty, onPick }: Props) {
  const touch = density === 'touch'
  const showCircos = mode === 'circos' && !!model.circoCounts

  return (
    <>
      {model.order(mode).map((c, i) => {
        const color = getCandidateColor(c.name, i, c.party, palette)
        const active = activeParty === c.party
        const b = model.buckets(c.name)
        return (
          <button
            key={c.name}
            type="button"
            onClick={() => onPick(c.party)}
            className={`w-full rounded-lg px-2 text-left transition-colors ${
              touch ? 'py-2' : 'py-1.5'
            } ${
              active
                ? 'bg-blue-50 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:ring-blue-800'
                : touch
                  ? 'active:bg-gray-100 dark:active:bg-slate-800'
                  : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <div
              className={
                touch ? 'flex items-center gap-2.5' : 'flex items-center justify-between mb-0.5'
              }
            >
              {touch ? (
                <>
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                    {c.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {c.party}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {c.name}
                  </span>
                </div>
              )}
              <span
                className={`text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0 ${
                  touch ? 'text-right' : 'ml-2'
                }`}
              >
                {showCircos
                  ? bucketCounts(b, model.hasSeats, model.showLeadBucket, fmtInt)
                  : `${fmtPct(c.percentage)}%`}
              </span>
            </div>
            {showCircos ? (
              /* Stacked circo bar — seats won (full colour), leading but not yet
                 won (medium), arrived 2nd (faint), scaled to all circos */
              <div
                className={`flex w-full h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800 ${
                  touch ? 'mt-1' : ''
                }`}
              >
                {b.won > 0 && (
                  <div
                    className="h-full"
                    style={{ width: `${model.pctOfCircos(b.won)}%`, background: color }}
                  />
                )}
                {b.lead1st > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${model.pctOfCircos(b.lead1st)}%`,
                      background: color,
                      opacity: 0.55,
                    }}
                  />
                )}
                {b.second > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${model.pctOfCircos(b.second)}%`,
                      background: color,
                      opacity: 0.25,
                    }}
                  />
                )}
              </div>
            ) : (
              <div
                className={`w-full bg-gray-100 dark:bg-slate-800 rounded-full h-1.5 ${touch ? 'mt-1' : ''}`}
              >
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${c.percentage}%`, background: color }}
                />
              </div>
            )}
          </button>
        )
      })}
    </>
  )
}
