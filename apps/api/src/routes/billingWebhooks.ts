// apps/api/src/routes/billingWebhooks.ts
import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/prisma'
import { getBillingProvider } from '../services/billing/providerRegistry'
import { processEvent, type ProcessOutcome } from '../services/billing/webhookProcessor'

// ─── Stripe webhook intake ───────────────────────────────────
// Unauthenticated and CSRF-exempt BY DESIGN — the Stripe signature on every
// request IS the authentication. This router is mounted at the app level in
// index.ts, above `api.use(isAuthenticated)`, on purpose: Stripe never has a
// Nexus session and never will, so there is no gate to put it behind.
//
// This is NOT the hole #116 closed. #116's bug was a router landing on the
// public side of that gate by omission — nobody meant for it to be reachable
// without a session. This one is deliberate and self-authenticating: every
// request is rejected below unless `verifyWebhook` accepts its signature,
// which only Stripe (holding STRIPE_WEBHOOK_SECRET) can produce. Moving this
// router under `isAuthenticated` would not make it safer, it would make it
// unreachable — Stripe cannot log in.
//
// It must also stay mounted ABOVE express.json() in index.ts, with its own
// express.raw({ type: 'application/json' }) parser. See the comment at that
// mount site for why.

export const billingWebhookRoutes: ReturnType<typeof Router> = Router()

const STATUS_FOR: Record<ProcessOutcome['status'], number> = {
  processed: 200,
  duplicate: 200,
  stale: 200,
  unhandled: 200,
  failed: 500, // non-2xx is what tells Stripe to retry
}

billingWebhookRoutes.post('/', async (req: Request, res: Response) => {
  const signature = req.header('stripe-signature')
  if (!signature) {
    // Never attempt to verify — let alone process — a request with nothing
    // to check the signature against.
    res.status(400).json({ error: 'missing_signature' })
    return
  }

  let event
  try {
    // req.body is a raw Buffer here, not a parsed object — see the mount
    // comment in index.ts. A verified signature is the only thing that ever
    // lets an event past this line.
    event = getBillingProvider().verifyWebhook(req.body as Buffer, signature)
  } catch {
    // Never log the body on a rejected signature: it means this request has
    // not been established to have come from Stripe at all.
    console.warn('[billing webhook] signature verification failed')
    res.status(400).json({ error: 'invalid_signature' })
    return
  }

  // Identifiers only. Never the payload (event.data) at info level — it
  // carries customer PII (email, address, card metadata).
  console.info(`[billing webhook] ${event.type} ${event.id}`)

  try {
    const outcome = await processEvent(prisma, event)
    res.status(STATUS_FOR[outcome.status]).json({ status: outcome.status })
  } catch (err) {
    // processEvent catches and classifies its own failures as
    // { status: 'failed' }; landing here means something broke outside that
    // contract (e.g. the database itself unreachable). Still answer non-2xx
    // so Stripe retries.
    console.error('[billing webhook] processing threw outside its own contract:', errorMessageOnly(err))
    res.status(500).json({ error: 'internal_error' })
  }
})

/// Keeps the error log to a message string — an Error thrown from deep in a
/// future handler could carry request/customer data on other properties.
function errorMessageOnly(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
