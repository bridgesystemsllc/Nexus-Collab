import { Router } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../index'
import crypto from 'crypto'

export const onboardingRoutes: ReturnType<typeof Router> = Router()

// ─── Validation Schema ──────────────────────────────────────
const onboardingSchema = z.object({
  usageContext: z.enum(['work', 'personal', 'school', 'other']),
  industry: z.string().min(1).max(100),
  departments: z.array(z.string()).min(1),
  integrations: z.array(z.string()).default([]),
  featureInterests: z.array(z.string()).default([]),
  workspaceName: z.string().min(2).max(50),
  workspaceSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  workspaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  workspaceLogoUrl: z.string().url().optional(),
  invites: z.array(z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'viewer']),
  })).default([]),
  phoneNumber: z.string().max(20).optional(),
  referralSource: z.string().max(100).optional(),
})

// ─── Integration name → type mapping ────────────────────────
const INTEGRATION_TYPE_MAP: Record<string, string> = {
  'Microsoft Outlook': 'MICROSOFT_OUTLOOK',
  'Microsoft Teams': 'MICROSOFT_TEAMS',
  'Google Workspace': 'GOOGLE_WORKSPACE',
  'Slack': 'SLACK',
  'Zoom': 'ZOOM',
  'Asana': 'ASANA',
  'Notion': 'NOTION',
  'HubSpot': 'HUBSPOT',
  'Salesforce': 'SALESFORCE',
  'QuickBooks': 'QUICKBOOKS',
  'Shopify': 'SHOPIFY',
}

// ─── Department icon/color defaults ─────────────────────────
const DEPT_DEFAULTS: Record<string, { icon: string; color: string }> = {
  'Sales': { icon: 'trending-up', color: '#32D74B' },
  'Operations': { icon: 'settings', color: '#FF9F0A' },
  'Marketing': { icon: 'megaphone', color: '#BF5AF2' },
  'Finance & Accounting': { icon: 'dollar-sign', color: '#00C7FF' },
  'Human Resources': { icon: 'users', color: '#E8948A' },
  'Product Development': { icon: 'lightbulb', color: '#7C3AED' },
  'Supply Chain / Procurement': { icon: 'truck', color: '#FF9F0A' },
  'Customer Service': { icon: 'headphones', color: '#0A84FF' },
  'IT / Technology': { icon: 'cpu', color: '#64D2FF' },
  'Legal & Compliance': { icon: 'shield', color: '#636366' },
  'Executive / Leadership': { icon: 'crown', color: '#E8E8EC' },
}

// ─── POST /onboarding — Complete onboarding ─────────────────
onboardingRoutes.post('/', async (req, res) => {
  try {
    const data = onboardingSchema.parse(req.body)

    // Check slug uniqueness
    const existingOrg = await prisma.organization.findUnique({
      where: { slug: data.workspaceSlug },
    })
    if (existingOrg) {
      return res.status(409).json({ error: 'Slug already taken', field: 'workspaceSlug' })
    }

    // Run all DB operations in a transaction
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1. Create the organization
      const org = await tx.organization.create({
        data: {
          name: data.workspaceName,
          slug: data.workspaceSlug,
          logoUrl: data.workspaceLogoUrl || null,
          color: data.workspaceColor || '#7C3AED',
          industry: data.industry,
          usageContext: data.usageContext,
          featureInterests: data.featureInterests,
          referralSource: data.referralSource || null,
          phoneNumber: data.phoneNumber || null,
          onboardingComplete: true,
        },
      })

      // 2. Create the owner member
      // Using a placeholder clerkUserId until Clerk is integrated
      const owner = await tx.member.create({
        data: {
          clerkUserId: `user_${crypto.randomUUID().slice(0, 8)}`,
          email: `owner@${data.workspaceSlug}.nexus`,
          name: 'Workspace Owner',
          role: 'ADMIN',
          orgId: org.id,
        },
      })

      // 3. Create departments
      for (const deptName of data.departments) {
        const defaults = DEPT_DEFAULTS[deptName] || { icon: 'circle', color: '#0A84FF' }
        await tx.department.create({
          data: {
            name: deptName,
            icon: defaults.icon,
            color: defaults.color,
            type: 'CUSTOM',
            orgId: org.id,
          },
        })
      }

      // 4. Create integration stubs
      for (const integrationName of data.integrations) {
        if (integrationName === 'None of the above') continue
        const intType = INTEGRATION_TYPE_MAP[integrationName] || integrationName.toUpperCase().replace(/\s+/g, '_')
        await tx.integration.create({
          data: {
            type: intType,
            name: integrationName,
            status: 'DISCONNECTED',
            orgId: org.id,
          },
        })
      }

      // 5. Create invites with unique tokens
      const invites = []
      for (const invite of data.invites) {
        if (!invite.email) continue
        const token = crypto.randomUUID()
        const created = await tx.organizationInvite.create({
          data: {
            orgId: org.id,
            invitedEmail: invite.email,
            role: invite.role,
            invitedBy: owner.id,
            token,
            status: 'pending',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        })
        invites.push(created)
      }

      return { org, owner, invites }
    })

    // TODO: Queue invite emails via BullMQ after transaction succeeds
    // for (const invite of result.invites) {
    //   await emailQueue.add('send-invite', { invite })
    // }

    res.status(201).json({
      orgId: result.org.id,
      slug: result.org.slug,
      redirectUrl: '/dashboard',
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      })
    }
    console.error('[Onboarding] Error:', err)
    res.status(500).json({ error: 'Failed to create workspace. Please try again.' })
  }
})

// ─── GET /onboarding/check-slug/:slug ───────────────────────
onboardingRoutes.get('/check-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    })
    res.json({ available: !existing })
  } catch (err) {
    console.error('[Onboarding] Slug check error:', err)
    res.status(500).json({ error: 'Failed to check slug availability' })
  }
})

// ─── GET /onboarding/status — Check if onboarding is complete ─
onboardingRoutes.get('/status', async (_req, res) => {
  try {
    // Find the first org (since auth isn't integrated yet)
    // When Clerk is integrated, this will use the authenticated user's org
    const org = await prisma.organization.findFirst({
      select: { id: true, onboardingComplete: true },
      orderBy: { createdAt: 'desc' },
    })

    if (!org) {
      return res.json({ onboardingComplete: false, hasOrg: false })
    }

    res.json({ onboardingComplete: org.onboardingComplete, hasOrg: true, orgId: org.id })
  } catch (err) {
    console.error('[Onboarding] Status check error:', err)
    res.status(500).json({ error: 'Failed to check onboarding status' })
  }
})
