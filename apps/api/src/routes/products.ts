import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { decryptJson } from '../lib/encryption'

export const productRoutes: ReturnType<typeof Router> = Router()

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
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const { search, brand, status, category } = req.query as Record<string, string>

    const where: any = { orgId: org.id }
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
    const product = await prisma.product.findUnique({ where: { id: req.params.id as string } })
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
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const product = await prisma.product.create({
      data: { ...data, orgId: org.id },
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
    const product = await prisma.product.update({
      where: { id: req.params.id as string },
      data: req.body,
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
    await prisma.product.delete({ where: { id: req.params.id as string } })
    res.status(204).send()
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Product not found' })
    console.error('[products] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete product' })
  }
})

// ─── Sync from KarEve ───────────────────────────────────────
productRoutes.post('/sync-kareve', async (_req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const integration = await prisma.integration.findFirst({
      where: { type: 'ERP_KAREVE_SYNC', status: 'CONNECTED' },
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

      const data = await response.json()
      kareveProducts = Array.isArray(data) ? data : data.products || data.data || []
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
        orgId: org.id,
      }

      const kareveId = String(kp.id)
      const existing = await prisma.product.findUnique({ where: { kareveId } })

      if (existing) {
        const changed = Object.entries(productData).some(
          ([key, val]) => key !== 'orgId' && (existing as any)[key] !== val
        )
        if (changed) {
          await prisma.product.update({ where: { kareveId }, data: productData })
          updated++
        } else {
          unchanged++
        }
      } else {
        await prisma.product.create({ data: { ...productData, kareveId } })
        created++
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
