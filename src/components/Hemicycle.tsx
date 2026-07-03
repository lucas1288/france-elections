import { useMemo, useState } from 'react'
import type { Palette, RoundData } from '../types/election'
import { useElectionStore } from '../store/electionStore'
import { getCandidateColor } from '../utils/partyColors'

interface Props {
  circoData: RoundData | null
  palette: Palette | null
  round: number
}

const VBW = 840
const VBH = 460
const EMPTY = '#cbd5e1' // greyed-out (unattributed) seat

interface Seat {
  code: string
  circoName: string
  arrangeParty: string
  mp: { name: string; party: string; percentage: number } | null // elected MP (null = not yet decided)
  sx: number
  sy: number
}

// Hemicycle seat coordinates (normalised), ordered left → right across all rows.
function seatLayout(n: number): Array<{ x: number; y: number }> {
  const rows = Math.max(3, Math.round(Math.sqrt(n / 2.6)))
  const innerFrac = 0.38
  const radii = Array.from({ length: rows }, (_, r) => innerFrac + (1 - innerFrac) * (r / (rows - 1)))
  const total = radii.reduce((a, b) => a + b, 0)

  const exact = radii.map((rad) => (n * rad) / total)
  const counts = exact.map(Math.floor)
  let rem = n - counts.reduce((a, b) => a + b, 0)
  // Hand out the rounding remainder to the rows with the largest fractional part.
  const byFrac = exact.map((e, i) => ({ i, f: e - Math.floor(e) })).sort((a, b) => b.f - a.f)
  for (let k = 0; rem > 0; k++, rem--) counts[byFrac[k % rows].i]++

  const pts: Array<{ x: number; y: number; ang: number }> = []
  radii.forEach((rad, r) => {
    const c = counts[r]
    for (let i = 0; i < c; i++) {
      const t = c === 1 ? 0.5 : i / (c - 1)
      const ang = Math.PI * (1 - t) // π (left) → 0 (right)
      pts.push({ x: rad * Math.cos(ang), y: rad * Math.sin(ang), ang })
    }
  })
  pts.sort((a, b) => b.ang - a.ang) // left → right
  return pts
}

export function Hemicycle({ circoData, palette, round }: Props) {
  const { clickedCommune, setClickedCommune } = useElectionStore()
  const isDark = useElectionStore((s) => s.isDark)
  const [hovered, setHovered] = useState<number | null>(null)

  const seats = useMemo<Seat[]>(() => {
    if (!circoData) return []
    const spectrum = palette?.parties ? Object.keys(palette.parties) : []
    const spIdx = (p: string) => {
      const i = spectrum.indexOf(p)
      return i < 0 ? spectrum.length : i
    }
    // One seat per circo; arranged by the leading candidate's nuance (spectrum order).
    const rows = circoData.communes.map((circo) => {
      const cands = circo.candidates
      const winner = cands.find((c) => c.elected) ?? null
      return {
        code: circo.inseeCode,
        circoName: circo.name,
        arrangeParty: cands[0]?.party ?? 'ZZZ',
        mp: winner ? { name: winner.name, party: winner.party, percentage: winner.percentage } : null,
      }
    })
    rows.sort((a, b) => spIdx(a.arrangeParty) - spIdx(b.arrangeParty) || a.code.localeCompare(b.code))

    const pos = seatLayout(rows.length)
    return rows.map((s, i) => ({
      ...s,
      sx: VBW / 2 + pos[i].x * (VBW / 2 - 24),
      sy: VBH - 28 - pos[i].y * (VBH - 56),
    }))
  }, [circoData, palette])

  if (!circoData) {
    return (
      <div className="absolute inset-0 z-20 bg-white dark:bg-slate-900 flex items-center justify-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">Chargement de l'Assemblée…</p>
      </div>
    )
  }

  const attributed = seats.filter((s) => s.mp).length
  const hov = hovered != null ? seats[hovered] : null
  const dotR = 5.5
  const emptySeat = isDark ? '#475569' : EMPTY
  const seatRing = isDark ? '#0f172a' : '#ffffff' // blends with the panel bg

  return (
    <div className="absolute inset-0 z-20 bg-white dark:bg-slate-900 flex flex-col">
      <div className="px-6 pt-4 shrink-0">
        <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Assemblée nationale</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {round === 1
            ? `${attributed} / 577 sièges attribués au 1ᵉʳ tour`
            : `577 sièges — composition après le 2ᵈ tour`}
        </p>
      </div>

      {/* Bottom padding reserves the space the mobile seats snippet overlays, so the
          arch centres in the region ABOVE it (balanced, using the vertical space). */}
      <div className="relative flex-1 min-h-0 px-4 pb-[calc(15rem+env(safe-area-inset-bottom))] md:pb-4">
        <svg viewBox={`0 0 ${VBW} ${VBH}`} className="w-full h-full" style={{ maxHeight: '100%' }}>
          {seats.map((s, i) => {
            const color = s.mp ? getCandidateColor(s.mp.name, 0, s.mp.party, palette) : emptySeat
            const selected = clickedCommune === s.code
            return (
              <circle
                key={s.code}
                cx={s.sx}
                cy={s.sy}
                r={selected ? dotR + 2.5 : dotR}
                fill={color}
                stroke={selected ? (isDark ? '#f8fafc' : '#0f172a') : hovered === i ? (isDark ? '#cbd5e1' : '#334155') : seatRing}
                strokeWidth={selected ? 2 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                onClick={() => setClickedCommune(s.code)}
              />
            )
          })}
        </svg>

        {/* Hover tooltip — anchored to the dot via its viewBox fractional position */}
        {hov && (
          <div
            className="absolute pointer-events-none z-10 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-md px-2.5 py-1.5 text-xs"
            style={{
              left: `${(hov.sx / VBW) * 100}%`,
              top: `${(hov.sy / VBH) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))',
              minWidth: 150,
              maxWidth: 240,
            }}
          >
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{hov.circoName}</p>
            {hov.mp ? (
              <>
                <p className="text-gray-800 dark:text-gray-200 truncate">{hov.mp.name}</p>
                <p className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: getCandidateColor(hov.mp.name, 0, hov.mp.party, palette) }}
                  />
                  <span className="text-gray-600 dark:text-gray-300 truncate">
                    {palette?.parties?.[hov.mp.party]?.label ?? hov.mp.party}
                  </span>
                </p>
              </>
            ) : (
              <p className="text-gray-400 dark:text-gray-500">Siège non attribué au 1ᵉʳ tour</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
