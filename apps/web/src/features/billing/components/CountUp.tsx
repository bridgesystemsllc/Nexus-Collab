import { useEffect, useRef, useState } from 'react'

export function CountUp({ value, duration = 600, className = '' }: {
  value: number; duration?: number; className?: string
}) {
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? value : 0)
  const raf = useRef<number>()

  useEffect(() => {
    if (reduce) { setShown(value); return }
    const start = performance.now()
    const from = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      // easeOutCubic — fast then settling, so the final value feels arrived at
      // rather than stopped.
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [value, duration, reduce])

  return <span className={`numeric ${className}`}>{shown}</span>
}
