# Nexus Billing — Phase 2: Provider Seam, Stripe, Webhooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put every Stripe call behind one interface, implement it, and process Stripe's webhooks idempotently — so the subscription mirror in Postgres converges on Stripe's truth without any route handler ever writing it.

**Architecture:** A `BillingProvider` interface is the only thing the rest of the module knows about. `stripeProvider` implements it and is the sole file that imports `stripe`; `fakeProvider` implements it deterministically for tests. A pure `proration.ts` decides *when* a change takes effect and whether it prorates, independent of any provider. The webhook processor is the **only** writer of the mirror tables.

**Tech Stack:** Node 20 · Express 4 · Prisma 5 + Postgres · Stripe Node SDK · vitest 3 · Zod 3

**Spec:** `docs/superpowers/plans/2026-08-25-billing-00-master.md` — its Locked Decisions, Spec Deltas and Interfaces section are binding. Phase 1 (`...-01-foundations.md`) shipped as PR #104.

## Global Constraints

- **Stripe keys are not available yet.** Everything above the provider must be testable without them. `fakeProvider` is the test seam; `stripeProvider` ships as code with a stated verification gap in its PR body. Never write a test that requires a live key to pass.
- **`stripeProvider.ts` is the ONLY file permitted to `import Stripe from 'stripe'`.** A `stripe` import anywhere else is a defect — it defeats the seam.
- **Money is integer cents**, server and client. Stripe already speaks cents; never convert to a float on the way through.
- **The webhook processor is the only writer of the mirror** (`BillingSubscription`, `BillingInvoice`, `BillingPaymentMethod`). A mutation route calls the provider and returns its response; local state converges when the webhook lands. This is what makes edge case 6 (webhook races the API response) trivially correct.
- **Idempotency is not optional.** Every provider write carries an idempotency key. Every inbound event is recorded in `BillingEvent` *before* it is processed.
- **Fail closed.** A provider error must never leave local state optimistically written. `BillingUnconfiguredError` maps to 503 with a retryable flag.
- **Never log** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, full card data, or raw webhook payloads at `info`. `BillingEvent.payload` stores the object; it is not echoed to stdout.
- **Typecheck gate is zero errors**, no filtering. Baseline at `afe65cc`: `npx tsc --noEmit -p tsconfig.json` in `apps/api` = 0, `npx vitest run` = 651 passed / 42 files, integration 25.
- **`maxSeats: null` means unlimited** — always via `exceedsSeatCeiling`.
- **`pnpm build:shared` after any `packages/shared` edit**, or the API imports stale `dist/`.
- Do **not** run `pnpm db:push`, `prisma migrate`, or anything with `--accept-data-loss` / `--force-reset` without it being an explicit step. Phase 2 needs **no** schema change — every column it uses already exists.
- Every task group is its own branch off `main`, its own PR. `git fetch` first — the Replit Agent pushes to `main` directly.

---

## What Phase 1 already provides (exact signatures — do not re-derive)

```ts
// apps/api/src/services/billing/catalogue.ts
export interface TierFeatureRecord { featureKey: FeatureKey; isEnabled: boolean; limitValue: number | null }
export interface TierRecord {
  id: string; key: TierKey; displayName: string; description: string | null
  sortOrder: number; rank: number
  stripePriceIdMonthly: string | null; stripePriceIdAnnual: string | null
  unitAmountMonthlyCents: number; unitAmountAnnualCents: number
  minSeats: number; maxSeats: number | null; isCustomQuote: boolean
  features: TierFeatureRecord[]
}
export function invalidateCatalogue(): void
export async function loadCatalogue(prisma: PrismaClient): Promise<TierRecord[]>
export async function findTier(prisma: PrismaClient, key: string): Promise<TierRecord | null>

// apps/api/src/services/billing/entitlementCache.ts
export async function invalidateEntitlements(orgId: string): Promise<void>

// apps/api/src/services/billing/billingAudit.ts
export type BillingAuditAction = Extract<AuditAction, `billing.${string}`>
export async function appendWebhookAudit(input: {
  tx: Tx; orgId: string; action: BillingAuditAction
  entityType: 'subscription' | 'seat' | 'payment_method' | 'invoice'
  entityId: string | null; stripeEventId: string
  changes?: Record<string, { from: unknown; to: unknown }> | null
}): Promise<void>

// packages/shared/src/billing/types.ts
export type BillingInterval = 'monthly' | 'annual'
export type SubscriptionStatus = 'trialing'|'active'|'past_due'|'canceled'|'incomplete'|'incomplete_expired'|'paused'
export interface PreviewResult { immediateChargeCents; creditAppliedCents; taxCents; nextInvoiceCents;
  nextInvoiceDate; proratedLineItems; newRecurringTotalCents; effectiveImmediately; currency }
export interface ChangePlan { timing: 'immediate' | 'period_end'; prorate: boolean; chargeNow: boolean }
```

**Mirror columns that already exist and matter here:** `BillingSubscription.lastStripeEventAt` (the out-of-order high-water mark), `.gracePeriodEndsAt`, `.pendingTierId` / `.pendingSeats` / `.pendingChangeEffectiveAt`, `.stripeSubscriptionItemId`; `BillingEvent.stripeEventId @unique`, `.processedAt`, `.processingError`, `.retryCount`.

---

## File Structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `apps/api/src/services/billing/provider.ts` | Create | `BillingProvider` interface, its DTOs, `BillingUnconfiguredError`, `BillingProviderError` |
| `apps/api/src/services/billing/proration.ts` | Create | **Pure.** The §3.2 decision table → `ChangePlan` |
| `apps/api/src/services/billing/proration.test.ts` | Create | Every row of the table, including the credit-farming guard |
| `apps/api/src/services/billing/fakeProvider.ts` | Create | Deterministic in-memory provider, injectable clock |
| `apps/api/src/services/billing/fakeProvider.test.ts` | Create | Proves the fake honours the interface's contract |
| `apps/api/src/services/billing/providerRegistry.ts` | Create | Env-driven selection; unconfigured → a provider that throws |
| `apps/api/src/services/billing/providerRegistry.test.ts` | Create | Its tests |
| `apps/api/src/services/billing/stripeClient.ts` | Create | Lazy `Stripe` singleton. **The only `import Stripe`** |
| `apps/api/src/services/billing/stripeProvider.ts` | Create | The Stripe implementation of `BillingProvider` |
| `apps/api/src/services/billing/stripeMappers.ts` | Create | **Pure.** Stripe objects → our DTOs. Where the unit-testable half of B5 lives |
| `apps/api/src/services/billing/stripeMappers.test.ts` | Create | Fixture-driven, no network, no keys |
| `apps/api/src/services/billing/webhookProcessor.ts` | Create | Idempotency, ordering, transactional handlers. **The only mirror writer** |
| `apps/api/src/services/billing/webhookProcessor.test.ts` | Create | Against `fakeProvider` + a fake prisma |
| `apps/api/src/services/billing/webhookProcessor.integration.test.ts` | Create | Replay ×100 against a live DB |
| `apps/api/src/routes/billingWebhooks.ts` | Create | Raw-body, signature-verified, unauthenticated, CSRF-exempt |
| `apps/api/src/index.ts` | Modify | Mount the webhook **above** `express.json()` |
| `apps/api/package.json` | Modify | Add `stripe` |
| `.env.example` | Modify | Document the Stripe keys |

---

## Interfaces — fixed now

```ts
// apps/api/src/services/billing/provider.ts
export interface ProviderPaymentMethod {
  id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean
}
export interface ProviderSubscription {
  id: string; customerId: string; itemId: string | null
  status: SubscriptionStatus; interval: BillingInterval
  priceId: string; quantity: number
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean; trialEndsAt: Date | null; canceledAt: Date | null
  /// Stripe's own event/object timestamp, for the out-of-order guard.
  updatedAt: Date
}
export interface ProviderInvoice {
  id: string; number: string | null; status: string
  amountDueCents: number; amountPaidCents: number; currency: string
  periodStart: Date | null; periodEnd: Date | null
  hostedInvoiceUrl: string | null; invoicePdfUrl: string | null
  attemptCount: number; nextPaymentAttemptAt: Date | null
}
export interface ProviderEvent {
  id: string; type: string; createdAt: Date
  /// The raw Stripe object, stored verbatim in BillingEvent.payload.
  data: Record<string, unknown>
}

export interface ChangeInput {
  subscriptionId: string; itemId: string
  priceId: string; quantity: number
  plan: ChangePlan
  /// Required on every write. Same key + same args = one effect, however many retries.
  idempotencyKey: string
}
export interface CreateSubscriptionInput {
  customerId: string; priceId: string; quantity: number
  trialDays?: number; idempotencyKey: string
}

export interface BillingProvider {
  ensureCustomer(i: { orgId: string; name: string; email: string; idempotencyKey: string }): Promise<{ customerId: string }>
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>
  listPaymentMethods(customerId: string): Promise<ProviderPaymentMethod[]>
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>
  detachPaymentMethod(paymentMethodId: string): Promise<void>
  createSubscription(i: CreateSubscriptionInput): Promise<ProviderSubscription>
  previewChange(i: ChangeInput): Promise<PreviewResult>
  applyChange(i: ChangeInput): Promise<ProviderSubscription>
  cancelAtPeriodEnd(subscriptionId: string, idempotencyKey: string): Promise<ProviderSubscription>
  reactivate(subscriptionId: string, idempotencyKey: string): Promise<ProviderSubscription>
  listInvoices(customerId: string, cursor?: string): Promise<{ items: ProviderInvoice[]; nextCursor: string | null }>
  verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent
}

/// Thrown when STRIPE_SECRET_KEY is absent. Routes map it to 503 + retryable.
export class BillingUnconfiguredError extends Error {}
/// Any provider-side failure. `retryable` distinguishes a network blip from a declined card.
export class BillingProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) { super(message) }
}
```

```ts
// apps/api/src/services/billing/proration.ts  (pure)
export type ChangeKind =
  | { kind: 'tier'; fromRank: number; toRank: number }
  | { kind: 'seats'; from: number; to: number }
  | { kind: 'interval'; from: BillingInterval; to: BillingInterval }
  | { kind: 'cancel' }
export function planFor(change: ChangeKind): ChangePlan
```

```ts
// apps/api/src/services/billing/webhookProcessor.ts
export type ProcessOutcome =
  | { status: 'processed'; eventId: string }
  | { status: 'duplicate'; eventId: string }       // already processed → 200, do nothing
  | { status: 'stale'; eventId: string }           // predates lastStripeEventAt → 200, discarded
  | { status: 'unhandled'; eventId: string }       // recognised delivery, no handler → 200
  | { status: 'failed'; eventId: string; error: string }  // → 500 so Stripe retries
export async function processEvent(
  prisma: PrismaClient, event: ProviderEvent,
): Promise<ProcessOutcome>
```

### The §3.2 change-path decision table — `planFor` must reproduce it exactly

| Change | `timing` | `prorate` | `chargeNow` |
|---|---|---|---|
| Tier upgrade (`toRank > fromRank`) | `immediate` | `true` | `true` |
| Tier downgrade (`toRank < fromRank`) | `period_end` | `false` | `false` |
| Tier unchanged (`toRank === fromRank`) | `immediate` | `false` | `false` |
| Seats increase (`to > from`) | `immediate` | `true` | `true` |
| Seats decrease (`to < from`) | `period_end` | `false` | `false` |
| Seats unchanged | `immediate` | `false` | `false` |
| Monthly → annual | `immediate` | `true` | `true` |
| Annual → monthly | `period_end` | `false` | `false` |
| Interval unchanged | `immediate` | `false` | `false` |
| Cancel | `period_end` | `false` | `false` |

**Seat decrease being deferred is deliberate and load-bearing:** immediate decrease plus immediate increase is a trivial credit-farming loop. There must be no branch anywhere that makes a seat reduction immediate.

### Webhook handling contract (spec §3.3)

1. Verify the signature with `STRIPE_WEBHOOK_SECRET`. Reject unsigned with 400 — never process it.
2. Insert into `BillingEvent` **first**. If `stripeEventId` already exists with `processedAt` set → return 200 immediately, do nothing.
3. Process inside a transaction. On failure record `processingError`, increment `retryCount`, return **500** so Stripe retries.
4. Events arrive **out of order**. Compare `event.createdAt` against `BillingSubscription.lastStripeEventAt`; discard stale updates rather than applying them.
5. Invalidate the entitlement cache for the org as the **last** step.
6. Return 200 within 5 seconds. Anything slow (emails, exports) goes to a queue, not the handler.

Events to handle: `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`, `payment_method.attached|detached`, `customer.subscription.trial_will_end`.

---

## Phase & PR Map

| PR | Branch | Deliverable | Needs Stripe keys? |
|---|---|---|---|
| **B4** | `feat/billing-provider` | `provider.ts`, `proration.ts` + tests, `fakeProvider`, `providerRegistry` | No |
| **B5** | `feat/billing-stripe` | `stripe` dep, `stripeClient`, `stripeMappers` + tests, `stripeProvider`, `.env.example` | **Live verification only** |
| **B6** | `feat/billing-webhooks` | Raw-body mount, signature route, `webhookProcessor`, idempotency + ordering + handlers | Signature test needs a secret; logic does not |

B4 and B6 are fully verifiable today. B5's pure mappers are fully tested; its network calls are not exercised until keys exist — that gap must be stated in the B5 PR body.

---

# PR B4 — `feat/billing-provider`

```bash
cd ~/Nexus-Collab && git fetch origin && git checkout -b feat/billing-provider origin/main
```

Nothing in this PR imports `stripe`. That is the point: everything the rest of the module will lean on becomes testable before a single key exists.

---

### Task 1: The provider interface and its errors

**Files:**
- Create: `apps/api/src/services/billing/provider.ts`

**Interfaces:**
- Consumes: `PreviewResult`, `ChangePlan`, `SubscriptionStatus`, `BillingInterval` from `@nexus/shared`.
- Produces: everything in the **Interfaces** block above. Tasks 2-13 and all of Phase 3 consume it.

This task is types only — no runtime behaviour beyond two error classes, so it has no test of its own. Its correctness is proven by Task 3, where `fakeProvider` must satisfy the interface, and by `tsc`.

- [ ] **Step 1: Write the file**

Transcribe the `provider.ts` block from the **Interfaces** section above verbatim, with these comments preserved on the members whose reasoning is not obvious:

```ts
export interface ChangeInput {
  subscriptionId: string
  itemId: string
  priceId: string
  quantity: number
  plan: ChangePlan
  /// Required on every write. Stripe retries on its own and so do we; the same
  /// key with the same arguments must produce one effect, not one per attempt.
  /// Derive it from what the change IS (org + target state), never from a clock
  /// or a random — a retry has to compute the same key the first attempt did.
  idempotencyKey: string
}
```

```ts
/// Thrown when STRIPE_SECRET_KEY is absent.
///
/// Distinct from a provider failure on purpose: "billing is not configured on
/// this install" is an operator problem answered with 503, while "Stripe said
/// no" is a user-facing outcome. Collapsing them would tell a customer their
/// card was declined when in fact nobody set the key.
export class BillingUnconfiguredError extends Error {
  constructor(message = 'BILLING_UNCONFIGURED') {
    super(message)
    this.name = 'BillingUnconfiguredError'
  }
}

/// Any provider-side failure.
///
/// `retryable` is the field that matters: a network blip should be retried, a
/// declined card must not be. Callers branch on it rather than parsing messages.
export class BillingProviderError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean) {
    super(message)
    this.name = 'BillingProviderError'
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd ~/Nexus-Collab/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output.

- [ ] **Step 3: Confirm nothing imports stripe yet**

Run: `cd ~/Nexus-Collab && grep -rn "from 'stripe'" apps/api/src || echo "clean"`
Expected: `clean`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/services/billing/provider.ts
git commit -m "feat(billing): the BillingProvider seam and its error taxonomy"
```

---

### Task 2: `proration.ts` — the change-path decision table

**Files:**
- Create: `apps/api/src/services/billing/proration.ts`
- Test: `apps/api/src/services/billing/proration.test.ts`

**Interfaces:**
- Consumes: `ChangePlan`, `BillingInterval` from `@nexus/shared`.
- Produces: `planFor(change: ChangeKind): ChangePlan` and `type ChangeKind`. Consumed by `stripeProvider.applyChange` (Task 8) and by every mutation route in Phase 3.

**Pure.** No Stripe, no database, no clock. This is where the product's money rules live, so it is tested row by row.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/proration.test.ts
import { describe, it, expect } from 'vitest'
import { planFor } from './proration'

// The §3.2 decision table, one test per row. These are money rules: an upgrade
// that fails to charge, or a downgrade that refunds, is a revenue bug that
// nobody notices until reconciliation.

describe('planFor — tier changes', () => {
  it('charges an upgrade immediately, prorated', () => {
    expect(planFor({ kind: 'tier', fromRank: 10, toRank: 20 }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers a downgrade to period end with no proration and no refund', () => {
    expect(planFor({ kind: 'tier', fromRank: 30, toRank: 10 }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('treats an unchanged tier as a no-op, not an upgrade', () => {
    expect(planFor({ kind: 'tier', fromRank: 20, toRank: 20 }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — seat changes', () => {
  it('charges a seat increase immediately, prorated', () => {
    expect(planFor({ kind: 'seats', from: 5, to: 8 }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers a seat decrease to period end', () => {
    expect(planFor({ kind: 'seats', from: 8, to: 5 }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('never makes a seat decrease immediate, at any magnitude', () => {
    // The credit-farming guard. Immediate decrease + immediate increase is a
    // loop that mints proration credit; deferring the decrease closes it.
    // Parameterised because "just this one case" is how the hole gets reopened.
    for (const [from, to] of [[2, 1], [50, 49], [250, 1], [10, 9]]) {
      const plan = planFor({ kind: 'seats', from, to })
      expect(plan.timing).toBe('period_end')
      expect(plan.chargeNow).toBe(false)
      expect(plan.prorate).toBe(false)
    }
  })

  it('treats an unchanged seat count as a no-op', () => {
    expect(planFor({ kind: 'seats', from: 5, to: 5 }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — interval changes', () => {
  it('charges monthly → annual immediately, prorated', () => {
    expect(planFor({ kind: 'interval', from: 'monthly', to: 'annual' }))
      .toEqual({ timing: 'immediate', prorate: true, chargeNow: true })
  })

  it('defers annual → monthly to period end', () => {
    // Immediate would mean refunding the unused annual term. Deferring is what
    // keeps that from being a withdrawal mechanism.
    expect(planFor({ kind: 'interval', from: 'annual', to: 'monthly' }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })

  it('treats an unchanged interval as a no-op', () => {
    expect(planFor({ kind: 'interval', from: 'monthly', to: 'monthly' }))
      .toEqual({ timing: 'immediate', prorate: false, chargeNow: false })
  })
})

describe('planFor — cancellation', () => {
  it('defers cancellation to period end, retaining paid access', () => {
    expect(planFor({ kind: 'cancel' }))
      .toEqual({ timing: 'period_end', prorate: false, chargeNow: false })
  })
})

describe('planFor — invariants that must hold for every input', () => {
  const ALL: Parameters<typeof planFor>[0][] = [
    { kind: 'tier', fromRank: 10, toRank: 20 },
    { kind: 'tier', fromRank: 30, toRank: 10 },
    { kind: 'tier', fromRank: 20, toRank: 20 },
    { kind: 'seats', from: 5, to: 8 },
    { kind: 'seats', from: 8, to: 5 },
    { kind: 'seats', from: 5, to: 5 },
    { kind: 'interval', from: 'monthly', to: 'annual' },
    { kind: 'interval', from: 'annual', to: 'monthly' },
    { kind: 'interval', from: 'monthly', to: 'monthly' },
    { kind: 'cancel' },
  ]

  it('never charges now without prorating', () => {
    // Charging an unprorated amount mid-period bills for time already paid for.
    for (const c of ALL) {
      const p = planFor(c)
      if (p.chargeNow) expect(p.prorate).toBe(true)
    }
  })

  it('never charges now on a deferred change', () => {
    // A period_end change that takes money today is the refund-abuse shape.
    for (const c of ALL) {
      const p = planFor(c)
      if (p.timing === 'period_end') expect(p.chargeNow).toBe(false)
    }
  })

  it('never prorates a deferred change', () => {
    for (const c of ALL) {
      const p = planFor(c)
      if (p.timing === 'period_end') expect(p.prorate).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/proration.test.ts`
Expected: FAIL — cannot resolve `./proration`

- [ ] **Step 3: Write the implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/proration.test.ts`
Expected: PASS — 14 passed

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/billing/proration.ts apps/api/src/services/billing/proration.test.ts
git commit -m "feat(billing): the change-path decision table as a pure function"
```

---

### Task 3: `fakeProvider` — the test seam

**Files:**
- Create: `apps/api/src/services/billing/fakeProvider.ts`
- Test: `apps/api/src/services/billing/fakeProvider.test.ts`

**Interfaces:**
- Consumes: `BillingProvider` and its DTOs (Task 1), `planFor` (Task 2).
- Produces: `createFakeProvider(opts?: { now?: Date }): FakeProvider`, where `FakeProvider extends BillingProvider` and additionally exposes `state` (for assertions) and `failNext(code, retryable)` (for error-path tests). Every test in Tasks 9-12 and all of Phase 3 uses it.

**Deterministic:** no `Date.now()`, no `Math.random()` inside. The clock is injected; ids are sequential (`cus_fake_1`, `sub_fake_1`). A test that passes only sometimes is worse than no test.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/fakeProvider.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createFakeProvider, type FakeProvider } from './fakeProvider'
import { BillingProviderError } from './provider'
import { planFor } from './proration'

// The fake is a test dependency, so its own contract has to hold or every suite
// built on it is testing a fiction. These tests pin the behaviours other suites
// will rely on: deterministic ids, an injected clock, idempotency, and the
// ability to make a call fail on demand.

const NOW = new Date('2026-09-01T00:00:00Z')
let p: FakeProvider

beforeEach(() => { p = createFakeProvider({ now: NOW }) })

describe('createFakeProvider — determinism', () => {
  it('issues sequential customer ids', async () => {
    const a = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const b = await p.ensureCustomer({ orgId: 'o2', name: 'B', email: 'b@x.com', idempotencyKey: 'k2' })
    expect(a.customerId).toBe('cus_fake_1')
    expect(b.customerId).toBe('cus_fake_2')
  })

  it('uses the injected clock, never the wall clock', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k3' })
    expect(sub.currentPeriodStart).toEqual(NOW)
    expect(sub.updatedAt).toEqual(NOW)
  })
})

describe('createFakeProvider — idempotency', () => {
  it('returns the same customer for a repeated key', async () => {
    const a = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const b = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    expect(b.customerId).toBe(a.customerId)
    expect(Object.keys(p.state.customers)).toHaveLength(1)
  })

  it('applies a repeated change once', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const input = {
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'seat-8',
    }
    await p.applyChange(input)
    const second = await p.applyChange(input)
    expect(second.quantity).toBe(8)
    expect(p.state.appliedChanges).toHaveLength(1)
  })
})

describe('createFakeProvider — change semantics mirror the decision table', () => {
  it('applies an immediate change to quantity right away', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const out = await p.applyChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'up',
    })
    expect(out.quantity).toBe(8)
  })

  it('leaves quantity untouched for a deferred change', async () => {
    // A period_end change must NOT be visible on the subscription yet — that is
    // what makes "scheduled downgrade keeps its features" testable upstream.
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    const out = await p.applyChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 5,
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'down',
    })
    expect(out.quantity).toBe(8)
    expect(p.state.scheduledChanges).toHaveLength(1)
  })
})

describe('createFakeProvider — previewChange', () => {
  it('returns zero immediate charge for a deferred change', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    const preview = await p.previewChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 5,
      plan: planFor({ kind: 'seats', from: 8, to: 5 }), idempotencyKey: 'prev',
    })
    expect(preview.immediateChargeCents).toBe(0)
    expect(preview.effectiveImmediately).toBe(false)
  })

  it('returns a positive immediate charge for an upgrade', async () => {
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 5, idempotencyKey: 'k2' })
    const preview = await p.previewChange({
      subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: 8,
      plan: planFor({ kind: 'seats', from: 5, to: 8 }), idempotencyKey: 'prev',
    })
    expect(preview.immediateChargeCents).toBeGreaterThan(0)
    expect(preview.effectiveImmediately).toBe(true)
  })

  it('never returns a negative charge', async () => {
    // Money is unsigned here; a credit belongs in creditAppliedCents.
    const { customerId } = await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
    const sub = await p.createSubscription({ customerId, priceId: 'price_m', quantity: 8, idempotencyKey: 'k2' })
    for (const q of [1, 5, 8, 20]) {
      const preview = await p.previewChange({
        subscriptionId: sub.id, itemId: sub.itemId!, priceId: 'price_m', quantity: q,
        plan: planFor({ kind: 'seats', from: 8, to: q }), idempotencyKey: `p${q}`,
      })
      expect(preview.immediateChargeCents).toBeGreaterThanOrEqual(0)
      expect(preview.creditAppliedCents).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('createFakeProvider — failure injection', () => {
  it('fails the next call with the given code, once', async () => {
    p.failNext('card_declined', false)
    await expect(
      p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' }),
    ).rejects.toThrow(BillingProviderError)
    // The injection is one-shot; the next call succeeds.
    await expect(
      p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k2' }),
    ).resolves.toHaveProperty('customerId')
  })

  it('carries the retryable flag through', async () => {
    p.failNext('rate_limit', true)
    await p.ensureCustomer({ orgId: 'o1', name: 'A', email: 'a@x.com', idempotencyKey: 'k1' })
      .catch((e: BillingProviderError) => {
        expect(e.code).toBe('rate_limit')
        expect(e.retryable).toBe(true)
      })
  })
})

describe('createFakeProvider — webhook verification', () => {
  it('rejects a bad signature', () => {
    expect(() => p.verifyWebhook(Buffer.from('{}'), 'nope')).toThrow()
  })

  it('accepts the sentinel signature and returns the parsed event', () => {
    const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'invoice.paid', created: 1756684800, data: { object: { id: 'in_1' } } }))
    const ev = p.verifyWebhook(body, 'fake-valid-signature')
    expect(ev.id).toBe('evt_1')
    expect(ev.type).toBe('invoice.paid')
    expect(ev.createdAt).toEqual(new Date(1756684800 * 1000))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/fakeProvider.test.ts`
Expected: FAIL — cannot resolve `./fakeProvider`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/fakeProvider.ts
import type { BillingInterval, PreviewResult, SubscriptionStatus } from '@nexus/shared'
import {
  BillingProviderError,
  type BillingProvider, type ChangeInput, type CreateSubscriptionInput,
  type ProviderEvent, type ProviderInvoice, type ProviderPaymentMethod, type ProviderSubscription,
} from './provider'

// ─── The fake provider ───────────────────────────────────────
// A real implementation of BillingProvider backed by memory, so everything
// above the seam can be tested without a Stripe key — which this install does
// not yet have.
//
// Deterministic by construction: the clock is injected and ids are sequential.
// No Date.now(), no Math.random() anywhere in this file. A fake that is
// occasionally non-reproducible turns every suite built on it into a flake.
//
// It is NOT a Stripe simulator. It models the contract our code depends on —
// idempotency, immediate-vs-deferred application, non-negative money — and
// nothing else. Where Stripe's real behaviour matters (proration arithmetic,
// tax), the test clock suite in phase 7 is the authority, not this.

const SEAT_PRICE_CENTS = 5_900   // matches the Growth tier; arbitrary but fixed
const DAYS_IN_PERIOD = 30

export interface FakeState {
  customers: Record<string, { orgId: string; name: string; email: string }>
  subscriptions: Record<string, ProviderSubscription>
  paymentMethods: Record<string, ProviderPaymentMethod[]>
  invoices: Record<string, ProviderInvoice[]>
  appliedChanges: ChangeInput[]
  scheduledChanges: ChangeInput[]
}

export interface FakeProvider extends BillingProvider {
  state: FakeState
  /// Make the next call throw. One-shot, so a test can prove the failure path
  /// without poisoning every subsequent call.
  failNext(code: string, retryable: boolean): void
}

export function createFakeProvider(opts: { now?: Date } = {}): FakeProvider {
  const now = opts.now ?? new Date('2026-01-01T00:00:00Z')
  let seq = 0
  const nextId = (prefix: string) => `${prefix}_fake_${++seq}`

  const state: FakeState = {
    customers: {}, subscriptions: {}, paymentMethods: {},
    invoices: {}, appliedChanges: [], scheduledChanges: [],
  }

  /// Idempotency ledger: key → the result the first call produced.
  const seen = new Map<string, unknown>()
  let pendingFailure: { code: string; retryable: boolean } | null = null

  function checkFailure(): void {
    if (!pendingFailure) return
    const { code, retryable } = pendingFailure
    pendingFailure = null
    throw new BillingProviderError(`fake provider failure: ${code}`, code, retryable)
  }

  /// Replays the first result for a repeated key rather than acting twice.
  function idempotent<T>(key: string, produce: () => T): T {
    if (seen.has(key)) return seen.get(key) as T
    const result = produce()
    seen.set(key, result)
    return result
  }

  const provider: FakeProvider = {
    state,
    failNext(code, retryable) { pendingFailure = { code, retryable } },

    async ensureCustomer({ orgId, name, email, idempotencyKey }) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const customerId = nextId('cus')
        state.customers[customerId] = { orgId, name, email }
        return { customerId }
      })
    },

    async createSetupIntent(customerId) {
      checkFailure()
      return { clientSecret: `seti_${customerId}_secret_fake` }
    },

    async listPaymentMethods(customerId) {
      checkFailure()
      return state.paymentMethods[customerId] ?? []
    },

    async setDefaultPaymentMethod(customerId, paymentMethodId) {
      checkFailure()
      const list = state.paymentMethods[customerId] ?? []
      state.paymentMethods[customerId] = list.map((pm) => ({ ...pm, isDefault: pm.id === paymentMethodId }))
    },

    async detachPaymentMethod(paymentMethodId) {
      checkFailure()
      for (const [cid, list] of Object.entries(state.paymentMethods)) {
        state.paymentMethods[cid] = list.filter((pm) => pm.id !== paymentMethodId)
      }
    },

    async createSubscription({ customerId, priceId, quantity, trialDays, idempotencyKey }: CreateSubscriptionInput) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const id = nextId('sub')
        const end = new Date(now.getTime() + DAYS_IN_PERIOD * 86_400_000)
        const sub: ProviderSubscription = {
          id, customerId, itemId: nextId('si'),
          status: (trialDays ? 'trialing' : 'active') as SubscriptionStatus,
          interval: 'monthly' as BillingInterval,
          priceId, quantity,
          currentPeriodStart: now, currentPeriodEnd: end,
          cancelAtPeriodEnd: false,
          trialEndsAt: trialDays ? new Date(now.getTime() + trialDays * 86_400_000) : null,
          canceledAt: null,
          updatedAt: now,
        }
        state.subscriptions[id] = sub
        return sub
      })
    },

    async previewChange(input) {
      checkFailure()
      const sub = state.subscriptions[input.subscriptionId]
      if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)

      // Half a period remaining, fixed — deterministic, and enough to make
      // "prorated is less than a full period" observable.
      const remainingFraction = 0.5
      const deltaSeats = Math.max(0, input.quantity - sub.quantity)
      const immediate = input.plan.chargeNow
        ? Math.round(deltaSeats * SEAT_PRICE_CENTS * remainingFraction)
        : 0
      const credit = 0   // the fake never issues credit; a deferred change simply costs nothing today

      return {
        immediateChargeCents: immediate,
        creditAppliedCents: credit,
        taxCents: 0,
        nextInvoiceCents: input.quantity * SEAT_PRICE_CENTS,
        nextInvoiceDate: (sub.currentPeriodEnd ?? now).toISOString(),
        proratedLineItems: immediate > 0
          ? [{
              description: `${deltaSeats} additional seat(s)`,
              amountCents: immediate,
              period: { start: now.toISOString(), end: (sub.currentPeriodEnd ?? now).toISOString() },
            }]
          : [],
        newRecurringTotalCents: input.quantity * SEAT_PRICE_CENTS,
        effectiveImmediately: input.plan.timing === 'immediate',
        currency: 'usd',
      } satisfies PreviewResult
    },

    async applyChange(input) {
      checkFailure()
      return idempotent(input.idempotencyKey, () => {
        const sub = state.subscriptions[input.subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)

        if (input.plan.timing === 'immediate') {
          const updated = { ...sub, priceId: input.priceId, quantity: input.quantity, updatedAt: now }
          state.subscriptions[sub.id] = updated
          state.appliedChanges.push(input)
          return updated
        }

        // Deferred: the subscription is unchanged today. This is what lets an
        // upstream test prove a scheduled downgrade keeps its current features.
        state.scheduledChanges.push(input)
        return sub
      })
    },

    async cancelAtPeriodEnd(subscriptionId, idempotencyKey) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const sub = state.subscriptions[subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)
        const updated = { ...sub, cancelAtPeriodEnd: true, canceledAt: now, updatedAt: now }
        state.subscriptions[subscriptionId] = updated
        return updated
      })
    },

    async reactivate(subscriptionId, idempotencyKey) {
      checkFailure()
      return idempotent(idempotencyKey, () => {
        const sub = state.subscriptions[subscriptionId]
        if (!sub) throw new BillingProviderError('no such subscription', 'not_found', false)
        const updated = { ...sub, cancelAtPeriodEnd: false, canceledAt: null, updatedAt: now }
        state.subscriptions[subscriptionId] = updated
        return updated
      })
    },

    async listInvoices(customerId) {
      checkFailure()
      return { items: state.invoices[customerId] ?? [], nextCursor: null }
    },

    verifyWebhook(rawBody, signature) {
      // The sentinel stands in for a real HMAC. Anything else is a rejection,
      // so a test can prove the unsigned path is refused without a secret.
      if (signature !== 'fake-valid-signature') {
        throw new BillingProviderError('invalid signature', 'signature_verification_failed', false)
      }
      const parsed = JSON.parse(rawBody.toString('utf8'))
      return {
        id: parsed.id,
        type: parsed.type,
        createdAt: new Date(parsed.created * 1000),
        data: parsed.data?.object ?? {},
      } satisfies ProviderEvent
    },
  }

  return provider
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/fakeProvider.test.ts`
Expected: PASS — 12 passed

- [ ] **Step 5: Confirm determinism by running it repeatedly**

Run: `cd ~/Nexus-Collab/apps/api && for i in 1 2 3; do npx vitest run src/services/billing/fakeProvider.test.ts 2>&1 | grep -E "Tests "; done`
Expected: three identical lines. Any variation means non-determinism leaked in.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/billing/fakeProvider.ts apps/api/src/services/billing/fakeProvider.test.ts
git commit -m "feat(billing): deterministic in-memory provider for testing without Stripe keys"
```

---

### Task 4: `providerRegistry` — selection and the unconfigured path

**Files:**
- Create: `apps/api/src/services/billing/providerRegistry.ts`
- Test: `apps/api/src/services/billing/providerRegistry.test.ts`

**Interfaces:**
- Consumes: `BillingProvider`, `BillingUnconfiguredError` (Task 1), `createFakeProvider` (Task 3), and — from Task 7 — `createStripeProvider`. Until Task 7 exists, the Stripe branch throws `BillingUnconfiguredError`; Task 7 replaces that line.
- Produces: `getBillingProvider(): BillingProvider`, `resetProviderForTests(): void`.

**Why it matters:** with no `STRIPE_SECRET_KEY`, every call must fail loudly and identically, not return `undefined` and blow up three frames later.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/providerRegistry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getBillingProvider, resetProviderForTests } from './providerRegistry'
import { BillingUnconfiguredError } from './provider'

// This install has no Stripe key yet, so the unconfigured path is the one that
// actually runs today. It must fail closed and say why — not return a broken
// object that fails somewhere less obvious.

const saved = { ...process.env }
beforeEach(() => { resetProviderForTests() })
afterEach(() => { process.env = { ...saved }; resetProviderForTests() })

describe('getBillingProvider — unconfigured', () => {
  it('every method rejects with BillingUnconfiguredError when no key is set', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const p = getBillingProvider()
    await expect(p.ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' }))
      .rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listPaymentMethods('cus_1')).rejects.toThrow(BillingUnconfiguredError)
    await expect(p.listInvoices('cus_1')).rejects.toThrow(BillingUnconfiguredError)
  })

  it('throws rather than returning undefined for the synchronous method', () => {
    delete process.env.STRIPE_SECRET_KEY
    expect(() => getBillingProvider().verifyWebhook(Buffer.from('{}'), 'sig'))
      .toThrow(BillingUnconfiguredError)
  })

  it('does not throw at construction — only on use', () => {
    // Booting an install without billing configured must not crash the API.
    delete process.env.STRIPE_SECRET_KEY
    expect(() => getBillingProvider()).not.toThrow()
  })
})

describe('getBillingProvider — fake', () => {
  it('returns the in-memory provider when BILLING_PROVIDER=fake', async () => {
    process.env.BILLING_PROVIDER = 'fake'
    const p = getBillingProvider()
    await expect(p.ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' }))
      .resolves.toHaveProperty('customerId')
  })

  it('memoises the instance so state persists across calls', async () => {
    process.env.BILLING_PROVIDER = 'fake'
    await getBillingProvider().ensureCustomer({ orgId: 'o', name: 'n', email: 'e@x.com', idempotencyKey: 'k' })
    const p2 = getBillingProvider() as ReturnType<typeof getBillingProvider> & { state?: unknown }
    expect(Object.keys((p2 as any).state.customers)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/providerRegistry.test.ts`
Expected: FAIL — cannot resolve `./providerRegistry`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/providerRegistry.ts
import { BillingUnconfiguredError, type BillingProvider } from './provider'
import { createFakeProvider } from './fakeProvider'

// ─── Provider selection ──────────────────────────────────────
// One place decides which BillingProvider the app is running against, so no
// caller ever has to ask whether Stripe is configured.
//
//   BILLING_PROVIDER=fake  → the in-memory provider (tests, local demos)
//   STRIPE_SECRET_KEY set  → the Stripe provider
//   neither                → a provider whose every method throws
//                            BillingUnconfiguredError
//
// The third case is the one this install is in today, and it is why the
// unconfigured provider is a real object rather than a null: a route that calls
// it gets a typed, catchable error naming the actual problem, instead of a
// TypeError three frames away from the cause.

let cached: BillingProvider | null = null

/** Every method fails. Constructing it does not. */
function unconfiguredProvider(): BillingProvider {
  // Two shapes, deliberately. The async methods must REJECT, not throw
  // synchronously: a caller doing `p.ensureCustomer(...).catch(h)` without an
  // await would otherwise get an uncaught synchronous throw that never reaches
  // its handler, and `.rejects.toThrow()` would not match. Only verifyWebhook
  // is synchronous, so only it throws.
  const fail = async (): Promise<never> => { throw new BillingUnconfiguredError() }
  const failSync = (): never => { throw new BillingUnconfiguredError() }
  return {
    ensureCustomer: fail, createSetupIntent: fail, listPaymentMethods: fail,
    setDefaultPaymentMethod: fail, detachPaymentMethod: fail,
    createSubscription: fail, previewChange: fail, applyChange: fail,
    cancelAtPeriodEnd: fail, reactivate: fail, listInvoices: fail,
    verifyWebhook: failSync,
  } as unknown as BillingProvider
}

export function getBillingProvider(): BillingProvider {
  if (cached) return cached

  if (process.env.BILLING_PROVIDER === 'fake') {
    cached = createFakeProvider()
    return cached
  }

  if (process.env.STRIPE_SECRET_KEY) {
    // Replaced in Task 7 with `cached = createStripeProvider()`. Until the
    // Stripe implementation exists, a set key must not imply a working
    // provider — that would be a worse lie than no key at all.
    cached = unconfiguredProvider()
    return cached
  }

  cached = unconfiguredProvider()
  return cached
}

/** Test hook. Never call this from application code. */
export function resetProviderForTests(): void {
  cached = null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/providerRegistry.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Full gate, then commit and open the PR**

```bash
cd ~/Nexus-Collab/apps/api && npx vitest run && npx tsc --noEmit -p tsconfig.json
cd ~/Nexus-Collab && grep -rn "from 'stripe'" apps/api/src || echo "no stripe imports — seam intact"
git add apps/api/src/services/billing/providerRegistry.ts apps/api/src/services/billing/providerRegistry.test.ts
git commit -m "feat(billing): provider selection with a fail-closed unconfigured path"
git push -u origin feat/billing-provider
gh pr create --base main --title "feat(billing): the provider seam and the change-path decision table" --body "$(cat <<'BODY'
The seam that makes the rest of billing testable before Stripe keys exist. **No file in this PR imports `stripe`.**

- `BillingProvider` is the only thing the rest of the module will know about, with `BillingUnconfiguredError` (operator problem → 503) kept distinct from `BillingProviderError` (Stripe said no, with a `retryable` flag callers branch on).
- `proration.ts` is the spec's §3.2 decision table as a pure function. Beyond one test per row, the suite asserts three invariants across *every* input: nothing charges without prorating, nothing deferred charges now, nothing deferred prorates. A new branch that breaks a money rule fails without anyone remembering to check it.
- The credit-farming guard has its own parameterised test. Immediate seat decrease plus immediate increase mints proration credit; deferring every reduction closes the loop, and "just this one case" is how that hole gets reopened.
- `fakeProvider` is deterministic by construction — injected clock, sequential ids, no `Date.now()` or `Math.random()` anywhere — with one-shot failure injection so error paths are testable.
- With no `STRIPE_SECRET_KEY`, every provider method throws a typed error rather than returning `undefined` and failing three frames later. Constructing it does not throw, so an install without billing configured still boots.

Plan: `docs/superpowers/plans/2026-08-29-billing-02-stripe-provider.md`
BODY
)"
```

---

# PR B5 — `feat/billing-stripe`  *(task detail authored when B4 merges)*

Same convention as Phase 1: a task's `Interfaces / Consumes` block must quote signatures that exist, not ones predicted. B4 fixes `BillingProvider`, so B5's detail is written the moment it lands. Scope is fixed here and must not drift.

| Task | Deliverable |
|---|---|
| 5 | Add `stripe@^17` to `apps/api`. Document `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` in `.env.example` with a note that price ids are per-install and live in `BillingTier`, never in code. |
| 6 | `stripeClient.ts` — lazy singleton, `apiVersion` pinned, throws `BillingUnconfiguredError` when the key is absent. **The only `import Stripe`.** |
| 7 | `stripeMappers.ts` — **pure** functions mapping Stripe objects to `ProviderSubscription` / `ProviderInvoice` / `ProviderPaymentMethod` / `ProviderEvent`, plus upcoming-invoice → `PreviewResult` with `taxCents` as its own line. Fixture-driven tests, no network, no keys. **This is where B5's real test coverage lives.** |
| 8 | `stripeProvider.ts` — implements `BillingProvider` over `stripeClient` + `stripeMappers`. `automatic_tax: { enabled: true }`; `proration_behavior` derived from `ChangePlan` (`immediate+prorate` → `create_prorations`, `period_end` → `none` with `Subscription.schedule`); an idempotency key on every write. Wire it into `providerRegistry` (replacing Task 4's placeholder). |

**Verification gap to state in the PR body:** the mappers are fully tested against captured fixtures; the network calls are not exercised until keys exist. A green suite here is evidence the mapping is right, **not** that Stripe behaves as modelled. Test clocks in Phase 7 are the authority for that.

---

# PR B6 — `feat/billing-webhooks`  *(task detail authored when B5 merges)*

| Task | Deliverable |
|---|---|
| 9 | Mount `POST /api/v1/webhooks/stripe` with `express.raw({ type: 'application/json' })` **above** the global `express.json()` at `index.ts:104`. Below it, signature verification receives a parsed object and fails every time. Unauthenticated and CSRF-exempt by design; the signature *is* the authentication. |
| 10 | `webhookProcessor.processEvent` — insert `BillingEvent` first; return `duplicate` (→200) if `processedAt` is set; process in a transaction; on failure record `processingError`, increment `retryCount`, return `failed` (→500) so Stripe retries. |
| 11 | Out-of-order guard: compare `event.createdAt` against `BillingSubscription.lastStripeEventAt`, discard stale updates as `stale` (→200). Handlers for `customer.subscription.created|updated|deleted`. |
| 12 | `invoice.paid` / `invoice.payment_failed` (sets `gracePeriodEndsAt` at +7 days) / `invoice.upcoming` / `payment_method.attached|detached` / `trial_will_end`. `appendWebhookAudit` inside the transaction. `invalidateEntitlements(orgId)` as the **last** step. |
| 13 | `webhookProcessor.integration.test.ts` — replay one event 100× against a live database, asserting exactly one state change. This is acceptance criterion "webhooks are idempotent" and it is not satisfiable by a unit test. |

**Constraint that outlives this phase:** the processor is the only writer of `BillingSubscription`, `BillingInvoice` and `BillingPaymentMethod`. Phase 3's mutation routes call the provider and return its response; local state converges when the webhook lands. Any route that writes the mirror directly reintroduces a local truth Stripe does not share, which the next webhook silently reverts.
