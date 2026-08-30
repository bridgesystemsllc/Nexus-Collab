import { seatSegments, seatBarLabel } from '../lib/format'

/**
 * The seat-usage bar under a KPI cell.
 *
 * `seatSegments` already decided segmented vs. continuous and clamped the
 * numbers, so this only draws. The one decision left here — which cell gets
 * the headroom pulse — is layout, not business logic: it is "the first false
 * entry in the array", nothing a unit test would want to own.
 */
export function SeatUsageBar({ purchased, consumed }: { purchased: number; consumed: number }) {
  const { mode, segments, fraction } = seatSegments(purchased, consumed)

  // A workspace with no seats has no bar to draw — an empty bar would still
  // assert "here is your usage", which is false for zero seats.
  if (purchased === 0) return null

  const label = seatBarLabel(purchased, consumed)

  if (mode === 'continuous') {
    return (
      <div
        role="img"
        aria-label={label}
        className="w-full rounded-full"
        style={{ background: 'var(--border-default)', height: '8px' }}
      >
        <div className="seat-fill" aria-hidden style={{ width: `${fraction * 100}%` }} />
      </div>
    )
  }

  const firstEmptyIndex = segments.indexOf(false)

  return (
    <div role="img" aria-label={label} className="flex" style={{ gap: '3px' }}>
      {segments.map((filled, i) => (
        <div
          key={i}
          aria-hidden
          className={[
            'seat-cell',
            filled && 'seat-cell--filled',
            !filled && i === firstEmptyIndex && 'seat-cell--headroom',
          ].filter(Boolean).join(' ')}
        />
      ))}
    </div>
  )
}
