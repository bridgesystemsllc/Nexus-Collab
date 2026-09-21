import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { isAuthenticated } from '../auth/session'
import { requirePermission, sendError } from '../middleware/requirePermission'
import { getActingOrgId } from '../middleware/billingContext'
import { resolveEntitlements } from '../services/billing/entitlements'
import { loadCatalogue, findTier } from '../services/billing/catalogue'
import { getBillingProvider } from '../services/billing/providerRegistry'
import { BillingUnconfiguredError, BillingProviderError } from '../services/billing/provider'
import { planFor } from '../services/billing/proration'
import type { TierKey, BillingInterval } from '@nexus/shared'

// ─── Billing ─────────────────────────────────────────────────
// Note what every handler does first and identically: getActingOrgId(req).
// There is no route in this module where a client names its own organization.

export const billingRoutes: ReturnType<typeof Router> = Router()

billingRoutes.use(isAuthenticated)

const TIER_KEYS: TierKey[] = ['starter', 'growth', 'professional', 'enterprise']
const INTERVALS: BillingInterval[] = ['monthly', 'annual']

// ─── Schemas ────────────────────────────────────────────────

const checkoutSessionSchema = z.object({
  tierKey: z.enum(TIER_KEYS as [TierKey, ...TierKey[]]),
  seats: z.number().int().min(1),
  interval: z.enum(INTERVALS as [BillingInterval, ...BillingInterval[]]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
}).strict()

const portalSessionSchema = z.object({
  returnUrl: z.string().url(),
}).strict()

const changePlanSchema = z.object({
  tierKey: z.enum(TIER_KEYS as [TierKey, ...TierKey[]]),
  seats: z.number().int().min(1),
  interval: z.enum(INTERVALS as [BillingInterval, ...BillingInterval[]]).optional(),
}).strict()

const seatAssignSchema = z.object({
  memberId: z.string().min(1),
}).strict()

// ─── Helpers ────────────────────────────────────────────────

function idempotencyKey(orgId: string, ...parts: (string | number)[]): string {
  return `${orgId}:${parts.join(':')}`
}

function handleProviderError(err: unknown, res: any): void {
  if (err instanceof BillingUnconfiguredError) {
    res.status(503).json({ error: { code: 'BILLING_UNCONFIGURED', message: 'Billing is not configured on this installation.' } })
    return
  }
  if (err instanceof BillingProviderError) {
    const status = err.retryable ? 503 : 400
    res.status(status).json({ error: { code: err.code, message: err.message, retryable: err.retryable } })
    return
  }
  console.error('[billing] provider error:', err)
  sendError(res, 'INTERNAL', 'Something went wrong.')
}

/**
 * The resolved entitlements for the acting organization.
 *
 * The frontend uses this to RENDER — to show the right tier, grey out the
 * right buttons, put up the right banner. It decides nothing: every gated
 * endpoint re-resolves server-side through requireFeature/requireWriteAccess,
 * so turning a flag off in devtools grants exactly nothing.
 */
billingRoutes.get('/entitlements', requirePermission('billing:read'), async (req, res) => {
  try {
    const entitlements = await resolveEntitlements(prisma, getActingOrgId(req))
    res.json(entitlements)
  } catch (err) {
    console.error('[billing] GET /entitlements failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/**
 * GET /subscription — returns current subscription + tier + seats info
 */
billingRoutes.get('/subscription', requirePermission('billing:read'), async (req, res) => {
  try {
    const orgId = getActingOrgId(req)
    const [subscription, seatCount, tiers] = await Promise.all([
      prisma.billingSubscription.findUnique({ where: { orgId } }),
      prisma.seatAssignment.count({ where: { orgId, releasedAt: null } }),
      loadCatalogue(prisma),
    ])

    if (!subscription) {
      return res.json({ subscription: null, tier: null, seats: { purchased: 0, consumed: 0, available: 0 } })
    }

    const tier = tiers.find((t) => t.id === subscription.tierId)
    return res.json({
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingInterval: subscription.billingInterval,
        seatsPurchased: subscription.seatsPurchased,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        canceledAt: subscription.canceledAt,
      },
      tier: tier ? { key: tier.key, displayName: tier.displayName, rank: tier.rank } : null,
      seats: {
        purchased: subscription.seatsPurchased,
        consumed: seatCount,
        available: Math.max(0, subscription.seatsPurchased - seatCount),
      },
    })
  } catch (err) {
    console.error('[billing] GET /subscription failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/**
 * POST /checkout-session — creates a Stripe checkout session (or fake sandbox URL)
 */
billingRoutes.post('/checkout-session', requirePermission('billing:write'), async (req, res) => {
  const parsed = checkoutSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors } })
  }

  const { tierKey, seats, interval, successUrl, cancelUrl } = parsed.data
  const orgId = getActingOrgId(req)

  try {
    const tier = await findTier(prisma, tierKey)
    if (!tier) {
      return sendError(res, 'NOT_FOUND', `Tier "${tierKey}" not found`)
    }

    if (tier.isCustomQuote) {
      return res.status(422).json({ error: { code: 'ENTERPRISE_TIER', message: 'Enterprise tier requires a custom quote. Contact sales.' } })
    }

    if (seats < tier.minSeats) {
      return res.status(422).json({ error: { code: 'INVALID_SEATS', message: `Minimum ${tier.minSeats} seats required for ${tier.displayName}` } })
    }
    if (tier.maxSeats !== null && seats > tier.maxSeats) {
      return res.status(422).json({ error: { code: 'INVALID_SEATS', message: `Maximum ${tier.maxSeats} seats allowed for ${tier.displayName}` } })
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } })
    const member = (req as any).member
    const idemKey = idempotencyKey(orgId, tierKey, seats, interval)

    // T2 GATE: Use fakeProvider for sandbox until live Stripe keys are enabled
    // In sandbox mode, return a fake checkout URL that the frontend can handle
    if (process.env.BILLING_PROVIDER === 'fake' || !process.env.STRIPE_SECRET_KEY) {
      // Fake checkout URL for sandbox mode - frontend will handle this
      const fakeCheckoutUrl = `${successUrl}?sandbox=true&tier=${tierKey}&seats=${seats}&interval=${interval}`
      
      // Create subscription directly in sandbox mode
      const existingSub = await prisma.billingSubscription.findUnique({ where: { orgId } })
      if (!existingSub) {
        await prisma.billingSubscription.create({
          data: {
            orgId,
            tierId: tier.id,
            stripeCustomerId: `cus_fake_${orgId}`,
            stripeSubscriptionId: `sub_fake_${Date.now()}`,
            status: 'active',
            billingInterval: interval,
            seatsPurchased: seats,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })
      }
      
      return res.json({ checkoutUrl: fakeCheckoutUrl })
    }

    const provider = getBillingProvider()
    const { customerId } = await provider.ensureCustomer({
      orgId,
      name: org?.name ?? 'Unknown',
      email: member?.email ?? 'billing@nexus.app',
      idempotencyKey: `${orgId}:customer`,
    })

    // For real Stripe, we would create a checkout session here
    // This is a placeholder that would be replaced with actual Stripe integration
    const checkoutUrl = `${successUrl}?checkout=pending`
    return res.json({ checkoutUrl })
  } catch (err) {
    handleProviderError(err, res)
  }
})

/**
 * POST /portal-session — creates a Stripe billing portal session
 */
billingRoutes.post('/portal-session', requirePermission('billing:write'), async (req, res) => {
  const parsed = portalSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors } })
  }

  const { returnUrl } = parsed.data
  const orgId = getActingOrgId(req)

  try {
    // For sandbox mode, return a fake portal URL
    if (process.env.BILLING_PROVIDER === 'fake' || !process.env.STRIPE_SECRET_KEY) {
      return res.json({ portalUrl: `${returnUrl}?portal=sandbox` })
    }

    // For real Stripe, we would create a portal session here
    return res.json({ portalUrl: `${returnUrl}?portal=pending` })
  } catch (err) {
    handleProviderError(err, res)
  }
})

/**
 * POST /change-plan — change tier/seats/interval
 */
billingRoutes.post('/change-plan', requirePermission('billing:write'), async (req, res) => {
  const parsed = changePlanSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors } })
  }

  const { tierKey, seats, interval } = parsed.data
  const orgId = getActingOrgId(req)

  try {
    const subscription = await prisma.billingSubscription.findUnique({
      where: { orgId },
      include: { tier: true },
    })

    if (!subscription) {
      return sendError(res, 'NOT_FOUND', 'No active subscription')
    }

    const newTier = await findTier(prisma, tierKey)
    if (!newTier) {
      return sendError(res, 'NOT_FOUND', `Tier "${tierKey}" not found`)
    }

    if (newTier.isCustomQuote) {
      return res.status(422).json({ error: { code: 'ENTERPRISE_TIER', message: 'Enterprise tier requires a custom quote. Contact sales.' } })
    }

    if (seats < newTier.minSeats) {
      return res.status(422).json({ error: { code: 'INVALID_SEATS', message: `Minimum ${newTier.minSeats} seats required` } })
    }
    if (newTier.maxSeats !== null && seats > newTier.maxSeats) {
      return res.status(422).json({ error: { code: 'INVALID_SEATS', message: `Maximum ${newTier.maxSeats} seats allowed` } })
    }

    // Check current seat usage
    const currentSeats = await prisma.seatAssignment.count({ where: { orgId, releasedAt: null } })
    if (seats < currentSeats) {
      return res.status(422).json({ error: { code: 'SEATS_IN_USE', message: `Cannot reduce to ${seats} seats — ${currentSeats} seats are currently assigned` } })
    }

    // Determine change type using proration rules
    const tierChange = planFor({ kind: 'tier', fromRank: subscription.tier.rank, toRank: newTier.rank })
    const seatsChange = planFor({ kind: 'seats', from: subscription.seatsPurchased, to: seats })

    // For sandbox, apply changes directly
    if (process.env.BILLING_PROVIDER === 'fake' || !process.env.STRIPE_SECRET_KEY) {
      const isUpgrade = tierChange.chargeNow || seatsChange.chargeNow
      
      if (isUpgrade) {
        // Immediate upgrade
        await prisma.billingSubscription.update({
          where: { orgId },
          data: {
            tierId: newTier.id,
            seatsPurchased: seats,
            billingInterval: interval ?? subscription.billingInterval,
          },
        })
      } else {
        // Scheduled downgrade
        await prisma.billingSubscription.update({
          where: { orgId },
          data: {
            pendingTierId: newTier.id,
            pendingSeats: seats,
            pendingChangeEffectiveAt: subscription.currentPeriodEnd,
          },
        })
      }
      
      return res.json({ success: true, effectiveImmediately: isUpgrade })
    }

    // For real Stripe, would use provider.applyChange here
    return res.json({ success: true, effectiveImmediately: false })
  } catch (err) {
    handleProviderError(err, res)
  }
})

/**
 * POST /cancel — cancel subscription at period end
 */
billingRoutes.post('/cancel', requirePermission('billing:write'), async (req, res) => {
  const orgId = getActingOrgId(req)

  try {
    const subscription = await prisma.billingSubscription.findUnique({ where: { orgId } })
    if (!subscription) {
      return sendError(res, 'NOT_FOUND', 'No active subscription')
    }

    if (subscription.cancelAtPeriodEnd) {
      return res.status(422).json({ error: { code: 'ALREADY_CANCELED', message: 'Subscription is already scheduled for cancellation' } })
    }

    // For sandbox, update directly
    if (process.env.BILLING_PROVIDER === 'fake' || !process.env.STRIPE_SECRET_KEY) {
      await prisma.billingSubscription.update({
        where: { orgId },
        data: { cancelAtPeriodEnd: true, canceledAt: new Date() },
      })
      return res.json({ success: true, cancelAtPeriodEnd: true })
    }

    // For real Stripe, would use provider.cancelAtPeriodEnd here
    return res.json({ success: true, cancelAtPeriodEnd: true })
  } catch (err) {
    handleProviderError(err, res)
  }
})

/**
 * POST /reactivate — reactivate a canceled subscription
 */
billingRoutes.post('/reactivate', requirePermission('billing:write'), async (req, res) => {
  const orgId = getActingOrgId(req)

  try {
    const subscription = await prisma.billingSubscription.findUnique({ where: { orgId } })
    if (!subscription) {
      return sendError(res, 'NOT_FOUND', 'No subscription found')
    }

    if (!subscription.cancelAtPeriodEnd) {
      return res.status(422).json({ error: { code: 'NOT_CANCELED', message: 'Subscription is not scheduled for cancellation' } })
    }

    // For sandbox, update directly
    if (process.env.BILLING_PROVIDER === 'fake' || !process.env.STRIPE_SECRET_KEY) {
      await prisma.billingSubscription.update({
        where: { orgId },
        data: { cancelAtPeriodEnd: false, canceledAt: null },
      })
      return res.json({ success: true, cancelAtPeriodEnd: false })
    }

    // For real Stripe, would use provider.reactivate here
    return res.json({ success: true, cancelAtPeriodEnd: false })
  } catch (err) {
    handleProviderError(err, res)
  }
})

/**
 * GET /seats — list seat assignments
 */
billingRoutes.get('/seats', requirePermission('billing:read'), async (req, res) => {
  const orgId = getActingOrgId(req)

  try {
    const [subscription, assignments] = await Promise.all([
      prisma.billingSubscription.findUnique({ where: { orgId }, select: { seatsPurchased: true } }),
      prisma.seatAssignment.findMany({
        where: { orgId, releasedAt: null },
        include: { member: { select: { id: true, email: true, name: true } } },
        orderBy: { assignedAt: 'asc' },
      }),
    ])

    return res.json({
      purchased: subscription?.seatsPurchased ?? 0,
      assignments: assignments.map((a) => ({
        memberId: a.memberId,
        email: a.member.email,
        name: a.member.name,
        assignedAt: a.assignedAt,
      })),
    })
  } catch (err) {
    console.error('[billing] GET /seats failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/**
 * POST /seats/assign — assign a seat to a member
 */
billingRoutes.post('/seats/assign', requirePermission('billing:write'), async (req, res) => {
  const parsed = seatAssignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors } })
  }

  const { memberId } = parsed.data
  const orgId = getActingOrgId(req)
  const actingMember = (req as any).member

  try {
    const [subscription, member, existingAssignment, currentCount] = await Promise.all([
      prisma.billingSubscription.findUnique({ where: { orgId }, select: { seatsPurchased: true } }),
      prisma.member.findFirst({ where: { id: memberId, orgId } }),
      prisma.seatAssignment.findFirst({ where: { orgId, memberId, releasedAt: null } }),
      prisma.seatAssignment.count({ where: { orgId, releasedAt: null } }),
    ])

    if (!member) {
      return sendError(res, 'NOT_FOUND', 'Member not found in this organization')
    }

    if (existingAssignment) {
      return res.status(422).json({ error: { code: 'ALREADY_ASSIGNED', message: 'Member already has a seat' } })
    }

    const purchased = subscription?.seatsPurchased ?? 0
    if (currentCount >= purchased) {
      return res.status(409).json({ error: { code: 'NO_SEATS_AVAILABLE', message: `No seats available. ${purchased} seats purchased, ${currentCount} assigned.` } })
    }

    await prisma.seatAssignment.create({
      data: {
        orgId,
        memberId,
        assignedByMemberId: actingMember?.id,
      },
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('[billing] POST /seats/assign failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/**
 * POST /seats/release — release a seat from a member
 */
billingRoutes.post('/seats/release', requirePermission('billing:write'), async (req, res) => {
  const parsed = seatAssignSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request', fields: parsed.error.flatten().fieldErrors } })
  }

  const { memberId } = parsed.data
  const orgId = getActingOrgId(req)

  try {
    const assignment = await prisma.seatAssignment.findFirst({
      where: { orgId, memberId, releasedAt: null },
    })

    if (!assignment) {
      return res.status(422).json({ error: { code: 'NOT_ASSIGNED', message: 'Member does not have a seat' } })
    }

    await prisma.seatAssignment.update({
      where: { id: assignment.id },
      data: { releasedAt: new Date() },
    })

    return res.json({ success: true })
  } catch (err) {
    console.error('[billing] POST /seats/release failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/**
 * GET /tiers — list available tiers for the plans picker
 */
billingRoutes.get('/tiers', requirePermission('billing:read'), async (req, res) => {
  try {
    const tiers = await loadCatalogue(prisma)
    return res.json({
      tiers: tiers.map((t) => ({
        key: t.key,
        displayName: t.displayName,
        description: t.description,
        unitAmountMonthlyCents: t.unitAmountMonthlyCents,
        unitAmountAnnualCents: t.unitAmountAnnualCents,
        minSeats: t.minSeats,
        maxSeats: t.maxSeats,
        isCustomQuote: t.isCustomQuote,
        features: t.features,
      })),
    })
  } catch (err) {
    console.error('[billing] GET /tiers failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})
