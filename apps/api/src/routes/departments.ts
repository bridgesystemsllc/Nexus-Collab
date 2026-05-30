import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const departmentRoutes: ReturnType<typeof Router> = Router()

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
