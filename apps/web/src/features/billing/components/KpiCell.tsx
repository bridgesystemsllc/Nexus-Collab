import { CountUp } from '@/modules/projects/components/CountUp'

/**
 * A single billing-card figure — the seat count, the MRR, the next invoice.
 *
 * `value` takes either a number or a string on purpose: most figures animate
 * through `CountUp`, but "—" for a workspace with no subscription is not a
 * number that should count up from zero, it's an absence. Passing a string
 * here is how a caller says so without KpiCell having to guess.
 */
export function KpiCell({
  label, value, sublabel, children,
}: {
  label: string
  value: number | string
  sublabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="billing-card" style={{ padding: '16px 18px' }}>
      <div
        className="uppercase font-semibold"
        style={{ fontSize: '11px', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}
      >
        {label}
      </div>
      <div className="mt-1" style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? <CountUp value={value} className="numeric" /> : <span className="numeric">{value}</span>}
      </div>
      {sublabel && (
        <div className="mt-0.5" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {sublabel}
        </div>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
