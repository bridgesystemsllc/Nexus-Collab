import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { getActingOrgId } from '../middleware/billingContext'
import { allocatePartNumber } from '../services/partNumbers/numbering'

export const partNumberRoutes: ReturnType<typeof Router> = Router()

// ─── Request Schemas ────────────────────────────────────────
const createPartNumberSchema = z.object({
  partsNumber: z.number().int().positive().optional(),
  brand: z.string().optional(),
  itemDescription: z.string().optional(),
  itemNumber: z.string().optional(),
  itemType: z.string().optional(),
})

const updatePartNumberSchema = z.object({
  brand: z.string().optional(),
  itemDescription: z.string().optional(),
  itemNumber: z.string().optional(),
  itemType: z.string().optional(),
})

const linkComponentSchema = z.object({
  componentId: z.string().optional(),
  create: z.boolean().optional(),
})

const importRowSchema = z.object({
  Brand: z.string().optional(),
  'Item Description': z.string().optional(),
  'Item Number': z.string().optional(),
  'Item Type': z.string().optional(),
  'Parts Number': z.union([z.string(), z.number()]).optional(),
})

const importSchema = z.object({
  rows: z.array(importRowSchema).min(1),
})

// ─── Helper: get COMPONENTS module for org ──────────────────
async function getComponentsModuleId(orgId: string): Promise<string | null> {
  const opsDept = await prisma.department.findFirst({
    where: { orgId, type: 'BUILTIN_OPS', archived: false },
    select: { id: true },
  })
  if (!opsDept) return null

  const module = await prisma.departmentModule.findFirst({
    where: { departmentId: opsDept.id, type: 'COMPONENTS' },
    select: { id: true },
  })
  return module?.id ?? null
}

// ─── GET /api/v1/ops/part-numbers ───────────────────────────
partNumberRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)

    const partNumbers = await prisma.partNumber.findMany({
      where: { orgId },
      orderBy: { partsNumber: 'asc' },
    })

    res.json(partNumbers)
  } catch (error) {
    console.error('[partNumbers] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch part numbers' })
  }
})

// ─── POST /api/v1/ops/part-numbers ──────────────────────────
partNumberRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const memberId = (req as any).member?.id as string | undefined

    const parsed = createPartNumberSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { partsNumber, brand, itemDescription, itemNumber, itemType } = parsed.data

    const result = await prisma.$transaction(async (tx) => {
      const finalPartsNumber = partsNumber ?? (await allocatePartNumber(tx, orgId))

      if (partsNumber) {
        const existing = await tx.partNumber.findUnique({
          where: { orgId_partsNumber: { orgId, partsNumber } },
        })
        if (existing) {
          throw { code: 'DUPLICATE', message: 'Part number already exists' }
        }
      }

      return tx.partNumber.create({
        data: {
          orgId,
          partsNumber: finalPartsNumber,
          brand,
          itemDescription,
          itemNumber,
          itemType,
          createdById: memberId,
        },
      })
    })

    res.status(201).json(result)
  } catch (error: any) {
    if (error?.code === 'DUPLICATE') {
      return res.status(409).json({ error: error.message })
    }
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'Part number already exists' })
    }
    console.error('[partNumbers] POST / error:', error)
    res.status(500).json({ error: 'Failed to create part number' })
  }
})

// ─── PATCH /api/v1/ops/part-numbers/:id ─────────────────────
partNumberRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { id } = req.params

    const parsed = updatePartNumberSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const existing = await prisma.partNumber.findFirst({
      where: { id, orgId },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Part number not found' })
    }

    const updated = await prisma.partNumber.update({
      where: { id },
      data: parsed.data,
    })

    res.json(updated)
  } catch (error) {
    console.error('[partNumbers] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update part number' })
  }
})

// ─── POST /api/v1/ops/part-numbers/:id/link-component ───────
partNumberRoutes.post('/:id/link-component', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const { id } = req.params
    const memberId = (req as any).member?.id as string | undefined

    const parsed = linkComponentSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { componentId, create } = parsed.data

    const partNumber = await prisma.partNumber.findFirst({
      where: { id, orgId },
    })
    if (!partNumber) {
      return res.status(404).json({ error: 'Part number not found' })
    }

    if (componentId) {
      const component = await prisma.moduleItem.findUnique({
        where: { id: componentId },
        include: { module: { include: { department: true } } },
      })
      if (!component || component.module.type !== 'COMPONENTS' || component.module.department.orgId !== orgId) {
        return res.status(404).json({ error: 'Component not found' })
      }

      const updated = await prisma.partNumber.update({
        where: { id },
        data: { componentId },
      })

      return res.json(updated)
    }

    if (create) {
      const moduleId = await getComponentsModuleId(orgId)
      if (!moduleId) {
        return res.status(400).json({ error: 'No Components module found for this organization' })
      }

      const result = await prisma.$transaction(async (tx) => {
        const newComponent = await tx.moduleItem.create({
          data: {
            moduleId,
            status: 'Active',
            data: {
              name: partNumber.itemDescription || `Part ${partNumber.partsNumber}`,
              partNumber: String(partNumber.partsNumber),
              brands: partNumber.brand ? [partNumber.brand] : [],
              type: partNumber.itemType || 'other',
              status: 'Active',
              vendors: [],
              moqTiers: [],
            },
          },
        })

        const updated = await tx.partNumber.update({
          where: { id },
          data: { componentId: newComponent.id },
        })

        return { partNumber: updated, component: newComponent }
      })

      return res.status(201).json(result)
    }

    return res.status(400).json({ error: 'Either componentId or create:true is required' })
  } catch (error) {
    console.error('[partNumbers] POST /:id/link-component error:', error)
    res.status(500).json({ error: 'Failed to link component' })
  }
})

// ─── POST /api/v1/ops/part-numbers/import ───────────────────
partNumberRoutes.post('/import', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const memberId = (req as any).member?.id as string | undefined

    const parsed = importSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid request' })
    }

    const { rows } = parsed.data
    const results: { created: number; updated: number; errors: string[] } = {
      created: 0,
      updated: 0,
      errors: [],
    }

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 1

        try {
          const brand = row.Brand?.trim() || undefined
          const itemDescription = row['Item Description']?.trim() || undefined
          const itemNumber = row['Item Number']?.trim() || undefined
          const itemType = row['Item Type']?.trim() || undefined
          const rawPartsNumber = row['Parts Number']

          let partsNumber: number | undefined
          if (rawPartsNumber !== undefined && rawPartsNumber !== null && rawPartsNumber !== '') {
            const parsed = typeof rawPartsNumber === 'number' ? rawPartsNumber : parseInt(String(rawPartsNumber), 10)
            if (isNaN(parsed) || parsed <= 0) {
              results.errors.push(`Row ${rowNum}: Invalid parts number`)
              continue
            }
            partsNumber = parsed
          }

          if (partsNumber) {
            const existing = await tx.partNumber.findUnique({
              where: { orgId_partsNumber: { orgId, partsNumber } },
            })
            if (existing) {
              await tx.partNumber.update({
                where: { id: existing.id },
                data: { brand, itemDescription, itemNumber, itemType },
              })
              results.updated++
            } else {
              await tx.partNumber.create({
                data: {
                  orgId,
                  partsNumber,
                  brand,
                  itemDescription,
                  itemNumber,
                  itemType,
                  createdById: memberId,
                },
              })
              results.created++
            }
          } else {
            const allocatedNumber = await allocatePartNumber(tx, orgId)
            await tx.partNumber.create({
              data: {
                orgId,
                partsNumber: allocatedNumber,
                brand,
                itemDescription,
                itemNumber,
                itemType,
                createdById: memberId,
              },
            })
            results.created++
          }
        } catch (rowErr: any) {
          results.errors.push(`Row ${rowNum}: ${rowErr?.message || 'Unknown error'}`)
        }
      }
    })

    res.json(results)
  } catch (error) {
    console.error('[partNumbers] POST /import error:', error)
    res.status(500).json({ error: 'Failed to import part numbers' })
  }
})
