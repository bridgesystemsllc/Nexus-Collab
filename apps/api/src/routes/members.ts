import { Router, Request, Response } from 'express'
import { z } from 'zod'
import crypto from 'crypto'
import { prisma } from '../index'

export const memberRoutes: ReturnType<typeof Router> = Router()

// ─── List all members ──────────────────────────────────────
memberRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const members = await prisma.member.findMany({
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(members)
  } catch (error) {
    console.error('[members] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch members' })
  }
})

// ─── Create a new member ───────────────────────────────────
const createMemberSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  departmentId: z.string().optional(),
  avatar: z.string().optional(),
})

memberRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createMemberSchema.parse(req.body)
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const member = await prisma.member.create({
      data: {
        clerkUserId: `user_${crypto.randomUUID().slice(0, 8)}`,
        orgId: org.id,
        name: data.name,
        email: data.email,
        role: data.role,
        departmentId: data.departmentId,
        avatar: data.avatar,
      },
    })
    res.status(201).json(member)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Email already in use' })
    console.error('[members] POST / error:', error)
    res.status(500).json({ error: 'Failed to create member' })
  }
})

// ─── Update a member ───────────────────────────────────────
memberRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const member = await prisma.member.update({
      where: { id: req.params.id as string },
      data: req.body,
      include: { department: { select: { id: true, name: true } } },
    })
    res.json(member)
  } catch (error) {
    console.error('[members] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update member' })
  }
})

// ─── Delete a member ───────────────────────────────────────
memberRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.member.delete({
      where: { id: req.params.id as string },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[members] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete member' })
  }
})

// ─── Invite a new user ─────────────────────────────────────
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.string().optional(),
  departmentId: z.string().optional(),
})

memberRoutes.post('/invite', async (req: Request, res: Response) => {
  try {
    const data = inviteSchema.parse(req.body)
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const inviter = await prisma.member.findFirst({
      where: { role: 'admin' },
    }) || await prisma.member.findFirst()

    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const invite = await prisma.organizationInvite.create({
      data: {
        orgId: org.id,
        email: data.email,
        role: data.role || 'member',
        token,
        status: 'pending',
        expiresAt,
        invitedById: inviter?.id,
      },
    })

    const member = await prisma.member.create({
      data: {
        clerkUserId: `user_${crypto.randomUUID().slice(0, 8)}`,
        orgId: org.id,
        name: data.email.split('@')[0],
        email: data.email,
        role: data.role || 'member',
        status: 'AVAILABLE',
        departmentId: data.departmentId,
      },
    })

    res.status(201).json({ invite, member })
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'Email already in use' })
    console.error('[members] POST /invite error:', error)
    res.status(500).json({ error: 'Failed to send invite' })
  }
})

// ─── List all pending invites ──────────────────────────────
memberRoutes.get('/invites', async (_req: Request, res: Response) => {
  try {
    const invites = await prisma.organizationInvite.findMany({
      orderBy: { createdAt: 'desc' },
      include: { invitedBy: { select: { name: true, email: true } } },
    })
    res.json(invites)
  } catch (error) {
    console.error('[members] GET /invites error:', error)
    res.status(500).json({ error: 'Failed to fetch invites' })
  }
})

// ─── Cancel/revoke an invite ───────────────────────────────
memberRoutes.delete('/invites/:id', async (req: Request, res: Response) => {
  try {
    await prisma.organizationInvite.delete({
      where: { id: req.params.id as string },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[members] DELETE /invites/:id error:', error)
    res.status(500).json({ error: 'Failed to revoke invite' })
  }
})

// ─── Assign member to department ───────────────────────────
memberRoutes.post('/:id/assign-department', async (req: Request, res: Response) => {
  try {
    const { departmentId } = req.body
    if (!departmentId) return res.status(400).json({ error: 'departmentId is required' })

    const member = await prisma.member.update({
      where: { id: req.params.id as string },
      data: { departmentId },
    })
    res.json(member)
  } catch (error) {
    console.error('[members] POST /:id/assign-department error:', error)
    res.status(500).json({ error: 'Failed to assign department' })
  }
})
