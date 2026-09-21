import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { normaliseEmail, type IndustryKey, type TierKey, type BillingInterval } from '@nexus/shared'
import { prisma } from '../index'
import {
  getPendingOnboarding,
  clearPendingOnboarding,
  stampLastLogin,
} from '../auth/session'
import { findTier } from '../services/billing/catalogue'

export const onboardingRoutes: ReturnType<typeof Router> = Router()

// ─── Validation Schema ──────────────────────────────────────
// Strict mode rejects unknown keys — the server never reads orgId/entraTenantId
// from the body; those come exclusively from session.pendingOnboarding.
const INDUSTRY_KEYS: IndustryKey[] = ['cosmetics', 'cpg', 'raw_material', 'contract_manufacturer', 'ecommerce']
const TIER_KEYS: TierKey[] = ['starter', 'growth', 'professional']
const INTERVALS: BillingInterval[] = ['monthly', 'annual']

const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(80, 'Company name must be at most 80 characters'),
  industry: z.enum(INDUSTRY_KEYS as [IndustryKey, ...IndustryKey[]], { errorMap: () => ({ message: 'Invalid industry selection' }) }),
  brands: z.array(z.string().trim().min(1)).min(1, 'At least one brand is required').max(20, 'Maximum 20 brands allowed').optional(),
  tierKey: z.enum(TIER_KEYS as [TierKey, ...TierKey[]], { errorMap: () => ({ message: 'Invalid plan selection' }) }),
  seats: z.number().int().min(1, 'At least 1 seat required'),
  interval: z.enum(INTERVALS as [BillingInterval, ...BillingInterval[]], { errorMap: () => ({ message: 'Invalid billing interval' }) }),
}).strict().refine(
  (data) => {
    if (!data.brands || data.brands.length === 0) return true
    const lowerBrands = data.brands.map((b) => b.toLowerCase())
    return new Set(lowerBrands).size === lowerBrands.length
  },
  { message: 'Brand names must be unique', path: ['brands'] }
)

// Builtin departments created for every new workspace
const BUILTIN_DEPARTMENTS = [
  { name: 'R&D', type: 'BUILTIN_RD', icon: 'flask-conical', color: '#7C3AED' },
  { name: 'Operations', type: 'BUILTIN_OPS', icon: 'settings', color: '#FF9F0A' },
  { name: 'Finance', type: 'BUILTIN_FINANCE', icon: 'dollar-sign', color: '#00C7FF' },
] as const

// Marketing department seeded for cosmetics industry
const MARKETING_DEPARTMENT = { name: 'Marketing', type: 'CUSTOM', icon: 'megaphone', color: '#FF453A' }

// Default brand colors (cycle through for multiple brands)
const BRAND_COLORS = ['#7C3AED', '#0A84FF', '#32D74B', '#FF9F0A', '#BF5AF2', '#FF453A']
const BRAND_ICONS = ['tag', 'star', 'sparkles', 'heart', 'zap', 'award']

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'workspace'
}

// ─── POST /onboarding — Provision workspace ─────────────────
// Creates Organization + ADMIN Member + Brands + Departments + UserPreference
// + BillingSubscription in a single transaction. Requires session.pendingOnboarding from OAuth flow.
onboardingRoutes.post('/', async (req: Request, res: Response) => {
  const pending = getPendingOnboarding(req.session)
  if (!pending) {
    return res.status(401).json({
      error: 'Not in onboarding flow',
      message: 'Please sign in with Microsoft to start onboarding.',
    })
  }

  const parsed = onboardingSchema.safeParse(req.body)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'unknown'
      fieldErrors[field] = issue.message
    }
    return res.status(400).json({
      error: 'Validation failed',
      fields: fieldErrors,
    })
  }

  const { name, industry, brands, tierKey, seats, interval } = parsed.data
  const { clerkUserId, email, entraTenantId, name: userName } = pending

  // Validate tier
  const tier = await findTier(prisma, tierKey)
  if (!tier) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { tierKey: `Invalid tier: ${tierKey}` },
    })
  }

  if (tier.isCustomQuote) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { tierKey: 'Enterprise tier requires a custom quote. Contact sales.' },
    })
  }

  if (seats < tier.minSeats) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { seats: `Minimum ${tier.minSeats} seats required for ${tier.displayName}` },
    })
  }

  if (tier.maxSeats !== null && seats > tier.maxSeats) {
    return res.status(400).json({
      error: 'Validation failed',
      fields: { seats: `Maximum ${tier.maxSeats} seats allowed for ${tier.displayName}` },
    })
  }

  // Use org name as default brand if not provided
  const brandList = brands && brands.length > 0 ? brands : [name]

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Generate a unique slug for the organization
      let slug = generateSlug(name)
      let slugSuffix = 0
      while (await tx.organization.findUnique({ where: { slug } })) {
        slugSuffix++
        slug = `${generateSlug(name)}-${slugSuffix}`
      }

      // 1. Create the organization
      const org = await tx.organization.create({
        data: {
          name,
          slug,
          entraTenantId,
          industry,
          onboardingComplete: true,
        },
      })

      // 2. Get the Owner role for assignment
      const ownerRole = await tx.role.findUnique({ where: { key: 'owner' } })
      if (!ownerRole) {
        throw new Error('Owner role not found — RBAC may not be seeded')
      }

      // 3. Create the founding member as ADMIN with Owner role
      const member = await tx.member.create({
        data: {
          clerkUserId,
          email: normaliseEmail(email),
          name: userName,
          role: 'ADMIN',
          roleId: ownerRole.id,
          lifecycleStatus: 'active',
          orgId: org.id,
        },
      })

      // 4. Create brands
      for (let i = 0; i < brandList.length; i++) {
        await tx.brand.create({
          data: {
            name: brandList[i],
            color: BRAND_COLORS[i % BRAND_COLORS.length],
            icon: BRAND_ICONS[i % BRAND_ICONS.length],
            orgId: org.id,
          },
        })
      }

      // 5. Create builtin departments
      for (const dept of BUILTIN_DEPARTMENTS) {
        const createdDept = await tx.department.create({
          data: {
            name: dept.name,
            type: dept.type,
            icon: dept.icon,
            color: dept.color,
            orgId: org.id,
          },
        })

        // Add FINANCE_COSTING module for the Finance department
        if (dept.type === 'BUILTIN_FINANCE') {
          await tx.departmentModule.create({
            data: {
              name: 'Costing',
              type: 'FINANCE_COSTING',
              departmentId: createdDept.id,
              sortOrder: 0,
            },
          })
        }
      }

      // 6. For cosmetics industry, also seed Marketing department (archived=false)
      if (industry === 'cosmetics') {
        const existingMarketing = await tx.department.findFirst({
          where: { orgId: org.id, name: 'Marketing' },
        })
        if (existingMarketing) {
          // Unarchive if it exists
          await tx.department.update({
            where: { id: existingMarketing.id },
            data: { archived: false },
          })
        } else {
          // Create Marketing department
          await tx.department.create({
            data: {
              name: MARKETING_DEPARTMENT.name,
              type: MARKETING_DEPARTMENT.type,
              icon: MARKETING_DEPARTMENT.icon,
              color: MARKETING_DEPARTMENT.color,
              orgId: org.id,
              archived: false,
            },
          })
        }
      }

      // 7. Create user preferences
      await tx.userPreference.create({
        data: { memberId: member.id },
      })

      // 8. Create billing subscription (sandbox mode)
      // T2 GATE: Uses fakeProvider - no real Stripe charges
      const billingTier = await tx.billingTier.findUnique({ where: { key: tierKey } })
      if (billingTier) {
        await tx.billingSubscription.create({
          data: {
            orgId: org.id,
            tierId: billingTier.id,
            stripeCustomerId: `cus_fake_${org.id}`,
            stripeSubscriptionId: `sub_fake_${Date.now()}`,
            status: 'active',
            billingInterval: interval,
            seatsPurchased: seats,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        })

        // Assign first seat to founding member
        await tx.seatAssignment.create({
          data: {
            orgId: org.id,
            memberId: member.id,
          },
        })
      }

      return { org, member }
    })

    // Clear pending state and establish the authenticated session
    clearPendingOnboarding(req.session)
    ;(req.session as any).userId = result.member.id
    stampLastLogin(result.member.id)

    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err)
        else resolve()
      })
    })

    // T2 GATE: Fake checkout URL for sandbox mode
    const checkoutUrl = `/?onboarding=complete&tier=${tierKey}&seats=${seats}`
    
    return res.status(201).json({
      orgId: result.org.id,
      memberId: result.member.id,
      checkoutUrl,
      redirectUrl: '/',
    })
  } catch (err: any) {
    // P2002 = unique constraint violation — likely a race condition where
    // another request already provisioned this tenant. Re-read and join.
    if (err?.code === 'P2002') {
      const existingOrg = await prisma.organization.findUnique({
        where: { entraTenantId },
      })
      if (existingOrg) {
        // Org was created by a concurrent request. Check if member exists.
        const existingMember = await prisma.member.findFirst({
          where: { orgId: existingOrg.id, clerkUserId },
        })
        if (existingMember) {
          // Already fully provisioned — establish session and return success
          clearPendingOnboarding(req.session)
          ;(req.session as any).userId = existingMember.id
          stampLastLogin(existingMember.id)
          await new Promise<void>((resolve, reject) => {
            req.session.save((err) => (err ? reject(err) : resolve()))
          })
          return res.status(200).json({
            orgId: existingOrg.id,
            memberId: existingMember.id,
            redirectUrl: '/',
          })
        }
        // Org exists but member doesn't — this shouldn't happen in normal flow
        // but handle it by creating the member
        const ownerRole = await prisma.role.findUnique({ where: { key: 'owner' } })
        const member = await prisma.member.create({
          data: {
            clerkUserId,
            email: normaliseEmail(email),
            name: userName,
            role: 'ADMIN',
            roleId: ownerRole?.id,
            lifecycleStatus: 'active',
            orgId: existingOrg.id,
          },
        })
        await prisma.userPreference.create({ data: { memberId: member.id } })
        clearPendingOnboarding(req.session)
        ;(req.session as any).userId = member.id
        stampLastLogin(member.id)
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => (err ? reject(err) : resolve()))
        })
        return res.status(200).json({
          orgId: existingOrg.id,
          memberId: member.id,
          redirectUrl: '/',
        })
      }
    }
    console.error('[onboarding] provision failed:', err)
    return res.status(500).json({
      error: 'Failed to create workspace',
      message: 'Something went wrong. Please try again.',
    })
  }
})

// ─── GET /onboarding/status — Check if onboarding is complete ─
// Used by OnboardingGuard to determine if wizard should show.
// Returns onboardingComplete for the acting member's org.
onboardingRoutes.get('/status', async (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member) {
    // Check pending state
    const pending = getPendingOnboarding(req.session)
    if (pending) {
      return res.json({ onboardingComplete: false, hasOrg: false, needsOnboarding: true })
    }
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Member exists — they have completed onboarding by definition
  return res.json({
    onboardingComplete: true,
    hasOrg: true,
    orgId: member.orgId,
  })
})
