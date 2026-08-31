// apps/api/src/services/billing/webhookProcessor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { processEvent, eventHandlers, type ProcessOutcome } from './webhookProcessor'
import type { ProviderEvent } from './provider'
import { invalidateCatalogue } from './catalogue'

// No live database here — a fake prisma, in-memory, deterministic. It models
// exactly what processEvent and the real handlers depend on: a unique
// constraint on BillingEvent.stripeEventId that throws P2002 on collision,
// a $transaction that genuinely rolls back on throw (a fake that just calls
// its callback would make the "handler throws → rollback" test pass for the
// wrong reason), and the BillingTier/BillingSubscription/BillingInvoice/
// BillingPaymentMethod/AuditLog tables the real handlers in
// webhookHandlers.ts read and write.

interface FakeBillingEventRow {
  id: string
  stripeEventId: string
  eventType: string
  orgId: string | null
  payload: unknown
  processedAt: Date | null
  processingError: string | null
  retryCount: number
}

interface FakeSubscriptionRow {
  id: string
  orgId: string
  stripeCustomerId: string
  stripeSubscriptionId: string | null
  stripeSubscriptionItemId: string | null
  tierId: string
  status: string
  billingInterval: string
  seatsPurchased: number
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  trialEndsAt: Date | null
  canceledAt: Date | null
  pendingTierId: string | null
  pendingSeats: number | null
  pendingChangeEffectiveAt: Date | null
  gracePeriodEndsAt: Date | null
  lastStripeEventAt: Date | null
}

interface FakeTierRow {
  id: string
  key: string
  displayName: string
  description: string | null
  sortOrder: number
  rank: number
  stripePriceIdMonthly: string | null
  stripePriceIdAnnual: string | null
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  maxSeats: number | null
  isCustomQuote: boolean
  isActive: boolean
  features: never[]
}

interface FakeInvoiceRow {
  id: string
  orgId: string
  stripeInvoiceId: string
  number: string | null
  status: string
  amountDueCents: number
  amountPaidCents: number
  currency: string
  periodStart: Date | null
  periodEnd: Date | null
  hostedInvoiceUrl: string | null
  invoicePdfUrl: string | null
  attemptCount: number
  nextPaymentAttemptAt: Date | null
}

interface FakePaymentMethodRow {
  id: string
  orgId: string
  stripePaymentMethodId: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

interface FakeAuditRow {
  id: string
  orgId: string | null | undefined
  action: string
  entityType: string
  entityId: string | null
  changes: unknown
  metadata: unknown
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

function tierFixture(overrides: Partial<FakeTierRow> = {}): FakeTierRow {
  return {
    id: 'tier_growth', key: 'growth', displayName: 'Growth', description: null,
    sortOrder: 20, rank: 20,
    stripePriceIdMonthly: 'price_growth_monthly', stripePriceIdAnnual: 'price_growth_annual',
    unitAmountMonthlyCents: 5900, unitAmountAnnualCents: 59000,
    minSeats: 1, maxSeats: null, isCustomQuote: false, isActive: true, features: [],
    ...overrides,
  }
}

function subscriptionFixture(overrides: Partial<FakeSubscriptionRow> = {}): FakeSubscriptionRow {
  return {
    id: 'sub_row_1', orgId: 'org_1', stripeCustomerId: 'cus_1',
    stripeSubscriptionId: null, stripeSubscriptionItemId: null,
    tierId: 'tier_starter', status: 'active', billingInterval: 'monthly', seatsPurchased: 3,
    currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false,
    trialEndsAt: null, canceledAt: null,
    pendingTierId: null, pendingSeats: null, pendingChangeEffectiveAt: null,
    gracePeriodEndsAt: null, lastStripeEventAt: null,
    ...overrides,
  }
}

/// Minimal Stripe subscription object as delivered in a webhook's
/// `data.object` — shaped to match StripeSubscriptionShape (see
/// stripeMappers.test.ts for the same convention).
function stripeSubscriptionData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sub_stripe_1',
    customer: 'cus_1',
    status: 'active',
    items: {
      data: [
        { id: 'si_1', quantity: 5, price: { id: 'price_growth_monthly', recurring: { interval: 'month' } } },
      ],
    },
    current_period_start: 1735689600,
    current_period_end: 1738368000,
    cancel_at_period_end: false,
    trial_end: null,
    canceled_at: null,
    ...overrides,
  }
}

function stripeInvoiceData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'in_1', number: 'NEXUS-0001', status: 'paid',
    amount_due: 5900, amount_paid: 5900, currency: 'usd',
    period_start: 1735689600, period_end: 1738368000,
    hosted_invoice_url: null, invoice_pdf: null,
    attempt_count: 1, next_payment_attempt: null,
    customer: 'cus_1',
    ...overrides,
  }
}

function stripePaymentMethodData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'pm_1',
    card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2030 },
    customer: 'cus_1',
    ...overrides,
  }
}

function createFakePrisma(opts: { subscriptions?: FakeSubscriptionRow[]; tiers?: FakeTierRow[] } = {}) {
  const events = new Map<string, FakeBillingEventRow>()
  const subscriptions = new Map<string, FakeSubscriptionRow>((opts.subscriptions ?? []).map((s) => [s.id, s]))
  const tiers = new Map<string, FakeTierRow>((opts.tiers ?? [tierFixture()]).map((t) => [t.id, t]))
  const invoices = new Map<string, FakeInvoiceRow>()
  const paymentMethods = new Map<string, FakePaymentMethodRow>()
  const auditLogs: FakeAuditRow[] = []
  let seq = 0
  let forceNextCreateP2002 = false

  function snapshot() {
    return {
      events: new Map([...events].map(([k, v]) => [k, { ...v }])),
      subscriptions: new Map([...subscriptions].map(([k, v]) => [k, { ...v }])),
      invoices: new Map([...invoices].map(([k, v]) => [k, { ...v }])),
      paymentMethods: new Map([...paymentMethods].map(([k, v]) => [k, { ...v }])),
      auditLogs: [...auditLogs],
    }
  }
  function restore(snap: ReturnType<typeof snapshot>) {
    events.clear(); for (const [k, v] of snap.events) events.set(k, v)
    subscriptions.clear(); for (const [k, v] of snap.subscriptions) subscriptions.set(k, v)
    invoices.clear(); for (const [k, v] of snap.invoices) invoices.set(k, v)
    paymentMethods.clear(); for (const [k, v] of snap.paymentMethods) paymentMethods.set(k, v)
    auditLogs.length = 0; auditLogs.push(...snap.auditLogs)
  }

  function billingEventApi() {
    return {
      async create({ data }: { data: Omit<FakeBillingEventRow, 'id' | 'processedAt' | 'processingError' | 'retryCount'> }) {
        if (forceNextCreateP2002) { forceNextCreateP2002 = false; throw p2002() }
        if (events.has(data.stripeEventId)) throw p2002()
        const row: FakeBillingEventRow = {
          id: `evt_row_${++seq}`, stripeEventId: data.stripeEventId, eventType: data.eventType,
          orgId: data.orgId, payload: data.payload,
          processedAt: null, processingError: null, retryCount: 0,
        }
        events.set(data.stripeEventId, row)
        return row
      },
      async findUniqueOrThrow({ where }: { where: { stripeEventId: string } }) {
        const row = events.get(where.stripeEventId)
        if (!row) throw new Error('not found')
        return row
      },
      async update({ where, data }: { where: { stripeEventId: string }; data: Record<string, unknown> }) {
        const row = events.get(where.stripeEventId)
        if (!row) throw new Error('not found')
        if ('processedAt' in data) row.processedAt = data.processedAt as Date
        if ('processingError' in data) row.processingError = data.processingError as string
        if ('retryCount' in data) row.retryCount += (data.retryCount as { increment: number }).increment
        return row
      },
    }
  }

  function billingSubscriptionApi() {
    return {
      async findFirst({ where }: { where: { stripeCustomerId: string } }) {
        for (const s of subscriptions.values()) if (s.stripeCustomerId === where.stripeCustomerId) return s
        return null
      },
      async findUniqueOrThrow({ where }: { where: { id: string } }) {
        const row = subscriptions.get(where.id)
        if (!row) throw new Error('not found')
        return { ...row }
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = subscriptions.get(where.id)
        if (!row) throw new Error('not found')
        Object.assign(row, data)
        return { ...row }
      },
    }
  }

  function billingTierApi() {
    return {
      async findMany() {
        return [...tiers.values()]
      },
    }
  }

  function billingInvoiceApi() {
    return {
      async upsert({ where, create, update }: { where: { stripeInvoiceId: string }; create: Omit<FakeInvoiceRow, 'id'>; update: Partial<FakeInvoiceRow> }) {
        const existing = invoices.get(where.stripeInvoiceId)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const row: FakeInvoiceRow = { id: `inv_row_${++seq}`, ...create }
        invoices.set(where.stripeInvoiceId, row)
        return { ...row }
      },
    }
  }

  function billingPaymentMethodApi() {
    return {
      async findUnique({ where }: { where: { stripePaymentMethodId: string } }) {
        return paymentMethods.get(where.stripePaymentMethodId) ?? null
      },
      async upsert({ where, create, update }: { where: { stripePaymentMethodId: string }; create: Omit<FakePaymentMethodRow, 'id'>; update: Partial<FakePaymentMethodRow> }) {
        const existing = paymentMethods.get(where.stripePaymentMethodId)
        if (existing) {
          Object.assign(existing, update)
          return { ...existing }
        }
        const row: FakePaymentMethodRow = { id: `pm_row_${++seq}`, ...create }
        paymentMethods.set(where.stripePaymentMethodId, row)
        return { ...row }
      },
      async delete({ where }: { where: { stripePaymentMethodId: string } }) {
        const row = paymentMethods.get(where.stripePaymentMethodId)
        if (!row) throw new Error('not found')
        paymentMethods.delete(where.stripePaymentMethodId)
        return row
      },
    }
  }

  function auditLogApi() {
    return {
      async create({ data }: { data: Omit<FakeAuditRow, 'id'> }) {
        const row: FakeAuditRow = { id: `audit_row_${++seq}`, ...data }
        auditLogs.push(row)
        return row
      },
    }
  }

  const fake = {
    billingEvent: billingEventApi(),
    billingSubscription: billingSubscriptionApi(),
    billingTier: billingTierApi(),
    billingInvoice: billingInvoiceApi(),
    billingPaymentMethod: billingPaymentMethodApi(),
    auditLog: auditLogApi(),
    async $transaction<T>(fn: (tx: typeof fake) => Promise<T>): Promise<T> {
      const snap = snapshot()
      try {
        return await fn(fake)
      } catch (err) {
        restore(snap)
        throw err
      }
    },
    _forceNextCreateP2002() { forceNextCreateP2002 = true },
    _events: events,
    _subscriptions: subscriptions,
    _invoices: invoices,
    _paymentMethods: paymentMethods,
    _auditLogs: auditLogs,
  }

  return fake
}

function makeEvent(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    // Deliberately NOT one of the nine types eventHandlers now implements —
    // generic machinery tests below want the true "nothing recognises this
    // type" path, not any one handler's real behaviour.
    type: 'customer.updated',
    createdAt: new Date('2026-08-25T00:00:00Z'),
    data: {},
    ...overrides,
  }
}

const originalHandlers = { ...eventHandlers }
beforeEach(() => {
  for (const key of Object.keys(eventHandlers)) delete eventHandlers[key]
  Object.assign(eventHandlers, originalHandlers)
  invalidateCatalogue()
})

describe('processEvent — first delivery', () => {
  it('creates the BillingEvent row and returns unhandled for an unrecognised type', async () => {
    const prisma = createFakePrisma()
    const event = makeEvent({ id: 'evt_first_1' })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'unhandled', eventId: 'evt_first_1' })
    const row = prisma._events.get('evt_first_1')
    expect(row).toBeDefined()
    expect(row!.processedAt).not.toBeNull()
  })
})

describe('processEvent — exact redelivery', () => {
  it('returns duplicate for a redelivery of an already-processed event, and writes nothing twice', async () => {
    const prisma = createFakePrisma()
    const event = makeEvent({ id: 'evt_dup_1' })
    const first = await processEvent(prisma as any, event)
    expect(first.status).toBe('unhandled')

    const second = await processEvent(prisma as any, event)
    expect(second).toEqual<ProcessOutcome>({ status: 'duplicate', eventId: 'evt_dup_1' })

    expect(prisma._events.size).toBe(1)
    expect(prisma._events.get('evt_dup_1')!.retryCount).toBe(0)
  })
})

describe('processEvent — redelivery of a failed event', () => {
  it('is retried and increments retryCount', async () => {
    const prisma = createFakePrisma()
    eventHandlers['customer.updated'] = { handler: async () => { throw new Error('boom') }, ordered: false }
    const event = makeEvent({ id: 'evt_fail_1' })

    const first = await processEvent(prisma as any, event)
    expect(first.status).toBe('failed')
    const afterFirst = prisma._events.get('evt_fail_1')!
    expect(afterFirst.processedAt).toBeNull()
    expect(afterFirst.processingError).toContain('boom')
    const retryAfterFirst = afterFirst.retryCount

    const second = await processEvent(prisma as any, event)
    expect(second.status).toBe('failed')
    const afterSecond = prisma._events.get('evt_fail_1')!
    expect(afterSecond.retryCount).toBeGreaterThan(retryAfterFirst)
  })
})

describe('processEvent — a handler throwing', () => {
  it('returns failed, records processingError, and rolls back the transaction', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_1', orgId: 'org_1', stripeCustomerId: 'cus_1', lastStripeEventAt: null })],
    })
    eventHandlers['customer.updated'] = {
      ordered: false,
      handler: async (tx) => {
        await (tx as any).billingSubscription.update({
          where: { id: 'sub_row_1' },
          data: { lastStripeEventAt: new Date('2099-01-01T00:00:00Z') },
        })
        throw new Error('handler exploded')
      },
    }
    const event = makeEvent({ id: 'evt_rollback_1', data: { customer: 'cus_1' } })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'failed', eventId: 'evt_rollback_1', error: 'handler exploded' })
    expect(prisma._subscriptions.get('sub_row_1')!.lastStripeEventAt).toBeNull()

    const row = prisma._events.get('evt_rollback_1')!
    expect(row.processedAt).toBeNull()
    expect(row.processingError).toContain('handler exploded')
  })
})

describe('processEvent — out-of-order guard', () => {
  it('discards an ORDERED event older than lastStripeEventAt as stale, applying nothing', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_2', orgId: 'org_2', stripeCustomerId: 'cus_2',
        lastStripeEventAt: new Date('2026-08-20T00:00:00Z'),
      })],
    })
    let handlerRan = false
    eventHandlers['customer.updated'] = { handler: async () => { handlerRan = true }, ordered: true }

    const event = makeEvent({
      id: 'evt_stale_1', data: { customer: 'cus_2' },
      createdAt: new Date('2026-08-01T00:00:00Z'),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'stale', eventId: 'evt_stale_1' })
    expect(handlerRan).toBe(false)
    expect(prisma._subscriptions.get('sub_row_2')!.lastStripeEventAt).toEqual(new Date('2026-08-20T00:00:00Z'))
  })

  it('does NOT treat a null lastStripeEventAt as stale', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_3', orgId: 'org_3', stripeCustomerId: 'cus_3', lastStripeEventAt: null })],
    })
    const event = makeEvent({
      id: 'evt_notstale_1', data: { customer: 'cus_3' },
      createdAt: new Date('2020-01-01T00:00:00Z'),
    })
    const outcome = await processEvent(prisma as any, event)
    // Falls through to dispatch — an unrecognised type — not stale.
    expect(outcome).toEqual<ProcessOutcome>({ status: 'unhandled', eventId: 'evt_notstale_1' })
  })

  it('does NOT treat an equal-second event as stale — last writer wins', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_3b', orgId: 'org_3b', stripeCustomerId: 'cus_3b',
        lastStripeEventAt: new Date('2026-08-25T00:00:00.000Z'),
      })],
    })
    let handlerRan = false
    eventHandlers['customer.updated'] = { handler: async () => { handlerRan = true }, ordered: true }

    const event = makeEvent({
      id: 'evt_equal_1', data: { customer: 'cus_3b' },
      createdAt: new Date('2026-08-25T00:00:00.000Z'), // exactly equal, not older
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed') // dispatched and applied, not stale
    expect(handlerRan).toBe(true)
  })

  it('does NOT gate an unordered (invoice/payment-method/trial) type, even when older than lastStripeEventAt', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_3c', orgId: 'org_3c', stripeCustomerId: 'cus_3c',
        lastStripeEventAt: new Date('2026-08-25T00:00:00Z'),
      })],
    })
    let handlerRan = false
    eventHandlers['customer.updated'] = { handler: async () => { handlerRan = true }, ordered: false }

    const event = makeEvent({
      id: 'evt_unordered_old_1', data: { customer: 'cus_3c' },
      createdAt: new Date('2020-01-01T00:00:00Z'), // far older than the subscription mark
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')
    expect(handlerRan).toBe(true)
  })
})

describe('processEvent — the ordering guard is scoped, not global (C1 regression)', () => {
  it('an invoice.paid landing before an OLDER-created subscription.updated does not cause it to be dropped as stale', async () => {
    // Reproduces the exact race: Stripe fires both at renewal, order not
    // guaranteed. invoice.paid (created a moment later than the
    // subscription event, but delivered first) must not advance
    // lastStripeEventAt — if it did, the subscription.updated below (created
    // BEFORE it) would be wrongly discarded as stale and currentPeriodEnd
    // would never advance.
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_race1', orgId: 'org_race1', stripeCustomerId: 'cus_race1',
        tierId: 'tier_growth', currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      })],
    })
    const subUpdatedCreatedAt = new Date('2026-09-01T00:00:00.000Z')
    const invoicePaidCreatedAt = new Date('2026-09-01T00:00:01.000Z') // one second later

    const invoiceOutcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_race1_invoice', type: 'invoice.paid', createdAt: invoicePaidCreatedAt,
      data: stripeInvoiceData({ customer: 'cus_race1' }),
    }))
    expect(invoiceOutcome.status).toBe('processed')
    // The invoice handler must not have touched the ordering mark.
    expect(prisma._subscriptions.get('sub_row_race1')!.lastStripeEventAt).toBeNull()

    const subOutcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_race1_sub', type: 'customer.subscription.updated', createdAt: subUpdatedCreatedAt,
      data: stripeSubscriptionData({
        customer: 'cus_race1',
        current_period_end: Math.floor(new Date('2026-10-01T00:00:00Z').getTime() / 1000),
      }),
    }))
    expect(subOutcome.status).toBe('processed') // NOT stale
    expect(prisma._subscriptions.get('sub_row_race1')!.currentPeriodEnd).toEqual(new Date('2026-10-01T00:00:00Z'))
  })

  it('an ordered subscription mark does not cause a later-arriving, older-created invoice.paid to be dropped', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_race2', orgId: 'org_race2', stripeCustomerId: 'cus_race2',
        status: 'past_due', gracePeriodEndsAt: new Date('2026-09-05T00:00:00Z'),
      })],
    })
    const subOutcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_race2_sub', type: 'customer.subscription.updated',
      createdAt: new Date('2026-09-01T00:00:02.000Z'),
      data: stripeSubscriptionData({ customer: 'cus_race2' }),
    }))
    expect(subOutcome.status).toBe('processed')
    expect(prisma._subscriptions.get('sub_row_race2')!.lastStripeEventAt).toEqual(new Date('2026-09-01T00:00:02.000Z'))

    // Older createdAt than the mark subscription.updated just stamped — an
    // ordered guard would have discarded this as stale, leaving the account
    // stuck past_due until day 14 despite having just paid.
    const invoiceOutcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_race2_invoice', type: 'invoice.paid',
      createdAt: new Date('2026-09-01T00:00:01.000Z'),
      data: stripeInvoiceData({ customer: 'cus_race2' }),
    }))
    expect(invoiceOutcome.status).toBe('processed') // NOT stale
    expect(prisma._subscriptions.get('sub_row_race2')!.gracePeriodEndsAt).toBeNull()
  })
})

describe('processEvent — a create() that collides with an already-committed row', () => {
  // NOT a real concurrency test — this is single-threaded and sequential: it
  // pre-seeds an already-`processedAt`-set row and forces the next create()
  // to throw P2002, which only exercises the "P2002 + processedAt already
  // set" branch (duplicate). It cannot exercise the other P2002 branch (a
  // row that exists but has NOT finished processing yet — two deliveries
  // genuinely racing each other) because nothing here ever runs two
  // operations concurrently. That branch is covered by
  // webhookProcessor.integration.test.ts, against two real PrismaClient
  // connections.
  it('reports duplicate rather than reprocessing a row that finished under a different delivery', async () => {
    const prisma = createFakePrisma()
    const event = makeEvent({ id: 'evt_race_1' })

    prisma._events.set('evt_race_1', {
      id: 'evt_row_seed', stripeEventId: 'evt_race_1', eventType: event.type,
      orgId: null, payload: {}, processedAt: new Date(), processingError: null, retryCount: 0,
    })
    prisma._forceNextCreateP2002()

    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'duplicate', eventId: 'evt_race_1' })
    expect(prisma._events.size).toBe(1)
  })
})

// ─── Real handlers ─────────────────────────────────────────────

describe('customer.subscription.updated', () => {
  it('syncs status, seats and tier', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_10', orgId: 'org_10', stripeCustomerId: 'cus_10',
        tierId: 'tier_starter', status: 'trialing', seatsPurchased: 1,
      })],
      tiers: [tierFixture({ id: 'tier_growth', stripePriceIdMonthly: 'price_growth_monthly' })],
    })
    const event = makeEvent({
      id: 'evt_sub_updated_1', type: 'customer.subscription.updated',
      data: stripeSubscriptionData({ customer: 'cus_10', status: 'active' }),
    })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual({ status: 'processed', eventId: 'evt_sub_updated_1' })

    const row = prisma._subscriptions.get('sub_row_10')!
    expect(row.status).toBe('active')
    expect(row.seatsPurchased).toBe(5) // item quantity in stripeSubscriptionData()
    expect(row.tierId).toBe('tier_growth')
    expect(row.billingInterval).toBe('monthly')
    expect(row.lastStripeEventAt).toEqual(event.createdAt)
  })

  it('writes an audit entry', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_10b', orgId: 'org_10b', stripeCustomerId: 'cus_10b' })],
    })
    const event = makeEvent({
      id: 'evt_sub_updated_audit', type: 'customer.subscription.updated',
      data: stripeSubscriptionData({ customer: 'cus_10b' }),
    })
    await processEvent(prisma as any, event)
    const entry = prisma._auditLogs.find((a) => a.entityId === 'sub_row_10b')
    expect(entry).toBeDefined()
    expect(entry!.action).toBe('billing.subscription_synced')
    expect(entry!.orgId).toBe('org_10b')
  })

  it('returns failed, not a guessed tier, for an unrecognised price id', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_11', orgId: 'org_11', stripeCustomerId: 'cus_11', tierId: 'tier_starter' })],
    })
    const event = makeEvent({
      id: 'evt_sub_badprice', type: 'customer.subscription.updated',
      data: stripeSubscriptionData({ customer: 'cus_11', items: { data: [{ id: 'si_x', quantity: 1, price: { id: 'price_does_not_exist' } }] } }),
    })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('failed')
    // Nothing applied — the tier the row had before is unchanged.
    expect(prisma._subscriptions.get('sub_row_11')!.tierId).toBe('tier_starter')
  })

  it('applies a pending downgrade once the period rolls past its effective date, and clears the pending fields', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_12', orgId: 'org_12', stripeCustomerId: 'cus_12',
        tierId: 'tier_growth', seatsPurchased: 5,
        pendingTierId: 'tier_starter', pendingSeats: 2,
        pendingChangeEffectiveAt: new Date('2026-09-01T00:00:00Z'),
      })],
      tiers: [tierFixture({ id: 'tier_growth' }), tierFixture({ id: 'tier_starter', key: 'starter', stripePriceIdMonthly: 'price_starter_monthly' })],
    })
    // The incoming event's new period starts ON the effective date — Stripe
    // still reports the OLD (growth) price on this item; the pending target
    // must win over it.
    const event = makeEvent({
      id: 'evt_sub_rollover', type: 'customer.subscription.updated',
      data: stripeSubscriptionData({
        customer: 'cus_12',
        current_period_start: Math.floor(new Date('2026-09-01T00:00:00Z').getTime() / 1000),
        current_period_end: Math.floor(new Date('2026-10-01T00:00:00Z').getTime() / 1000),
      }),
    })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')

    const row = prisma._subscriptions.get('sub_row_12')!
    expect(row.tierId).toBe('tier_starter')
    expect(row.seatsPurchased).toBe(2)
    expect(row.pendingTierId).toBeNull()
    expect(row.pendingSeats).toBeNull()
    expect(row.pendingChangeEffectiveAt).toBeNull()
  })

  it('leaves a pending change untouched when the period has not yet rolled over', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_13', orgId: 'org_13', stripeCustomerId: 'cus_13',
        tierId: 'tier_growth', seatsPurchased: 5,
        pendingTierId: 'tier_starter', pendingSeats: 2,
        pendingChangeEffectiveAt: new Date('2026-12-01T00:00:00Z'),
      })],
    })
    const event = makeEvent({
      id: 'evt_sub_notyet', type: 'customer.subscription.updated',
      data: stripeSubscriptionData({
        customer: 'cus_13',
        current_period_start: Math.floor(new Date('2026-09-01T00:00:00Z').getTime() / 1000),
      }),
    })

    await processEvent(prisma as any, event)
    const row = prisma._subscriptions.get('sub_row_13')!
    expect(row.tierId).toBe('tier_growth')
    expect(row.pendingTierId).toBe('tier_starter')
    expect(row.pendingChangeEffectiveAt).toEqual(new Date('2026-12-01T00:00:00Z'))
  })
})

describe('customer.subscription.created', () => {
  it('writes an audit entry', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_14', orgId: 'org_14', stripeCustomerId: 'cus_14' })],
    })
    const event = makeEvent({
      id: 'evt_sub_created', type: 'customer.subscription.created',
      data: stripeSubscriptionData({ customer: 'cus_14' }),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')
    const entry = prisma._auditLogs.find((a) => a.entityId === 'sub_row_14')
    expect(entry!.action).toBe('billing.subscription_created')
  })
})

describe('customer.subscription.deleted', () => {
  it('sets status canceled, stamps canceledAt, and preserves currentPeriodEnd', async () => {
    const paidThrough = new Date('2026-10-15T00:00:00Z')
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_20', orgId: 'org_20', stripeCustomerId: 'cus_20',
        status: 'active', currentPeriodEnd: paidThrough,
      })],
    })
    const event = makeEvent({
      id: 'evt_sub_deleted', type: 'customer.subscription.deleted',
      data: stripeSubscriptionData({ customer: 'cus_20', status: 'canceled', canceled_at: 1735689600 }),
    })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')

    const row = prisma._subscriptions.get('sub_row_20')!
    expect(row.status).toBe('canceled')
    expect(row.canceledAt).toEqual(new Date(1735689600 * 1000))
    // The row still exists and currentPeriodEnd is untouched — access
    // continues through the period already paid for.
    expect(row.currentPeriodEnd).toEqual(paidThrough)

    const entry = prisma._auditLogs.find((a) => a.entityId === 'sub_row_20')
    expect(entry!.action).toBe('billing.subscription_canceled')
  })
})

describe('invoice.paid', () => {
  it('upserts the invoice and clears gracePeriodEndsAt', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_30', orgId: 'org_30', stripeCustomerId: 'cus_30',
        status: 'past_due', gracePeriodEndsAt: new Date('2026-09-01T00:00:00Z'),
      })],
    })
    const event = makeEvent({
      id: 'evt_inv_paid', type: 'invoice.paid',
      data: stripeInvoiceData({ customer: 'cus_30' }),
    })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')

    expect(prisma._subscriptions.get('sub_row_30')!.gracePeriodEndsAt).toBeNull()
    expect(prisma._invoices.get('in_1')).toBeDefined()

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.invoice_paid')
    expect(entry).toBeDefined()
    expect(entry!.orgId).toBe('org_30')
  })
})

describe('invoice.payment_failed', () => {
  it('sets a 14-day grace window on the first failure', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_40', orgId: 'org_40', stripeCustomerId: 'cus_40', status: 'past_due' })],
    })
    const createdAt = new Date('2026-08-25T00:00:00Z')
    const event = makeEvent({
      id: 'evt_inv_failed_1', type: 'invoice.payment_failed', createdAt,
      data: stripeInvoiceData({ customer: 'cus_40', status: 'open' }),
    })

    await processEvent(prisma as any, event)
    const row = prisma._subscriptions.get('sub_row_40')!
    expect(row.gracePeriodEndsAt).toEqual(new Date(createdAt.getTime() + 14 * 24 * 60 * 60 * 1000))

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.invoice_failed')
    expect(entry).toBeDefined()
  })

  it('does not extend the window on a second failure', async () => {
    const firstDeadline = new Date('2026-09-08T00:00:00Z')
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_41', orgId: 'org_41', stripeCustomerId: 'cus_41', status: 'past_due',
        gracePeriodEndsAt: firstDeadline,
      })],
    })
    const event = makeEvent({
      id: 'evt_inv_failed_2', type: 'invoice.payment_failed',
      createdAt: new Date('2026-08-30T00:00:00Z'), // later retry, would push a 14d-from-now deadline further out
      data: stripeInvoiceData({ id: 'in_2', customer: 'cus_41', status: 'open' }),
    })

    await processEvent(prisma as any, event)
    expect(prisma._subscriptions.get('sub_row_41')!.gracePeriodEndsAt).toEqual(firstDeadline)
  })
})

describe('invoice.upcoming', () => {
  it('is recorded and audited without mutating the subscription', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({
        id: 'sub_row_50', orgId: 'org_50', stripeCustomerId: 'cus_50', status: 'active',
        gracePeriodEndsAt: null,
      })],
    })
    const event = makeEvent({
      id: 'evt_upcoming', type: 'invoice.upcoming',
      data: stripeInvoiceData({ customer: 'cus_50' }),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')

    // Untouched.
    const row = prisma._subscriptions.get('sub_row_50')!
    expect(row.status).toBe('active')
    expect(row.gracePeriodEndsAt).toBeNull()
    expect(prisma._invoices.size).toBe(0)

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.invoice_upcoming')
    expect(entry).toBeDefined()
  })
})

describe('payment_method.attached / .detached', () => {
  it('attach upserts a BillingPaymentMethod and audits it', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_60', orgId: 'org_60', stripeCustomerId: 'cus_60' })],
    })
    const event = makeEvent({
      id: 'evt_pm_attach', type: 'payment_method.attached',
      data: stripePaymentMethodData({ customer: 'cus_60' }),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')

    const pm = prisma._paymentMethods.get('pm_1')!
    expect(pm.brand).toBe('visa')
    expect(pm.last4).toBe('4242')
    expect(pm.orgId).toBe('org_60')

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.payment_method_added')
    expect(entry).toBeDefined()
  })

  it('detach resolves the org from the mirrored row, not from event.data.customer (real Stripe payload has customer: null)', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_61', orgId: 'org_61', stripeCustomerId: 'cus_61' })],
    })
    await processEvent(prisma as any, makeEvent({
      id: 'evt_pm_attach_2', type: 'payment_method.attached',
      data: stripePaymentMethodData({ customer: 'cus_61' }),
    }))
    expect(prisma._paymentMethods.has('pm_1')).toBe(true)

    // The real shape of a `.detached` payload: `customer` is null (Stripe
    // sends the object AFTER detachment) — no `previous_attributes` needed
    // here because the BillingPaymentMethod row already carries orgId from
    // the attach above.
    const outcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_pm_detach', type: 'payment_method.detached',
      data: stripePaymentMethodData({ customer: null }),
    }))
    expect(outcome.status).toBe('processed')
    expect(prisma._paymentMethods.has('pm_1')).toBe(false)

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.payment_method_removed')
    expect(entry).toBeDefined()
    expect(entry!.orgId).toBe('org_61')
  })

  it('detach of a method never mirrored falls back to previous_attributes.customer', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_62', orgId: 'org_62', stripeCustomerId: 'cus_62' })],
    })
    // Never attached in this test — nothing in BillingPaymentMethod for
    // pm_1, so the only route to an orgId is previous_attributes.
    const outcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_pm_detach_unmirrored', type: 'payment_method.detached',
      data: stripePaymentMethodData({ customer: null, previous_attributes: { customer: 'cus_62' } }),
    }))
    expect(outcome.status).toBe('processed')

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.payment_method_removed')
    expect(entry).toBeDefined()
    expect(entry!.orgId).toBe('org_62')
    expect(entry!.entityId).toBeNull() // nothing existed to delete
  })

  it('detach fails loudly (not unhandled) when no org can be resolved at all', async () => {
    const prisma = createFakePrisma({ subscriptions: [] })
    const outcome = await processEvent(prisma as any, makeEvent({
      id: 'evt_pm_detach_orphan', type: 'payment_method.detached',
      data: stripePaymentMethodData({ customer: null }),
    }))
    expect(outcome.status).toBe('failed')
  })
})

describe('customer.subscription.trial_will_end', () => {
  it('is recorded and audited, and does not mutate the subscription', async () => {
    const prisma = createFakePrisma({
      subscriptions: [subscriptionFixture({ id: 'sub_row_70', orgId: 'org_70', stripeCustomerId: 'cus_70', status: 'trialing' })],
    })
    const event = makeEvent({
      id: 'evt_trial_end', type: 'customer.subscription.trial_will_end',
      data: stripeSubscriptionData({ customer: 'cus_70', status: 'trialing' }),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('processed')
    expect(prisma._subscriptions.get('sub_row_70')!.status).toBe('trialing')

    const entry = prisma._auditLogs.find((a) => a.action === 'billing.trial_will_end')
    expect(entry).toBeDefined()
  })
})

describe('an event for an unknown Stripe customer', () => {
  it('returns failed rather than silently dropping it', async () => {
    const prisma = createFakePrisma({ subscriptions: [] })
    const event = makeEvent({
      id: 'evt_unknown_customer', type: 'invoice.paid',
      data: stripeInvoiceData({ customer: 'cus_does_not_exist' }),
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome.status).toBe('failed')
    expect(prisma._invoices.size).toBe(0)
  })
})
