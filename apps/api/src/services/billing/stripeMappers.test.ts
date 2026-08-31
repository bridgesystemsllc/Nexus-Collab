// apps/api/src/services/billing/stripeMappers.test.ts
import { describe, it, expect } from 'vitest'
import {
  toProviderSubscription, toProviderInvoice, toProviderPaymentMethod,
  toProviderEvent, toPreviewResult, prorationBehavior,
  type StripeSubscriptionShape, type StripeInvoiceShape, type StripePaymentMethodShape,
  type StripeEventShape, type StripeUpcomingInvoiceShape,
} from './stripeMappers'

// Fixtures built by hand from Stripe's documented object shapes
// (https://stripe.com/docs/api/subscriptions/object,
//  /invoices/object, /payment_methods/object, /events/object). No network,
// no client, no keys — every fixture below is a plain object literal.

const FIXED_UPDATED_AT = new Date('2026-08-30T12:00:00Z')

function subscriptionFixture(overrides: Partial<StripeSubscriptionShape> = {}): StripeSubscriptionShape {
  return {
    id: 'sub_1Nabc',
    customer: 'cus_1Nxyz',
    status: 'active',
    items: {
      data: [
        {
          id: 'si_1Nitem',
          quantity: 5,
          price: { id: 'price_growth_monthly', recurring: { interval: 'month' } },
        },
      ],
    },
    current_period_start: 1735689600, // 2025-01-01T00:00:00Z
    current_period_end: 1738368000, // 2025-02-01T00:00:00Z
    cancel_at_period_end: false,
    trial_end: null,
    canceled_at: null,
    ...overrides,
  }
}

function invoiceFixture(overrides: Partial<StripeInvoiceShape> = {}): StripeInvoiceShape {
  return {
    id: 'in_1Nabc',
    number: 'NEXUS-0001',
    status: 'paid',
    amount_due: 5900,
    amount_paid: 5900,
    currency: 'usd',
    period_start: 1735689600,
    period_end: 1738368000,
    hosted_invoice_url: 'https://invoice.stripe.com/i/abc',
    invoice_pdf: 'https://invoice.stripe.com/i/abc/pdf',
    attempt_count: 1,
    next_payment_attempt: null,
    ...overrides,
  }
}

describe('toProviderSubscription', () => {
  it('maps a subscription with one item, converting seconds to Date', () => {
    const result = toProviderSubscription(subscriptionFixture(), FIXED_UPDATED_AT)
    expect(result).toEqual({
      id: 'sub_1Nabc',
      customerId: 'cus_1Nxyz',
      itemId: 'si_1Nitem',
      status: 'active',
      interval: 'monthly',
      priceId: 'price_growth_monthly',
      quantity: 5,
      currentPeriodStart: new Date(1735689600 * 1000),
      currentPeriodEnd: new Date(1738368000 * 1000),
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      canceledAt: null,
      updatedAt: FIXED_UPDATED_AT,
    })
  })

  it('takes quantity and price from items.data[0]', () => {
    const result = toProviderSubscription(
      subscriptionFixture({
        items: { data: [{ id: 'si_x', quantity: 12, price: { id: 'price_enterprise_annual', recurring: { interval: 'year' } } }] },
      }),
      FIXED_UPDATED_AT,
    )
    expect(result.quantity).toBe(12)
    expect(result.priceId).toBe('price_enterprise_annual')
    expect(result.interval).toBe('annual')
  })

  it('resolves a customer passed as an expanded object, not just a string id', () => {
    const result = toProviderSubscription(subscriptionFixture({ customer: { id: 'cus_expanded' } }), FIXED_UPDATED_AT)
    expect(result.customerId).toBe('cus_expanded')
  })

  it('maps null current_period_start/end to null Dates, not epoch-0', () => {
    const result = toProviderSubscription(
      subscriptionFixture({ current_period_start: null, current_period_end: null }),
      FIXED_UPDATED_AT,
    )
    expect(result.currentPeriodStart).toBeNull()
    expect(result.currentPeriodEnd).toBeNull()
  })

  it('maps trial_end and canceled_at seconds to Date when present', () => {
    const result = toProviderSubscription(
      subscriptionFixture({ trial_end: 1735776000, canceled_at: 1735862400 }),
      FIXED_UPDATED_AT,
    )
    expect(result.trialEndsAt).toEqual(new Date(1735776000 * 1000))
    expect(result.canceledAt).toEqual(new Date(1735862400 * 1000))
  })

  it('maps every Stripe status our union also models, one to one', () => {
    const modeled: Record<string, string> = {
      trialing: 'trialing', active: 'active', past_due: 'past_due', canceled: 'canceled',
      incomplete: 'incomplete', incomplete_expired: 'incomplete_expired', paused: 'paused',
      unpaid: 'unpaid',
    }
    for (const [stripeStatus, ours] of Object.entries(modeled)) {
      expect(toProviderSubscription(subscriptionFixture({ status: stripeStatus }), FIXED_UPDATED_AT).status).toBe(ours)
    }
  })

  it('maps Stripe\'s unpaid status 1:1 — SubscriptionStatus now models it directly', () => {
    // Widened in packages/shared (review C1 follow-up / I3): unpaid used to
    // collapse into past_due, which only read as correct because dunning had
    // already run by the time it fires. Modelled directly so resolve.ts can
    // give it its own unconditional read_only, never grace-period-gated.
    const result = toProviderSubscription(subscriptionFixture({ status: 'unpaid' }), FIXED_UPDATED_AT)
    expect(result.status).toBe('unpaid')
  })

  it('maps an unrecognised/future status defensively to paused, never active or past_due', () => {
    // paused, not past_due: past_due can still resolve to FULL access when a
    // grace timestamp is live, so it is not actually the fail-closed choice
    // for a status this module has never seen. paused is unconditionally
    // read_only in resolve.ts.
    const result = toProviderSubscription(subscriptionFixture({ status: 'some_future_status' }), FIXED_UPDATED_AT)
    expect(result.status).toBe('paused')
  })

  it('maps a subscription with no items to a null itemId and zero quantity, not a throw', () => {
    const result = toProviderSubscription(subscriptionFixture({ items: { data: [] } }), FIXED_UPDATED_AT)
    expect(result.itemId).toBeNull()
    expect(result.quantity).toBe(0)
    expect(result.priceId).toBe('')
  })
})

describe('toProviderInvoice', () => {
  it('maps a standard invoice, leaving integer cents untouched', () => {
    const result = toProviderInvoice(invoiceFixture())
    expect(result).toEqual({
      id: 'in_1Nabc',
      number: 'NEXUS-0001',
      status: 'paid',
      amountDueCents: 5900,
      amountPaidCents: 5900,
      currency: 'usd',
      periodStart: new Date(1735689600 * 1000),
      periodEnd: new Date(1738368000 * 1000),
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/abc',
      invoicePdfUrl: 'https://invoice.stripe.com/i/abc/pdf',
      attemptCount: 1,
      nextPaymentAttemptAt: null,
    })
  })

  it('maps null period_start/period_end to null, not epoch-0', () => {
    const result = toProviderInvoice(invoiceFixture({ period_start: null, period_end: null }))
    expect(result.periodStart).toBeNull()
    expect(result.periodEnd).toBeNull()
  })

  it('maps a zero-amount invoice without coercing 0 to a falsy default', () => {
    const result = toProviderInvoice(invoiceFixture({ amount_due: 0, amount_paid: 0, status: 'paid' }))
    expect(result.amountDueCents).toBe(0)
    expect(result.amountPaidCents).toBe(0)
  })

  it('falls back a null status to draft', () => {
    const result = toProviderInvoice(invoiceFixture({ status: null }))
    expect(result.status).toBe('draft')
  })

  it('maps a future payment attempt to a Date', () => {
    const result = toProviderInvoice(invoiceFixture({ next_payment_attempt: 1739059200 }))
    expect(result.nextPaymentAttemptAt).toEqual(new Date(1739059200 * 1000))
  })

  it('defaults missing hosted/pdf urls to null', () => {
    const result = toProviderInvoice(invoiceFixture({ hosted_invoice_url: undefined, invoice_pdf: undefined }))
    expect(result.hostedInvoiceUrl).toBeNull()
    expect(result.invoicePdfUrl).toBeNull()
  })
})

describe('toProviderPaymentMethod', () => {
  const cardPm: StripePaymentMethodShape = {
    id: 'pm_1Ncard',
    card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
  }

  it('maps a card payment method', () => {
    const result = toProviderPaymentMethod(cardPm, null)
    expect(result).toEqual({
      id: 'pm_1Ncard', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, isDefault: false,
    })
  })

  it('marks isDefault true only when the id matches the default id', () => {
    expect(toProviderPaymentMethod(cardPm, 'pm_1Ncard').isDefault).toBe(true)
    expect(toProviderPaymentMethod(cardPm, 'pm_other').isDefault).toBe(false)
    expect(toProviderPaymentMethod(cardPm, null).isDefault).toBe(false)
  })

  it('falls back a non-card payment method to placeholder card fields rather than throwing', () => {
    const result = toProviderPaymentMethod({ id: 'pm_bank' }, null)
    expect(result.brand).toBe('unknown')
    expect(result.last4).toBe('0000')
  })
})

describe('toProviderEvent', () => {
  it('maps createdAt from evt.created (seconds) and unwraps data.object', () => {
    const evt: StripeEventShape = {
      id: 'evt_1Nabc',
      type: 'customer.subscription.updated',
      created: 1735689600,
      data: { object: { id: 'sub_1Nabc', status: 'active' } },
    }
    const result = toProviderEvent(evt)
    expect(result).toEqual({
      id: 'evt_1Nabc',
      type: 'customer.subscription.updated',
      createdAt: new Date(1735689600 * 1000),
      data: { id: 'sub_1Nabc', status: 'active' },
    })
  })
})

describe('toPreviewResult', () => {
  const upgradePlan = { timing: 'immediate' as const, prorate: true, chargeNow: true }
  const deferredPlan = { timing: 'period_end' as const, prorate: false, chargeNow: false }

  // The instant this preview is computed against — what the caller would
  // pass as subscription_details.proration_date on the real request. Both
  // of THIS change's proration lines share this period.start; a third,
  // earlier-dated proration line (added below in its own test) models an
  // unbilled proration left over from a prior change this period.
  const PRORATION_DATE = 1735689600

  // Realistic ordering: a next payment attempt happens AT OR AFTER the
  // period it is attempting to collect for, never before it.
  const PERIOD_END = 1738368000
  const NEXT_PAYMENT_ATTEMPT = 1738371600 // period_end + 1 hour

  function upcomingInvoiceFixture(overrides: Partial<StripeUpcomingInvoiceShape> = {}): StripeUpcomingInvoiceShape {
    return {
      currency: 'usd',
      tax: 472,
      period_end: PERIOD_END,
      next_payment_attempt: NEXT_PAYMENT_ATTEMPT,
      lines: {
        data: [
          {
            description: 'Unused time on Growth (5 seats)',
            amount: -2500,
            proration: true,
            period: { start: PRORATION_DATE, end: PERIOD_END },
          },
          {
            description: 'Remaining time on Growth (8 seats)',
            amount: 4000,
            proration: true,
            period: { start: PRORATION_DATE, end: PERIOD_END },
          },
          {
            description: '8 × Growth seat',
            amount: 47200,
            proration: false,
            period: { start: PERIOD_END, end: 1741046400 },
          },
        ],
      },
      ...overrides,
    }
  }

  it('keeps tax as its own line, never folded into the total', () => {
    const result = toPreviewResult(upcomingInvoiceFixture(), upgradePlan, PRORATION_DATE)
    expect(result.taxCents).toBe(472)
    // taxCents is not baked into nextInvoiceCents or newRecurringTotalCents.
    expect(result.nextInvoiceCents).toBe(47200)
    expect(result.newRecurringTotalCents).toBe(47200)
  })

  it('splits a proration credit and charge into non-negative aggregates, never a negative charge', () => {
    const result = toPreviewResult(upcomingInvoiceFixture(), upgradePlan, PRORATION_DATE)
    expect(result.immediateChargeCents).toBe(4000)
    expect(result.creditAppliedCents).toBe(2500)
    expect(result.immediateChargeCents).toBeGreaterThanOrEqual(0)
    expect(result.creditAppliedCents).toBeGreaterThanOrEqual(0)
  })

  it('carries the proration line items through with description and period', () => {
    const result = toPreviewResult(upcomingInvoiceFixture(), upgradePlan, PRORATION_DATE)
    expect(result.proratedLineItems).toHaveLength(2)
    expect(result.proratedLineItems[0]).toEqual({
      description: 'Unused time on Growth (5 seats)',
      amountCents: -2500,
      period: { start: new Date(PRORATION_DATE * 1000).toISOString(), end: new Date(PERIOD_END * 1000).toISOString() },
    })
  })

  it('excludes an earlier, still-unbilled proration line from a prior change this period', () => {
    // Review C2/C3, Failure A: seats added on the 5th leave a pending
    // +$30 proration line; upgrading again on the 7th must preview (and
    // later charge) only the 7th's own proration, not both summed —
    // Stripe's own doc on this endpoint says to consider only lines whose
    // period.start equals the proration_date passed in the request.
    const EARLIER_CHANGE_DATE = PRORATION_DATE - 172_800 // two days earlier
    const result = toPreviewResult(
      upcomingInvoiceFixture({
        lines: {
          data: [
            {
              description: '3 additional seat(s) (pending from an earlier change)',
              amount: 3000,
              proration: true,
              period: { start: EARLIER_CHANGE_DATE, end: PERIOD_END },
            },
            {
              description: 'Remaining time on Growth (8 seats)',
              amount: 4000,
              proration: true,
              period: { start: PRORATION_DATE, end: PERIOD_END },
            },
            {
              description: '8 × Growth seat',
              amount: 47200,
              proration: false,
              period: { start: PERIOD_END, end: 1741046400 },
            },
          ],
        },
      }),
      upgradePlan,
      PRORATION_DATE,
    )
    // Only the line dated exactly at PRORATION_DATE counts — the earlier
    // pending +$30 line is excluded from both the aggregate and the list.
    expect(result.immediateChargeCents).toBe(4000)
    expect(result.proratedLineItems).toHaveLength(1)
    expect(result.proratedLineItems[0].description).toBe('Remaining time on Growth (8 seats)')
  })

  it('reports effectiveImmediately from the plan, not the invoice', () => {
    expect(toPreviewResult(upcomingInvoiceFixture(), upgradePlan, PRORATION_DATE).effectiveImmediately).toBe(true)
    expect(toPreviewResult(upcomingInvoiceFixture(), deferredPlan, PRORATION_DATE).effectiveImmediately).toBe(false)
  })

  it('maps a zero-amount preview (a no-op change) without any proration lines', () => {
    const result = toPreviewResult(
      upcomingInvoiceFixture({
        tax: 0,
        lines: { data: [{ description: null, amount: 0, proration: false, period: { start: PRORATION_DATE, end: PERIOD_END } }] },
      }),
      deferredPlan,
      PRORATION_DATE,
    )
    expect(result.immediateChargeCents).toBe(0)
    expect(result.creditAppliedCents).toBe(0)
    expect(result.taxCents).toBe(0)
    expect(result.proratedLineItems).toEqual([])
  })

  describe('nextInvoiceDate precedence', () => {
    it('uses next_payment_attempt when present', () => {
      const result = toPreviewResult(upcomingInvoiceFixture(), upgradePlan, PRORATION_DATE)
      expect(result.nextInvoiceDate).toBe(new Date(NEXT_PAYMENT_ATTEMPT * 1000).toISOString())
    })

    it('falls back to period_end when next_payment_attempt is absent', () => {
      const result = toPreviewResult(
        upcomingInvoiceFixture({ next_payment_attempt: null }),
        upgradePlan,
        PRORATION_DATE,
      )
      expect(result.nextInvoiceDate).toBe(new Date(PERIOD_END * 1000).toISOString())
    })
  })
})

describe('prorationBehavior', () => {
  it('immediate + prorate + chargeNow → always_invoice', () => {
    expect(prorationBehavior({ timing: 'immediate', prorate: true, chargeNow: true })).toBe('always_invoice')
  })

  it('immediate + prorate without charging now → create_prorations', () => {
    expect(prorationBehavior({ timing: 'immediate', prorate: true, chargeNow: false })).toBe('create_prorations')
  })

  it('period_end → none, regardless of prorate/chargeNow', () => {
    expect(prorationBehavior({ timing: 'period_end', prorate: false, chargeNow: false })).toBe('none')
    // Defensive: a malformed period_end plan with prorate/chargeNow true must
    // still resolve to none — period_end changes apply via a schedule, never
    // Stripe's own proration math.
    expect(prorationBehavior({ timing: 'period_end', prorate: true, chargeNow: true })).toBe('none')
  })

  it('immediate, nothing to prorate (a no-op plan) → none', () => {
    expect(prorationBehavior({ timing: 'immediate', prorate: false, chargeNow: false })).toBe('none')
  })
})
