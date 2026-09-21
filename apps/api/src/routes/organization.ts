import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { isAuthenticated } from '../auth/session'
import { requirePermission, sendError } from '../middleware/requirePermission'
import type { IndustryKey } from '@nexus/shared'

export const organizationRoutes: ReturnType<typeof Router> = Router()

organizationRoutes.use(isAuthenticated)

const INDUSTRY_KEYS: IndustryKey[] = ['cosmetics', 'cpg', 'raw_material', 'contract_manufacturer', 'ecommerce']

const updateOrgSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters').optional(),
  industry: z.enum(INDUSTRY_KEYS as [IndustryKey, ...IndustryKey[]]).optional(),
  logoUrl: z.string().url().nullable().optional(),
  phoneNumber: z.string().max(30).nullable().optional(),
}).strict()

function shapeOrg(org: any) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    industry: org.industry,
    logoUrl: org.logoUrl,
    phoneNumber: org.phoneNumber,
    onboardingComplete: org.onboardingComplete,
    createdAt: org.createdAt,
  }
}

// GET /organization — returns the acting member's organization
organizationRoutes.get('/', requirePermission('billing:read'), async (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member?.orgId) {
    return sendError(res, 'FORBIDDEN', 'No organization context')
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: member.orgId },
    })

    if (!org) {
      return sendError(res, 'NOT_FOUND', 'Organization not found')
    }

    return res.json(shapeOrg(org))
  } catch (err) {
    console.error('[organization] GET / failed:', err)
    return sendError(res, 'INTERNAL', 'Failed to fetch organization')
  }
})

// PATCH /organization — update org settings (admin only)
organizationRoutes.patch('/', requirePermission('billing:write'), async (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member?.orgId) {
    return sendError(res, 'FORBIDDEN', 'No organization context')
  }

  const parsed = updateOrgSchema.safeParse(req.body)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]?.toString() || 'unknown'
      fieldErrors[field] = issue.message
    }
    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fields: fieldErrors },
    })
  }

  const { name, industry, logoUrl, phoneNumber } = parsed.data

  try {
    const org = await prisma.organization.update({
      where: { id: member.orgId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(industry !== undefined ? { industry } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber } : {}),
      },
    })

    return res.json(shapeOrg(org))
  } catch (err) {
    console.error('[organization] PATCH / failed:', err)
    return sendError(res, 'INTERNAL', 'Failed to update organization')
  }
})
