import type { CSSProperties } from 'react'
import { useEntitlements } from '../hooks/useEntitlements'
import { ApiError } from '@/features/users/api/usersApi'
import { Alert } from '@/features/settings/components/SettingsPrimitives'
import { DunningBanner } from '../components/DunningBanner'
import { NoSubscriptionState } from '../components/NoSubscriptionState'
import { StatusPill } from '../components/StatusPill'
import { KpiCell } from '../components/KpiCell'
import { SeatUsageBar } from '../components/SeatUsageBar'

// ─── Overview ────────────────────────────────────────────────
// The one screen billing has today. It renders one of three shapes: a
// skeleton while `/entitlements` is in flight, an honest error if it fails,
// or the entitlements themselves — and for `tier: null` (Ahmad's own
// workspace, right now) that third shape is the empty state alone, not an
// empty state bolted onto a row of zeroed KPIs.

/**
 * Loading placeholder shaped like the real layout — a hero block plus a
 * KPI row — so the page does not jump when data lands. Not a spinner: a
 * spinner tells you Nexus is thinking, a skeleton tells you what is about to
 * appear, which is the more honest promise to make while a network request
 * is in flight.
 */
function OverviewSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton" style={{ height: '76px', borderRadius: 'var(--radius-xl)' }} />
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}
      >
        <div className="skeleton" style={{ height: '96px', borderRadius: 'var(--radius-xl)' }} />
        <div className="skeleton" style={{ height: '96px', borderRadius: 'var(--radius-xl)' }} />
      </div>
    </div>
  )
}

/// `starter` -> `Starter`. Presentation only — the tier's meaning already
/// lives server-side; this just puts a capital letter on the key we were sent.
function tierDisplayName(tier: string): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function OverviewSection() {
  const { data, isLoading, isError, error } = useEntitlements()

  if (isLoading) return <OverviewSkeleton />

  if (isError) {
    // ApiError's message is always something a server author wrote for a
    // human (or the network-failure fallback in billingApi) — never a raw
    // stack. Anything else thrown here is not something to put on screen.
    const detail = error instanceof ApiError ? error.message : null
    return (
      <Alert>
        Could not load billing information.
        {detail && <span className="mt-0.5 block">{detail}</span>}
      </Alert>
    )
  }

  if (!data) return null

  if (data.tier === null) return <NoSubscriptionState />

  const purchased = data.limits.seats.purchased
  // Runs alongside JSX order so the stagger always matches what actually
  // renders — the dunning banner not appearing shifts everything below it up
  // one step rather than leaving a gap in the sequence.
  let i = 0

  return (
    <div className="space-y-3">
      {data.status === 'past_due' && (
        <div className="fade-up" style={{ '--i': i++ } as CSSProperties}>
          <DunningBanner gracePeriodEndsAt={data.gracePeriodEndsAt} />
        </div>
      )}

      <div className="billing-card fade-up" style={{ padding: '20px 24px', '--i': i++ } as CSSProperties}>
        <div className="flex items-center gap-3">
          <h2
            className="font-semibold text-2xl"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.03em' }}
          >
            {tierDisplayName(data.tier)}
          </h2>
          <StatusPill status={data.status} accessLevel={data.accessLevel} />
        </div>
        {/* /entitlements carries no renewal date — inventing one from thin air
            is worse than saying plainly that this line is not available yet. */}
        <p className="mt-1" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Renewal date available once the subscription endpoint ships
        </p>
      </div>

      <div
        className="fade-up grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', '--i': i++ } as CSSProperties}
      >
        <KpiCell
          label="Seats in use"
          value={data.limits.seats.consumed}
          sublabel={`of ${purchased} purchased`}
        >
          <SeatUsageBar purchased={purchased} consumed={data.limits.seats.consumed} />
        </KpiCell>

        <KpiCell label="Seats available" value={data.limits.seats.available} />

        {/* /entitlements has no renewal date, so there is nothing for
            daysUntil() to compute against. Shown as an honest em dash rather
            than omitted, matching KpiCell's own contract for an absent
            figure (see its doc comment) — the cell stays in the grid so the
            layout does not shift the day the subscription endpoint ships. */}
        <KpiCell
          label="Days until renewal"
          value="—"
          sublabel="Available with the subscription endpoint"
        />
      </div>
    </div>
  )
}
