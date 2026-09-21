import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { syncErpSkuPipeline } from '../lib/erpSync'
import {
  OpenOrderEditForbiddenError,
  ScopedModuleItemNotFoundError,
  updateModuleItemForOrg,
} from '../services/oor/erpLineSync'
import { requirePermission, sendError, type RbacRequest } from '../middleware/requirePermission'
import { can } from '../services/rbac/resolve'
import { getActingOrgId } from '../middleware/billingContext'

export const departmentRoutes: ReturnType<typeof Router> = Router()

// ─── SKU Pipeline ← ERP sync ────────────────────────────────
// Direct trigger for pulling the ERP SKU/product master feed into the
// Operations SKU Pipeline module. Mirrors /sku-pipeline/sync-from-npd and
// runs request-driven (no Redis / Bull worker required).
departmentRoutes.post('/sku-pipeline/sync-from-erp', async (_req: Request, res: Response) => {
  try {
    const result = await syncErpSkuPipeline(prisma)
    res.json(result)
  } catch (error) {
    console.error('[departments] POST /sku-pipeline/sync-from-erp error:', error)
    res.status(500).json({ error: 'Failed to sync SKU pipeline from ERP' })
  }
})

// ─── SKU Pipeline ← NPD linkage ─────────────────────────────
// When an NPD project completes a Stage-3 task, create or progress the
// matching SKU Pipeline entry in Operations. Lives before /:id routes so
// the literal path is matched first.
const NPD_STAGE3_TO_SKU: Record<string, { status: string; step: number }> = {
  'Code / BOM Send (to CM)': { status: 'Component Sourcing', step: 2 },
  'Artwork Send (to CM)': { status: 'Awaiting Artwork', step: 3 },
  'Proof Approval': { status: 'Pre-Production', step: 4 },
  'PO Submission': { status: 'In Production', step: 5 },
}

departmentRoutes.post('/sku-pipeline/sync-from-npd', async (req: Request, res: Response) => {
  try {
    const { npdProjectId, skuItemId, name, sku, upc, brand, taskName } = req.body as {
      npdProjectId?: string
      skuItemId?: string
      name?: string
      sku?: string
      upc?: string
      brand?: string
      taskName?: string
    }

    if (!taskName || !NPD_STAGE3_TO_SKU[taskName]) {
      return res.json({ skipped: true, reason: 'Task does not map to a SKU pipeline stage' })
    }
    const target = NPD_STAGE3_TO_SKU[taskName]

    const skuModule = await prisma.departmentModule.findFirst({
      where: { type: 'SKU_PIPELINE' },
    })
    if (!skuModule) {
      return res.status(404).json({ error: 'SKU Pipeline module not found' })
    }

    // Find an existing entry: explicit link, then by linkedNpdId.
    const existingItems = await prisma.moduleItem.findMany({ where: { moduleId: skuModule.id } })
    let existing = skuItemId ? existingItems.find((i) => i.id === skuItemId) : undefined
    if (!existing && npdProjectId) {
      existing = existingItems.find((i) => (i.data as any)?.linkedNpdId === npdProjectId)
    }

    if (existing) {
      const prev = existing.data as any
      // Only progress forward — never regress the pipeline.
      const nextStep = Math.max(prev.step || 0, target.step)
      const data = {
        ...prev,
        status: nextStep > (prev.step || 0) ? target.status : prev.status,
        step: nextStep,
        linkedNpdId: prev.linkedNpdId || npdProjectId || null,
        ...(name ? { name } : {}),
        ...(brand ? { brand } : {}),
      }
      const updated = await prisma.moduleItem.update({
        where: { id: existing.id },
        data: { data, status: data.status },
      })
      return res.json({ created: false, item: updated })
    }

    const data = {
      name: name || 'NPD SKU',
      sku: sku || '',
      upc: upc || '',
      status: target.status,
      brand: brand || '',
      step: target.step,
      totalSteps: 6,
      owner: 'Operations',
      blocker: null,
      linkedNpdId: npdProjectId || null,
    }
    const created = await prisma.moduleItem.create({
      data: { moduleId: skuModule.id, data, status: target.status },
    })
    res.status(201).json({ created: true, item: created })
  } catch (error) {
    console.error('[departments] POST /sku-pipeline/sync-from-npd error:', error)
    res.status(500).json({ error: 'Failed to sync SKU pipeline from NPD' })
  }
})

// ─── List all departments ───────────────────────────────────
departmentRoutes.get('/', async (req: Request, res: Response) => {
  try {
    // Scope to the caller's org when authenticated so one tenant never sees
    // another tenant's department names.
    const orgId = (req as any).member?.orgId
    const departments = await prisma.department.findMany({
      where: { archived: false, ...(orgId ? { orgId } : {}) },
      include: {
        modules: { orderBy: { sortOrder: 'asc' } },
        members: { select: { id: true, name: true, avatar: true, role: true, status: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    res.json(departments)
  } catch (error) {
    console.error('[departments] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch departments' })
  }
})

// ─── Get department by ID ───────────────────────────────────
departmentRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id as string },
      include: {
        modules: {
          orderBy: { sortOrder: 'asc' },
          include: { items: { orderBy: { sortOrder: 'asc' } } },
        },
        members: true,
        _count: { select: { tasks: true } },
      },
    })
    if (!dept) return res.status(404).json({ error: 'Department not found' })
    res.json(dept)
  } catch (error) {
    console.error('[departments] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch department' })
  }
})

// ─── Department Overview ────────────────────────────────────
// GET /api/v1/departments/:departmentId/overview
// Returns a rollup of open tasks, assigned tasks, open projects, and open
// module items for the department.
const OVERVIEW_MODULE_MAP: Record<string, string> = {
  BRIEFS: 'briefs',
  TECH_TRANSFERS: 'transfers',
  FORMULATIONS: 'formulations',
  NPD_PIPELINE: 'npd',
  INVENTORY_HEALTH: 'inventory',
  PRODUCTION_TRACKING: 'production',
  BILL_OF_MATERIALS: 'bom',
}

const BRIEF_STATUS_TERMINALS = ['Completed', 'Formula Approved'] as const
const TASK_CLOSED_STATUSES = ['COMPLETE', 'CANCELLED'] as const
const PROJECT_CLOSED_STATUSES = ['COMPLETED', 'CANCELLED', 'ARCHIVED'] as const

departmentRoutes.get('/:departmentId/overview', async (req: Request, res: Response) => {
  try {
    const { departmentId } = req.params

    const dept = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        modules: { include: { items: true } },
      },
    })

    if (!dept) {
      return res.status(404).json({ error: 'Department not found' })
    }

    // pendingTasks: dept tasks not COMPLETE/CANCELLED (cap 100)
    const pendingTasks = await prisma.task.findMany({
      where: {
        departmentId,
        status: { notIn: [...TASK_CLOSED_STATUSES] },
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: 100,
    })

    // assignedTasks: same filter + has an ownerId
    const assignedTasks = await prisma.task.findMany({
      where: {
        departmentId,
        status: { notIn: [...TASK_CLOSED_STATUSES] },
        ownerId: { not: null },
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, title: true } },
      },
      orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
      take: 100,
    })

    // openProjects: owned by or laned to this department, not closed
    const openProjects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerDepartmentId: departmentId },
          { departments: { some: { departmentId } } },
        ],
        status: { notIn: [...PROJECT_CLOSED_STATUSES] },
      },
      include: {
        ownerDepartment: { select: { id: true, name: true, color: true } },
        projectManager: { select: { id: true, name: true, avatar: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { targetEndDate: 'asc' },
      take: 50,
    })

    // openModuleItems: collect from modules by type
    const openModuleItems: Record<string, any[]> = {}

    for (const mod of dept.modules || []) {
      const modType = mod.type
      // Exclude CM_PRODUCTIVITY by default
      if (modType === 'CM_PRODUCTIVITY') continue

      const mapKey = OVERVIEW_MODULE_MAP[modType]
      // Handle CUSTOM_* modules
      const outputKey = mapKey || (modType.startsWith('CUSTOM_') ? 'modules' : null)
      if (!outputKey) continue

      let openItems: any[] = []

      if (modType === 'BRIEFS') {
        // Briefs: exclude terminal statuses
        openItems = ((mod.items as any[]) || []).filter((item: any) => {
          const briefStatus = item.data?.briefStatus
          return !BRIEF_STATUS_TERMINALS.includes(briefStatus)
        })
      } else if (modType === 'FINANCE_COSTING') {
        // Only include if needsReview
        openItems = ((mod.items as any[]) || []).filter((item: any) => item.data?.needsReview === true)
      } else {
        // All other modules: include all items (they have various status fields)
        openItems = (mod.items as any[]) || []
      }

      // Cap at 100 per category
      openItems = openItems.slice(0, 100)

      // Aggregate CUSTOM_* into a single 'modules' array
      if (outputKey === 'modules') {
        openModuleItems.modules = [...(openModuleItems.modules || []), ...openItems]
      } else {
        openModuleItems[outputKey] = openItems
      }
    }

    // Ensure modules array is capped at 100 total
    if (openModuleItems.modules) {
      openModuleItems.modules = openModuleItems.modules.slice(0, 100)
    }

    // ─── Operations Radar (BUILTIN_OPS only) ────────────────────
    // Top 10 low-stock SKUs + Top 5 at-risk open orders
    // NOT user-scoped — visible to everyone viewing the Ops overview
    let lowStockSkus: Array<{
      id: string
      sku: string
      description: string | null
      qtyOnHand: number
      reorderPoint: number
      lastUpdated: string | null
    }> = []

    let atRiskOpenOrders: Array<{
      id: string
      customerPoNumber: string | null
      itemNumber: string | null
      description: string | null
      riskLevel: string
      requiredDeliveryDate: string | null
      qtyRemaining: number
      lineStatus: string
    }> = []

    if (dept.type === 'BUILTIN_OPS') {
      // Low-stock SKUs from INVENTORY_HEALTH module
      const inventoryModule = dept.modules.find((m) => m.type === 'INVENTORY_HEALTH')
      if (inventoryModule) {
        const inventoryItems = ((inventoryModule.items as any[]) || [])
          .filter((item: any) => {
            const data = item.data || {}
            const qtyOnHand = Number(data.qtyOnHand ?? data.quantity ?? 0)
            const reorderPoint = Number(data.reorderPoint ?? data.minStock ?? 0)
            return qtyOnHand < reorderPoint && qtyOnHand >= 0
          })
          .sort((a: any, b: any) => {
            const aData = a.data || {}
            const bData = b.data || {}
            const aRatio = Number(aData.qtyOnHand ?? 0) / Math.max(Number(aData.reorderPoint ?? 1), 1)
            const bRatio = Number(bData.qtyOnHand ?? 0) / Math.max(Number(bData.reorderPoint ?? 1), 1)
            return aRatio - bRatio
          })
          .slice(0, 10)

        lowStockSkus = inventoryItems.map((item: any) => {
          const data = item.data || {}
          return {
            id: item.id,
            sku: String(data.sku || data.itemNumber || data.partNumber || ''),
            description: data.description || data.name || null,
            qtyOnHand: Number(data.qtyOnHand ?? data.quantity ?? 0),
            reorderPoint: Number(data.reorderPoint ?? data.minStock ?? 0),
            lastUpdated: item.updatedAt?.toISOString() || null,
          }
        })
      }

      // At-risk open orders from OorLine
      const riskOrders = await prisma.oorLine.findMany({
        where: {
          orgId: dept.orgId,
          isOpen: true,
          riskLevel: { in: ['critical', 'at_risk'] },
        },
        orderBy: [
          { riskLevel: 'asc' },
          { requiredDeliveryDate: 'asc' },
        ],
        take: 5,
        select: {
          id: true,
          customerPoNumber: true,
          itemNumber: true,
          description: true,
          riskLevel: true,
          requiredDeliveryDate: true,
          qtyRemaining: true,
          lineStatus: true,
        },
      })

      atRiskOpenOrders = riskOrders.map((line) => ({
        id: line.id,
        customerPoNumber: line.customerPoNumber,
        itemNumber: line.itemNumber,
        description: line.description,
        riskLevel: line.riskLevel,
        requiredDeliveryDate: line.requiredDeliveryDate?.toISOString() || null,
        qtyRemaining: Number(line.qtyRemaining ?? 0),
        lineStatus: line.lineStatus,
      }))
    }

    res.json({
      departmentId,
      pendingTasks,
      assignedTasks,
      openProjects,
      openModuleItems,
      lowStockSkus,
      atRiskOpenOrders,
    })
  } catch (error) {
    console.error('[departments] GET /:departmentId/overview error:', error)
    res.status(500).json({ error: 'Failed to fetch department overview' })
  }
})

// ─── Create department ──────────────────────────────────────
const createDeptSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  icon: z.string().default('circle'),
  color: z.string().default('#0A84FF'),
  type: z.enum(['BUILTIN_RD', 'BUILTIN_OPS', 'CUSTOM']).default('CUSTOM'),
  orgId: z.string(),
})

departmentRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createDeptSchema.parse(req.body)
    const dept = await prisma.department.create({ data })
    res.status(201).json(dept)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[departments] POST / error:', error)
    res.status(500).json({ error: 'Failed to create department' })
  }
})

// ─── Update department ──────────────────────────────────────
departmentRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const dept = await prisma.department.update({
      where: { id: req.params.id as string },
      data: req.body,
    })
    res.json(dept)
  } catch (error) {
    console.error('[departments] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update department' })
  }
})

// ─── Archive department ─────────────────────────────────────
departmentRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.department.update({
      where: { id: req.params.id as string },
      data: { archived: true },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[departments] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to archive department' })
  }
})

// ─── Add module to department ───────────────────────────────
const createModuleSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  config: z.record(z.any()).optional(),
  sortOrder: z.number().optional(),
})

departmentRoutes.post('/:id/modules', async (req: Request, res: Response) => {
  try {
    const data = createModuleSchema.parse(req.body)
    const mod = await prisma.departmentModule.create({
      data: { ...data, departmentId: req.params.id as string },
    })
    res.status(201).json(mod)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[departments] POST /:id/modules error:', error)
    res.status(500).json({ error: 'Failed to create module' })
  }
})

// ─── List module items ──────────────────────────────────────
departmentRoutes.get('/:id/modules/:mid/items', async (req: Request, res: Response) => {
  try {
    const items = await prisma.moduleItem.findMany({
      where: { moduleId: req.params.mid as string },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(items)
  } catch (error) {
    console.error('[departments] GET module items error:', error)
    res.status(500).json({ error: 'Failed to fetch module items' })
  }
})

// ─── Create module item ─────────────────────────────────────
departmentRoutes.post('/:id/modules/:mid/items', async (req: Request, res: Response) => {
  try {
    const item = await prisma.moduleItem.create({
      data: {
        moduleId: req.params.mid as string,
        data: req.body.data || {},
        status: req.body.status,
        sortOrder: req.body.sortOrder || 0,
      },
    })
    res.status(201).json(item)
  } catch (error) {
    console.error('[departments] POST module item error:', error)
    res.status(500).json({ error: 'Failed to create module item' })
  }
})

// ─── Update module item ─────────────────────────────────────
departmentRoutes.patch(
  '/:id/modules/:mid/items/:iid',
  requirePermission('departments:read'),
  async (req: RbacRequest, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const patch = {
      ...('data' in req.body ? { data: req.body.data } : {}),
      ...('status' in req.body ? { status: req.body.status } : {}),
      ...('sortOrder' in req.body ? { sortOrder: req.body.sortOrder } : {}),
    }
    const item = await updateModuleItemForOrg(prisma, {
      orgId,
      departmentId: req.params.id as string,
      moduleId: req.params.mid as string,
      itemId: req.params.iid as string,
      canEditOpenOrders: can(req.subject!, 'oor:edit_status'),
      patch,
    })
    res.json(item)
  } catch (error) {
    if (error instanceof ScopedModuleItemNotFoundError) {
      return sendError(res, 'NOT_FOUND', 'Module item not found.')
    }
    if (error instanceof OpenOrderEditForbiddenError) {
      return sendError(res, 'FORBIDDEN', 'You do not have permission to edit production orders.', {
        required: 'oor:edit_status',
      })
    }
    console.error('[departments] PATCH module item error:', error)
    res.status(500).json({ error: 'Failed to update module item' })
  }
})

// ─── Delete module item ─────────────────────────────────────
departmentRoutes.delete('/:id/modules/:mid/items/:iid', async (req: Request, res: Response) => {
  try {
    await prisma.moduleItem.delete({
      where: { id: req.params.iid as string },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[departments] DELETE module item error:', error)
    res.status(500).json({ error: 'Failed to delete module item' })
  }
})
