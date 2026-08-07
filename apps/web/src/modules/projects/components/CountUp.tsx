import { useEffect, useRef, useState } from 'react'

// ─── Count-up number ─────────────────────────────────────────
// A KPI that snaps into place reads as static data; one that counts up reads
// as a live figure someone measured (§6.6).
//
// Two things it must not do: animate on every re-render (a background refetch
// returning the same number would make the dashboard twitch), and animate for
// people who have asked their system not to.

export function CountUp({
  value,
  duration = 800,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
  style,
}: {
  value: number | null | undefined
  duration?: number
  decimals?: number
  suffix?: string
  prefix?: string
  className?: string
  style?: React.CSSProperties
}) {
  const target = typeof value === 'number' && Number.isFinite(value) ? value : null
  const [shown, setShown] = useState(target ?? 0)
  const from = useRef(0)
  const frame = useRef<number>()
  const previous = useRef<number | null>(null)

  useEffect(() => {
    if (target === null) return

    // Same value again — a poll returning unchanged data. Nothing to animate.
    if (previous.current === target) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      previous.current = target
      setShown(target)
      return
    }

    // Count from where the display currently is, not from zero, so a refresh
    // that nudges 42 → 43 does not sweep the whole way up again.
    from.current = previous.current === null ? 0 : shown
    previous.current = target

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // matches the app's easing curve
      setShown(from.current + (target - from.current) * eased)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
    // `shown` is deliberately not a dependency: reading it starts the tween
    // from the current position, but depending on it would restart every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  if (target === null) {
    // An em dash, not 0. "No data" and "zero" are different facts.
    return <span className={className} style={style}>—</span>
  }

  return (
    <span className={`tabular-nums ${className ?? ''}`} style={style}>
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  )
}
