import { useElectionStore, useIsOverview } from '../store/electionStore'

/**
 * The app's identity AND its home control, in one element (redesign R3).
 *
 * lucas's brief: "always a way home", but not as yet another floating button —
 * the wordmark *grows a back arrow* when the map is away from the overview and
 * takes you back. One element, two states, so the map's top-left corner carries
 * a single affordance instead of a title plus a "← Vue générale" button.
 *
 * "Away" is broader than a settled territory: scroll-zooming with nothing
 * selected leaves `isOverview` true, so `zoomedAway` is checked too — otherwise
 * the one case where you most want a way out wouldn't offer one.
 *
 * Going home re-fits via the store's `flyBounds: 'overview'` rather than
 * touching the map, which is what keeps this a plain chrome component (FranceMap
 * owns the camera and consumes the request).
 */
export function Wordmark({ className = '' }: { className?: string }) {
  const isOverview = useIsOverview()
  const zoomedAway = useElectionStore((s) => s.zoomedAway)
  const setClickedCommune = useElectionStore((s) => s.setClickedCommune)
  const setFocusedTerritory = useElectionStore((s) => s.setFocusedTerritory)
  const setFlyBounds = useElectionStore((s) => s.setFlyBounds)

  const away = !isOverview || zoomedAway

  const goHome = () => {
    setClickedCommune(null)
    setFocusedTerritory(null)
    setFlyBounds('overview')
  }

  return (
    <button
      type="button"
      onClick={goHome}
      disabled={!away}
      aria-label={away ? 'Revenir à la vue générale' : 'Élections France'}
      title={away ? 'Revenir à la vue générale' : undefined}
      className={`group flex items-center gap-2 rounded-xl bg-white/90 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-colors enabled:hover:bg-white disabled:cursor-default dark:bg-slate-900/90 dark:ring-white/10 dark:enabled:hover:bg-slate-900 ${className}`}
    >
      {/* The arrow occupies width only when active, so the wordmark doesn't
          shift sideways on every selection — it just gains a leading glyph. */}
      <span
        className="grid overflow-hidden text-gray-500 transition-all duration-200 group-enabled:group-hover:text-gray-900 dark:text-gray-400 dark:group-enabled:group-hover:text-gray-100"
        style={{ width: away ? 16 : 0, opacity: away ? 1 : 0 }}
        aria-hidden="true"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </span>
      <span className="text-sm font-bold leading-none text-gray-900 dark:text-gray-100">
        Élections France
      </span>
    </button>
  )
}
