import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { normaliseEmail } from '@nexus/shared'
import { prisma } from '../index'
import {
  getPendingOnboarding,
  clearPendingOnboarding,
  stampLastLogin,
} from '../auth/session'

export const onboardingRoutes: ReturnType<typeof Router> = Router()

// ─── Validation Schema ──────────────────────────────────────
// Strict mode rejects unknown keys — the server never reads orgId/entraTenantId
// from the body; those come exclusively from session.pendingOnboarding.
const onboardingSchema = z.object({
  name: z.string().trim().min(2, 'Company name must be at least 2 characters').max(80, 'Company name must be at most 80 characters'),
  industry: z.string().trim().min(1, 'Industry is required').max(100),
  brands: z.array(z.string().trim().min(1)).min(1, 'At least one brand is required').max(20, 'Maximum 20 brands allowed'),
}).strict().refine(
  (data) => {
    // Check for duplicate brands (case-insensitive)
    const lowerBrands = data.brands.map((b) => b.toLowerCase())
    return new Set(lowerBrands).size === lowerBrands.length
  },
  { message: 'Brand names must be unique', path: ['brands'] }
)

// Builtin departments created for every new workspace (no code field per spec)
const BUILTIN_DEPARTMENTS = [
  { name: 'R&D', type: 'BUILTIN_RD', icon: 'flask-conical', color: '#7C3AED' },
  { name: 'Operations', type: 'BUILTIN_OPS', icon: 'settings', color: '#FF9F0A' },
  { name: 'Finance', type: 'BUILTIN_FINANCE', icon: 'dollar-sign', color: '#00C7FF' },
] as const

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
// in a single transaction. Requires session.pendingOnboarding from OAuth flow.
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

  const { name, industry, brands } = parsed.data
  const { clerkUserId, email, entraTenantId, name: userName } = pending

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
      for (let i = 0; i < brands.length; i++) {
        await tx.brand.create({
          data: {
            name: brands[i],
            color: BRAND_COLORS[i % BRAND_COLORS.length],
            icon: BRAND_ICONS[i % BRAND_ICONS.length],
            orgId: org.id,
          },
        })
      }

      // 5. Create builtin departments (no code per spec)
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

      // 6. Create user preferences
      await tx.userPreference.create({
        data: { memberId: member.id },
      })

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

    return res.status(201).json({
      orgId: result.org.id,
      memberId: result.member.id,
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
