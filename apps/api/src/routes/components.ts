import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getActingOrgId } from '../middleware/billingContext'

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
