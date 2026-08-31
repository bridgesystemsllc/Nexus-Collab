# PR B5 — feat/billing-stripe — Stripe provider

## Status
Complete. Typecheck: 0 errors (`cd apps/api && npx tsc --noEmit -p tsconfig.json`).
Tests: `cd apps/api && npx vitest run` → **734 passed / 47 files** (baseline 706 + 28
new mapper tests + net new/replaced providerRegistry tests). No test requires a
Stripe key or makes a network call.

## Commits
1. `d5d2ffe` — feat(billing): pin the Stripe client and refuse a key that does not match the environment
2. `11f85ef` — feat(billing): pure mappers from Stripe objects to provider DTOs
3. `b231306` — feat(billing): the Stripe implementation of BillingProvider

## `unpaid` status decision
`SubscriptionStatus` (packages/shared) models 7 of Stripe's 8 subscription
statuses, omitting `unpaid`. Mapped `unpaid` → `past_due` in
`stripeMappers.ts`'s `STRIPE_STATUS_MAP` — both mean "payment owed, collection
failing, subscription not yet terminated," so grace-period/entitlement logic
built against `past_due` behaves correctly for it. Any other unrecognized or
future Stripe status also falls back to `past_due`, never `active`, so an
unknown state can't silently grant access. Both paths are covered by tests in
`stripeMappers.test.ts` ("maps Stripe's unpaid status..." and "maps an
unrecognised/future status...").

## Shapes that didn't map cleanly
- **`unpaid`** — see above.
- **Non-card payment methods.** `ProviderPaymentMethod` has no `type` field —
  it models a card only. `toProviderPaymentMethod` falls back to placeholder
  card fields (`brand: 'unknown'`, `last4: '0000'`) for a payment method with
  no `card` object (ACH, etc.) rather than throwing. If this account ever
  accepts a non-card method, the DTO needs a variant, not a smarter fallback.
- **`Invoice.status` is nullable** in Stripe's own type (legacy invoices).
  Defaulted to `'draft'`.
- **`recurring.interval`** has 4 values (`day/week/month/year`); our
  `BillingInterval` has 2. Only `year` → `annual`; everything else, including
  a hypothetical `day`/`week` price this catalogue should never create, maps
  to `monthly` as the safer bucket.
- **`current_period_start/end` can be `null`** (e.g. mid-trial with no
  billing period yet) — mapped to `null`, not epoch-0, so no fabricated
  period boundary leaks downstream.
- **Deferred (`period_end`) changes** aren't a single Stripe call — no
  `proration_behavior: 'none'` update alone defers a change to period end.
  Implemented via a Subscription Schedule (create-or-reuse, then two phases);
  this is the most structurally complex part of `stripeProvider.ts` and is
  the piece most worth a close look once live-key verification is possible.

## Single-import grep
```
$ grep -rn "from 'stripe'" apps/api/src
apps/api/src/services/billing/stripeClient.ts:2:import Stripe from 'stripe'
```
Exactly one hit, as required.

## Verification gap
Mappers are fully tested against hand-built fixtures. Every Stripe network
call in `stripeProvider.ts` (customers, subscriptions, invoices, payment
methods, subscription schedules, webhook signature construction against a
real secret) is unexercised until live/test keys exist on this install.

---

## Review fixes (`fix(billing): pin the proration instant, defer deferred changes, and refuse untaxable customers`)

**C1 — deferred change could charge today.** `subscriptionSchedules.update`
now sets top-level `proration_behavior` (via `prorationBehavior(plan)`,
resolving to `'none'` for every `period_end` plan) instead of leaving it to
Stripe's `create_prorations` default. The current phase is also carried
forward field-for-field (`items`, `discounts`, `trial_end`,
`collection_method`, `default_payment_method`, `billing_cycle_anchor`) rather
than rebuilt from just `start_date`/`end_date`/`items`, so a live coupon or
trial on the still-invoicing phase is no longer silently dropped. Fields this
account's schedules don't use (Connect transfer/application-fee data, manual
`add_invoice_items`, per-phase metadata) are still not carried — a schedule
that sets one of those needs a wider copy than this PR gives it.

**C2 + C3 — previewed number ≠ charged number.** `ChangeInput` gained a
required `prorationDate` (unix seconds), computed once by the caller and
reused for both `previewChange` and `applyChange` — the same discipline as
`idempotencyKey`, and for the same reason (the provider must never generate
it from a clock). Both Stripe calls now pass it as
`subscription_details.proration_date` / top-level `proration_date`, and
`toPreviewResult` filters proration lines on `period.start === prorationDate`
so a pending, unbilled proration from an earlier change this period is
excluded from both the aggregate and `proratedLineItems`.

**Did pinning `prorationDate` change any existing test's expected numbers?
No.** The original fixture's two proration lines already shared one
`period.start`, so the new filter is a no-op against it — the bug was a
missing scenario, not a wrong existing expectation. A new fixture/test
(`excludes an earlier, still-unbilled proration line...`) exercises the
actual failure mode (Failure A) with its own new expected numbers.

**C4 — untaxable customer.** `ensureCustomer` accepts an optional `address`
(translated to Stripe's snake_case `address` param). `mapStripeError` gives
`customer_tax_location_invalid` its own code and a message naming the missing
address, rather than letting it fall through the generic path and read
identically to a card decline (both would otherwise be `retryable: false`
with no other distinguishing field).

**I1 — declined upgrade granted the tier.** The immediate `applyChange` path
now sets `payment_behavior: 'error_if_incomplete'` whenever `plan.chargeNow`,
so a declined card fails the whole update instead of landing the item swap
with the subscription in `past_due` (which briefly reads as full access).

**I2 — `phases[0]` assumed to be current.** The phase to preserve is now
located via `schedule.current_phase.start_date`, falling back to `phases[0]`
only when `current_phase` is null (a schedule that hasn't started, which
`from_subscription` never produces).

**I3 — `unpaid` widened into `SubscriptionStatus`.** Added to
`packages/shared/src/billing/types.ts`; `resolve.ts`'s `accessFor` gives it
its own unconditional `read_only` case (never grace-period-gated, unlike
`past_due`); `stripeMappers.ts` maps it 1:1 and its unrecognised/future-status
fallback changed from `past_due` → `paused` (the latter is unconditionally
`read_only`; `past_due` can still resolve `full` under a live grace
timestamp, so it wasn't actually the fail-closed default it looked like).
`pnpm build:shared` run after the type change. `apps/web/.../present.ts`
also given an `unpaid` case (was falling through to the generic `default`,
showing the raw status string).

**Tests.** New `stripeProvider.test.ts` (21 tests): `mapStripeError`
classification (including the tax-location/card-decline distinction),
idempotency-key threading on every write, `proration_date`/
`payment_behavior` on the immediate path, and the deferred-schedule path
(C1's proration_behavior + field preservation, I2's current-phase lookup over
completed phases, the derived schedule-update idempotency key). All Stripe
access is `vi.mock('./stripeClient')` — no network, no key. `stripeMappers.test.ts`
gained the earlier-proration-line exclusion test and an explicit
`nextInvoiceDate` precedence test (and fixed its own `next_payment_attempt`/
`period_end` fixture ordering, which was chronologically inconsistent).

**Not fixed / residual gaps:** the current-phase copy still omits Connect
transfer/application-fee fields, manual `add_invoice_items`, and per-phase
metadata (noted above, C1). Everything else in the review was addressed.

## Final verification
`cd apps/api && npx tsc --noEmit -p tsconfig.json` → 0 errors.
`cd apps/web && npx tsc -p tsconfig.json` → 0 errors (packages/shared was
widened; web has no exhaustive switch over `SubscriptionStatus` so this was a
low-risk check, not a required gate).
`cd apps/api && npx vitest run` → **760 passed / 48 files**, zero network
calls, zero Stripe keys required.
`grep -rn "from 'stripe'" apps/api/src` → exactly one hit (`stripeClient.ts`).
