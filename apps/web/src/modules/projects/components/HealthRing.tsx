import { useEffect, useRef, useState } from 'react'
import { HEALTH_COLORS, type HealthBand, type HealthPenalty } from '../types'

// ─── Health ring ─────────────────────────────────────────────
// An animated arc that draws in on mount and reveals the penalty breakdown on
// hover. The breakdown is the point: a score with no explanation tells an
// operator nothing they can act on.

interface Props {
  score: number
  band: HealthBand
  penalties?: HealthPenalty[]
  size?: number
  strokeWidth?: number
  showLabel?: boolean
}

export function HealthRing({
  score, band, penalties = [], size = 56, strokeWidth = 5, showLabel = true,
}: Props) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const [drawn, setDrawn] = useState(0)
  const [shown, setShown] = useState(0)
  const [open, setOpen] = useState(false)
  const frame = useRef<number>()

  // Draw the arc and count the number up together, so they finish in step.
  useEffect(() => {
    const start = performance.now()
    const duration = 700
    const from = 0
    const to = Math.max(0, Math.min(100, score))

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // Same easing curve as the rest of the app's transitions.
      const eased = 1 - Math.pow(1 - t, 3)
      setDrawn(from + (to - from) * eased)
      setShown(Math.round(from + (to - from) * eased))
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
  }, [score])

  const color = HEALTH_COLORS[band]
  const offset = circumference - (drawn / 100) * circumference

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--border-subtle)" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={band === 'RED' ? 'health-ring-pulse' : undefined}
          style={{ transition: 'stroke 300ms ease' }}
        />
      </svg>

      {showLabel && (
        <span
          className="absolute font-semibold tabular-nums"
          style={{ fontSize: size * 0.3, color }}
          // The visible number animates, so give assistive tech the real one.
          aria-label={`Health score ${score} of 100, ${band.toLowerCase()}`}
        >
          {shown}
        </span>
      )}

      {open && penalties.length > 0 && (
        <div
          role="tooltip"
          className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-64 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-3 shadow-lg"
        >
          <p className="text-xs font-medium text-[var(--text-primary)] mb-2">
            Why this score
          </p>
          <ul className="space-y-1.5">
            {penalties.map((p) => (
              <li key={p.code} className="flex items-start justify-between gap-3 text-xs">
                <span className="text-[var(--text-secondary)] leading-snug">{p.label}</span>
                <span className="tabular-nums font-medium shrink-0" style={{ color: 'var(--danger)' }}>
                  −{p.points}
                  {/* Show when a cap clipped the raw total, so the maths adds up. */}
                  {p.cappedAt !== undefined && (
                    <span className="text-[var(--text-tertiary)] font-normal"> (max)</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-tertiary)]">Score</span>
            <span className="tabular-nums font-semibold" style={{ color }}>{score} / 100</span>
          </div>
        </div>
      )}

      {open && penalties.length === 0 && (
        <div
          role="tooltip"
          className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg"
        >
          No issues detected — nothing is dragging this score down.
        </div>
      )}
    </div>
  )
}

/** Compact inline dot for dense tables where a ring would be too heavy. */
export function HealthDot({ band, score }: { band: HealthBand; score: number }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`Health ${score}/100`}>
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${band === 'RED' ? 'health-dot-pulse' : ''}`}
        style={{ background: HEALTH_COLORS[band] }}
      />
      <span className="tabular-nums text-xs text-[var(--text-secondary)]">{score}</span>
    </span>
  )
}
