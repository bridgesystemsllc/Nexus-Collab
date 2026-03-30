import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma, io } from '../index'

export const coworkRoutes: ReturnType<typeof Router> = Router()

// ─── List cowork spaces ─────────────────────────────────────
coworkRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const spaces = await prisma.coworkSpace.findMany({
      where: { status: 'ACTIVE' },
      include: {
        project: { select: { id: true, title: true, priority: true, health: true } },
        _count: { select: { activities: true, tasks: true, documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(spaces)
  } catch (error) {
    console.error('[cowork] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch cowork spaces' })
  }
})

// ─── Get space detail ───────────────────────────────────────
coworkRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const space = await prisma.coworkSpace.findUnique({
      where: { id: req.params.id as string },
      include: {
        project: true,
        activities: {
          include: { author: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        tasks: {
          include: { owner: { select: { id: true, name: true, avatar: true } } },
          orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!space) return res.status(404).json({ error: 'Cowork space not found' })
    res.json(space)
  } catch (error) {
    console.error('[cowork] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch cowork space' })
  }
})

// ─── Create space ───────────────────────────────────────────
const createSpaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['PROJECT', 'EMERGENCY', 'INITIATIVE', 'DEPARTMENT']).default('PROJECT'),
  projectId: z.string().optional(),
  deptNames: z.array(z.string()).optional(),
  memberIds: z.array(z.string()).optional(),
})

coworkRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSpaceSchema.parse(req.body)
    const space = await prisma.coworkSpace.create({
      data: {
        ...data,
        deptNames: data.deptNames || [],
        memberIds: data.memberIds || [],
      },
    })
    res.status(201).json(space)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[cowork] POST / error:', error)
    res.status(500).json({ error: 'Failed to create cowork space' })
  }
})

// ─── Activity feed (paginated) ──────────────────────────────
coworkRoutes.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where: { coworkSpaceId: req.params.id as string },
        include: { author: { select: { id: true, name: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.activity.count({ where: { coworkSpaceId: req.params.id as string } }),
    ])

    res.json({ activities, total })
  } catch (error) {
    console.error('[cowork] GET /:id/activity error:', error)
    res.status(500).json({ error: 'Failed to fetch activities' })
  }
})

// ─── Post activity ──────────────────────────────────────────
coworkRoutes.post('/:id/activity', async (req: Request, res: Response) => {
  try {
    const activity = await prisma.activity.create({
      data: {
        type: req.body.type || 'UPDATE',
        content: req.body.content,
        coworkSpaceId: req.params.id as string,
        authorId: req.body.authorId,
        metadata: req.body.metadata,
      },
      include: { author: { select: { id: true, name: true, avatar: true } } },
    })
    io.to(`space:${req.params.id as string}`).emit('activity_new', { spaceId: req.params.id as string, activity })
    res.status(201).json(activity)
  } catch (error) {
    console.error('[cowork] POST /:id/activity error:', error)
    res.status(500).json({ error: 'Failed to post activity' })
  }
})

// ─── Get shared tasks ───────────────────────────────────────
coworkRoutes.get('/:id/tasks', async (req: Request, res: Response) => {
  try {
    const space = await prisma.coworkSpace.findUnique({
      where: { id: req.params.id as string },
      include: {
        tasks: {
          include: {
            owner: { select: { id: true, name: true, avatar: true } },
            department: { select: { id: true, name: true, color: true } },
          },
          orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        },
      },
    })
    res.json(space?.tasks || [])
  } catch (error) {
    console.error('[cowork] GET /:id/tasks error:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// ─── Create shared task ─────────────────────────────────────
coworkRoutes.post('/:id/tasks', async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.create({
      data: {
        title: req.body.title,
        description: req.body.description,
        priority: req.body.priority || 'MEDIUM',
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
        ownerId: req.body.ownerId,
        departmentId: req.body.departmentId,
        projectId: req.body.projectId,
        brandNames: req.body.brandNames || [],
        coworkSpaces: { connect: { id: req.params.id as string } },
      },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
    })
    io.to(`space:${req.params.id as string}`).emit('task_updated', task)
    res.status(201).json(task)
  } catch (error) {
    console.error('[cowork] POST /:id/tasks error:', error)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// ─── Get shared files ───────────────────────────────────────
coworkRoutes.get('/:id/files', async (req: Request, res: Response) => {
  try {
    const space = await prisma.coworkSpace.findUnique({
      where: { id: req.params.id as string },
      include: { documents: { orderBy: { createdAt: 'desc' } } },
    })
    res.json(space?.documents || [])
  } catch (error) {
    console.error('[cowork] GET /:id/files error:', error)
    res.status(500).json({ error: 'Failed to fetch files' })
  }
})
