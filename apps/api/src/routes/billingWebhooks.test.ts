// apps/api/src/routes/billingWebhooks.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'

// processEvent is mocked so this suite proves the route's own job — header
// check, signature verification, status mapping — without touching a
// database. webhookProcessor.test.ts is where the processing contract itself
// is proven.
vi.mock('../services/billing/webhookProcessor', () => ({
  processEvent: vi.fn(),
}))

import { billingWebhookRoutes } from './billingWebhooks'
import { processEvent } from '../services/billing/webhookProcessor'
import { resetProviderForTests } from '../services/billing/providerRegistry'

const mockedProcessEvent = processEvent as unknown as ReturnType<typeof vi.fn>

let server: Server
let baseUrl: string

beforeAll(async () => {
  // BILLING_PROVIDER=fake is the test seam named in the task: fakeProvider's
  // verifyWebhook accepts only the sentinel signature, so signature-path
  // behaviour is exercised with no Stripe key anywhere in this process.
  process.env.BILLING_PROVIDER = 'fake'
  resetProviderForTests()

  const app = express()
  // Mirrors the real mount in index.ts: express.raw() ahead of the route,
  // and nothing else in front of it — this suite would also catch a
  // regression where some other body parser sneaks in ahead of raw().
  app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), billingWebhookRoutes)
  server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/webhooks/stripe`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  resetProviderForTests()
})

beforeEach(() => {
  mockedProcessEvent.mockReset()
})

function stripeBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: 'evt_route_test_1',
    type: 'invoice.upcoming',
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'in_1' } },
    ...overrides,
  })
}

describe('POST /webhooks/stripe', () => {
  it('rejects a request with no stripe-signature header — 400, never processed', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stripeBody(),
    })
    expect(res.status).toBe(400)
    expect(mockedProcessEvent).not.toHaveBeenCalled()
  })

  it('rejects a signature the provider does not accept — 400, never processed', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'not-the-sentinel' },
      body: stripeBody(),
    })
    expect(res.status).toBe(400)
    expect(mockedProcessEvent).not.toHaveBeenCalled()
  })

  it('accepts the sentinel signature and returns 200 for a recognised, non-failed outcome', async () => {
    mockedProcessEvent.mockResolvedValue({ status: 'unhandled', eventId: 'evt_route_test_1' })
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'fake-valid-signature' },
      body: stripeBody(),
    })
    expect(res.status).toBe(200)
    expect(mockedProcessEvent).toHaveBeenCalledTimes(1)
    const [, event] = mockedProcessEvent.mock.calls[0]
    expect(event).toMatchObject({ id: 'evt_route_test_1', type: 'invoice.upcoming' })
  })

  it('maps a failed outcome to 500 so Stripe retries', async () => {
    mockedProcessEvent.mockResolvedValue({ status: 'failed', eventId: 'evt_route_test_1', error: 'db down' })
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': 'fake-valid-signature' },
      body: stripeBody(),
    })
    expect(res.status).toBe(500)
  })

  it('maps duplicate/stale outcomes to 200, not just processed', async () => {
    for (const status of ['duplicate', 'stale', 'processed'] as const) {
      mockedProcessEvent.mockResolvedValue({ status, eventId: 'evt_route_test_1' })
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': 'fake-valid-signature' },
        body: stripeBody(),
      })
      expect(res.status).toBe(200)
    }
  })
})
