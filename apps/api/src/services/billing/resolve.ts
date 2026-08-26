import {
  seatsAvailable,
  type AccessLevel, type Entitlements, type FeatureKey,
  type SubscriptionStatus, type TierKey,
} from '@nexus/shared'
import type { TierFeatureRecord, TierRecord } from './catalogue'

// ─── Entitlement resolution ──────────────────────────────────
// The single place that answers "what may this organization do?".
//
// Deliberately pure: no Prisma, no Redis, no clock of its own. Everything it
// needs arrives as an argument, which is what lets the status matrix below be
// tested exhaustively rather than sampled. The I/O lives in entitlements.ts.
//
// The frontend receives this object so it can RENDER correctly. It never
// decides anything with it — every gated endpoint re-resolves server-side.

export interface SubscriptionSnapshot {
  status: SubscriptionStatus
  seatsPurchased: number
  gracePeriodEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export interface ResolverInput {
  subscription: SubscriptionSnapshot | null
  tier: TierRecord | null
  features: TierFeatureRecord[]
  seatsConsumed: number
  now: Date
}

/// Every key that exists, so a lookup never returns undefined. `if (!f.x)` and
/// `if (f.x === false)` must agree, and an undefined third state is how they
/// stop agreeing.
const ALL_FEATURES: FeatureKey[] = [
  'projects_core', 'reporting_basic', 'active_briefs',
  'npd_stage_gate', 'artwork_tracker', 'component_sourcing', 'api_read',
  'tech_transfers', 'formulations', 'meeting_agent', 'api_write', 'sso',
  'custom_sla', 'audit_export', 'dedicated_env', 'scim',
]

function emptyFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(ALL_FEATURES.map((k) => [k, false])) as Record<FeatureKey, boolean>
}

const LOCKED_LIMITS = { activeBriefs: 0, apiCallsPerMonth: 0 }

/**
 * The status → access matrix.
 *
 * Separated from resolve() so it reads as the table it is. Every branch has a
 * test; adding a status without adding a row here fails the exhaustiveness
 * check below rather than defaulting to "allowed".
 */
function accessFor(sub: SubscriptionSnapshot, now: Date): AccessLevel {
  switch (sub.status) {
    case 'trialing':
    case 'active':
      return 'full'

    case 'past_due':
      // Seven days of full access after a failed payment, then read-only.
      // Never deletion — the spec is explicit that lockout loses no data.
      return sub.gracePeriodEndsAt && now <= sub.gracePeriodEndsAt ? 'full' : 'read_only'

    case 'canceled':
      // Access is retained through the period already paid for. Edge case 9
      // (cancel, then reactivate before period end) depends on this being
      // full, not read_only.
      return sub.currentPeriodEnd && now < sub.currentPeriodEnd ? 'full' : 'read_only'

    case 'paused':
      return 'read_only'

    case 'incomplete':
    case 'incomplete_expired':
      // Edge case 3: the upgrade's payment has not succeeded. Granting the new
      // tier here is exactly the unpaid-access bug.
      return 'locked'

    default: {
      // An unrecognised status is a Stripe change we have not modelled. Fail
      // closed — an unknown state must never be a permissive one.
      const _exhaustive: never = sub.status
      void _exhaustive
      return 'locked'
    }
  }
}

export function resolve(input: ResolverInput): Entitlements {
  const { subscription, tier, features, seatsConsumed, now } = input

  if (!subscription || !tier) {
    return {
      tier: null, status: null, accessLevel: 'locked',
      features: emptyFeatures(),
      limits: { seats: { purchased: 0, consumed: 0, available: 0 }, ...LOCKED_LIMITS },
      inGracePeriod: false, gracePeriodEndsAt: null,
    }
  }

  const accessLevel = accessFor(subscription, now)
  const locked = accessLevel === 'locked'

  const resolved = emptyFeatures()
  if (!locked) {
    for (const f of features) {
      if (f.isEnabled) resolved[f.featureKey] = true
    }
  }

  const limitOf = (key: string): number | null => {
    if (locked) return 0
    const row = features.find((f) => f.featureKey === key)
    return row?.isEnabled ? row.limitValue : null
  }

  // Grace is a property of being past_due, not of the column. A stale
  // gracePeriodEndsAt left behind by a recovered payment must not make an
  // active subscription render a dunning banner.
  const inGracePeriod =
    subscription.status === 'past_due' &&
    !!subscription.gracePeriodEndsAt &&
    now <= subscription.gracePeriodEndsAt

  return {
    tier: tier.key as TierKey,
    status: subscription.status,
    accessLevel,
    features: resolved,
    limits: {
      seats: {
        purchased: subscription.seatsPurchased,
        consumed: seatsConsumed,
        available: seatsAvailable(subscription.seatsPurchased, seatsConsumed),
      },
      activeBriefs: limitOf('active_briefs'),
      apiCallsPerMonth: limitOf('api_read'),
    },
    inGracePeriod,
    gracePeriodEndsAt: inGracePeriod ? subscription.gracePeriodEndsAt!.toISOString() : null,
  }
}
