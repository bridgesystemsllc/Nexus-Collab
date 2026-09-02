import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { getPendingOnboarding } from '../auth/session'

export const authRoutes: ReturnType<typeof Router> = Router()

function shapeMember(member: any) {
  const firstName = (member.name || '').split(/\s+/)[0] || member.name
  return {
    id: member.id,
    name: member.name,
    firstName,
    email: member.email,
    role: member.role,
    orgId: member.orgId,
    departmentId: member.departmentId ?? null,
    avatar: member.avatar ?? null,
  }
}

// ─── Current authenticated member ───────────────────────────
// Returns:
// - 200 with shaped member when signed in with an existing membership
// - 200 with {status:'needs_onboarding',email,name} when pending onboarding
// - 401 when there is no authenticated identity and no pending state
authRoutes.get('/me', (req: Request, res: Response) => {
  const member = (req as any).member
  if (member) {
    return res.json(shapeMember(member))
  }

  // Check for pending onboarding state (user authenticated but no org yet)
  const pending = getPendingOnboarding(req.session)
  if (pending) {
    return res.json({
      status: 'needs_onboarding',
      email: pending.email,
      name: pending.name,
    })
  }

  return res.status(401).json({ error: 'Unauthorized' })
})

// ─── Update own profile ─────────────────────────────────────
// Self-service: a signed-in member may change their display name and pick the
// department they belong to (any department in their own org). This is what
// unblocks "You must belong to a department to create a project".
const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    departmentId: z.string().trim().min(1).nullable().optional(),
  })
  .strict()

authRoutes.patch('/me', async (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member) return res.status(401).json({ error: 'Unauthorized' })

  const parsed = updateMeSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(422).json({ error: 'Validation failed', details: parsed.error.flatten() })
  }
  const { name, departmentId } = parsed.data

  try {
    if (departmentId) {
      const dept = await prisma.department.findFirst({
        where: { id: departmentId, orgId: member.orgId, archived: false },
      })
      if (!dept) {
        return res.status(422).json({ error: 'Unknown department for your organization' })
      }
    }

    const updated = await prisma.member.update({
      where: { id: member.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(departmentId !== undefined ? { departmentId } : {}),
      },
    })
    return res.json(shapeMember(updated))
  } catch (err) {
    console.error('[auth] PATCH /me error:', err)
    return res.status(500).json({ error: 'Failed to update profile' })
  }
})
