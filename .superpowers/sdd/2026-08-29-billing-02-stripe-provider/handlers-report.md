# Webhook handlers — implementation report

New file: `apps/api/src/services/billing/webhookHandlers.ts`, wired into the
`eventHandlers` table in `webhookProcessor.ts`. `catalogue.ts` gained
`findTierByPriceId` and both catalogue functions now accept `Tx` as well as
`PrismaClient` (needed to query the catalogue from inside the webhook's
transaction). `auditService.ts` gained three `AuditAction` entries the
original foundations list didn't name: `billing.subscription_synced`,
`billing.invoice_upcoming`, `billing.trial_will_end`.

## Handlers

- **`customer.subscription.created` / `.updated`** — share one `syncSubscription`.
  Maps via `toProviderSubscription`, resolves `tierId` from the price id via
  `findTierByPriceId` (throws — not `unhandled`, a real `failed` — on no
  match), syncs status/seats/interval/periods/cancelAtPeriodEnd/trial/canceled,
  and advances `lastStripeEventAt` (every handler touching
  `BillingSubscription` must, or the out-of-order guard never moves). Created
  uses audit action `billing.subscription_created`; updated uses the new
  `billing.subscription_synced` (no existing action named a plain sync).
- **Pending-change rollover**: read separately via `findUniqueOrThrow` (the
  ordering guard's `LinkedSubscription` projection is too narrow). If
  `pendingChangeEffectiveAt` is set and the incoming `currentPeriodStart` is
  on/after it, the pending `tierId`/`seatsPurchased` win over whatever the
  event's own price/quantity say, and all three pending fields clear. This is
  deliberately independent of what price Stripe reports on the item — belt
  and suspenders against a schedule that didn't flip the price exactly when
  expected.
- **`customer.subscription.deleted`** — status → `canceled`, stamps
  `canceledAt`; row and `currentPeriodEnd` untouched.
- **`invoice.paid`** — upserts `BillingInvoice`, clears `gracePeriodEndsAt`.
- **`invoice.payment_failed`** — upserts `BillingInvoice`, sets
  `gracePeriodEndsAt = event.createdAt + 14d` only when it was previously
  null (re-stamp guard, tested with a second failure). 14 supersedes the
  master plan's 7 — noted in `resolve.ts` and in the handler's own comment.
- **`invoice.upcoming`** — audit-only (`billing.invoice_upcoming`, new
  action). Does not upsert `BillingInvoice` (that table mirrors real
  invoices, not previews) or touch the subscription.
- **`payment_method.attached` / `.detached`** — upsert/delete
  `BillingPaymentMethod`. Attach can't know the true "default" flag (Stripe
  reports that on the customer object, not this event) — `isDefault` stays
  `false` on create and the field is omitted from the `update` branch, so an
  existing default is never regressed.
- **`customer.subscription.trial_will_end`** — audit-only, new action
  `billing.trial_will_end`. **Not implemented: notification delivery.** No
  email/notification service exists yet in billing; this PR only records and
  audits the event.

## Org resolution

Every handler calls a shared `requireContext(ctx)` that throws when
`ctx.subscription`/`ctx.orgId` is null — an unknown Stripe customer now
returns `failed`, never `unhandled`.

## Tests / verification

`webhookProcessor.test.ts` extended to 22 tests (fake prisma now models
`billingTier`, `billingInvoice`, `billingPaymentMethod`, `auditLog` in
addition to the existing `billingEvent`/`billingSubscription`). The three
pre-existing generic-machinery tests that asserted `unhandled` for the
default event type were repointed at an event type outside the table
(`customer.updated`), since all nine real types now dispatch to real
handlers.

Status: complete. Typecheck: 0 errors. Full suite: 918 passing / 62 files
(baseline 903 + 15 new).

## Review response (do-not-merge → addressed)

### C1 — ordering guard rescoped

`eventHandlers` entries are now `{ handler, ordered }`. `ordered: true` is
set on exactly the three `customer.subscription.*` handlers — the only ones
that write the `BillingSubscription` fields `lastStripeEventAt` protects,
and the only ones that advance it. `invoice.paid`, `invoice.payment_failed`,
`invoice.upcoming`, `payment_method.attached/.detached`, and
`trial_will_end` are `ordered: false` and no longer participate in the
staleness check at all — `invoice.paid`/`invoice.payment_failed` also no
longer write `lastStripeEventAt`. `processEvent` only runs the
`event.createdAt < lastStripeEventAt` comparison when `entry.ordered` is
true. Equal-second events are explicitly NOT stale (last writer wins) —
documented in the contract comment and covered by a dedicated test.
`invalidateEntitlements` is now wrapped in try/catch (I4) so a cache blip
after commit can't turn an already-applied event into an HTTP 500 retry.

New regression tests reproduce both directions of the original race
(`invoice.paid` arriving first no longer stales a same-second
`subscription.updated`, and vice versa) and prove an unordered type still
applies even when older than the subscription's mark.

### C2 — `payment_method.detached` org resolution

Confirmed against Stripe's docs/webhook conventions: Stripe sends the
payment method object **after** detachment on this event, so its top-level
`customer` is `null`. The prior owner only survives in
`previous_attributes.customer`. `StripePaymentMethodShape` now declares both
`customer` and `previous_attributes` so this is visible in the type, not
just assumed by a duck-typed reader.

`handlePaymentMethodDetached` no longer goes through the shared
`requireContext`/`ctx.orgId` path (which is null on a real payload). It
resolves the org from the existing `BillingPaymentMethod` row by
`stripePaymentMethodId` first (populated at attach time, no customer id
needed), falling back to `previous_attributes.customer` only when that row
was never mirrored. Only when neither resolves does it throw (→ `failed`,
retried, visible) — it no longer 500s on every real detach.

Test fixtures corrected: `.detached` payloads in the test file now set
`customer: null`, matching the real shape; new tests cover the primary
(mirrored-row) path, the `previous_attributes` fallback, and the genuine
unattributable-failure case.

### I3 — `stripeCustomerId @unique` — SCHEMA CHANGE WRITTEN, MIGRATION NOT APPLIED

`BillingSubscription.stripeCustomerId` is now `@unique` in
`schema.prisma`, with a comment explaining why. `SELECT count(*) FROM
"BillingSubscription"` was verified `0` immediately before editing the
schema and again immediately before attempting the push (both times: 0 —
see below).

`pnpm db:push` could not be completed under the "no `--accept-data-loss`"
constraint: this Prisma version (5.22.0) unconditionally requires that flag
for any change db push classifies as data-loss-risk — including on an
empty table — with no interactive prompt fallback (verified: piping `y` to
stdin produces the identical hard error, confirming there is no TTY-gated
confirmation path to use instead). Since the two instructions directly
conflict and this touches the database, I stopped short rather than guess:
`db:push`/`db:generate` were not run, and the DB does not yet have the
constraint. The schema file is otherwise correct and ready — this needs an
explicit decision (authorize `--accept-data-loss` for this specific
already-verified-empty table, or apply it another way) before it lands.

### I4 — see C1 above (folded into the same fix, same file/mechanism).

### Task 13 — replay/idempotency integration test

`apps/api/src/services/billing/webhookProcessor.integration.test.ts`,
following `bootstrap.integration.test.ts`'s shape (own timestamp-slugged
orgs, `allOrgIds` cleanup registry, restores the one shared row it borrows
— the `growth` tier's `stripePriceIdMonthly` — in `afterAll`). Three tests:

1. Replays one `customer.subscription.updated` 100× sequentially against
   the same live `PrismaClient`: asserts exactly one `BillingEvent` row,
   exactly one `AuditLog` row for it, and the final subscription state
   correct (not just plausible).
2. Fires the SAME event concurrently from two independent `PrismaClient`
   connections (`Promise.allSettled`): asserts neither call rejects, exactly
   one `BillingEvent` row survives the real unique-constraint race, and the
   subscription state is correct regardless of which branch each side took
   (duplicate vs. the P2002-without-`processedAt` retry branch, which no
   other test reaches).
3. Forces a real handler throw (unrecognised price id) and asserts Postgres
   itself rolled back every write: the subscription row is byte-for-byte
   unchanged (including `updatedAt` — no write happened at all), zero audit
   rows, `BillingEvent.processedAt` still null with `processingError` set.

Output (both `pnpm test` and `pnpm test:integration`, run 6× for the
concurrency test to check for flakiness — stable every time):

```
apps/api $ npx vitest run
 Test Files  62 passed (62)
      Tests  924 passed (924)

apps/api $ npx vitest run --config vitest.integration.config.ts
 Test Files  6 passed (6)
      Tests  66 passed (66)
```

`BillingSubscription` row count before AND after this whole suite: **0**
(pre-existing DB has 1 Organization / 12 Members, unaffected — verified via
direct `psql` query after the full integration run).

Also renamed the misleadingly-titled unit test `processEvent — concurrent
insert of the same id` (it is sequential, not concurrent — it pre-seeds an
already-processed row and forces P2002 to exercise only the `duplicate`
branch) to `processEvent — a create() that collides with an
already-committed row`, with a comment pointing at the integration test for
the branch it cannot reach.
