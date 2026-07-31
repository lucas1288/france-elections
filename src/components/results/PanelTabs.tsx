import type { PanelTab, PanelTabId } from '../../utils/panelTabs'
import type { RowDensity } from './ForceRows'

interface Props {
  tabs: PanelTab[]
  active: PanelTabId
  onChange: (id: PanelTabId) => void
  density: RowDensity
}

/**
 * The results panel's tab bar. Renders nothing for a single tab — a lone tab is
 * chrome that says nothing, and plain commune/circo selections legitimately
 * have only "Résultats".
 *
 * Underline style rather than the segmented-pill look used by the granularity
 * switcher and the Pourcentages/Sièges switch: those SET something on the map,
 * this only changes which part of the panel you're reading, and giving them the
 * same visual weight made the panel read as two competing control rows.
 */
export function PanelTabs({ tabs, active, onChange, density }: Props) {
  if (tabs.length < 2) return null
  const touch = density === 'touch'

  return (
    // Sticky: the Territoires tab can run long (Paris = 18 circos + 20
    // arrondissements), and losing the tabs on scroll strands you in a list
    // with no way back to the results without scrolling all the way up.
    <div
      role="tablist"
      className={`sticky top-0 z-10 flex gap-1 border-b border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${
        touch ? 'px-4' : 'px-3'
      }`}
    >
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 font-medium transition-colors ${
              touch ? 'px-3 py-2.5 text-sm' : 'px-2.5 py-2 text-xs'
            } ${
              isActive
                ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
                : `border-transparent text-gray-500 dark:text-gray-400 ${
                    touch ? 'active:text-gray-800' : 'hover:text-gray-800 dark:hover:text-gray-200'
                  }`
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
