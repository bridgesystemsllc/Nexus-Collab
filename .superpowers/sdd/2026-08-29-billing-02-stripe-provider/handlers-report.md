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
