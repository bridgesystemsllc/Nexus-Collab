# Nexus Billing & Subscription — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the per-phase plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Nexus organization self-serve, Stripe-backed, per-seat subscription billing — tier changes, seat changes, proration previews, dunning — with entitlements enforced server-side and Stripe as the authority for subscription state.

**Architecture:** Stripe holds subscription truth; Postgres holds a webhook-fed mirror; a single server-side resolver derives entitlements from that mirror and is the only way any code learns what an org may do. Every Stripe call goes through a `BillingProvider` interface so the entire module above the provider is unit-testable without Stripe credentials. Billing sits behind the existing RBAC `billing:manage` permission and writes to the existing append-only `AuditLog`.

**Tech Stack:** Node 20 · **Express 4** (not Fastify — see Spec Deltas) · Prisma 5 + Postgres · Redis (ioredis, optional) · React 18 + Vite + TypeScript · TanStack Query · Stripe Billing + Elements + Tax

**Spec:** The build prompt "Nexus Billing & Subscription Module" as issued 2026-08-25, amended by the Locked Decisions and Spec Deltas below.

---

## Locked Decisions (confirmed 2026-08-25)

| Question | Answer |
|---|---|
| Product model | **Commercial SaaS.** Full spec, including fixing the tenancy gap. |
| Stripe access | **Account exists, keys come later.** Build provider-agnostic and unit-tested now; the Stripe integration + test-clock suite is blocked pending keys. |
| Audit trail | **Extend the existing `AuditLog`.** No separate `billing_audit_log` table. |

Plus the spec's own locked decisions, unchanged: Stripe as processor; card data never touches our servers (Elements + SetupIntent, SAQ-A); Stripe authoritative for subscription state, our DB a mirror; our server authoritative for entitlements; per-seat licensed quantity × tier price; every billing row scoped by org; upgrades immediate and prorated; downgrades scheduled for period end with no refund.

---

## Spec Deltas — where the build prompt and the repo disagree

These are resolved decisions, not open questions. Recorded so no executor re-litigates them.

| # | Spec said | Repo is | Resolution |
|---|---|---|---|
| D1 | Fastify, `preHandler` middleware | **Express 4** (`apps/api/src/index.ts`) | Use Express. Guards are `RequestHandler`s composed like the existing `requirePermission()`. |
| D2 | "Write migrations" | **No `prisma migrate` history exists.** No `packages/prisma/prisma/migrations/` dir. Schema is applied with `prisma db push`; structural invariants live in idempotent boot-time ensures (`ensureRbacSeeded`, `ensureDepartmentStructure`, `ensureEmailsNormalised` in `index.ts:start()`) | Do **not** introduce `prisma migrate` in this build — baselining a 1446-line schema is its own project and would collide with the Replit Agent pushing to main. Schema changes go in `schema.prisma` + `pnpm db:push`. The one constraint Prisma cannot express (the seat invariant trigger) ships as idempotent raw SQL in `ensureBillingSeeded()`. |
| D3 | snake_case tables (`billing_tiers`) | Repo uses PascalCase models / camelCase fields, no `@@map` (except `Session`) | Follow the repo. `BillingTier`, `orgId`, `seatsPurchased`. The spec's SQL is read as a field inventory, not literal DDL. |
| D4 | `organization_id` on every row | Repo names the column `orgId` with relation `org` | Use `orgId` / `org` throughout. |
| D5 | Separate `billing_audit_log` | `AuditLog` exists: append-only, secret-redacting, transactional, with a `/audit` read UI and `services/users/auditService.ts` | Extend `AuditLog` with `orgId` + billing actions/entityTypes. Billing mutations then appear in Settings → Audit for free. |
| D6 | Roles `owner`, `billing_admin` | `billing:manage` **already exists** in `packages/shared/src/rbac/catalogue.ts:61`; `owner` holds it, `admin` is explicitly denied it (`catalogue.ts:94`) | Gate on **permissions, not role names**. Mutations require `billing:manage`. Reads require a new `billing:read`, granted to owner + admin. No new roles. |
| D7 | Accent `#7C3AED` | Global `--accent` is `#2F80ED`; `#7C3AED` is already `--accent-secondary` | Scope the override to the billing module: `.billing-module { --accent: #7C3AED; --accent-hover: #6D28D9; --accent-glow: rgba(124,58,237,0.20); --accent-subtle: rgba(124,58,237,0.08); }`. Do **not** change the global token — every other screen depends on it. |
| D8 | JetBrains Mono for numerics | Not loaded anywhere | Add the font via the existing font pipeline and a `.numeric` utility carrying `font-variant-numeric: tabular-nums`. |
| D9 | E2E tests (upgrade, add-seat, dunning) | No Playwright or Cypress in the repo | Introducing an E2E harness is out of scope for this build. Phase 7 delivers integration-level coverage through the existing `vitest.integration.config.ts` (serial, live DB) driving the API. **This is a stated coverage gap** — flag it in the Phase 7 PR. |
| D10 | Rate-limit 10/min/org | `middleware/rateLimit.ts` is in-memory and per-process; the file's own comment says a multi-instance deploy doubles the effective limit | Acceptable for billing mutations (they guard against double-submit, not credentials) **provided** every mutation is additionally idempotent server-side. Use the existing limiter; do not build a Redis limiter in this build. |
| D11 | Subscription state model | — | The mirror is written **only** by the webhook processor, never by a route handler. A mutation route calls Stripe, then returns the provider's response; local state converges when the webhook lands. This is what makes edge case 6 (webhook races the API response) trivially correct. |

### Stale-memory correction

A prior note claimed `prisma db push` wants to drop the `session` table created by `connect-pg-simple`. **That is no longer true** — `model Session` with `@@map("session")` is now in `schema.prisma:49`. `db push` is safe on this axis. Verify with `prisma migrate diff` before pushing anyway.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node** `>=20.0.0`. **TypeScript** `^5.4`. **Prisma** `^5.22`. **Express** `^4.21`. **Zod** `^3.23`. **React** `^18.3`. **vitest** `^3.2`.
- **New runtime deps, exact:** `stripe@^17` (API), `@stripe/stripe-js@^4` + `@stripe/react-stripe-js@^2` (web). No other new dependencies without flagging in the PR.
- **API base** is `/api/v1`. Billing routes mount at `/api/v1/billing`. The webhook mounts at `/api/v1/webhooks/stripe`.
- **Every billing route** derives `orgId` from `req.member.orgId` via `getActingOrgId(req)`. Reading an org id from a body, param, or query string is a **defect**, not an input — there is no route in this module where a client names its own org.
- **Money is integer cents, everywhere,** server and client. No floats. No client-side proration arithmetic ever. The only client-side currency operation permitted is `Intl.NumberFormat` formatting for display.
- **`maxSeats: null` means unlimited.** Every ceiling check goes through `exceedsSeatCeiling(seats, maxSeats)` — never a bare `seats > tier.maxSeats`, which is `false` for `null` and silently grants infinity to the wrong tier.
- **Fail closed.** Any error resolving entitlements, permissions, or Stripe state produces a refusal, never a pass. This matches `requirePermission.ts`'s existing posture.
- **Error envelope** is the module standard from `middleware/requirePermission.ts`: `sendError(res, CODE, message, extra)` producing `{ error: { code, message, requestId, ... } }`. Do not invent a second error shape.
- **Audit appends run inside the caller's transaction** and are allowed to fail the mutation — same contract as `auditService.append`. An unaudited billing change is worse than no change.
- **Never log** Stripe secret keys, full card data, or raw webhook payloads at `info`. `BillingEvent.payload` stores the Stripe object; it is not written to stdout.
- **Copy rule:** user-facing billing copy states amounts with currency and period explicitly ("$59.00 / seat / month"), and every scheduled change states its effective date. Never "you will be charged later".
- **PR rule:** every task group below is its own branch off `main` and its own PR. Never stack a PR on another feature branch. `git fetch` before branching — the Replit Agent pushes to `main` directly.

---

## Tenancy — scope and boundary

Recon finding: `auth/session.ts` resolves an organization with `prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })`, and `Member.email` is `@unique` **globally**. Nexus is multi-tenant in schema and single-tenant in behaviour.

Selling to external organizations makes that a correctness problem, but a full org-scoping sweep of ~40 route files is a larger project than this billing module. This build therefore fixes **org resolution and identity**, and produces a written inventory of the rest:

**In scope (Phase 1):**
- `Organization.entraTenantId` (unique, nullable) — the Entra `tid` claim becomes the org key at login.
- `upsertMemberFromMicrosoft` resolves the org by `entraTenantId`, falling back to invite-binding. `findFirst()` is deleted.
- `Member.email` `@unique` → `@@unique([orgId, email])`, with a pre-flight collision check that refuses rather than guessing (mirrors `ensureEmailsNormalised`'s posture).
- `getActingOrgId(req)` helper — the single sanctioned way any handler learns the acting org.

**Out of scope, delivered as a document:** `docs/billing.md` §Tenancy carries an inventory of every route and service that still reads org implicitly (via `findFirst`, a global query, or an unscoped `findMany`), ranked by exposure. That inventory drives a follow-on PR set that is **not** part of this build.

---

## File Structure

### Shared (`packages/shared/src/`)
| File | Responsibility |
|---|---|
| `billing/types.ts` | `TierKey`, `FeatureKey`, `BillingInterval`, `SubscriptionStatus`, `AccessLevel`, `Entitlements`, `PreviewResult`, `ChangePlan`. The single vocabulary both sides import. |
| `billing/tiers.ts` | The seed catalogue as data (Starter/Growth/Professional/Enterprise, prices, min/max seats, feature matrix). Consumed by the seed script *and* the boot-time ensure — a second copy is how they drift. Mirrors the `rbac/catalogue.ts` pattern exactly. |
| `billing/seats.ts` | `exceedsSeatCeiling(seats, maxSeats)`, `seatsAvailable(purchased, consumed)`. Pure, shared, so the UI and the API cannot disagree about the ceiling. |
| `rbac/catalogue.ts` | **Modify** — add `billing:read`; grant to `owner` + `admin`. |

### API (`apps/api/src/`)
| File | Responsibility |
|---|---|
| `services/billing/provider.ts` | `BillingProvider` interface + typed `BillingProviderError`. The seam that makes "keys come later" work. |
| `services/billing/stripeProvider.ts` | The Stripe implementation. **The only file that imports `stripe`.** |
| `services/billing/fakeProvider.ts` | In-memory provider for unit and integration tests. |
| `services/billing/providerRegistry.ts` | Selects provider from env; returns a provider that throws `BILLING_UNCONFIGURED` when `STRIPE_SECRET_KEY` is absent. |
| `services/billing/catalogue.ts` | Reads `BillingTier` + `BillingTierFeature` from the DB. Memoised 60s. |
| `services/billing/resolve.ts` | **Pure.** `resolve(input: ResolverInput): Entitlements`. No I/O. Where the status→access matrix lives. Heavily unit-tested. |
| `services/billing/entitlements.ts` | `resolveEntitlements(orgId)` — loads snapshots, calls `resolve`, caches. |
| `services/billing/entitlementCache.ts` | Redis 60s TTL with in-process fallback when `REDIS_URL` is unset. `invalidate(orgId)`. |
| `services/billing/seatManager.ts` | `assignSeat` / `releaseSeat` / `countConsumed`, with `FOR UPDATE` row lock on the subscription. |
| `services/billing/proration.ts` | **Pure.** The §3.2 decision table → `ChangePlan { timing, prorate, chargeNow }`. No Stripe, no DB. |
| `services/billing/preview.ts` | `previewChange(orgId, change)` → `PreviewResult`. Delegates arithmetic to the provider. |
| `services/billing/subscriptionService.ts` | Tier change, seat change, cancel, reactivate. Calls provider, audits, invalidates. Never writes the mirror. |
| `services/billing/webhookProcessor.ts` | Idempotency, out-of-order rejection, transactional handlers, cache invalidation. **The only writer of the mirror.** |
| `services/billing/billingAudit.ts` | Billing action vocabulary over `auditService.append`. |
| `services/billing/bootstrap.ts` | `ensureBillingSeeded(prisma)` — tier catalogue + the seat-invariant trigger. Idempotent. Called from `start()`. |
| `middleware/requireEntitlement.ts` | `requireFeature(key)`, `requireSeatAvailable()`. |
| `middleware/billingContext.ts` | `getActingOrgId(req)`. |
| `routes/billing.ts` | Authed routes with Zod schemas. |
| `routes/billingWebhooks.ts` | Raw-body, signature-verified, unauthenticated, CSRF-exempt. |

### Web (`apps/web/src/features/billing/`)
`api/billingApi.ts` · `hooks/useBilling.ts` · `hooks/useEntitlements.ts` · `pages/BillingPage.tsx` · `sections/{Overview,Plans,Seats,PaymentMethods,Invoices}Section.tsx` · `components/{StatusCard,KpiCell,TierCard,ComparisonTable,ChangeConfirmModal,ProrationSummary,SeatUsageBar,DunningBanner,PendingChangeBanner,Money,AddCardModal,EmptyState}.tsx` · `styles/billing.css`

---

## Interfaces — fixed now so later phases are mechanical

```ts
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
  timing: 'immediate' | 'period_end'
  prorate: boolean
  chargeNow: boolean
}
```

```ts
// apps/api/src/services/billing/provider.ts
export interface BillingProvider {
  ensureCustomer(input: { orgId: string; name: string; email: string }): Promise<{ customerId: string }>
  createSetupIntent(customerId: string): Promise<{ clientSecret: string }>
  listPaymentMethods(customerId: string): Promise<ProviderPaymentMethod[]>
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>
  detachPaymentMethod(paymentMethodId: string): Promise<void>
  createSubscription(input: CreateSubscriptionInput): Promise<ProviderSubscription>
  previewChange(input: ChangeInput): Promise<PreviewResult>
  applyChange(input: ChangeInput): Promise<ProviderSubscription>
  cancelAtPeriodEnd(subscriptionId: string): Promise<ProviderSubscription>
  reactivate(subscriptionId: string): Promise<ProviderSubscription>
  listInvoices(customerId: string, cursor?: string): Promise<{ items: ProviderInvoice[]; nextCursor: string | null }>
  verifyWebhook(rawBody: Buffer, signature: string): ProviderEvent
}

/// Thrown when STRIPE_SECRET_KEY is absent. Routes map it to a 503 with a
/// retryable flag — §5.7 requires failing closed, never writing local state
/// optimistically.
export class BillingUnconfiguredError extends Error {}
```

```ts
// apps/api/src/services/billing/resolve.ts  (pure)
export interface ResolverInput {
  subscription: SubscriptionSnapshot | null
  tier: TierSnapshot | null
  features: Array<{ featureKey: FeatureKey; isEnabled: boolean; limitValue: number | null }>
  seatsConsumed: number
  now: Date
}
export function resolve(input: ResolverInput): Entitlements
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
// apps/api/src/middleware/billingContext.ts
export function getActingOrgId(req: Request): string   // throws if no member on request
```

### The status → access matrix (the heart of `resolve.ts`)

| `status` | within grace? | `accessLevel` | features |
|---|---|---|---|
| no subscription row | — | `locked` | all `false` |
| `trialing` | — | `full` | tier's matrix |
| `active` | — | `full` | tier's matrix |
| `past_due` | yes (`now <= gracePeriodEndsAt`) | `full` | tier's matrix |
| `past_due` | no | `read_only` | tier's matrix |
| `incomplete` | — | `locked` | all `false` |
| `incomplete_expired` | — | `locked` | all `false` |
| `paused` | — | `read_only` | tier's matrix |
| `canceled`, `now < currentPeriodEnd` | — | `full` | tier's matrix |
| `canceled`, `now >= currentPeriodEnd` | — | `read_only` | tier's matrix |

`read_only` never deletes data and never hides it — it refuses writes. §5.4 is explicit that lockout is not deletion.

---

## Data Model

New Prisma models, repo conventions (PascalCase model, camelCase fields, `orgId`/`org`, `createdAt`/`updatedAt`).

- **`BillingTier`** — `key`, `displayName`, `description`, `sortOrder`, `stripePriceIdMonthly?`, `stripePriceIdAnnual?`, `unitAmountMonthlyCents`, `unitAmountAnnualCents`, `minSeats`, `maxSeats Int?` *(null = ∞)*, `isCustomQuote`, `isActive`, `rank` *(for upgrade/downgrade comparison — the spec omits it and `sortOrder` is presentation, not ordering semantics)*.
- **`BillingTierFeature`** — `tierId`, `featureKey`, `isEnabled`, `limitValue Int?`. `@@unique([tierId, featureKey])`.
- **`BillingSubscription`** — `orgId @unique`, `tierId`, `stripeCustomerId`, `stripeSubscriptionId?`, `stripeSubscriptionItemId?`, `status`, `billingInterval`, `seatsPurchased`, `currentPeriodStart?`, `currentPeriodEnd?`, `cancelAtPeriodEnd`, `trialEndsAt?`, `canceledAt?`, `pendingTierId?`, `pendingSeats?`, `pendingChangeEffectiveAt?`, `gracePeriodEndsAt?`, **`lastStripeEventAt?`** *(added — the out-of-order guard from §3.3.4 needs a stored high-water mark)*.
- **`SeatAssignment`** — `orgId`, `memberId`, `assignedAt`, `assignedByMemberId?`, `releasedAt?`. Partial unique index on `(orgId, memberId) WHERE releasedAt IS NULL`, created as raw SQL in `ensureBillingSeeded` (Prisma 5 cannot express a partial unique index).
- **`BillingPaymentMethod`** — `orgId`, `stripePaymentMethodId @unique`, `brand`, `last4`, `expMonth`, `expYear`, `isDefault`.
- **`BillingInvoice`** — `orgId`, `stripeInvoiceId @unique`, `number?`, `status`, `amountDueCents`, `amountPaidCents`, `currency`, `periodStart?`, `periodEnd?`, `hostedInvoiceUrl?`, `invoicePdfUrl?`, `attemptCount`, `nextPaymentAttemptAt?`.
- **`BillingEvent`** — `stripeEventId @unique`, `eventType`, `orgId?`, `payload Json`, `processedAt?`, `processingError?`, `retryCount`.
- **`AuditLog`** — **modify**: add `orgId String?` + `@@index([orgId, createdAt(sort: Desc)])`.
- **`Organization`** — **modify**: add `entraTenantId String? @unique`, plus back-relations for the models above.
- **`Member`** — **modify**: `email` loses global `@unique`, gains `@@unique([orgId, email])`; add `seatAssignments SeatAssignment[]`.

### The seat invariant

`seatsPurchased >= count(SeatAssignment WHERE orgId = ? AND releasedAt IS NULL)`.

A Postgres `CHECK` cannot contain a subquery, so this ships as a **deferrable constraint trigger** on both tables, created idempotently in `ensureBillingSeeded()`. Deferred to commit time so a legitimate "assign seat + expand subscription" transaction can pass through an intermediate violating state. Application logic enforces it *as well* — the trigger is the backstop that makes overselling impossible, not the primary error path, because a trigger cannot produce a good error message.

---

## Phase & PR Map

Each PR branches from `main`. Do not begin a phase before the prior phase's tests pass.

| Phase | PR | Branch | Deliverable | Blocked on Stripe keys? |
|---|---|---|---|---|
| **1** | B1 | `feat/billing-tenancy` | Org resolution by Entra tid, per-org email uniqueness, `getActingOrgId` | No |
| **1** | B2 | `feat/billing-schema` | Prisma models, `ensureBillingSeeded`, seat trigger, tier catalogue + seed, catalogue service | No |
| **1** | B3 | `feat/billing-entitlements` | Pure `resolve.ts` + full unit suite, cache, `resolveEntitlements`, `requireFeature`/`requireSeatAvailable`, `billing:read`, `GET /billing/entitlements` | No |
| **2** | B4 | `feat/billing-provider` | `BillingProvider` interface, `fakeProvider`, registry, `proration.ts` + unit suite | No |
| **2** | B5 | `feat/billing-stripe` | `stripeProvider.ts`, `.env.example`, customer + subscription CRUD, preview mapping | **Yes** — code lands, live verification deferred |
| **2** | B6 | `feat/billing-webhooks` | Raw-body mount, signature verify, `BillingEvent` idempotency, out-of-order guard, transactional handlers, cache invalidation | Partly — idempotency/ordering testable against `fakeProvider` |
| **3** | B7 | `feat/billing-seats` | `seatManager` with `FOR UPDATE`, auto-expand, release-without-reduce | No |
| **3** | B8 | `feat/billing-api` | All `/api/v1/billing` routes, Zod schemas, permission guards, rate limits, audit | No |
| **4** | B9 | `feat/billing-ui-shell` | Tab shell, `billing.css` scoped accent, JetBrains Mono, `Money`, skeletons, `useBilling`/`useEntitlements` | No |
| **4** | B10 | `feat/billing-ui-overview` | Status card, KPI cells, pending-change banner, dunning banner | No |
| **4** | B11 | `feat/billing-ui-plans` | Tier cards, interval toggle, comparison table, confirm modal wired to `/preview`, downgrade blocks | No |
| **5** | B12 | `feat/billing-ui-seats` | Seat table, inline expansion flow, bulk stepper, remove-nudge | No |
| **5** | B13 | `feat/billing-ui-payment` | Elements modal, card list, expiry warnings, last-card block | **Yes** — needs publishable key |
| **5** | B14 | `feat/billing-ui-invoices` | Invoice table, filters, CSV export, retry action | No |
| **6** | B15 | `feat/billing-edge-cases` | §5 items 1–14 top to bottom, each with a test | No |
| **6** | B16 | `feat/billing-dunning` | Grace countdown, read-only lockout enforcement across the app | No |
| **7** | B17 | `feat/billing-hardening` | Test-clock suite, webhook load test, a11y pass, `docs/billing.md` | **Yes** — test clocks need keys |

**Critical path if keys stay absent:** B1→B4, B6 (against fake), B7, B8, B9→B12, B14, B15, B16 all ship. B5, B13, B17 land as code with a documented verification gap. That gap must be named in each PR body — a green suite against `fakeProvider` is not evidence that Stripe behaves as modelled.

---

## Per-Phase Task Summaries

Phase 1 is expanded to full bite-sized TDD detail in `2026-08-25-billing-01-foundations.md`. Phases 2–7 are authored as their predecessor lands, because each plan's `Interfaces / Consumes` block must quote signatures that exist. The scope of each is fixed by the PR map above and must not drift.

### Phase 2 — Provider + Stripe + Webhooks (B4–B6)
1. `BillingProvider` interface and `BillingUnconfiguredError`.
2. `fakeProvider` — in-memory, deterministic, with a settable clock (no `Date.now()` inside).
3. `providerRegistry` — env-driven; absent key yields a provider whose every method throws `BillingUnconfiguredError`.
4. `proration.ts` `planFor()` — the §3.2 decision table as pure code. Test every row, including the credit-farming guard (seat decrease is always `period_end`).
5. `stripeProvider` — `automatic_tax: true`, `proration_behavior` from `planFor`, idempotency keys on every write.
6. Webhook mount **before** `express.json()`. `app.use('/api/v1/webhooks/stripe', express.raw({ type: 'application/json' }), billingWebhookRoutes)` must be registered in `index.ts` above the global `app.use(express.json(...))` at line ~100, or the signature check receives a parsed object and fails every time.
7. Processor: insert `BillingEvent` first → return 200 if already `processedAt` → handle in a transaction → on failure record `processingError`, increment `retryCount`, return 500 → discard events whose `event.created` predates `lastStripeEventAt` → invalidate cache last.

### Phase 3 — Seats + API (B7–B8)
1. `seatManager.assignSeat` — `$transaction` + `SELECT id FROM "BillingSubscription" WHERE "orgId" = $1 FOR UPDATE` via `$queryRaw`, re-read consumed count inside the lock, auto-expand when full, audit, invalidate.
2. `releaseSeat` — sets `releasedAt`; **never** reduces `seatsPurchased`.
3. All 18 routes from spec §3, each with a Zod schema, `requirePermission('billing:manage')` on mutations / `billing:read` on reads, `hit()` rate limit at 10/min keyed on `orgId`.
4. `GET /invoices/:id/pdf` issues a redirect to the Stripe-hosted URL after verifying the invoice belongs to the acting org — never proxy the PDF.

### Phase 4 — UI Overview + Plans (B9–B11)
Design non-negotiables from spec §4.6, plus D7 (module-scoped accent) and D8 (JetBrains Mono). Confirm modal's primary CTA stays disabled until `/preview` resolves; it renders the server's numbers verbatim.

### Phase 5 — Seats + Payment + Invoices (B12–B14)
The inline seat-expansion panel is the module's signature interaction: it must show the server's prorated figure, not a computed one, and the projected total cross-fades as the stepper moves.

### Phase 6 — Edge cases + dunning (B15–B16)
Work spec §5 items 1–14 in order. Each gets a named test. Item 12 (member deleted while holding a seat) is a domain event in `userService`'s deactivation path, not a DB trigger — the trigger cannot audit, and an unaudited seat release breaks the §8 acceptance criterion.

### Phase 7 — Hardening (B17)
Test clocks for renewal / upgrade / downgrade / failure / retry / cancel. Webhook replay ×100 asserting one state change. Full a11y pass. `docs/billing.md` with architecture, webhook contract, support runbook, and the §Tenancy inventory.

---

## Acceptance Criteria — mapped to where they are proven

| Criterion | Proven by |
|---|---|
| Self-serve upgrade / downgrade / add / remove seats | B8 routes + B11/B12 UI; integration test per path |
| Exact prorated amount shown, charged amount matches to the cent | B5 preview mapping + B11 modal renders verbatim; test-clock assertion in B17 |
| Seats purchased never below seats assigned | B2 deferred trigger + B7 row lock; concurrency test in B15 (edge case 5) |
| Server-side feature enforcement | B3 `requireFeature`; test asserts a request with a forged client flag is refused |
| Idempotent webhooks | B6 `BillingEvent` unique index; B17 replay ×100 test |
| Every mutation in the audit log with a resolvable actor | B8 audit calls inside each mutation's transaction; assertion per route test |
| Dunning → banner → grace → read-only, no data loss | B16; `resolve.ts` matrix already encodes it and is unit-tested in B3 |
| Dark + light both pass design review | B9–B14, checked per PR |
| Tabular figures + correct locale | `Money.tsx` is the only currency renderer; lint rule forbids raw `toFixed` in `features/billing` |
| Stripe test-clock suite | B17 — **blocked pending keys** |

---

## Known Risks

1. **The Replit Agent pushes to `main`.** Every branch starts with `git fetch`. A long-lived billing branch will conflict; keep PRs small and merge fast.
2. ~~`pnpm --filter @nexus/api build` already fails on `main`.~~ **Corrected 2026-08-25:** measured at `c295960`, both `tsc --noEmit` and the API build are clean — PR #101 fixed the 45 typecheck errors. The gate is zero errors with no filtering.
3. **No E2E harness** (D9). Stated coverage gap.
4. **Stripe keys absent** — B5, B13, B17 ship unverified against live Stripe.
5. **The tenancy sweep is deliberately incomplete.** Billing is correctly org-scoped; the rest of Nexus is not yet. Onboarding a second organization is unsafe until the follow-on PR set from the `docs/billing.md` inventory lands. **This must be stated in the B1 PR body.**
