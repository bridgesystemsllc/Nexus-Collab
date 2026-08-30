// apps/api/src/services/billing/proration.ts
import type { BillingInterval, ChangePlan } from '@nexus/shared'

// ─── The change-path decision table ──────────────────────────
// Spec §3.2, as code. Pure: no Stripe, no database, no clock — the provider
// takes the ChangePlan and translates it into Stripe's proration_behavior, but
// the DECISION lives here where it can be read and tested as a table.
//
// Two rules are load-bearing and must never acquire an exception:
//
//   1. Anything that reduces what the customer pays is deferred to period end.
//      Immediate reduction plus immediate increase is a loop that mints
//      proration credit, and it is the single most common way this category of
//      product gets farmed.
//
//   2. Nothing charges without prorating. An unprorated mid-period charge bills
//      for time the customer has already paid for.
//
// The invariant tests at the bottom of the suite assert both across every input,
// so a new branch that violates either fails without anyone remembering to
// check.

export type ChangeKind =
  | { kind: 'tier'; fromRank: number; toRank: number }
  | { kind: 'seats'; from: number; to: number }
  | { kind: 'interval'; from: BillingInterval; to: BillingInterval }
  | { kind: 'cancel' }

/// Immediate, prorated, charged now. Every "customer pays more" path.
const UPGRADE: ChangePlan = { timing: 'immediate', prorate: true, chargeNow: true }
/// Scheduled for period end. No proration, no refund. Every "customer pays less" path.
const DEFERRED: ChangePlan = { timing: 'period_end', prorate: false, chargeNow: false }
/// Nothing actually changed. Applied immediately because there is nothing to apply.
const NOOP: ChangePlan = { timing: 'immediate', prorate: false, chargeNow: false }

export function planFor(change: ChangeKind): ChangePlan {
  switch (change.kind) {
    case 'tier':
      if (change.toRank > change.fromRank) return UPGRADE
      if (change.toRank < change.fromRank) return DEFERRED
      return NOOP

    case 'seats':
      if (change.to > change.from) return UPGRADE
      if (change.to < change.from) return DEFERRED
      return NOOP

    case 'interval':
      // monthly → annual is more money now; annual → monthly would mean
      // refunding the unused annual term, so it waits for the term to end.
      if (change.from === 'monthly' && change.to === 'annual') return UPGRADE
      if (change.from === 'annual' && change.to === 'monthly') return DEFERRED
      return NOOP

    case 'cancel':
      // Access is retained through the period already paid for.
      return DEFERRED

    default: {
      // An unmodelled change kind must not silently become an upgrade.
      const _exhaustive: never = change
      void _exhaustive
      return NOOP
    }
  }
}
