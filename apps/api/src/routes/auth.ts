import { Router, Request, Response } from 'express'

export const authRoutes: ReturnType<typeof Router> = Router()

// ─── Current authenticated member ───────────────────────────
// Returns the NEXUS Member resolved from the session, shaped for the
// frontend user store. 401 when there is no authenticated identity.
authRoutes.get('/me', (req: Request, res: Response) => {
  const member = (req as any).member
  if (!member) return res.status(401).json({ error: 'Unauthorized' })

  const firstName = (member.name || '').split(/\s+/)[0] || member.name
  res.json({
    id: member.id,
    name: member.name,
    firstName,
    email: member.email,
    role: member.role,
    orgId: member.orgId,
    departmentId: member.departmentId ?? null,
    avatar: member.avatar ?? null,
  })
})
