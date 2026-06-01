import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma, io } from '../index'

export const coworkRoutes: ReturnType<typeof Router> = Router()

// ─── Resolve memberIds → member objects ─────────────────────
async function resolveMembers(memberIds: string[]) {
  if (!memberIds || memberIds.length === 0) return []
  return prisma.member.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, name: true, avatar: true, role: true, department: { select: { id: true, name: true } } },
  })
}

// ─── List cowork spaces ─────────────────────────────────────
coworkRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const spaces = await prisma.coworkSpace.findMany({
      where: { status: 'ACTIVE' },
      include: {
        project: { select: { id: true, title: true, priority: true, health: true } },
        tasks: { select: { id: true, status: true } },
        _count: { select: { activities: true, tasks: true, documents: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    // Resolve members for every space (small lists; one query each is fine here)
    const allMemberIds = Array.from(new Set(spaces.flatMap((s) => s.memberIds)))
    const members = await resolveMembers(allMemberIds)
    const memberMap = new Map(members.map((m) => [m.id, m]))
    const withMembers = spaces.map((s) => ({
      ...s,
      members: s.memberIds.map((id) => memberMap.get(id)).filter(Boolean),
    }))

    res.json(withMembers)
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
        emails: { orderBy: { date: 'desc' } },
      },
    })
    if (!space) return res.status(404).json({ error: 'Cowork space not found' })
    const members = await resolveMembers(space.memberIds)
    res.json({ ...space, members })
  } catch (error) {
    console.error('[cowork] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch cowork space' })
  }
})

// ─── Create space ───────────────────────────────────────────
const linkedItemSchema = z.object({
  category: z.string(),
  id: z.string().optional().nullable(),
  name: z.string(),
}).passthrough()

const createSpaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['PROJECT', 'EMERGENCY', 'INITIATIVE', 'DEPARTMENT']).default('PROJECT'),
  projectId: z.string().optional(),
  deptNames: z.array(z.string()).optional(),
  memberIds: z.array(z.string()).optional(),
  linkedItem: linkedItemSchema.optional().nullable(),
  metadata: z.record(z.any()).optional().nullable(),
  initialTask: z
    .object({
      title: z.string().min(1),
      assigneeId: z.string().optional().nullable(),
      priority: z.string().optional(),
      dueDate: z.string().optional().nullable(),
    })
    .optional(),
})

coworkRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSpaceSchema.parse(req.body)
    const { linkedItem, metadata, initialTask, ...rest } = data

    // Fold the linked source item into metadata so any entity type persists.
    const mergedMetadata: Record<string, any> | undefined =
      linkedItem || metadata ? { ...(metadata || {}), ...(linkedItem ? { linkedItem } : {}) } : undefined

    const space = await prisma.coworkSpace.create({
      data: {
        ...rest,
        deptNames: rest.deptNames || [],
        memberIds: rest.memberIds || [],
        metadata: mergedMetadata,
      },
    })

    // Optionally seed an initial task on creation.
    if (initialTask?.title) {
      await prisma.task.create({
        data: {
          title: initialTask.title,
          priority: initialTask.priority || 'MEDIUM',
          dueDate: initialTask.dueDate ? new Date(initialTask.dueDate) : undefined,
          ownerId: initialTask.assigneeId || undefined,
          coworkSpaces: { connect: { id: space.id } },
        },
      })
    }

    res.status(201).json(space)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[cowork] POST / error:', error)
    res.status(500).json({ error: 'Failed to create cowork space' })
  }
})

// ─── Update space (name, members, depts, metadata) ──────────
const updateSpaceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  type: z.enum(['PROJECT', 'EMERGENCY', 'INITIATIVE', 'DEPARTMENT']).optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  deptNames: z.array(z.string()).optional(),
  memberIds: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional().nullable(),
})

coworkRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateSpaceSchema.parse(req.body)
    const space = await prisma.coworkSpace.update({
      where: { id: req.params.id as string },
      data: {
        ...data,
        description: data.description ?? undefined,
      },
    })
    const members = await resolveMembers(space.memberIds)
    io.to(`space:${req.params.id as string}`).emit('space_updated', { spaceId: req.params.id, space })
    res.json({ ...space, members })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[cowork] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update cowork space' })
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

// ─── Get linked emails ──────────────────────────────────────
coworkRoutes.get('/:id/emails', async (req: Request, res: Response) => {
  try {
    const emails = await prisma.emailLink.findMany({
      where: { coworkSpaceId: req.params.id as string },
      orderBy: { date: 'desc' },
    })
    res.json(emails)
  } catch (error) {
    console.error('[cowork] GET /:id/emails error:', error)
    res.status(500).json({ error: 'Failed to fetch emails' })
  }
})

// ─── Attach email to space ──────────────────────────────────
coworkRoutes.post('/:id/emails', async (req: Request, res: Response) => {
  try {
    const { subject, fromAddr, toAddrs, date, snippet, messageId, metadata } = req.body
    if (!subject) return res.status(400).json({ error: 'Subject is required' })

    const email = await prisma.emailLink.create({
      data: {
        messageId: messageId || `manual-${Date.now()}`,
        subject,
        fromAddr: fromAddr || '',
        toAddrs: toAddrs || [],
        date: date ? new Date(date) : new Date(),
        snippet: snippet || '',
        coworkSpaceId: req.params.id as string,
        metadata: metadata || null,
      },
    })

    io.to(`space:${req.params.id as string}`).emit('email_linked', { spaceId: req.params.id, email })
    res.status(201).json(email)
  } catch (error) {
    console.error('[cowork] POST /:id/emails error:', error)
    res.status(500).json({ error: 'Failed to attach email' })
  }
})

// ─── Remove email from space ────────────────────────────────
coworkRoutes.delete('/:id/emails/:emailId', async (req: Request, res: Response) => {
  try {
    await prisma.emailLink.delete({ where: { id: req.params.emailId as string } })
    res.json({ success: true })
  } catch (error) {
    console.error('[cowork] DELETE /:id/emails/:emailId error:', error)
    res.status(500).json({ error: 'Failed to remove email' })
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

// ─── Attach a file to a space (link-based document) ─────────
coworkRoutes.post('/:id/files', async (req: Request, res: Response) => {
  try {
    const { name, storageUrl, type, mimeType, size } = req.body
    if (!name) return res.status(400).json({ error: 'File name is required' })

    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })
    const uploader = await prisma.member.findFirst()

    const doc = await prisma.document.create({
      data: {
        name,
        mimeType: mimeType || 'application/octet-stream',
        size: size ?? 0,
        storageKey: `cowork-link-${Date.now()}`,
        storageUrl: storageUrl || null,
        type: type || 'OTHER',
        orgId: org.id,
        uploadedById: uploader?.id ?? '',
        coworkSpaces: { connect: { id: req.params.id as string } },
      },
    })

    io.to(`space:${req.params.id as string}`).emit('file_linked', { spaceId: req.params.id, document: doc })
    res.status(201).json(doc)
  } catch (error) {
    console.error('[cowork] POST /:id/files error:', error)
    res.status(500).json({ error: 'Failed to attach file' })
  }
})

// ─── Remove a file from a space ─────────────────────────────
coworkRoutes.delete('/:id/files/:fileId', async (req: Request, res: Response) => {
  try {
    await prisma.document.delete({ where: { id: req.params.fileId as string } })
    res.json({ success: true })
  } catch (error) {
    console.error('[cowork] DELETE /:id/files/:fileId error:', error)
    res.status(500).json({ error: 'Failed to remove file' })
  }
})
