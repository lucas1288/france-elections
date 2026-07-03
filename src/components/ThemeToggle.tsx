import { useElectionStore } from '../store/electionStore'
import type { Theme } from '../store/electionStore'

/** Tap order: follow the OS → force dark → force light → back to OS. */
const NEXT: Record<Theme, Theme> = { system: 'dark', dark: 'light', light: 'system' }

const LABEL: Record<Theme, string> = {
  system: 'Thème : automatique (suit le système)',
  dark: 'Thème : sombre',
  light: 'Thème : clair',
}

/**
 * Theme cycle button (shared desktop/mobile — only the wrapper styles differ via
 * className). Shows the CURRENT mode's icon: half-circle = system, moon = dark,
 * sun = light. Chrome colors come from Tailwind `dark:` variants; the map and
 * D3 surfaces read the resolved `isDark` from the store.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useElectionStore((s) => s.theme)
  const setTheme = useElectionStore((s) => s.setTheme)

  return (
    <button
      type="button"
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      onClick={() => setTheme(NEXT[theme])}
      className={className}
    >
      {theme === 'system' ? <AutoIcon /> : theme === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

/** Half-filled circle — "follows the system". */
function AutoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  )
}
