import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { ObjectStorageService } from '../lib/objectStorage'
import { isAuthenticated } from '../auth/session'
import { getActingOrgId } from '../middleware/billingContext'

export const documentRoutes: ReturnType<typeof Router> = Router()

// Documents are scoped to the caller's org (see getActingOrgId below), which
// requires a signed-in member. This router was previously reachable with no
// session at all — that was the bug, not a feature.
documentRoutes.use(isAuthenticated)

const objectStorage = new ObjectStorageService()

// ─── List documents with filters ────────────────────────────
documentRoutes.get('/', async (req: Request, res: Response) => {
  try {
    // The router requires a session (see documentRoutes.use(isAuthenticated)
    // above), so the acting member's org is always available here.
    const orgId = getActingOrgId(req)

    const { type, dept, project, search, page = '1', limit = '50' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    // A row must belong to the caller's org to be listed at all.
    const where: any = { orgId }
    if (type) where.type = type
    if (search) where.name = { contains: search as string, mode: 'insensitive' }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.document.count({ where }),
    ])

    res.json({ documents, total })
  } catch (error) {
    console.error('[documents] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch documents' })
  }
})

// ─── Upload document (real device upload or link) ───────────
// `objectPath` (e.g. "/objects/uploads/<uuid>") is set when the client has
// uploaded a real file to object storage via the presigned-URL flow. In that
// case we mark the object public-readable and expose a download URL served by
// the API. Otherwise it falls back to a link/metadata-based document.
documentRoutes.post('/upload', async (req: Request, res: Response) => {
  try {
    const { name, storageUrl, objectPath, type, mimeType, size } = req.body
    if (!name) return res.status(400).json({ error: 'File name is required' })

    // The router requires a session (see documentRoutes.use(isAuthenticated)
    // above), so the acting member's org is always available here.
    const orgId = getActingOrgId(req)
    // Attribute the upload to the genuinely logged-in member (the same rule
    // cowork.ts's upload handler follows) — never a client-supplied actorId,
    // which would let one org's member post a document credited to another
    // org's employee.
    const uploader = (req as any).member
    if (!uploader) return res.status(401).json({ error: 'Unauthorized' })

    let docStorageKey: string = req.body.storageKey || `doc-link-${Date.now()}`
    let docStorageUrl: string | null = storageUrl || null

    if (objectPath) {
      const normalized = await objectStorage.trySetObjectEntityAclPolicy(objectPath, {
        owner: uploader?.id ?? '',
        visibility: 'public',
      })
      docStorageKey = normalized
      // Served through the API so the file is downloadable from the app.
      docStorageUrl = `/api/v1/uploads${normalized}`
    }

    const doc = await prisma.document.create({
      data: {
        name,
        mimeType: mimeType || 'application/octet-stream',
        size: size ?? 0,
        storageKey: docStorageKey,
        storageUrl: docStorageUrl,
        type: type || 'OTHER',
        orgId,
        uploadedById: uploader?.id ?? '',
      },
    })
    res.status(201).json(doc)
  } catch (error) {
    console.error('[documents] POST /upload error:', error)
    res.status(500).json({ error: 'Failed to upload document' })
  }
})

// ─── Get document metadata ──────────────────────────────────
documentRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    // findFirst (not findUnique) so a real id belonging to another org comes
    // back as "no match" — identical to a genuinely missing id. That is what
    // makes the 404 uninformative to a member probing ids that aren't theirs.
    const doc = await prisma.document.findFirst({ where: { id: req.params.id as string, orgId } })
    if (!doc) return res.status(404).json({ error: 'Document not found' })
    res.json(doc)
  } catch (error) {
    console.error('[documents] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch document' })
  }
})

// ─── Delete document ────────────────────────────────────────
documentRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    // deleteMany + a count check rather than delete-by-id: it lets the where
    // clause carry orgId, so a member can never delete a row that isn't
    // theirs by guessing its id, and a mismatch reads as the same 404 as a
    // missing row.
    const result = await prisma.document.deleteMany({ where: { id: req.params.id as string, orgId } })
    if (result.count === 0) return res.status(404).json({ error: 'Document not found' })
    res.json({ success: true })
  } catch (error) {
    console.error('[documents] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})
