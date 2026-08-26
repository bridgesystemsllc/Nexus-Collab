// packages/shared/src/billing/tiers.ts
import type { TierSpec } from './types'

// ─── The tier catalogue ──────────────────────────────────────
// The four plans as data. This is the seed source AND what
// ensureBillingSeeded() reconciles against — same reasoning as
// rbac/catalogue.ts: three consumers, one copy, or they drift.
//
// The DB rows are authoritative at runtime (an admin may edit a price without
// a deploy). This file is what a brand new database is filled with, and what
// a missing tier is restored from.
//
// stripePriceId* are deliberately absent: they are environment-specific, set
// per install once the Stripe products exist, and a value committed here would
// be a test-mode id charging a production customer.

import type { FeatureKey, TierFeatureSpec } from './types'

const f = (featureKey: FeatureKey, limitValue: number | null = null): TierFeatureSpec =>
  ({ featureKey, isEnabled: true, limitValue })

export const TIER_CATALOGUE: TierSpec[] = [
  {
    key: 'starter',
    displayName: 'Starter',
    description: 'Core Projects & Initiatives, 5 active briefs, basic reporting',
    sortOrder: 10, rank: 10,
    unitAmountMonthlyCents: 2_900, unitAmountAnnualCents: 29_000,
    minSeats: 3, maxSeats: 15, isCustomQuote: false,
    features: [f('projects_core'), f('reporting_basic'), f('active_briefs', 5)],
  },
  {
    key: 'growth',
    displayName: 'Growth',
    description: 'Everything in Starter, plus NPD stage-gate, Artwork Tracker, Component Sourcing and read-only API',
    sortOrder: 20, rank: 20,
    unitAmountMonthlyCents: 5_900, unitAmountAnnualCents: 59_000,
    minSeats: 5, maxSeats: 50, isCustomQuote: false,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', 50),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', 10_000),
    ],
  },
  {
    key: 'professional',
    displayName: 'Professional',
    description: 'Everything in Growth, plus Tech Transfers, Formulations, Meeting Agent, read/write API and SSO',
    sortOrder: 30, rank: 30,
    unitAmountMonthlyCents: 9_900, unitAmountAnnualCents: 99_000,
    minSeats: 10, maxSeats: 250, isCustomQuote: false,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', null),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', 100_000),
      f('tech_transfers'), f('formulations'), f('meeting_agent'), f('api_write'), f('sso'),
    ],
  },
  {
    key: 'enterprise',
    displayName: 'Enterprise',
    description: 'Everything in Professional, plus custom SLAs, audit exports, a dedicated environment and SCIM',
    sortOrder: 40, rank: 40,
    // Quote-driven. These are the floor a sales conversation starts from, and
    // nothing self-serve may ever charge them — the Enterprise CTA opens
    // contact-sales, never a checkout.
    unitAmountMonthlyCents: 0, unitAmountAnnualCents: 0,
    minSeats: 25, maxSeats: null, isCustomQuote: true,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', null),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', null),
      f('tech_transfers'), f('formulations'), f('meeting_agent'), f('api_write'), f('sso'),
      f('custom_sla'), f('audit_export'), f('dedicated_env'), f('scim'),
    ],
  },
]
