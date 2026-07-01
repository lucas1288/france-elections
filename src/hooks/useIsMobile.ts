import { useEffect, useState } from 'react'

/** Tailwind `md` breakpoint: below 768px we render the mobile-first layout. */
const QUERY = '(max-width: 767px)'

/** True on phone-width viewports; updates live on resize / orientation change. */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  )

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
