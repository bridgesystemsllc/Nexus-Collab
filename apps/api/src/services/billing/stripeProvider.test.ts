// apps/api/src/services/billing/stripeProvider.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// stripeClient.ts is mocked wholesale — getStripeClient() returns a plain
// object of vi.fn() stand-ins, never the real Stripe SDK. No network call is
// possible through this file: every "Stripe response" below is a value this
// test hands back itself. vi.mock's factory is hoisted above these imports by
// vitest's transform, so the mock object has to be built through vi.hoisted()
// to exist by the time the factory runs.
const { mockStripe } = vi.hoisted(() => ({
  mockStripe: {
    customers: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
    setupIntents: { create: vi.fn() },
    paymentMethods: { list: vi.fn(), detach: vi.fn() },
    subscriptions: { create: vi.fn(), update: vi.fn(), retrieve: vi.fn() },
    invoices: { createPreview: vi.fn(), list: vi.fn() },
    subscriptionSchedules: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  },
}))

vi.mock('./stripeClient', () => ({ getStripeClient: () => mockStripe }))

import { createStripeProvider, mapStripeError } from './stripeProvider'
import { BillingProviderError } from './provider'
import type { ChangeInput } from './provider'
import { planFor } from './proration'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── mapStripeError classification ───────────────────────────
// The one thing standing between "retry" and "double-charge a declined
// card" — nothing in the type system stops a future edit from flipping
// card_declined to retryable, so this is asserted directly.
describe('mapStripeError', () => {
  it('treats a card decline as non-retryable', () => {
    const err = mapStripeError({ type: 'StripeCardError', code: 'card_declined', message: 'Your card was declined.' })
    expect(err).toBeInstanceOf(BillingProviderError)
    expect(err.code).toBe('card_declined')
    expect(err.retryable).toBe(false)
  })

  it('treats a validation error as non-retryable', () => {
    const err = mapStripeError({ type: 'StripeInvalidRequestError', message: 'Missing required param.' })
    expect(err.retryable).toBe(false)
  })

  it('treats a network failure as retryable', () => {
    const err = mapStripeError({ type: 'StripeConnectionError', message: 'Could not connect to Stripe.' })
    expect(err.retryable).toBe(true)
  })

  it('treats a rate limit as retryable', () => {
    const err = mapStripeError({ type: 'StripeRateLimitError', message: 'Too many requests.' })
    expect(err.retryable).toBe(true)
  })

  it('treats lock_timeout as retryable regardless of which type wraps it', () => {
    const err = mapStripeError({ type: 'StripeAPIError', code: 'lock_timeout', message: 'Lock timeout.' })
    expect(err.retryable).toBe(true)
    expect(err.code).toBe('lock_timeout')
  })

  it('gives customer_tax_location_invalid its own code and a diagnosable message, distinct from a decline', () => {
    const declined = mapStripeError({ type: 'StripeCardError', code: 'card_declined', message: 'declined' })
    const untaxable = mapStripeError({
      type: 'StripeInvalidRequestError', code: 'customer_tax_location_invalid', message: 'generic stripe text',
    })
    expect(untaxable.code).toBe('customer_tax_location_invalid')
    expect(untaxable.code).not.toBe(declined.code)
    expect(untaxable.retryable).toBe(false)
    expect(untaxable.message.toLowerCase()).toContain('address')
  })

  it('treats a non-Stripe error (a bug, a thrown string) as non-retryable', () => {
    expect(mapStripeError('boom').retryable).toBe(false)
    expect(mapStripeError(new Error('boom')).retryable).toBe(false)
  })
})

// ─── idempotency-key threading ───────────────────────────────
describe('idempotency-key threading', () => {
  it('passes idempotencyKey through on ensureCustomer', async () => {
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_1' })
    const provider = createStripeProvider()
    await provider.ensureCustomer({ orgId: 'o1', name: 'Acme', email: 'a@x.com', idempotencyKey: 'idem-1' })
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Acme', email: 'a@x.com' }),
      { idempotencyKey: 'idem-1' },
    )
  })

  it('translates an address to Stripe\'s snake_case shape when supplied', async () => {
    mockStripe.customers.create.mockResolvedValue({ id: 'cus_1' })
    const provider = createStripeProvider()
    await provider.ensureCustomer({
      orgId: 'o1', name: 'Acme', email: 'a@x.com', idempotencyKey: 'idem-1',
      address: { line1: '1 Main St', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' },
    })
    expect(mockStripe.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        address: { line1: '1 Main St', line2: undefined, city: 'Austin', state: 'TX', postal_code: '78701', country: 'US' },
      }),
      expect.anything(),
    )
  })

  it('passes idempotencyKey through on createSubscription', async () => {
    mockStripe.subscriptions.create.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.createSubscription({ customerId: 'cus_1', priceId: 'price_1', quantity: 3, idempotencyKey: 'idem-2' })
    expect(mockStripe.subscriptions.create).toHaveBeenCalledWith(expect.anything(), { idempotencyKey: 'idem-2' })
  })

  it('passes idempotencyKey through on the immediate applyChange path', async () => {
    mockStripe.subscriptions.update.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ idempotencyKey: 'idem-3' }))
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1', expect.anything(), { idempotencyKey: 'idem-3' },
    )
  })

  it('passes idempotencyKey through on cancelAtPeriodEnd and reactivate', async () => {
    mockStripe.subscriptions.update.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.cancelAtPeriodEnd('sub_1', 'idem-4')
    expect(mockStripe.subscriptions.update).toHaveBeenLastCalledWith(
      'sub_1', { cancel_at_period_end: true }, { idempotencyKey: 'idem-4' },
    )
    await provider.reactivate('sub_1', 'idem-5')
    expect(mockStripe.subscriptions.update).toHaveBeenLastCalledWith(
      'sub_1', { cancel_at_period_end: false }, { idempotencyKey: 'idem-5' },
    )
  })
})

// ─── C2/C3: proration_date pinning, I1: payment_behavior ─────
describe('applyChange — immediate path', () => {
  it('passes proration_date through so the charge matches the preview', async () => {
    mockStripe.subscriptions.update.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ prorationDate: 1735689600 }))
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1', expect.objectContaining({ proration_date: 1735689600 }), expect.anything(),
    )
  })

  it('sets payment_behavior: error_if_incomplete when chargeNow is true — a declined card must fail the whole update, never land the new tier on an unpaid invoice', async () => {
    mockStripe.subscriptions.update.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: planFor({ kind: 'seats', from: 5, to: 8 }) }))
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith(
      'sub_1', expect.objectContaining({ payment_behavior: 'error_if_incomplete' }), expect.anything(),
    )
  })

  it('does not set payment_behavior when the change does not charge (a no-op plan)', async () => {
    mockStripe.subscriptions.update.mockResolvedValue(basicSubscription())
    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: planFor({ kind: 'seats', from: 5, to: 5 }) }))
    const [, params] = mockStripe.subscriptions.update.mock.calls.at(-1)!
    expect(params).not.toHaveProperty('payment_behavior')
  })
})

describe('previewChange', () => {
  it('passes proration_date to subscription_details, mirroring what applyChange will send', async () => {
    mockStripe.invoices.createPreview.mockResolvedValue(basicUpcomingInvoice())
    const provider = createStripeProvider()
    await provider.previewChange(immediateChange({ prorationDate: 1735689600 }))
    expect(mockStripe.invoices.createPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_details: expect.objectContaining({ proration_date: 1735689600 }),
      }),
    )
  })
})

// ─── C1 + I2: the deferred-schedule path ─────────────────────
describe('applyChange — deferred (period_end) path', () => {
  const deferredPlan = planFor({ kind: 'seats', from: 8, to: 5 })

  function currentSchedulePhase() {
    return {
      start_date: 1735689600,
      end_date: 1738368000,
      items: [{ price: { id: 'price_old' }, quantity: 8 }],
      discounts: [{ coupon: null, discount: { id: 'di_promo_1' } }],
      trial_end: null,
      collection_method: 'charge_automatically',
      default_payment_method: { id: 'pm_default' },
      billing_cycle_anchor: null,
    }
  }

  it('never lets the schedule update prorate the live phase (C1)', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...basicSubscription(), schedule: null })
    mockStripe.subscriptionSchedules.create.mockResolvedValue({
      id: 'sub_sched_1',
      current_phase: { start_date: 1735689600, end_date: 1738368000 },
      phases: [currentSchedulePhase()],
    })
    mockStripe.subscriptionSchedules.update.mockResolvedValue({})

    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: deferredPlan }))

    const [, params] = mockStripe.subscriptionSchedules.update.mock.calls[0]
    // The documented Stripe default for this field is create_prorations —
    // omitting it entirely is exactly how C1 happened.
    expect(params.proration_behavior).toBe('none')
  })

  it('carries the current phase forward field-for-field, not just items (C1)', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...basicSubscription(), schedule: null })
    mockStripe.subscriptionSchedules.create.mockResolvedValue({
      id: 'sub_sched_1',
      current_phase: { start_date: 1735689600, end_date: 1738368000 },
      phases: [currentSchedulePhase()],
    })
    mockStripe.subscriptionSchedules.update.mockResolvedValue({})

    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: deferredPlan }))

    const [, params] = mockStripe.subscriptionSchedules.update.mock.calls[0]
    const preservedPhase = params.phases[0]
    // A live coupon and payment method silently dropped here is what read to
    // Stripe as a real billing change on the still-invoicing current phase.
    expect(preservedPhase.discounts).toEqual([{ discount: 'di_promo_1' }])
    expect(preservedPhase.collection_method).toBe('charge_automatically')
    expect(preservedPhase.default_payment_method).toBe('pm_default')
    expect(preservedPhase.start_date).toBe(1735689600)
    expect(preservedPhase.end_date).toBe(1738368000)
    expect(params.phases).toHaveLength(2)
    expect(params.phases[1].items).toEqual([{ price: 'price_m', quantity: 5 }])
  })

  it('locates the phase to preserve via current_phase, never phases[0], once a schedule has advanced (I2)', async () => {
    const completedPhase = {
      start_date: 1730000000,
      end_date: 1735689600,
      items: [{ price: { id: 'price_ancient' }, quantity: 1 }],
      discounts: [],
      trial_end: null,
      collection_method: 'charge_automatically',
      default_payment_method: null,
      billing_cycle_anchor: null,
    }
    const liveCurrentPhase = currentSchedulePhase()

    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...basicSubscription(), schedule: 'sub_sched_2' })
    mockStripe.subscriptionSchedules.retrieve.mockResolvedValue({
      id: 'sub_sched_2',
      // current_phase points at the SECOND phase's start_date — phases[0] is
      // already finished.
      current_phase: { start_date: liveCurrentPhase.start_date, end_date: liveCurrentPhase.end_date },
      phases: [completedPhase, liveCurrentPhase],
    })
    mockStripe.subscriptionSchedules.update.mockResolvedValue({})

    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: deferredPlan }))

    const [, params] = mockStripe.subscriptionSchedules.update.mock.calls[0]
    // Preserved phase must be the LIVE one (with the discount/payment method
    // that only liveCurrentPhase carries), not the completed phase[0].
    expect(params.phases[0].start_date).toBe(liveCurrentPhase.start_date)
    expect(params.phases[0].discounts).toEqual([{ discount: 'di_promo_1' }])
    expect(params.phases).toHaveLength(2)
  })

  it('derives the schedule-update idempotency key deterministically from the caller\'s key', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...basicSubscription(), schedule: null })
    mockStripe.subscriptionSchedules.create.mockResolvedValue({
      id: 'sub_sched_1',
      current_phase: { start_date: 1735689600, end_date: 1738368000 },
      phases: [currentSchedulePhase()],
    })
    mockStripe.subscriptionSchedules.update.mockResolvedValue({})

    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: deferredPlan, idempotencyKey: 'change-42' }))

    expect(mockStripe.subscriptionSchedules.create).toHaveBeenCalledWith(
      { from_subscription: 'sub_1' }, { idempotencyKey: 'change-42' },
    )
    const [, , opts] = mockStripe.subscriptionSchedules.update.mock.calls[0]
    expect(opts).toEqual({ idempotencyKey: 'change-42:schedule' })
  })

  it('leaves the subscription itself unchanged — never calls subscriptions.update on the deferred path', async () => {
    mockStripe.subscriptions.retrieve.mockResolvedValue({ ...basicSubscription(), schedule: null })
    mockStripe.subscriptionSchedules.create.mockResolvedValue({
      id: 'sub_sched_1',
      current_phase: { start_date: 1735689600, end_date: 1738368000 },
      phases: [currentSchedulePhase()],
    })
    mockStripe.subscriptionSchedules.update.mockResolvedValue({})

    const provider = createStripeProvider()
    await provider.applyChange(immediateChange({ plan: deferredPlan }))

    expect(mockStripe.subscriptions.update).not.toHaveBeenCalled()
  })
})

// ─── fixtures ─────────────────────────────────────────────────

function basicSubscription() {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    schedule: null,
    items: { data: [{ id: 'si_1', quantity: 5, price: { id: 'price_m', recurring: { interval: 'month' } } }] },
    current_period_start: 1735689600,
    current_period_end: 1738368000,
    cancel_at_period_end: false,
    trial_end: null,
    canceled_at: null,
  }
}

function basicUpcomingInvoice() {
  return {
    currency: 'usd',
    tax: 0,
    period_end: 1738368000,
    next_payment_attempt: null,
    lines: { data: [] },
  }
}

function immediateChange(overrides: Partial<ChangeInput> = {}): ChangeInput {
  return {
    subscriptionId: 'sub_1',
    itemId: 'si_1',
    priceId: 'price_m',
    quantity: 5,
    plan: planFor({ kind: 'seats', from: 3, to: 5 }),
    idempotencyKey: 'idem-default',
    prorationDate: 1735689600,
    ...overrides,
  }
}
