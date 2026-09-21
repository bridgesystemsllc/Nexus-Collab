import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const atRiskProductRoutes: ReturnType<typeof Router> = Router()

const LINK_TYPES = ['oor_line', 'tech_transfer', 'project', 'production_order', 'formulation'] as const
const ISSUE_TYPES = ['formulation', 'artwork', 'missing_component', 'raw_material', 'supply_chain', 'other'] as const
const RISK_CATEGORIES = ['supply_chain', 'formulation', 'artwork', 'component', 'raw_material', 'other'] as const
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM'] as const
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const PRODUCT_STATUSES = ['ACTIVE', 'MONITORING', 'RESOLVED'] as const
const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'RESOLVED'] as const
const ETA_CONFIDENCES = ['confirmed', 'estimated', 'unknown'] as const

type RbacRequest = Request & { member?: { id: string; orgId: string } }

function orgIdOf(req: RbacRequest): string {
  const orgId = req.member?.orgId
  if (!orgId) throw new Error('No org context')
  return orgId
}

function actorIdOf(req: RbacRequest): string | undefined {
  return req.member?.id
}

function fail(res: Response, code: number, message: string) {
  return res.status(code).json({ error: { code, message } })
}

// ─── List At-Risk Products ──────────────────────────────────
const listQuerySchema = z.object({
  departmentId: z.string().optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
})

atRiskProductRoutes.get('/', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const query = listQuerySchema.parse(req.query)

    const where: any = { orgId }
    if (query.departmentId) where.departmentId = query.departmentId
    if (query.status) {
      where.status = query.status
    } else {
      where.status = { in: ['ACTIVE', 'MONITORING'] }
    }
    if (query.priority) where.priority = query.priority

    const [items, total] = await Promise.all([
      prisma.atRiskProduct.findMany({
        where,
        include: {
          links: true,
          issues: {
            where: { status: { not: 'RESOLVED' } },
            select: { id: true, status: true },
          },
        },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        skip: query.offset,
        take: query.limit,
      }),
      prisma.atRiskProduct.count({ where }),
    ])

    const itemsWithInventory = await Promise.all(
      items.map(async (item) => {
        const moduleItem = await prisma.moduleItem.findUnique({
          where: { id: item.inventoryItemId },
          select: { id: true, data: true },
        })
        const data = moduleItem?.data as Record<string, any> | undefined
        return {
          ...item,
          openIssueCount: item.issues.length,
          linkCount: item.links.length,
          inventory: data
            ? {
                sku: data.sku,
                name: data.name,
                brand: data.brand,
                status: data.status,
                available: data.available,
                coverageMonths: data.coverageMonths,
              }
            : null,
        }
      })
    )

    res.json({ items: itemsWithInventory, total })
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch at-risk products' })
  }
})

// ─── Create At-Risk Product ─────────────────────────────────
const createBodySchema = z.object({
  inventoryItemId: z.string().min(1),
  departmentId: z.string().optional(),
  riskCategory: z.enum(RISK_CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).default('HIGH'),
  addedReason: z.string().optional(),
})

atRiskProductRoutes.post('/', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const actorId = actorIdOf(req)
    const body = createBodySchema.parse(req.body)

    const moduleItem = await prisma.moduleItem.findUnique({
      where: { id: body.inventoryItemId },
      include: { module: true },
    })
    if (!moduleItem || moduleItem.module.type !== 'INVENTORY_HEALTH') {
      return fail(res, 400, 'inventoryItemId must reference an INVENTORY_HEALTH ModuleItem')
    }

    const existing = await prisma.atRiskProduct.findUnique({
      where: { orgId_inventoryItemId: { orgId, inventoryItemId: body.inventoryItemId } },
    })

    if (existing) {
      if (existing.status === 'RESOLVED') {
        const reopened = await prisma.atRiskProduct.update({
          where: { id: existing.id },
          data: {
            status: 'ACTIVE',
            resolvedAt: null,
            resolvedById: null,
            resolutionNote: null,
            riskCategory: body.riskCategory ?? existing.riskCategory,
            priority: body.priority,
            addedById: actorId,
            addedReason: body.addedReason,
          },
          include: { links: true, issues: true },
        })
        return res.status(200).json(reopened)
      }
      return fail(res, 409, 'This inventory item is already on the at-risk list')
    }

    const created = await prisma.atRiskProduct.create({
      data: {
        orgId,
        inventoryItemId: body.inventoryItemId,
        departmentId: body.departmentId,
        riskCategory: body.riskCategory,
        priority: body.priority,
        addedById: actorId,
        addedReason: body.addedReason,
      },
      include: { links: true, issues: true },
    })

    res.status(201).json(created)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] POST / error:', error)
    res.status(500).json({ error: 'Failed to create at-risk product' })
  }
})

// ─── Resolve At-Risk Product ────────────────────────────────
const resolveBodySchema = z.object({
  resolutionNote: z.string().optional(),
})

atRiskProductRoutes.patch('/:id/resolve', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const actorId = actorIdOf(req)
    const { id } = req.params
    const body = resolveBodySchema.parse(req.body)

    const existing = await prisma.atRiskProduct.findFirst({
      where: { id, orgId },
    })
    if (!existing) return fail(res, 404, 'At-risk product not found')

    if (existing.status === 'RESOLVED') {
      return res.json(existing)
    }

    const resolved = await prisma.atRiskProduct.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote: body.resolutionNote,
      },
      include: { links: true, issues: true },
    })

    res.json(resolved)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] PATCH /:id/resolve error:', error)
    res.status(500).json({ error: 'Failed to resolve at-risk product' })
  }
})

// ─── Add Link ───────────────────────────────────────────────
const addLinkBodySchema = z.object({
  linkType: z.enum(LINK_TYPES),
  linkId: z.string().min(1),
  linkLabel: z.string().optional(),
  linkContext: z.string().optional(),
})

atRiskProductRoutes.post('/:id/links', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const actorId = actorIdOf(req)
    const { id } = req.params
    const body = addLinkBodySchema.parse(req.body)

    const product = await prisma.atRiskProduct.findFirst({
      where: { id, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const existingLink = await prisma.atRiskProductLink.findUnique({
      where: {
        atRiskProductId_linkType_linkId: {
          atRiskProductId: id,
          linkType: body.linkType,
          linkId: body.linkId,
        },
      },
    })
    if (existingLink) return fail(res, 409, 'Link already added')

    const link = await prisma.atRiskProductLink.create({
      data: {
        atRiskProductId: id,
        linkType: body.linkType,
        linkId: body.linkId,
        linkLabel: body.linkLabel,
        linkContext: body.linkContext,
        createdById: actorId,
      },
    })

    res.status(201).json(link)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] POST /:id/links error:', error)
    res.status(500).json({ error: 'Failed to add link' })
  }
})

// ─── Delete Link ────────────────────────────────────────────
atRiskProductRoutes.delete('/:id/links/:linkId', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const { id, linkId } = req.params

    const product = await prisma.atRiskProduct.findFirst({
      where: { id, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const link = await prisma.atRiskProductLink.findFirst({
      where: { id: linkId, atRiskProductId: id },
    })
    if (!link) return fail(res, 404, 'Link not found')

    await prisma.atRiskProductLink.delete({ where: { id: linkId } })
    res.status(204).send()
  } catch (error) {
    console.error('[at-risk-products] DELETE /:id/links/:linkId error:', error)
    res.status(500).json({ error: 'Failed to delete link' })
  }
})

// ─── List Issues ────────────────────────────────────────────
const listIssuesQuerySchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  issueType: z.enum(ISSUE_TYPES).optional(),
})

atRiskProductRoutes.get('/:id/issues', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const { id } = req.params
    const query = listIssuesQuerySchema.parse(req.query)

    const product = await prisma.atRiskProduct.findFirst({
      where: { id, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const where: any = { atRiskProductId: id }
    if (query.status) where.status = query.status
    if (query.issueType) where.issueType = query.issueType

    const items = await prisma.atRiskProductIssue.findMany({
      where,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })

    res.json({ items })
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] GET /:id/issues error:', error)
    res.status(500).json({ error: 'Failed to fetch issues' })
  }
})

// ─── Create Issue ───────────────────────────────────────────
const createIssueBodySchema = z.object({
  issueType: z.enum(ISSUE_TYPES),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.enum(SEVERITIES).default('HIGH'),
  dueDate: z.string().datetime().optional(),
  ownerId: z.string().optional(),
})

atRiskProductRoutes.post('/:id/issues', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const actorId = actorIdOf(req)
    const { id } = req.params
    const body = createIssueBodySchema.parse(req.body)

    const product = await prisma.atRiskProduct.findFirst({
      where: { id, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const issue = await prisma.atRiskProductIssue.create({
      data: {
        atRiskProductId: id,
        issueType: body.issueType,
        title: body.title,
        description: body.description,
        severity: body.severity,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        ownerId: body.ownerId,
        createdById: actorId,
      },
    })

    res.status(201).json(issue)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] POST /:id/issues error:', error)
    res.status(500).json({ error: 'Failed to create issue' })
  }
})

// ─── Update Issue ───────────────────────────────────────────
const updateIssueBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  severity: z.enum(SEVERITIES).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  etaDate: z.string().datetime().nullable().optional(),
  etaConfidence: z.enum(ETA_CONFIDENCES).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
})

atRiskProductRoutes.patch('/:atRiskId/issues/:issueId', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const { atRiskId, issueId } = req.params
    const body = updateIssueBodySchema.parse(req.body)

    const product = await prisma.atRiskProduct.findFirst({
      where: { id: atRiskId, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const existing = await prisma.atRiskProductIssue.findFirst({
      where: { id: issueId, atRiskProductId: atRiskId },
    })
    if (!existing) return fail(res, 404, 'Issue not found')

    const updateData: any = {}
    if (body.title !== undefined) updateData.title = body.title
    if (body.description !== undefined) updateData.description = body.description
    if (body.severity !== undefined) updateData.severity = body.severity
    if (body.dueDate !== undefined) updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.etaDate !== undefined) updateData.etaDate = body.etaDate ? new Date(body.etaDate) : null
    if (body.etaConfidence !== undefined) updateData.etaConfidence = body.etaConfidence
    if (body.ownerId !== undefined) updateData.ownerId = body.ownerId
    if (body.status !== undefined) updateData.status = body.status

    const updated = await prisma.atRiskProductIssue.update({
      where: { id: issueId },
      data: updateData,
    })

    res.json(updated)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] PATCH /:atRiskId/issues/:issueId error:', error)
    res.status(500).json({ error: 'Failed to update issue' })
  }
})

// ─── Resolve Issue ──────────────────────────────────────────
const resolveIssueBodySchema = z.object({
  resolutionNote: z.string().optional(),
})

atRiskProductRoutes.patch('/:atRiskId/issues/:issueId/resolve', async (req: RbacRequest, res: Response) => {
  try {
    const orgId = orgIdOf(req)
    const actorId = actorIdOf(req)
    const { atRiskId, issueId } = req.params
    const body = resolveIssueBodySchema.parse(req.body)

    const product = await prisma.atRiskProduct.findFirst({
      where: { id: atRiskId, orgId },
    })
    if (!product) return fail(res, 404, 'At-risk product not found')

    const existing = await prisma.atRiskProductIssue.findFirst({
      where: { id: issueId, atRiskProductId: atRiskId },
    })
    if (!existing) return fail(res, 404, 'Issue not found')

    if (existing.status === 'RESOLVED') {
      return res.json(existing)
    }

    const resolved = await prisma.atRiskProductIssue.update({
      where: { id: issueId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote: body.resolutionNote,
      },
    })

    res.json(resolved)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[at-risk-products] PATCH /:atRiskId/issues/:issueId/resolve error:', error)
    res.status(500).json({ error: 'Failed to resolve issue' })
  }
})
