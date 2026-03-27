import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const documentRoutes: ReturnType<typeof Router> = Router()

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

// ─── Upload document (metadata only — file upload via S3 presigned URL) ──
documentRoutes.post('/upload', async (req: Request, res: Response) => {
  try {
    const doc = await prisma.document.create({
      data: {
        name: req.body.name,
        mimeType: req.body.mimeType,
        size: req.body.size,
        storageKey: req.body.storageKey,
        storageUrl: req.body.storageUrl,
        type: req.body.type || 'OTHER',
        orgId: req.body.orgId,
        uploadedById: req.body.uploadedById,
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
