// apps/api/src/services/billing/webhookProcessor.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { processEvent, eventHandlers, type ProcessOutcome } from './webhookProcessor'
import type { ProviderEvent } from './provider'

// No live database here — a fake prisma, in-memory, deterministic. It models
// exactly what processEvent depends on: a unique constraint on
// BillingEvent.stripeEventId that throws P2002 on collision, and a
// $transaction that genuinely rolls back on throw (a fake that just calls its
// callback would make the "handler throws → rollback" test pass for the
// wrong reason).

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
  lastStripeEventAt: Date | null
}

function p2002(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

function createFakePrisma(opts: { subscriptions?: FakeSubscriptionRow[] } = {}) {
  const events = new Map<string, FakeBillingEventRow>()
  const subscriptions = new Map<string, FakeSubscriptionRow>((opts.subscriptions ?? []).map((s) => [s.id, s]))
  let seq = 0
  /// Forces the NEXT billingEvent.create call to throw P2002, regardless of
  /// whether a row with that id actually exists yet — this is how the
  /// "concurrent insert" test simulates two transactions racing the same
  /// unique constraint without needing real concurrency.
  let forceNextCreateP2002 = false

  function snapshot() {
    return {
      events: new Map([...events].map(([k, v]) => [k, { ...v }])),
      subscriptions: new Map([...subscriptions].map(([k, v]) => [k, { ...v }])),
    }
  }
  function restore(snap: ReturnType<typeof snapshot>) {
    events.clear()
    for (const [k, v] of snap.events) events.set(k, v)
    subscriptions.clear()
    for (const [k, v] of snap.subscriptions) subscriptions.set(k, v)
  }

  function billingEventApi() {
    return {
      async create({ data }: { data: Omit<FakeBillingEventRow, 'id' | 'processedAt' | 'processingError' | 'retryCount'> }) {
        if (forceNextCreateP2002) {
          forceNextCreateP2002 = false
          throw p2002()
        }
        if (events.has(data.stripeEventId)) throw p2002()
        const row: FakeBillingEventRow = {
          id: `evt_row_${++seq}`,
          stripeEventId: data.stripeEventId,
          eventType: data.eventType,
          orgId: data.orgId,
          payload: data.payload,
          processedAt: null,
          processingError: null,
          retryCount: 0,
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
        if ('retryCount' in data) {
          const inc = data.retryCount as { increment: number }
          row.retryCount += inc.increment
        }
        return row
      },
    }
  }

  function billingSubscriptionApi() {
    return {
      async findFirst({ where }: { where: { stripeCustomerId: string } }) {
        for (const s of subscriptions.values()) {
          if (s.stripeCustomerId === where.stripeCustomerId) return s
        }
        return null
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = subscriptions.get(where.id)
        if (!row) throw new Error('not found')
        if ('lastStripeEventAt' in data) row.lastStripeEventAt = data.lastStripeEventAt as Date
        return row
      },
    }
  }

  const fake = {
    billingEvent: billingEventApi(),
    billingSubscription: billingSubscriptionApi(),
    async $transaction<T>(fn: (tx: typeof fake) => Promise<T>): Promise<T> {
      const snap = snapshot()
      try {
        return await fn(fake)
      } catch (err) {
        restore(snap)
        throw err
      }
    },
    /// Test-only knobs, not part of the PrismaClient shape.
    _forceNextCreateP2002() { forceNextCreateP2002 = true },
    _events: events,
    _subscriptions: subscriptions,
  }

  return fake
}

function makeEvent(overrides: Partial<ProviderEvent> = {}): ProviderEvent {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type: 'invoice.upcoming',
    createdAt: new Date('2026-08-25T00:00:00Z'),
    data: {},
    ...overrides,
  }
}

const originalHandlers = { ...eventHandlers }
beforeEach(() => {
  for (const key of Object.keys(eventHandlers)) delete eventHandlers[key]
  Object.assign(eventHandlers, originalHandlers)
})

describe('processEvent — first delivery', () => {
  it('creates the BillingEvent row and returns unhandled for the stub table', async () => {
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

    // Exactly one row, unaffected by the second delivery.
    expect(prisma._events.size).toBe(1)
    expect(prisma._events.get('evt_dup_1')!.retryCount).toBe(0)
  })
})

describe('processEvent — redelivery of a failed event', () => {
  it('is retried and increments retryCount', async () => {
    const prisma = createFakePrisma()
    eventHandlers['invoice.upcoming'] = async () => { throw new Error('boom') }
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
      subscriptions: [
        { id: 'sub_row_1', orgId: 'org_1', stripeCustomerId: 'cus_1', lastStripeEventAt: null },
      ],
    })
    eventHandlers['invoice.upcoming'] = async (tx) => {
      // Make a write, then blow up — this is what "rolled back" is testing:
      // the write below must not survive the throw.
      await (tx as any).billingSubscription.update({
        where: { id: 'sub_row_1' },
        data: { lastStripeEventAt: new Date('2099-01-01T00:00:00Z') },
      })
      throw new Error('handler exploded')
    }
    const event = makeEvent({ id: 'evt_rollback_1', data: { customer: 'cus_1' } })

    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'failed', eventId: 'evt_rollback_1', error: 'handler exploded' })

    // The in-transaction write to the subscription must not have survived.
    expect(prisma._subscriptions.get('sub_row_1')!.lastStripeEventAt).toBeNull()

    const row = prisma._events.get('evt_rollback_1')!
    expect(row.processedAt).toBeNull()
    expect(row.processingError).toContain('handler exploded')
  })
})

describe('processEvent — out-of-order guard', () => {
  it('discards an event older than lastStripeEventAt as stale, applying nothing', async () => {
    const prisma = createFakePrisma({
      subscriptions: [
        {
          id: 'sub_row_2', orgId: 'org_2', stripeCustomerId: 'cus_2',
          lastStripeEventAt: new Date('2026-08-20T00:00:00Z'),
        },
      ],
    })
    let handlerRan = false
    eventHandlers['invoice.upcoming'] = async () => { handlerRan = true }

    const event = makeEvent({
      id: 'evt_stale_1', data: { customer: 'cus_2' },
      createdAt: new Date('2026-08-01T00:00:00Z'), // before the high-water mark
    })
    const outcome = await processEvent(prisma as any, event)
    expect(outcome).toEqual<ProcessOutcome>({ status: 'stale', eventId: 'evt_stale_1' })
    expect(handlerRan).toBe(false)
    expect(prisma._subscriptions.get('sub_row_2')!.lastStripeEventAt).toEqual(new Date('2026-08-20T00:00:00Z'))
  })

  it('does NOT treat a null lastStripeEventAt as stale', async () => {
    const prisma = createFakePrisma({
      subscriptions: [
        { id: 'sub_row_3', orgId: 'org_3', stripeCustomerId: 'cus_3', lastStripeEventAt: null },
      ],
    })
    const event = makeEvent({
      id: 'evt_notstale_1', data: { customer: 'cus_3' },
      createdAt: new Date('2020-01-01T00:00:00Z'), // deliberately "old" in absolute terms
    })
    const outcome = await processEvent(prisma as any, event)
    // Falls through to dispatch — the stub — not stale.
    expect(outcome).toEqual<ProcessOutcome>({ status: 'unhandled', eventId: 'evt_notstale_1' })
  })
})

describe('processEvent — concurrent insert of the same id', () => {
  it('one winner is unhandled/processed, the other sees P2002 and returns duplicate', async () => {
    const prisma = createFakePrisma()
    const event = makeEvent({ id: 'evt_race_1' })

    // Simulate the winner of the race already having fully committed —
    // another process's create() succeeded and its processing finished —
    // by seeding the row directly, then forcing OUR create() to hit the
    // unique constraint exactly as it would against a real concurrent insert.
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
