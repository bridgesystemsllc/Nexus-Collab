// packages/shared/src/billing/types.ts
export type TierKey = 'starter' | 'growth' | 'professional' | 'enterprise'
export type BillingInterval = 'monthly' | 'annual'
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'paused'

/// Added to the spec's shape. §5.4 and §5.8 both require a read-only state
/// that is neither "has the feature" nor "does not have it", and the spec's
/// `inGracePeriod` alone cannot express it.
export type AccessLevel = 'full' | 'read_only' | 'locked'

export type FeatureKey =
  | 'projects_core' | 'reporting_basic' | 'active_briefs'
  | 'npd_stage_gate' | 'artwork_tracker' | 'component_sourcing' | 'api_read'
  | 'tech_transfers' | 'formulations' | 'meeting_agent' | 'api_write' | 'sso'
  | 'custom_sla' | 'audit_export' | 'dedicated_env' | 'scim'

export interface Entitlements {
  tier: TierKey | null
  status: SubscriptionStatus | null
  accessLevel: AccessLevel
  features: Record<FeatureKey, boolean>
  limits: {
    seats: { purchased: number; consumed: number; available: number }
    activeBriefs: number | null      // null = unlimited
    apiCallsPerMonth: number | null  // null = unlimited
  }
  inGracePeriod: boolean
  gracePeriodEndsAt: string | null   // ISO 8601
}

export interface PreviewResult {
  immediateChargeCents: number
  creditAppliedCents: number
  taxCents: number                   // §5.10 — tax is its own line
  nextInvoiceCents: number
  nextInvoiceDate: string
  proratedLineItems: Array<{ description: string; amountCents: number; period: { start: string; end: string } }>
  newRecurringTotalCents: number
  effectiveImmediately: boolean
  currency: string
}

export interface ChangePlan {
  readonly timing: 'immediate' | 'period_end'
  readonly prorate: boolean
  readonly chargeNow: boolean
}

export interface TierFeatureSpec {
  featureKey: FeatureKey
  isEnabled: boolean
  /// null means "enabled, no numeric cap". Only meaningful when isEnabled.
  limitValue: number | null
}

export interface TierSpec {
  key: TierKey
  displayName: string
  description: string
  sortOrder: number
  /// Lower is cheaper. This — not sortOrder — is what makes a change an
  /// upgrade or a downgrade, and sortOrder is presentation only.
  rank: number
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  /// null means unlimited. Always compare through exceedsSeatCeiling().
  maxSeats: number | null
  isCustomQuote: boolean
  features: TierFeatureSpec[]
}
