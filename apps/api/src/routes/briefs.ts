import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const briefRoutes: ReturnType<typeof Router> = Router()

// ─── List all briefs ────────────────────────────────────────
briefRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const briefs = await prisma.moduleItem.findMany({
      where: { module: { type: 'BRIEFS' } },
      include: { module: true },
      orderBy: { sortOrder: 'asc' },
    })
    res.json(briefs)
  } catch (error) {
    console.error('[briefs] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch briefs' })
  }
})

// ─── Get brief by ID ───────────────────────────────────────
briefRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const brief = await prisma.moduleItem.findUnique({
      where: { id: req.params.id as string },
      include: { module: true },
    })
    if (!brief) return res.status(404).json({ error: 'Brief not found' })
    res.json(brief)
  } catch (error) {
    console.error('[briefs] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch brief' })
  }
})

// ─── Create brief ───────────────────────────────────────────
const projectContactSchema = z.object({
  name: z.string(),
  role: z.string(),
  email: z.string(),
})

const teamMemberSchema = z.object({
  name: z.string(),
  role: z.string(),
})

const supportingDocSchema = z.object({
  name: z.string(),
  url: z.string(),
  source: z.string(),
})

const briefDataSchema = z.object({
  companyName: z.string().optional(),
  dateOfRequest: z.string().optional(),
  projectName: z.string().optional(),
  brand: z.string().optional(),
  subBrand: z.string().optional(),
  contractManufacturer: z.string().optional(),
  briefStatus: z.string().optional(),
  phase: z.string().optional(),
  projectContacts: z.array(projectContactSchema).optional(),
  projectObjective: z.string().optional(),
  ingredients: z.string().optional(),
  targetAvailabilityDate: z.string().optional(),
  targetFormulaDate: z.string().optional(),
  targetStabilityDate: z.string().optional(),
  targetScaleUpDate: z.string().optional(),
  markets: z.array(z.string()).optional(),
  targetRetailPrice: z.string().optional(),
  projectedAnnualVolume: z.string().optional(),
  moq: z.string().optional(),
  targetCostPerUnit: z.string().optional(),
  productDescription: z.string().optional(),
  isCurrentLine: z.boolean().optional(),
  consumerExperience: z.string().optional(),
  feel: z.string().optional(),
  fragrance: z.string().optional(),
  appearance: z.string().optional(),
  restrictedIngredients: z.string().optional(),
  requestedIngredients: z.string().optional(),
  keyBenefits: z.string().optional(),
  copyClaims: z.string().optional(),
  clinicalClaims: z.string().optional(),
  typicalUsage: z.string().optional(),
  retailChain: z.string().optional(),
  targetDemographics: z.string().optional(),
  intendedPackage: z.string().optional(),
  intendedClosure: z.string().optional(),
  packagingMaterial: z.string().optional(),
  labelType: z.string().optional(),
  labelArtwork: z.string().optional(),
  secondaryPackage: z.string().optional(),
  kitCombos: z.string().optional(),
  packagingCostPerUnit: z.string().optional(),
  casePackout: z.string().optional(),
  benchmarkImageUrl: z.string().optional(),
  teamMembers: z.array(teamMemberSchema).optional(),
  supportingDocs: z.array(supportingDocSchema).optional(),
})

const createBriefSchema = z.object({
  moduleId: z.string().min(1),
  data: briefDataSchema,
  status: z.string().optional(),
  sortOrder: z.number().optional(),
})

briefRoutes.post('/', async (req: Request, res: Response) => {
  try {
    const parsed = createBriefSchema.parse(req.body)
    const brief = await prisma.moduleItem.create({
      data: {
        moduleId: parsed.moduleId,
        data: parsed.data,
        status: parsed.status,
        sortOrder: parsed.sortOrder || 0,
      },
      include: { module: true },
    })
    res.status(201).json(brief)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[briefs] POST / error:', error)
    res.status(500).json({ error: 'Failed to create brief' })
  }
})

// ─── Update brief ───────────────────────────────────────────
const updateBriefSchema = z.object({
  data: briefDataSchema.partial().optional(),
  status: z.string().optional(),
  sortOrder: z.number().optional(),
})

briefRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = updateBriefSchema.parse(req.body)

    // If data is provided, merge with existing data
    let updatePayload: Record<string, unknown> = {}
    if (parsed.status !== undefined) updatePayload.status = parsed.status
    if (parsed.sortOrder !== undefined) updatePayload.sortOrder = parsed.sortOrder

    if (parsed.data) {
      const existing = await prisma.moduleItem.findUnique({
        where: { id: req.params.id as string },
      })
      if (!existing) return res.status(404).json({ error: 'Brief not found' })
      const existingData = (existing.data as Record<string, unknown>) || {}
      updatePayload.data = { ...existingData, ...parsed.data }
    }

    const brief = await prisma.moduleItem.update({
      where: { id: req.params.id as string },
      data: updatePayload,
      include: { module: true },
    })
    res.json(brief)
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[briefs] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update brief' })
  }
})

// ─── Delete brief ───────────────────────────────────────────
briefRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.moduleItem.delete({
      where: { id: req.params.id as string },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[briefs] DELETE /:id error:', error)
    res.status(500).json({ error: 'Failed to delete brief' })
  }
})
