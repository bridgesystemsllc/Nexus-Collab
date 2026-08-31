import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requirePermission, sendError, type RbacRequest } from '../middleware/requirePermission'
import { query } from '../services/users/auditService'
import { getActingOrgId } from '../middleware/billingContext'

// ─── Audit log (read) ────────────────────────────────────────
// Read-only by design. There is no POST, PATCH or DELETE here and there never
// will be — the service exports append() and query() and nothing else, so no
// route could offer one even by mistake.

export const auditRoutes: ReturnType<typeof Router> = Router()

const querySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(60).optional(),
  actorId: z.string().max(60).optional(),
  action: z.string().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

auditRoutes.get('/', requirePermission('audit:read'), async (req: RbacRequest, res: Response) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    return sendError(res, 'VALIDATION_FAILED', 'One or more filters are invalid.', {
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])),
    })
  }

  try {
    const result = await query(prisma, getActingOrgId(req), parsed.data)
    return res.json({
      data: result.rows,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      pages: result.pages,
    })
  } catch (err) {
    console.error('[audit] query failed:', err)
    return sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})

/** Distinct actions present, so the filter offers only what exists. */
auditRoutes.get('/actions', requirePermission('audit:read'), async (req: RbacRequest, res: Response) => {
  const rows = await prisma.auditLog.groupBy({
    by: ['action'],
    where: { orgId: getActingOrgId(req) },
    _count: { action: true },
  })
  return res.json({
    data: rows
      .map((r) => ({ action: r.action, count: r._count.action }))
      .sort((a, b) => a.action.localeCompare(b.action)),
  })
})

export default auditRoutes
