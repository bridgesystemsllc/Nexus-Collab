import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma, io } from '../index'
import { userScopedTasksListWhere } from '../lib/departmentVisibility'
import { resolveActor, UnauthenticatedError } from '../services/projects/context'
import type { Prisma } from '@prisma/client'

export const taskRoutes: ReturnType<typeof Router> = Router()

// ─── Constants for my-tasks filtering ───────────────────────
const TASK_CLOSED = ['COMPLETE', 'CANCELLED'] as const
const FOLLOW_UP_TAG = 'follow-up' as const

function myTasksWhere(
  actorId: string,
  opts: { open: boolean; followUp: boolean },
): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    OR: [{ ownerId: actorId }, { createdById: actorId }],
  }
  if (opts.open) {
    where.status = { notIn: [...TASK_CLOSED] }
  }
  if (opts.followUp) {
    where.brandNames = { has: FOLLOW_UP_TAG }
  } else {
    where.NOT = { brandNames: { has: FOLLOW_UP_TAG } }
  }
  return where
}

// ─── My tasks (personal queue) ──────────────────────────────
// GET /tasks/mine?open=true&followUp=false|true
// Must be registered BEFORE /:id to avoid "mine" being captured as an id
const myTasksQuerySchema = z.object({
  open: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  followUp: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  page: z.string().default('1').transform((v) => Math.max(1, parseInt(v, 10))),
  limit: z.string().default('50').transform((v) => Math.min(100, Math.max(1, parseInt(v, 10)))),
})

taskRoutes.get('/mine', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const parsed = myTasksQuerySchema.safeParse(req.query)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors })
    }
    const { open, followUp, page, limit } = parsed.data
    const skip = (page - 1) * limit
    const where = myTasksWhere(actor.id, { open, followUp })

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, title: true } },
        },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
    ])

    res.json({ tasks, total, page, limit })
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    console.error('[tasks] GET /mine error:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// ─── List tasks with filters ────────────────────────────────
taskRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { status, priority, dept, brand, owner, project, search, page = '1', limit = '50' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
    const actor = (req as any).member as { id: string } | undefined

    const where: any = {}
    if (status) where.status = status
    if (priority) where.priority = priority
    if (owner) where.ownerId = owner
    if (project) where.projectId = project
    if (brand) where.brandNames = { has: brand as string }
    if (search) where.title = { contains: search as string, mode: 'insensitive' }

    // When dept filter is set and actor is authenticated, apply user-scope
    // (ownerId=actor OR createdById=actor). This ensures Tasks & Follow-up
    // dept list shows only the user's own tasks.
    if (dept && actor) {
      Object.assign(where, userScopedTasksListWhere(dept as string, actor.id))
    } else if (dept) {
      where.departmentId = dept
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, title: true } },
          _count: { select: { subtasks: true, documents: true, emails: true, notes: true } },
        },
        orderBy: [{ priority: 'asc' }, { dueDate: 'asc' }],
        skip,
        take: parseInt(limit as string),
      }),
      prisma.task.count({ where }),
    ])

    res.json({ tasks, total, page: parseInt(page as string), limit: parseInt(limit as string) })
  } catch (error) {
    console.error('[tasks] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch tasks' })
  }
})

// ─── Get task detail ────────────────────────────────────────
taskRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id as string },
      include: {
        owner: true,
        department: true,
        project: true,
        subtasks: { include: { owner: { select: { id: true, name: true, avatar: true } } } },
        documents: true,
        emails: { orderBy: { date: 'desc' } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  } catch (error) {
    console.error('[tasks] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch task' })
  }
})

// ─── Create task ────────────────────────────────────────────
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE']).default('NOT_STARTED'),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  effort: z.enum(['XS', 'S', 'M', 'L', 'XL']).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  projectId: z.string().optional(),
  departmentId: z.string().optional(),
  ownerId: z.string().optional(),
  brandNames: z.array(z.string()).optional(),
  parentId: z.string().optional(),
})

taskRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createTaskSchema.parse(req.body)
    const actor = (req as any).member as { id: string } | undefined
    const task = await prisma.task.create({
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        brandNames: data.brandNames || [],
        // Set createdById to actor if missing — required for user-scope filtering
        createdById: actor?.id ?? null,
      },
      include: { owner: { select: { id: true, name: true, avatar: true } } },
    })
    io.emit('task_updated', task)
    res.status(201).json(task)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[tasks] POST / error:', error)
    res.status(500).json({ error: 'Failed to create task' })
  }
})

// ─── Update task ────────────────────────────────────────────
taskRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const updateData: any = { ...req.body }
    if (updateData.startDate) updateData.startDate = new Date(updateData.startDate)
    if (updateData.dueDate) updateData.dueDate = new Date(updateData.dueDate)
    if (updateData.status === 'COMPLETE') updateData.completedAt = new Date()

    const task = await prisma.task.update({
      where: { id: req.params.id as string },
      data: updateData,
      include: { owner: { select: { id: true, name: true, avatar: true } } },
    })
    io.emit('task_updated', task)
    res.json(task)
  } catch (error) {
    console.error('[tasks] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update task' })
  }
})

// ─── Delete task ────────────────────────────────────────────
taskRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id as string } })
    res.json({ success: true })
  } catch (error) {
    console.error('[tasks] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

// ─── Add note to task ───────────────────────────────────────
taskRoutes.post('/:id/notes', async (req: Request, res: Response) => {
  try {
    const note = await prisma.note.create({
      data: {
        content: req.body.content,
        authorId: req.body.authorId,
        taskId: req.params.id as string,
      },
      include: { author: { select: { id: true, name: true } } },
    })
    res.status(201).json(note)
  } catch (error) {
    console.error('[tasks] POST /:id/notes error:', error)
    res.status(500).json({ error: 'Failed to add note' })
  }
})

// ─── Link email to task ─────────────────────────────────────
taskRoutes.post('/:id/emails', async (req: Request, res: Response) => {
  try {
    const email = await prisma.emailLink.create({
      data: {
        messageId: req.body.messageId,
        subject: req.body.subject,
        fromAddr: req.body.fromAddr,
        toAddrs: req.body.toAddrs || [],
        date: new Date(req.body.date),
        snippet: req.body.snippet,
        taskId: req.params.id as string,
        metadata: req.body.metadata,
      },
    })
    res.status(201).json(email)
  } catch (error) {
    console.error('[tasks] POST /:id/emails error:', error)
    res.status(500).json({ error: 'Failed to link email' })
  }
})
