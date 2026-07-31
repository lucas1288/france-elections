import type { NationalSummaryModel, NationalViewMode } from '../../utils/nationalSummary'
import type { RowDensity } from './ForceRows'

interface Props {
  model: NationalSummaryModel
  mode: NationalViewMode
  onChange: (mode: NationalViewMode) => void
  density: RowDensity
}

function fmtInt(n: number) {
  return n.toLocaleString('fr-FR')
}

/**
 * Pourcentages ↔ Sièges/Circonscriptions switch, plus the legend naming the
 * buckets in play. The second label and the legend adapt to the election:
 * presidentials have no seats ("Circonscriptions", two buckets), and at
 * legislative T2 every lead is already a win so "en tête" is dropped.
 *
 * Hidden by the caller when there is no circo data to switch to.
 */
export function ViewModeSwitch({ model, mode, onChange, density }: Props) {
  const touch = density === 'touch'
  return (
    <div className={touch ? 'px-2 pb-1 pt-1.5' : 'px-2 pb-1 pt-1'}>
      <div
        className={`flex w-full rounded-lg bg-gray-100 p-0.5 dark:bg-slate-800 ${
          touch ? 'text-sm' : 'text-xs'
        }`}
      >
        {(
          [
            ['pct', 'Pourcentages'],
            ['circos', model.circoSwitchLabel],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`flex-1 rounded-md px-2 font-medium transition-colors ${
              touch ? 'py-1.5' : 'py-1'
            } ${
              mode === m
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-600 dark:text-gray-100'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'circos' && model.circoCounts && (
        <p
          className={`text-gray-400 dark:text-gray-500 ${
            touch ? 'mt-1.5 text-xs' : 'mt-1 text-[11px]'
          }`}
        >
          Sur {fmtInt(model.circoCounts.total)} circonscriptions — {model.bucketLegend}
        </p>
      )}
    </div>
  )
}
