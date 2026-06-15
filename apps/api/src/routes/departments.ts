import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { syncErpSkuPipeline } from '../lib/erpSync'

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
departmentRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const departments = await prisma.department.findMany({
      where: { archived: false },
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
departmentRoutes.patch('/:id/modules/:mid/items/:iid', async (req: Request, res: Response) => {
  try {
    const item = await prisma.moduleItem.update({
      where: { id: req.params.iid as string },
      data: req.body,
    })
    res.json(item)
  } catch (error) {
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
