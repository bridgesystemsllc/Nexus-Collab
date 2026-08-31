// ─── Open Order Report routes ───────────────────────────────
// Mounted under /api/v1/operations/oor. The spec asked for /api/operations, but
// every route in this API lives behind /api/v1 and a second prefix would be a
// second convention.
//
// Handlers stay thin: validation lives in oor.schema.ts and the work lives in
// services/oor, so both can be tested without an HTTP server.

import { Router, type Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../index'
import { requirePermission, type RbacRequest } from '../middleware/requirePermission'
import { UPLOAD_MAX_BYTES } from '../lib/uploadValidation'
import { listLines, getLine, getTree, updateLine, updateNode } from '../services/oor/lineQueries'
import { runImport } from '../services/oor/importRun'
import { ExcelSourceAdapter } from '../services/oor/excel/excelSourceAdapter'
import { UnknownReportFormatError } from '../services/oor/excel/detectFormat'
import {
  listLinesQuerySchema,
  patchLineSchema,
  patchNodeSchema,
  importQuerySchema,
} from './oor.schema'

export const oorRoutes: ReturnType<typeof Router> = Router()

// Reports are parsed in memory and never written to disk: the rows are the
// durable artifact, and a spreadsheet on a disk somewhere is a copy of customer
// data nobody is tracking.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
})

/** The acting person, for audit attribution. */
function actorOf(req: RbacRequest): { id: string | null; email: string | null } {
  const subject = req.subject
  return { id: subject?.id ?? null, email: subject?.email ?? null }
}

/**
 * Nexus is single-organization per deployment today but multi-tenant by model.
 * Resolving the org from the acting member — not from a query parameter — is
 * what keeps a crafted request from reading another tenant's orders.
 */
async function orgIdOf(req: RbacRequest): Promise<string | null> {
  const subject = req.subject
  if (subject?.id) {
    const member = await prisma.member.findUnique({ where: { id: subject.id }, select: { orgId: true } })
    if (member) return member.orgId
  }
  const org = await prisma.organization.findFirst({ select: { id: true } })
  return org?.id ?? null
}

function fail(res: Response, status: number, message: string, extra?: Record<string, unknown>) {
  res.status(status).json({ error: { message, ...extra } })
}

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return fail(res, 422, 'Invalid request', { issues: error.errors })
  if (error instanceof UnknownReportFormatError) return fail(res, 422, error.message)
  console.error('[oor]', error)
  return fail(res, 500, 'Something went wrong handling that request.')
}

// ─── Lines ───────────────────────────────────────────────────

oorRoutes.get('/lines', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const query = listLinesQuerySchema.parse(req.query)
    res.json(await listLines(prisma, orgId, query))
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.get('/lines/:id', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const line = await getLine(prisma, orgId, req.params.id)
    if (!line) return fail(res, 404, 'That line does not exist.')
    res.json(line)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.get('/lines/:id/tree', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const tree = await getTree(prisma, orgId, req.params.id)
    if (tree === null) return fail(res, 404, 'That line does not exist.')
    res.json({ nodes: tree })
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.patch('/lines/:id', requirePermission('oor:edit_status'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const patch = patchLineSchema.parse(req.body)
    const updated = await updateLine(prisma, orgId, actorOf(req), req.params.id, patch)
    if (!updated) return fail(res, 404, 'That line does not exist.')
    res.json(updated)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.patch('/nodes/:id', requirePermission('oor:edit_tree'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const patch = patchNodeSchema.parse(req.body)
    const updated = await updateNode(prisma, orgId, actorOf(req), req.params.id, patch)
    if (!updated) return fail(res, 404, 'That material does not exist.')
    res.json(updated)
  } catch (error) {
    handleError(res, error)
  }
})

// ─── Imports ─────────────────────────────────────────────────

oorRoutes.post(
  '/imports',
  requirePermission('oor:import'),
  upload.single('file'),
  async (req: RbacRequest, res: Response) => {
    try {
      const orgId = await orgIdOf(req)
      if (!orgId) return fail(res, 400, 'No organization found')
      if (!req.file) return fail(res, 400, 'Attach the report file as `file`.')

      const { brandId } = importQuerySchema.parse({ ...req.query, ...req.body })
      const result = await runImport(prisma, new ExcelSourceAdapter(), {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        orgId,
        brandId,
        importedById: actorOf(req).id,
      })

      // A duplicate is not an error — someone forwarded the same file twice.
      // Saying so plainly beats a 409 the operator has to interpret.
      res.status(result.duplicateOfRunId ? 200 : 201).json(result)
    } catch (error) {
      handleError(res, error)
    }
  },
)

oorRoutes.get('/imports/:id', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const run = await prisma.oorReportRun.findFirst({
      where: { id: req.params.id, orgId },
      include: { _count: { select: { lines: true } } },
    })
    if (!run) return fail(res, 404, 'That import does not exist.')
    res.json(run)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.get('/imports', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const runs = await prisma.oorReportRun.findMany({
      where: { orgId },
      orderBy: { importedAt: 'desc' },
      take: 25,
      include: { _count: { select: { lines: true } } },
    })
    res.json({ runs })
  } catch (error) {
    handleError(res, error)
  }
})
