// ─── Status, risk and blocker pills ─────────────────────────
// One tone vocabulary, used everywhere a status appears, so a red pill means
// the same thing in the grid, the tree and the modal header.

import { AlertTriangle, Lock, PenLine } from 'lucide-react'
import { OOR_STATUS_META, OOR_RISK_META, type OorLineStatus, type OorRiskLevel } from '@nexus/shared'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE_STYLE: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: 'var(--bg-hover)', fg: 'var(--text-secondary)', border: 'var(--border-default)' },
  accent: { bg: 'var(--accent-secondary-light)', fg: 'var(--accent-secondary)', border: 'var(--accent-secondary)' },
  success: { bg: 'var(--success-light)', fg: 'var(--success)', border: 'var(--success)' },
  warning: { bg: 'var(--warning-light)', fg: 'var(--warning)', border: 'var(--warning)' },
  danger: { bg: 'var(--danger-light)', fg: 'var(--danger)', border: 'var(--danger)' },
}

export function Pill({
  tone = 'neutral',
  children,
  title,
  icon: Icon,
}: {
  tone?: Tone
  children: React.ReactNode
  title?: string
  icon?: React.ElementType
}) {
  const style = TONE_STYLE[tone]
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: style.bg, color: style.fg, border: `1px solid ${style.border}33` }}
    >
      {Icon ? <Icon size={11} strokeWidth={2.5} /> : null}
      {children}
    </span>
  )
}

export function StatusPill({
  status,
  overridden,
  reason,
}: {
  status: string
  overridden?: boolean
  reason?: string | null
}) {
  const meta = OOR_STATUS_META[status as OorLineStatus] ?? { label: status, tone: 'neutral' as Tone }
  return (
    <Pill
      tone={meta.tone}
      icon={overridden ? PenLine : undefined}
      // The reason is on the marker, not buried in an audit screen: the next
      // person to look at this row is the one who needs to know why.
      title={overridden ? `Set by hand${reason ? ` — ${reason}` : ''}` : undefined}
    >
      {meta.label}
    </Pill>
  )
}

export function RiskPill({ risk }: { risk: string }) {
  const meta = OOR_RISK_META[risk as OorRiskLevel]
  if (!meta || risk === 'on_track') return null
  return (
    <Pill tone={meta.tone} icon={risk === 'critical' ? AlertTriangle : undefined}>
      {meta.label}
    </Pill>
  )
}

/** The CP? column, as the blocker it actually is. */
export function CustomerProvidedPill() {
  return (
    <Pill tone="warning" icon={Lock} title="Customer-provided — nobody here can clear this alone">
      CP
    </Pill>
  )
}
