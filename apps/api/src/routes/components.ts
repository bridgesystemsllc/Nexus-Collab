import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getActingOrgId } from '../middleware/billingContext'
import { isS3Configured, createPresignedPutUrl, createPresignedGetUrl, headObject } from '../lib/s3'
import { ComponentAttachmentKind } from '@prisma/client'

export const componentRoutes: ReturnType<typeof Router> = Router()

// NOTE: Authentication is applied globally in index.ts via api.use(isAuthenticated)
// before this router is mounted. No need to apply it here.

// ─── UPC-A Validation ───────────────────────────────────────
function normalizeUpcA(upc: string): string {
  return upc.replace(/[\s-]/g, '')
}

function isValidUpcA(upc: string): boolean {
  const normalized = normalizeUpcA(upc)
  if (!/^\d{12}$/.test(normalized)) return false
  const digits = normalized.split('').map(Number)
  const check =
    (10 -
      ((digits.slice(0, 11).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 3 : 1), 0)) % 10)) %
    10
  return check === digits[11]
}

function containsLetters(upc: string): boolean {
  return /[a-zA-Z]/.test(upc)
}

// ─── Request Schemas ────────────────────────────────────────
const assignProductSchema = z.object({
  upc: z.string().min(1, 'UPC is required'),
})

// ─── Helper: verify componentId belongs to a COMPONENTS module in this org ──
async function verifyComponentOwnership(
  componentId: string,
  orgId: string
): Promise<{ valid: boolean; error?: string }> {
  const item = await prisma.moduleItem.findUnique({
    where: { id: componentId },
    include: {
      module: {
        include: {
          department: true,
        },
      },
    },
  })

  if (!item) {
    return { valid: false, error: 'Component not found' }
  }

  if (item.module.type !== 'COMPONENTS') {
    return { valid: false, error: 'Component not found' }
  }

  if (item.module.department.orgId !== orgId) {
    return { valid: false, error: 'Component not found' }
  }

  return { valid: true }
}

// ─── GET /api/v1/components/:componentId/products/search?upc= ─
// Search products by UPC-A prefix (min 4 digits), exclude already-linked, cap 8
componentRoutes.get(
  '/:componentId/products/search',
  async (req: Request, res: Response) => {
    try {
      const orgId = getActingOrgId(req)
      const { componentId } = req.params
      const { upc } = req.query as { upc?: string }

      if (!upc || typeof upc !== 'string') {
        return res.status(400).json({ error: 'upc query parameter is required' })
      }

      if (containsLetters(upc)) {
        return res.status(400).json({ error: 'UPC-A must contain only digits' })
      }

      const normalized = normalizeUpcA(upc)

      if (normalized.length < 4) {
        return res.status(400).json({ error: 'Enter at least 4 digits to search' })
      }

      const ownership = await verifyComponentOwnership(componentId, orgId)
      if (!ownership.valid) {
        return res.status(404).json({ error: ownership.error })
      }

      const existingLinks = await prisma.componentProductLink.findMany({
        where: { orgId, componentId },
        select: { productId: true },
      })
      const linkedProductIds = existingLinks.map((l) => l.productId)

      const products = await prisma.product.findMany({
        where: {
          orgId,
          upc: { startsWith: normalized },
          id: { notIn: linkedProductIds },
        },
        take: 8,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          brand: true,
          sku: true,
          upc: true,
        },
      })

      res.json(products)
    } catch (error) {
      console.error('[components] GET /:componentId/products/search error:', error)
      res.status(500).json({ error: 'Failed to search products' })
    }
  }
)

// ─── GET /api/v1/components/:componentId/products ───────────
// List assigned products for a component
componentRoutes.get('/:componentId/products', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { componentId } = req.params

    const ownership = await verifyComponentOwnership(componentId, orgId)
    if (!ownership.valid) {
      return res.status(404).json({ error: ownership.error })
    }

    const links = await prisma.componentProductLink.findMany({
      where: { orgId, componentId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            sku: true,
            upc: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const products = links.map((l) => l.product)
    res.json(products)
  } catch (error) {
    console.error('[components] GET /:componentId/products error:', error)
    res.status(500).json({ error: 'Failed to fetch assigned products' })
  }
})

// ─── POST /api/v1/components/:componentId/products ──────────
// Assign a product by UPC-A. 201 for new, 200 for idempotent P2002.
componentRoutes.post('/:componentId/products', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { componentId } = req.params

    const parsed = assignProductSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { upc } = parsed.data

    if (containsLetters(upc)) {
      return res.status(400).json({ error: 'UPC-A must contain only digits' })
    }

    const normalized = normalizeUpcA(upc)

    if (!isValidUpcA(normalized)) {
      return res.status(400).json({ error: 'Invalid UPC-A: must be 12 digits with valid check digit' })
    }

    const ownership = await verifyComponentOwnership(componentId, orgId)
    if (!ownership.valid) {
      return res.status(404).json({ error: ownership.error })
    }

    const products = await prisma.product.findMany({
      where: { orgId, upc: normalized },
      select: { id: true, name: true, brand: true, sku: true, upc: true },
    })

    if (products.length === 0) {
      return res.status(404).json({ error: 'No product with this UPC-A' })
    }

    if (products.length > 1) {
      return res.status(409).json({ error: 'Multiple products share this UPC-A' })
    }

    const product = products[0]

    try {
      await prisma.componentProductLink.create({
        data: {
          orgId,
          componentId,
          productId: product.id,
        },
      })
      return res.status(201).json(product)
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(200).json(product)
      }
      throw err
    }
  } catch (error) {
    console.error('[components] POST /:componentId/products error:', error)
    res.status(500).json({ error: 'Failed to assign product' })
  }
})

// ─── DELETE /api/v1/components/:componentId/products/:upc ───
// Unassign a product by UPC-A. 204 on success.
componentRoutes.delete('/:componentId/products/:upc', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { componentId, upc } = req.params

    if (containsLetters(upc)) {
      return res.status(400).json({ error: 'UPC-A must contain only digits' })
    }

    const normalized = normalizeUpcA(upc)

    const ownership = await verifyComponentOwnership(componentId, orgId)
    if (!ownership.valid) {
      return res.status(404).json({ error: ownership.error })
    }

    const product = await prisma.product.findFirst({
      where: { orgId, upc: normalized },
      select: { id: true },
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    const result = await prisma.componentProductLink.deleteMany({
      where: {
        orgId,
        componentId,
        productId: product.id,
      },
    })

    if (result.count === 0) {
      return res.status(404).json({ error: 'Product not assigned to this component' })
    }

    res.status(204).send()
  } catch (error) {
    console.error('[components] DELETE /:componentId/products/:upc error:', error)
    res.status(500).json({ error: 'Failed to unassign product' })
  }
})

// ═══════════════════════════════════════════════════════════════
// NX-ATTACH: Component Attachments (Compatibility Reports & Spec Sheets)
// ═══════════════════════════════════════════════════════════════

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ATTACHMENT_KIND_DISPLAY: Record<ComponentAttachmentKind, string> = {
  COMPATIBILITY_REPORT: 'Compatibility report',
  SPEC_SHEET: 'Spec sheet',
}

const createAttachmentSchema = z.object({
  kind: z.enum(['COMPATIBILITY_REPORT', 'SPEC_SHEET']),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

function requirePrivilegedRole(req: Request, res: Response): boolean {
  const member = (req as any).member as { role?: string } | undefined
  const role = member?.role
  if (role !== 'ADMIN' && role !== 'OPS_MANAGER') {
    res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    return false
  }
  return true
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/__+/g, '_')
    .slice(0, 200)
}

// ─── POST /api/v1/components/:componentId/attachments ───────
// Request a presigned PUT URL for uploading an attachment.
// Requires ADMIN or OPS_MANAGER role.
componentRoutes.post('/:componentId/attachments', async (req: Request, res: Response) => {
  try {
    if (!requirePrivilegedRole(req, res)) return

    const orgId = getActingOrgId(req)
    const { componentId } = req.params
    const memberId = (req as any).member?.id as string | undefined

    const parsed = createAttachmentSchema.safeParse(req.body)
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]
      if (firstError?.path[0] === 'kind') {
        return res.status(400).json({ error: 'Invalid attachment kind' })
      }
      return res.status(400).json({ error: firstError?.message || 'Invalid request' })
    }

    const { kind, filename, contentType, sizeBytes } = parsed.data

    if (!ALLOWED_MIME_TYPES.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type. Allowed: PDF, PNG, JPEG' })
    }

    const ownership = await verifyComponentOwnership(componentId, orgId)
    if (!ownership.valid) {
      return res.status(404).json({ error: ownership.error })
    }

    if (!isS3Configured()) {
      return res.status(503).json({ error: 'File storage is not configured.' })
    }

    const existingVersions = await prisma.componentAttachment.findMany({
      where: { orgId, componentId, kind },
      select: { version: true },
      orderBy: { version: 'desc' },
      take: 1,
    })

    const nextVersion = (existingVersions[0]?.version ?? 0) + 1
    const safeFilename = sanitizeFilename(filename)
    const s3Key = `orgs/${orgId}/components/${componentId}/${kind}/v${nextVersion}/${safeFilename}`

    let uploadUrl: string
    try {
      uploadUrl = await createPresignedPutUrl(s3Key, contentType, 900)
    } catch (err) {
      console.error('[components] Failed to create presigned PUT URL:', err)
      return res.status(503).json({ error: 'File storage is not configured.' })
    }

    let attachment
    try {
      attachment = await prisma.componentAttachment.create({
        data: {
          orgId,
          componentId,
          kind,
          version: nextVersion,
          filename,
          contentType,
          sizeBytes,
          s3Key,
          uploadedById: memberId,
        },
      })
    } catch (err: any) {
      console.error('[components] Failed to create attachment row:', err)
      return res.status(500).json({ error: 'Failed to create attachment' })
    }

    res.status(201).json({
      id: attachment.id,
      kind: attachment.kind,
      kindDisplay: ATTACHMENT_KIND_DISPLAY[attachment.kind],
      version: attachment.version,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      uploadUrl,
      createdAt: attachment.createdAt.toISOString(),
    })
  } catch (error) {
    console.error('[components] POST /:componentId/attachments error:', error)
    res.status(500).json({ error: 'Failed to create attachment' })
  }
})

// ─── GET /api/v1/components/:componentId/attachments ────────
// List all attachments for a component.
componentRoutes.get('/:componentId/attachments', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { componentId } = req.params

    const ownership = await verifyComponentOwnership(componentId, orgId)
    if (!ownership.valid) {
      return res.status(404).json({ error: ownership.error })
    }

    const attachments = await prisma.componentAttachment.findMany({
      where: { orgId, componentId },
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        kind: true,
        version: true,
        filename: true,
        contentType: true,
        sizeBytes: true,
        createdAt: true,
      },
    })

    const result = attachments.map((att) => ({
      id: att.id,
      kind: att.kind,
      kindDisplay: ATTACHMENT_KIND_DISPLAY[att.kind],
      version: att.version,
      filename: att.filename,
      contentType: att.contentType,
      sizeBytes: att.sizeBytes,
      createdAt: att.createdAt.toISOString(),
    }))

    res.json(result)
  } catch (error) {
    console.error('[components] GET /:componentId/attachments error:', error)
    res.status(500).json({ error: 'Failed to fetch attachments' })
  }
})

// ─── GET /api/v1/components/:componentId/attachments/:attachmentId/download-url ─
// Get a presigned download URL for an attachment.
componentRoutes.get(
  '/:componentId/attachments/:attachmentId/download-url',
  async (req: Request, res: Response) => {
    try {
      const orgId = getActingOrgId(req)
      const { componentId, attachmentId } = req.params

      const ownership = await verifyComponentOwnership(componentId, orgId)
      if (!ownership.valid) {
        return res.status(404).json({ error: ownership.error })
      }

      const attachment = await prisma.componentAttachment.findFirst({
        where: { id: attachmentId, orgId, componentId },
      })

      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' })
      }

      if (!isS3Configured()) {
        return res.status(503).json({ error: 'File storage is not configured.' })
      }

      const exists = await headObject(attachment.s3Key)
      if (!exists) {
        return res.status(409).json({ error: 'File is not available yet. Retry the upload.' })
      }

      const downloadUrl = await createPresignedGetUrl(attachment.s3Key, 900)

      res.json({
        downloadUrl,
        filename: attachment.filename,
        contentType: attachment.contentType,
        sizeBytes: attachment.sizeBytes,
      })
    } catch (error) {
      console.error('[components] GET /:componentId/attachments/:attachmentId/download-url error:', error)
      res.status(500).json({ error: 'Failed to generate download URL' })
    }
  }
)
