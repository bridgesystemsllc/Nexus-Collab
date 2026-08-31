import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { decryptJson } from '../lib/encryption'
import { isAuthenticated } from '../auth/session'
import { getActingOrgId } from '../middleware/billingContext'

export const productRoutes: ReturnType<typeof Router> = Router()

// Every product read/write is scoped to the caller's org (see getActingOrgId
// below), which requires a signed-in member. This router was previously
// reachable with no session at all — that was the bug, not a feature.
productRoutes.use(isAuthenticated)

// ─── Validation ─────────────────────────────────────────────
const createProductSchema = z.object({
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  sku: z.string().optional(),
  upc: z.string().optional(),
  description: z.string().optional(),
  retailPrice: z.string().optional(),
  cogs: z.string().optional(),
  status: z.string().default('ACTIVE'),
  imageUrl: z.string().optional(),
  weight: z.string().optional(),
  dimensions: z.string().optional(),
  ingredients: z.string().optional(),
  manufacturer: z.string().optional(),
  variants: z.any().optional(),
})

// ─── List products ──────────────────────────────────────────
productRoutes.get('/', async (req: Request, res: Response) => {
  try {
    // The router requires a session (see productRoutes.use(isAuthenticated)
    // above), so the acting member's org is always available here.
    const orgId = getActingOrgId(req)

    const { search, brand, status, category } = req.query as Record<string, string>

    const where: any = { orgId }
    if (brand) where.brand = brand
    if (status) where.status = status
    if (category) where.category = category
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
      ]
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    })
    res.json(products)
  } catch (error) {
    console.error('[products] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch products' })
  }
})

// ─── Get single product ─────────────────────────────────────
productRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    // findFirst (not findUnique) so a real id belonging to another org comes
    // back as "no match" — the same 404 a genuinely missing id gets, rather
    // than a 403 that confirms the id exists elsewhere.
    const product = await prisma.product.findFirst({ where: { id: req.params.id as string, orgId } })
    if (!product) return res.status(404).json({ error: 'Product not found' })
    res.json(product)
  } catch (error) {
    console.error('[products] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch product' })
  }
})

// ─── Create product ─────────────────────────────────────────
productRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const data = createProductSchema.parse(req.body)
    const orgId = getActingOrgId(req)

    const product = await prisma.product.create({
      data: { ...data, orgId },
    })
    res.status(201).json(product)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' })
    console.error('[products] POST / error:', error)
    res.status(500).json({ error: 'Failed to create product' })
  }
})

// ─── Update product ─────────────────────────────────────────
productRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    // `update({where:{id}})` would happily write a row in another org if the
    // id merely exists. Verify ownership first, then update by id — and
    // never let the body's own `orgId` (if any) move the row to another org.
    const { orgId: _ignoredOrgId, ...data } = req.body ?? {}
    const existing = await prisma.product.findFirst({ where: { id: req.params.id as string, orgId } })
    if (!existing) return res.status(404).json({ error: 'Product not found' })

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
    })
    res.json(product)
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Product not found' })
    if (error?.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' })
    console.error('[products] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update product' })
  }
})

// ─── Delete product ─────────────────────────────────────────
productRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    // deleteMany + a count check rather than delete-by-id: the where clause
    // carries orgId, so a member can never delete a row that isn't theirs by
    // guessing its id, and a mismatch reads as the same 404 as a missing row.
    const result = await prisma.product.deleteMany({ where: { id: req.params.id as string, orgId } })
    if (result.count === 0) return res.status(404).json({ error: 'Product not found' })
    res.status(204).send()
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Product not found' })
    console.error('[products] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

// ─── Sync from KarEve ───────────────────────────────────────
productRoutes.post('/sync-kareve', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)

    // Unscoped, this would pick up ANY org's connected integration — including
    // its decrypted API key — and pull that org's catalogue into the caller's.
    const integration = await prisma.integration.findFirst({
      where: { type: 'ERP_KAREVE_SYNC', status: 'CONNECTED', orgId },
    })
    if (!integration) {
      return res.status(400).json({ error: 'KarEve integration not connected. Configure it in Integrations settings.' })
    }

    // Decrypt config to get API credentials
    let config: { apiUrl: string; apiKey: string }
    try {
      config = decryptJson(integration.config as any)
    } catch {
      return res.status(500).json({ error: 'Failed to decrypt KarEve credentials' })
    }

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: { integrationId: integration.id, status: 'RUNNING' },
    })

    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'SYNCING' },
    })

    // Fetch products from KarEve API
    let kareveProducts: any[]
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(`${config.apiUrl}/products`, {
        headers: {
          'X-API-Key': config.apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw new Error(`KarEve API returned ${response.status}`)
      }

      // `response.json()` is `unknown` — the shape is whatever KarEve sent, and
      // this endpoint has always coped with three of them.
      const data = await response.json() as unknown
      kareveProducts = Array.isArray(data)
        ? data
        : (data as { products?: unknown[]; data?: unknown[] })?.products
          ?? (data as { products?: unknown[]; data?: unknown[] })?.data
          ?? []
    } catch (fetchError: any) {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'ERROR', completedAt: new Date(), errors: { message: fetchError.message } },
      })
      await prisma.integration.update({
        where: { id: integration.id },
        data: { status: 'CONNECTED' },
      })
      return res.status(502).json({ error: `Failed to fetch from KarEve: ${fetchError.message}` })
    }

    // Upsert products
    let created = 0
    let updated = 0
    let unchanged = 0

    for (const kp of kareveProducts) {
      const productData = {
        name: kp.name || 'Unnamed Product',
        brand: kp.brand || '',
        category: kp.category || '',
        sku: kp.sku || null,
        upc: kp.upc || null,
        description: kp.description || null,
        retailPrice: kp.price || kp.retailPrice || null,
        cogs: kp.cost || kp.cogs || null,
        status: (kp.status || 'active').toUpperCase() === 'ACTIVE' ? 'ACTIVE'
          : (kp.status || '').toUpperCase() === 'DISCONTINUED' ? 'DISCONTINUED'
          : 'IN_DEVELOPMENT',
        imageUrl: kp.image_url || kp.imageUrl || null,
        weight: kp.weight || null,
        dimensions: kp.dimensions || null,
        ingredients: kp.ingredients || null,
        manufacturer: kp.manufacturer || null,
        variants: kp.variants || null,
        orgId,
      }

      const kareveId = String(kp.id)
      // `kareveId` is `@unique` GLOBALLY, not per-org (a schema gap — see
      // @@unique([orgId, kareveId]) tracked for PR A2). Scoping the lookup by
      // orgId stops the update below from reassigning another org's row to
      // this one; it does not by itself stop two orgs' catalogues from
      // colliding on the same kareveId, which is what the migration fixes.
      const existing = await prisma.product.findFirst({ where: { kareveId, orgId } })

      if (existing) {
        const changed = Object.entries(productData).some(
          ([key, val]) => key !== 'orgId' && (existing as any)[key] !== val
        )
        if (changed) {
          // Update by row id, not by the globally-unique kareveId, now that
          // the lookup above has proven this row is the caller's.
          await prisma.product.update({ where: { id: existing.id }, data: productData })
          updated++
        } else {
          unchanged++
        }
      } else {
        try {
          await prisma.product.create({ data: { ...productData, kareveId } })
          created++
        } catch (createError: any) {
          // Global uniqueness means this kareveId may already belong to a
          // different org (see the schema note above). Until that's a
          // per-org constraint, treat the collision as "not ours to create"
          // rather than letting one bad SKU 500 the whole sync.
          if (createError?.code === 'P2002') {
            unchanged++
          } else {
            throw createError
          }
        }
      }
    }

    // Complete sync
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'COMPLETE',
        completedAt: new Date(),
        recordsProcessed: created + updated + unchanged,
      },
    })
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'CONNECTED', lastSyncAt: new Date(), syncCount: { increment: 1 } },
    })

    res.json({ created, updated, unchanged, total: kareveProducts.length })
  } catch (error) {
    console.error('[products] POST /sync-kareve error:', error)
    res.status(500).json({ error: 'Failed to sync from KarEve' })
  }
})
