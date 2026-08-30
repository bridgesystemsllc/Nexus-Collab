# Nexus Subscriptions — Phase 0 Plan (awaiting approval)

## Goal
Take payments for seat-based monthly subscriptions, self-serve, with no manual step — reusing the
billing infrastructure merged in #104-#106 rather than rebuilding it, and without selling modules
that do not exist.

## Approach
Three tracks, gated in order. Track A is a prerequisite for selling to anyone but KarEve.

**Track A — make the tenant boundary real (blocking).**
10 routes call bare `organization.findFirst()`; `Task` carries no `orgId`. Until both are fixed, a
second paying customer can read the first customer's data. This is not optional before charging
strangers.

**Track B — money rails on the existing model.**
Add the `stripe` SDK behind the `BillingProvider` seam that already exists. Stripe Checkout +
Billing Portal (supersedes the Elements plan). Webhook processor writes the mirror; no route ever
writes it. Reuse `BillingSubscription`, `SeatAssignment`, `BillingEvent`, `AuditLog` as-is.

**Track C — make the catalogue match what is sellable.**
Reprice `BillingTier` to the two plans, and define each plan's feature set from modules that
actually exist today. Ship the AI Assistant as a tier feature only once its call sites are on a
live model.

## Steps

### Track A — tenancy (must land first)
- `apps/api/src/middleware/billingContext.ts` — already exports `getActingOrgId(req)`. Sweep the
  10 `organization.findFirst()` call sites onto it: `routes/products.ts:30,74,120`,
  `routes/members.ts:63,198`, `routes/documents.ts:57`, `routes/brandTransition.ts:103,301`,
  `routes/cowork.ts:606`, `services/inventoryImport/feedConfig.ts:125`, `routes/onboarding.ts:193`.
- `services/users/userService.ts:103` `classifyEmail` — scope by `orgId`. Today one org's admin
  inviting an address another org already invited REVOKES that org's pending invitation.
- `packages/prisma/prisma/schema.prisma` — add `orgId` + index to `Task` and any other domain table
  recon lists as unscoped; backfill from the parent Project.
- `scripts/tenancy-audit.ts` — CI check that fails on any unscoped org lookup, so this cannot regress.

### Track B — money rails
- `apps/api/package.json` — add `stripe@^17`. Pin `apiVersion` explicitly in the client constructor.
- `services/billing/stripeClient.ts` — lazy singleton, the ONLY `import Stripe`.
- `services/billing/stripeMappers.ts` — pure Stripe-object -> our DTO mappers. Fixture-tested, no keys needed.
- `services/billing/stripeProvider.ts` — implements the existing `BillingProvider` interface.
- `scripts/stripe-bootstrap.ts` — idempotent catalogue provisioning, look up by `lookup_key` first.
- `routes/billingWebhooks.ts` + `services/billing/webhookProcessor.ts` — raw-body mount ABOVE the
  global `express.json()` at `index.ts:104`, signature verify, `BillingEvent` insert-first
  idempotency, out-of-order guard via `lastStripeEventAt`, transactional handlers,
  `invalidateEntitlements` last.
- `POST /api/v1/billing/checkout` — creates the Checkout Session. Access granted ONLY by webhook.
- `POST /api/v1/billing/portal` — Billing Portal session.
- Seat invite/remove: reuse `seatManager` with the `FOR UPDATE` row lock; Stripe quantity update
  inside the same transaction, roll back on Stripe failure so no unbilled seat is ever created.

### Track C — catalogue
- `packages/shared/src/billing/tiers.ts` — reprice to the agreed plans; `ensureBillingSeeded`
  reconciles on boot (it already upserts by key and deliberately does not overwrite configured prices).
- `FeatureKey` union — replace the current placeholder keys with the modules that genuinely exist.

## Edge cases handled
- Double-clicked checkout -> idempotency key from org+plan+seats.
- Webhook replay -> `BillingEvent.stripeEventId` unique; already built.
- Out-of-order webhooks -> `lastStripeEventAt` high-water mark; column already exists.
- Concurrent invites -> `FOR UPDATE` on the subscription row + the deferred DB trigger that already
  makes overselling impossible at commit.
- Stripe fails mid-invite -> transaction rolls back; no `SeatAssignment` without billing.
- Downgrade -> `pendingTierId` / `pendingChangeEffectiveAt` columns already exist.
- Dunning -> `gracePeriodEndsAt` already exists; `resolve.ts` already returns `read_only` past grace.
- Cross-org IDOR -> `getActingOrgId` reads session only; never a body/param/query.

## Risks
1. **Selling vapor.** 4 of 5 Pro modules do not exist; the Enterprise differentiator is on a retired
   model. Highest risk in this build, and it is a product risk, not an engineering one.
2. **Tenancy.** Charging strangers before Track A lands means cross-customer data exposure.
3. **No migration tooling.** Schema changes go through `db push` on a live database.
4. **AI cost control.** Metering is buildable (3 Anthropic call sites) but the $95 tier's margin is
   unmodelled until those calls work at all.
5. **Replit Agent pushes to main** mid-build; every branch starts with a fetch.
