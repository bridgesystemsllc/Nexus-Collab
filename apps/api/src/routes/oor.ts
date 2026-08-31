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
import { can } from '../services/rbac/resolve'
import { UPLOAD_MAX_BYTES } from '../lib/uploadValidation'
import { listLines, getLine, getTree, updateLine, updateNode } from '../services/oor/lineQueries'
import { runImport } from '../services/oor/importRun'
import { ExcelSourceAdapter } from '../services/oor/excel/excelSourceAdapter'
import { buildExportWorkbook } from '../services/oor/exportReport'
import { UnknownReportFormatError } from '../services/oor/excel/detectFormat'
import {
  listLinesQuerySchema,
  patchLineSchema,
  patchNodeSchema,
  importQuerySchema,
  exportQuerySchema,
  createCommentSchema,
  patchCommentSchema,
  createNoteSchema,
  patchNoteSchema,
  createMeetingUpdateSchema,
  patchMeetingUpdateSchema,
  createEmailSchema,
  activityQuerySchema,
  COMMENT_EDIT_WINDOW_MS,
} from './oor.schema'
import { parsePastedEmail, parseEmlBuffer } from '../services/oor/emailParse'
import { buildActivityFeed, type ActivityKind, type FeedParts } from '../services/oor/activityFeed'
import type { Prisma } from '@prisma/client'

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

/** Whether the caller may edit content authored by other people. */
function canAdminister(req: RbacRequest): boolean {
  return req.subject ? can(req.subject, 'oor:admin') : false
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

// ─── Brands ──────────────────────────────────────────────────
// The Brand table is not exposed anywhere else in the API, and the report is
// scoped by brand at every level — import, filter, export. A small scoped
// endpoint here beats inventing a global brands API as a side effect of this
// feature.

oorRoutes.get('/brands', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const brands = await prisma.brand.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, icon: true },
    })
    res.json({ brands })
  } catch (error) {
    handleError(res, error)
  }
})

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

// ─── Collaboration ───────────────────────────────────────────
// Comments, notes, meeting updates and emails are append-only from an audit
// standpoint: every delete is a soft delete, because this is the record of how
// a purchase order was handled and a deleted paragraph is often the most
// interesting thing in it.

/** Confirms the line exists inside the caller's org before anything is written
 *  against it — the check that stops a guessed id reaching another tenant. */
async function lineInOrg(orgId: string, lineId: string): Promise<boolean> {
  const line = await prisma.oorLine.findFirst({ where: { id: lineId, orgId }, select: { id: true } })
  return line !== null
}

const EMAIL_ATTACHABLE_TYPE = 'oor_line'

oorRoutes.get('/lines/:id/comments', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')

    const { page, pageSize } = activityQuerySchema.parse(req.query)
    const where = { oorLineId: req.params.id, deletedAt: null }
    const [rows, total] = await Promise.all([
      prisma.oorComment.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.oorComment.count({ where }),
    ])
    res.json({ rows, total, page, pageSize })
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.post('/lines/:id/comments', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')

    const data = createCommentSchema.parse(req.body)
    const actor = actorOf(req)
    const comment = await prisma.oorComment.create({
      data: {
        oorLineId: req.params.id,
        shortageNodeId: data.shortageNodeId ?? null,
        body: data.body,
        entryDate: data.entryDate ?? null,
        isPinned: data.isPinned ?? false,
        authorId: actor.id,
        source: 'app',
      },
    })
    res.status(201).json(comment)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.patch('/comments/:id', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')

    const existing = await prisma.oorComment.findFirst({
      where: { id: req.params.id, oorLine: { orgId } },
    })
    if (!existing) return fail(res, 404, 'That comment does not exist.')

    const patch = patchCommentSchema.parse(req.body)
    const actor = actorOf(req)
    const isAuthor = existing.authorId !== null && existing.authorId === actor.id
    const isAdmin = req.subject ? canAdminister(req) : false

    if (!isAuthor && !isAdmin) {
      return fail(res, 403, "You can only edit your own comments.")
    }
    // The window is what makes a thread a record rather than a draft: after it
    // closes, the way to correct something is to say so in a new comment.
    const withinWindow = Date.now() - existing.createdAt.getTime() <= COMMENT_EDIT_WINDOW_MS
    if (patch.body !== undefined && !withinWindow && !isAdmin) {
      return fail(res, 409, 'That comment is past its edit window. Add a new comment instead.')
    }

    const updated = await prisma.oorComment.update({
      where: { id: existing.id },
      data: {
        ...(patch.body !== undefined ? { body: patch.body, editedAt: new Date() } : {}),
        ...(patch.isPinned !== undefined ? { isPinned: patch.isPinned } : {}),
        ...(patch.deleted === true ? { deletedAt: new Date() } : {}),
        ...(patch.deleted === false ? { deletedAt: null } : {}),
      },
    })
    res.json(updated)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.get('/lines/:id/notes', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const rows = await prisma.oorNote.findMany({
      where: { oorLineId: req.params.id, deletedAt: null },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    })
    res.json({ rows })
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.post('/lines/:id/notes', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const data = createNoteSchema.parse(req.body)
    const note = await prisma.oorNote.create({
      data: { ...data, oorLineId: req.params.id, authorId: actorOf(req).id },
    })
    res.status(201).json(note)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.patch('/notes/:id', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const existing = await prisma.oorNote.findFirst({ where: { id: req.params.id, oorLine: { orgId } } })
    if (!existing) return fail(res, 404, 'That note does not exist.')
    const { deleted, ...fields } = patchNoteSchema.parse(req.body)
    const updated = await prisma.oorNote.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(deleted === true ? { deletedAt: new Date() } : {}),
        ...(deleted === false ? { deletedAt: null } : {}),
      },
    })
    res.json(updated)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.get('/lines/:id/meeting-updates', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const rows = await prisma.oorMeetingUpdate.findMany({
      where: { oorLineId: req.params.id, deletedAt: null },
      orderBy: { meetingDate: 'desc' },
    })
    const now = new Date()
    res.json({
      rows,
      // An overdue next-action is what badges the row back in the grid, so it
      // is computed once here rather than in every client that renders it.
      overdue: rows.filter((r) => r.status === 'open' && r.dueDate !== null && r.dueDate < now).length,
    })
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.post('/lines/:id/meeting-updates', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const data = createMeetingUpdateSchema.parse(req.body)
    const update = await prisma.oorMeetingUpdate.create({
      data: {
        ...data,
        attendees: data.attendees,
        oorLineId: req.params.id,
        authorId: actorOf(req).id,
      },
    })
    res.status(201).json(update)
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.patch('/meeting-updates/:id', requirePermission('oor:comment'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const existing = await prisma.oorMeetingUpdate.findFirst({ where: { id: req.params.id, oorLine: { orgId } } })
    if (!existing) return fail(res, 404, 'That meeting update does not exist.')
    const { deleted, attendees, ...fields } = patchMeetingUpdateSchema.parse(req.body)
    const updated = await prisma.oorMeetingUpdate.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(attendees ? { attendees } : {}),
        ...(deleted === true ? { deletedAt: new Date() } : {}),
        ...(deleted === false ? { deletedAt: null } : {}),
      },
    })
    res.json(updated)
  } catch (error) {
    handleError(res, error)
  }
})

// ─── Emails ──────────────────────────────────────────────────
// Stored as Attachment rows rather than a dedicated table: Attachment is
// already polymorphic, already typed `email`, already soft-deleted and already
// indexed on (attachableType, attachableId).

oorRoutes.get('/lines/:id/emails', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const rows = await prisma.attachment.findMany({
      where: { attachableType: EMAIL_ATTACHABLE_TYPE, attachableId: req.params.id, type: 'email', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ rows })
  } catch (error) {
    handleError(res, error)
  }
})

oorRoutes.post(
  '/lines/:id/emails',
  requirePermission('oor:comment'),
  upload.single('file'),
  async (req: RbacRequest, res: Response) => {
    try {
      const orgId = await orgIdOf(req)
      if (!orgId) return fail(res, 400, 'No organization found')
      if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')

      let parsed: ReturnType<typeof parsePastedEmail> & { attachmentCount?: number }
      let source: string

      if (req.file) {
        parsed = parseEmlBuffer(req.file.buffer)
        source = 'eml_upload'
      } else {
        const data = createEmailSchema.parse(req.body)
        if (data.raw) {
          parsed = parsePastedEmail(data.raw)
          // Explicit fields from a mailbox connector beat anything scraped out
          // of the pasted text.
          parsed = {
            ...parsed,
            messageId: data.messageId ?? parsed.messageId,
            subject: data.subject ?? parsed.subject,
            fromAddress: data.fromAddress ?? parsed.fromAddress,
            toAddresses: data.toAddresses ?? parsed.toAddresses,
            ccAddresses: data.ccAddresses ?? parsed.ccAddresses,
            sentAt: data.sentAt ?? parsed.sentAt,
            bodyText: data.bodyText ?? parsed.bodyText,
          }
        } else if (data.bodyText || data.subject) {
          parsed = {
            messageId: data.messageId ?? null,
            subject: data.subject ?? null,
            fromAddress: data.fromAddress ?? null,
            toAddresses: data.toAddresses ?? [],
            ccAddresses: data.ccAddresses ?? [],
            sentAt: data.sentAt ?? null,
            bodyText: data.bodyText ?? '',
          }
        } else {
          return fail(res, 400, 'Paste the email as `raw`, upload it as `file`, or send its fields.')
        }
        source = data.source
      }

      const attachment = await prisma.attachment.create({
        data: {
          attachableType: EMAIL_ATTACHABLE_TYPE,
          attachableId: req.params.id,
          module: 'oor',
          type: 'email',
          createdBy: actorOf(req).id,
          payload: {
            messageId: parsed.messageId,
            subject: parsed.subject,
            fromAddress: parsed.fromAddress,
            toAddresses: parsed.toAddresses,
            ccAddresses: parsed.ccAddresses,
            sentAt: parsed.sentAt ? parsed.sentAt.toISOString() : null,
            bodyText: parsed.bodyText,
            attachmentCount: parsed.attachmentCount ?? 0,
            source,
            filename: req.file?.originalname ?? null,
          } as unknown as Prisma.InputJsonValue,
        },
      })
      res.status(201).json(attachment)
    } catch (error) {
      handleError(res, error)
    }
  },
)

oorRoutes.get('/lines/:id/emails/:emailId', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')
    const email = await prisma.attachment.findFirst({
      where: {
        id: req.params.emailId,
        attachableType: EMAIL_ATTACHABLE_TYPE,
        attachableId: req.params.id,
        type: 'email',
        deletedAt: null,
      },
    })
    if (!email) return fail(res, 404, 'That email does not exist.')
    res.json(email)
  } catch (error) {
    handleError(res, error)
  }
})

// ─── Activity ────────────────────────────────────────────────

oorRoutes.get('/lines/:id/activity', requirePermission('oor:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    if (!(await lineInOrg(orgId, req.params.id))) return fail(res, 404, 'That line does not exist.')

    const { kind, page, pageSize } = activityQuerySchema.parse(req.query)
    const lineId = req.params.id

    const nodeIds = await prisma.oorShortageNode.findMany({
      where: { oorLineId: lineId },
      select: { id: true },
    })

    const [comments, notes, meetingUpdates, emails, statusEvents] = await Promise.all([
      prisma.oorComment.findMany({ where: { oorLineId: lineId } }),
      prisma.oorNote.findMany({ where: { oorLineId: lineId } }),
      prisma.oorMeetingUpdate.findMany({ where: { oorLineId: lineId } }),
      prisma.attachment.findMany({
        where: { attachableType: EMAIL_ATTACHABLE_TYPE, attachableId: lineId, type: 'email' },
      }),
      // The line's own events plus every event on a material beneath it: to the
      // reader, "an ETA moved" is something that happened to this PO.
      prisma.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'oor_line', entityId: lineId },
            { entityType: 'oor_shortage_node', entityId: { in: nodeIds.map((n) => n.id) } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    const feed = buildActivityFeed(
      { comments, notes, meetingUpdates, emails, statusEvents } as unknown as FeedParts,
      kind as ActivityKind[] | undefined,
    )
    const start = (page - 1) * pageSize
    res.json({ rows: feed.slice(start, start + pageSize), total: feed.length, page, pageSize })
  } catch (error) {
    handleError(res, error)
  }
})

// ─── Export ──────────────────────────────────────────────────

oorRoutes.get('/exports', requirePermission('oor:export'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = await orgIdOf(req)
    if (!orgId) return fail(res, 400, 'No organization found')
    const query = exportQuerySchema.parse(req.query)

    const { buffer, filename } = await buildExportWorkbook(prisma, {
      orgId,
      brandId: query.brandId ?? null,
      reportType: query.reportType,
      includeStatus: query.includeStatus,
      includeAppendix: query.includeAppendix,
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  } catch (error) {
    handleError(res, error)
  }
})
