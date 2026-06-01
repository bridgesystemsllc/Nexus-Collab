import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { ObjectStorageService } from '../lib/objectStorage'

export const documentRoutes: ReturnType<typeof Router> = Router()

const objectStorage = new ObjectStorageService()

async function resolveActingMember(identifier?: string | null) {
  if (identifier) {
    const member = await prisma.member.findFirst({
      where: { OR: [{ id: identifier }, { clerkUserId: identifier }] },
      select: { id: true },
    })
    if (member) return member
  }
  return prisma.member.findFirst({ select: { id: true } })
}

// ─── List documents with filters ────────────────────────────
documentRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { type, dept, project, search, page = '1', limit = '50' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const where: any = {}
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

    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })
    const uploader = await resolveActingMember(req.body.actorId || req.body.uploadedById)

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
        orgId: org.id,
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
    const doc = await prisma.document.findUnique({ where: { id: req.params.id as string } })
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
    await prisma.document.delete({ where: { id: req.params.id as string } })
    res.json({ success: true })
  } catch (error) {
    console.error('[documents] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete document' })
  }
})
