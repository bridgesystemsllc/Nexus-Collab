import type { LifecycleStatus } from '../api/usersApi'

// ─── Status pill ─────────────────────────────────────────────
// Lifecycle, not presence. `Member.status` is the AVAILABLE/FOCUSED/OOO field
// and means something different; conflating them in one badge would make
// "away for lunch" look like "account suspended".

const STYLES: Record<LifecycleStatus, { label: string; fg: string; bg: string }> = {
  active:      { label: 'Active',      fg: 'var(--success)', bg: 'rgba(30,158,90,0.10)' },
  invited:     { label: 'Invited',     fg: 'var(--accent)',  bg: 'var(--accent-subtle)' },
  suspended:   { label: 'Suspended',   fg: 'var(--warning)', bg: 'rgba(199,119,0,0.10)' },
  deactivated: { label: 'Deactivated', fg: 'var(--text-tertiary)', bg: 'rgba(0,0,0,0.05)' },
}

export function StatusPill({ status }: { status: LifecycleStatus }) {
  const s = STYLES[status] ?? STYLES.deactivated
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ color: s.fg, background: s.bg }}
    >
      {s.label}
    </span>
  )
}

/** The role badge. Owner and Admin read differently from the rest on purpose. */
export function RoleChip({ role }: { role: { key: string; name: string } | null }) {
  if (!role) return <span className="text-[11px] text-[var(--text-tertiary)]">No role</span>
  const elevated = role.key === 'owner' || role.key === 'admin'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={
        elevated
          ? { color: 'var(--accent)', background: 'var(--accent-subtle)' }
          : { color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.04)' }
      }
    >
      {role.name}
    </span>
  )
}

/** Relative time, falling back to a date once it stops being useful. */
export function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  })
}
