import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const brandTransitionRoutes: ReturnType<typeof Router> = Router()

// ─── Validation ─────────────────────────────────────────────
const createNoteSchema = z.object({
  noteType: z.string().min(1),
  noteText: z.string().min(1),
  createdBy: z.string().min(1),
})

const createMilestoneSchema = z.object({
  milestoneName: z.string().min(1),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
})

const updateMilestoneSchema = z.object({
  completed: z.boolean().optional(),
  completedDate: z.string().optional(),
  completedBy: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
})

// ─── Seed Data ──────────────────────────────────────────────

const TRACK1_MILESTONES = [
  'CM Identified & Qualified',
  'Outreach Sent to CM',
  'CM Capability Confirmed',
  'Agreement / Contract Sent',
  'Agreement / Contract Signed',
  'Formula Documentation Transferred',
  'Raw Material Sourcing Confirmed',
  'Trial Batch Scheduled',
  'Trial Batch Completed & Approved',
  'QC Sign-Off on Trial',
  'First Commercial Production Run',
  'Transition Complete — L\'Oreal Cutoff',
]

const TRACK2_MILESTONES = [
  'CD\u2013CM Agreement Confirmed',
  'Formula Ownership Verified',
  'Raw Materials \u2014 CD-Owned Suppliers Confirmed',
  'Continuity Production Run Scheduled',
  'Inventory Runway Confirmed (WOS review)',
]

interface SkuSeed {
  materialCode: string
  skuName: string
  track: string
  currentCm: string | null
  cmCode: string | null
  processDescription: string | null
  priority: string
  overallStatus: string
  discoDecision?: string | null
  lastLorealBatches?: number | null
}

const SEED_SKUS: SkuSeed[] = [
  // ─── Track 1: loreal_coman (20 SKUs) ───
  { materialCode: 'K2674205', skuName: 'Coco Creme Shampoo 12 floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K2674305', skuName: 'Coco Creme Conditioner 12 floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K3386108', skuName: 'Blk Vanilla Cond Accessible 8.5oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K3692911', skuName: 'Goddess Strength Conditioner 11oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K3905223', skuName: 'Black Vanilla Hydrating Cond 12floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K3905507', skuName: 'Black Vanilla Replenish Shmp 12floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K4415110', skuName: 'Goddess Strength Shampoo 11oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K5356706', skuName: 'Goddess Strgth Shp 8.5floz Accessbl', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5405603', skuName: 'INTL BV Hydrating Cond 12floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5405800', skuName: 'INTL COCO CREME COND 12oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5405900', skuName: 'INTL COCO CREME SHAMPOO 12oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5406001', skuName: 'INTL Goddess Strength INT TRMT 11oz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5454506', skuName: 'Goddess Strength Dp Cond 8.5floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Medium', overallStatus: 'Not Started' },
  { materialCode: 'K5517706', skuName: 'Born to Repair Born to Repair Shamp', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Low', overallStatus: 'Not Started' },
  { materialCode: 'K5517805', skuName: 'CD Born to Repair Cond 11floz', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Low', overallStatus: 'Not Started' },
  { materialCode: 'K6423100', skuName: 'CD Goddess Strength Con and Sh Samp', track: 'loreal_coman', currentCm: 'Unette', cmCode: 'CM_UNETTE-CPD-PKT', processDescription: 'Batch IH @ FLO / Fill & Packout @ Unette', priority: 'Low', overallStatus: 'Not Started' },
  { materialCode: 'K3692709', skuName: 'CD Goddess Strength LIN Cream 10oz', track: 'loreal_coman', currentCm: 'BASQ', cmCode: null, processDescription: 'Batch & Fill IH @ MTL / Packout @ BASQ', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K5406701', skuName: 'INTL CD GODDESS STRENGTH LIC 10oz', track: 'loreal_coman', currentCm: 'BASQ', cmCode: null, processDescription: 'Batch & Fill IH @ MTL / Packout @ BASQ', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K3692804', skuName: 'Goddess Strength Hair & Scalp Oil 4oz', track: 'loreal_coman', currentCm: 'Kolmar', cmCode: null, processDescription: 'Batch IH @ MTL / Fill & Packout @ Kolmar', priority: 'High', overallStatus: 'Not Started' },
  { materialCode: 'K5410302', skuName: 'INTL GODDESS STRENGTH Scalp Oil 4oz', track: 'loreal_coman', currentCm: 'Kolmar', cmCode: null, processDescription: 'Batch IH @ MTL / Fill & Packout @ Kolmar', priority: 'High', overallStatus: 'Not Started' },

  // ─── Track 2: full_buy (5 SKUs) ───
  { materialCode: 'K3906002', skuName: 'Hair Milk Orig LI Moisturizer 8floz', track: 'full_buy', currentCm: 'Voyant California', cmCode: null, processDescription: 'Batch Fill & Packout @ Voyant', priority: 'Medium', overallStatus: 'Active' },
  { materialCode: 'K3906111', skuName: 'Hair Milk Refresher Spray 10 fl oz', track: 'full_buy', currentCm: 'Voyant California', cmCode: null, processDescription: 'Batch Fill & Packout @ Voyant', priority: 'Medium', overallStatus: 'Active' },
  { materialCode: 'K4415000', skuName: 'Wash Day Delight Shampoo 16oz', track: 'full_buy', currentCm: 'BMSC', cmCode: null, processDescription: 'Batch Fill & Packout @ BMSC', priority: 'Medium', overallStatus: 'Active' },
  { materialCode: 'K6250400', skuName: 'GS Hair Regrowth Treatment', track: 'full_buy', currentCm: 'Perrigo', cmCode: null, processDescription: 'Batch Fill & Packout @ Perrigo', priority: 'Medium', overallStatus: 'Active' },
  { materialCode: 'K5410200', skuName: 'INTL WDD WATER-TO-FOAM SH 16OZ', track: 'full_buy', currentCm: 'BMSC', cmCode: null, processDescription: 'Batch Fill & Packout @ BMSC', priority: 'Low', overallStatus: 'Active' },

  // ─── Track 3: disco_decision (2 SKUs) ───
  { materialCode: 'K3907212', skuName: 'Mimosa Hair Honey Shine Pomade 8 oz', track: 'disco_decision', currentCm: null, cmCode: null, processDescription: null, priority: 'High', overallStatus: 'Decision Required', discoDecision: 'Pending', lastLorealBatches: 0 },
  { materialCode: 'K5891000', skuName: 'CD Goddess Strength Smooth and Shape Balm', track: 'disco_decision', currentCm: null, cmCode: null, processDescription: null, priority: 'High', overallStatus: 'Decision Required', discoDecision: 'Pending', lastLorealBatches: 2 },
]

// ─── List TransitionSkus ────────────────────────────────────
brandTransitionRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    const { track, status, priority, cm, search } = req.query as Record<string, string>

    const where: any = { orgId: org.id }
    if (track) where.track = track
    if (status) where.overallStatus = status
    if (priority) where.priority = priority
    if (cm) where.currentCm = cm
    if (search) {
      where.OR = [
        { skuName: { contains: search, mode: 'insensitive' } },
        { materialCode: { contains: search, mode: 'insensitive' } },
        { currentCm: { contains: search, mode: 'insensitive' } },
      ]
    }

    const skus = await prisma.transitionSku.findMany({
      where,
      include: {
        transitionNotes: { orderBy: { createdAt: 'desc' }, take: 3 },
        milestones: { orderBy: { sortOrder: 'asc' } },
        cmCandidates: true,
      },
      orderBy: [{ priority: 'asc' }, { materialCode: 'asc' }],
    })
    res.json(skus)
  } catch (error) {
    console.error('[brandTransition] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch transition SKUs' })
  }
})

// ─── Get single SKU ─────────────────────────────────────────
brandTransitionRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const sku = await prisma.transitionSku.findUnique({
      where: { id: req.params.id as string },
      include: {
        transitionNotes: { orderBy: { createdAt: 'desc' } },
        milestones: { orderBy: { sortOrder: 'asc' } },
        cmCandidates: true,
      },
    })
    if (!sku) return res.status(404).json({ error: 'TransitionSku not found' })
    res.json(sku)
  } catch (error) {
    console.error('[brandTransition] GET /:id error:', error)
    res.status(500).json({ error: 'Failed to fetch transition SKU' })
  }
})

// ─── Update SKU ─────────────────────────────────────────────
brandTransitionRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    const sku = await prisma.transitionSku.update({
      where: { id: req.params.id as string },
      data: req.body,
    })
    res.json(sku)
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'TransitionSku not found' })
    console.error('[brandTransition] PATCH /:id error:', error)
    res.status(500).json({ error: 'Failed to update transition SKU' })
  }
})

// ─── Create note ────────────────────────────────────────────
brandTransitionRoutes.post('/:id/notes', async (req: Request, res: Response) => {
  try {
    const data = createNoteSchema.parse(req.body)
    const sku = await prisma.transitionSku.findUnique({ where: { id: req.params.id as string } })
    if (!sku) return res.status(404).json({ error: 'TransitionSku not found' })

    const note = await prisma.transitionNote.create({
      data: {
        transitionSkuId: sku.id,
        noteType: data.noteType,
        noteText: data.noteText,
        createdBy: data.createdBy,
      },
    })
    res.status(201).json(note)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[brandTransition] POST /:id/notes error:', error)
    res.status(500).json({ error: 'Failed to create note' })
  }
})

// ─── List notes for SKU ─────────────────────────────────────
brandTransitionRoutes.get('/:id/notes', async (req: Request, res: Response) => {
  try {
    const sku = await prisma.transitionSku.findUnique({ where: { id: req.params.id as string } })
    if (!sku) return res.status(404).json({ error: 'TransitionSku not found' })

    const notes = await prisma.transitionNote.findMany({
      where: { transitionSkuId: sku.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json(notes)
  } catch (error) {
    console.error('[brandTransition] GET /:id/notes error:', error)
    res.status(500).json({ error: 'Failed to fetch notes' })
  }
})

// ─── Create milestone ───────────────────────────────────────
brandTransitionRoutes.post('/:id/milestones', async (req: Request, res: Response) => {
  try {
    const data = createMilestoneSchema.parse(req.body)
    const sku = await prisma.transitionSku.findUnique({ where: { id: req.params.id as string } })
    if (!sku) return res.status(404).json({ error: 'TransitionSku not found' })

    // Get next sort order
    const lastMilestone = await prisma.transitionMilestone.findFirst({
      where: { transitionSkuId: sku.id },
      orderBy: { sortOrder: 'desc' },
    })
    const sortOrder = (lastMilestone?.sortOrder ?? 0) + 1

    const milestone = await prisma.transitionMilestone.create({
      data: {
        transitionSkuId: sku.id,
        milestoneName: data.milestoneName,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes ?? null,
        sortOrder,
      },
    })
    res.status(201).json(milestone)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[brandTransition] POST /:id/milestones error:', error)
    res.status(500).json({ error: 'Failed to create milestone' })
  }
})

// ─── Update milestone ───────────────────────────────────────
brandTransitionRoutes.patch('/milestones/:milestoneId', async (req: Request, res: Response) => {
  try {
    const data = updateMilestoneSchema.parse(req.body)
    const updateData: any = { ...data }
    if (data.completedDate) updateData.completedDate = new Date(data.completedDate)
    if (data.dueDate) updateData.dueDate = new Date(data.dueDate)

    const milestone = await prisma.transitionMilestone.update({
      where: { id: req.params.milestoneId as string },
      data: updateData,
    })
    res.json(milestone)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    if (error?.code === 'P2025') return res.status(404).json({ error: 'Milestone not found' })
    console.error('[brandTransition] PATCH /milestones/:milestoneId error:', error)
    res.status(500).json({ error: 'Failed to update milestone' })
  }
})

// ─── Create CM candidate ────────────────────────────────────
brandTransitionRoutes.post('/:id/cm-candidates', async (req: Request, res: Response) => {
  try {
    const sku = await prisma.transitionSku.findUnique({ where: { id: req.params.id as string } })
    if (!sku) return res.status(404).json({ error: 'TransitionSku not found' })

    const candidate = await prisma.cmCandidate.create({
      data: {
        transitionSkuId: sku.id,
        ...req.body,
      },
    })
    res.status(201).json(candidate)
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'TransitionSku not found' })
    console.error('[brandTransition] POST /:id/cm-candidates error:', error)
    res.status(500).json({ error: 'Failed to create CM candidate' })
  }
})

// ─── Update CM candidate ────────────────────────────────────
brandTransitionRoutes.patch('/cm-candidates/:candidateId', async (req: Request, res: Response) => {
  try {
    const candidate = await prisma.cmCandidate.update({
      where: { id: req.params.candidateId as string },
      data: req.body,
    })
    res.json(candidate)
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ error: 'CM candidate not found' })
    console.error('[brandTransition] PATCH /cm-candidates/:candidateId error:', error)
    res.status(500).json({ error: 'Failed to update CM candidate' })
  }
})

// ─── Seed all 28 SKUs + default milestones ──────────────────
brandTransitionRoutes.post('/seed', async (_req: Request, res: Response) => {
  try {
    const org = await prisma.organization.findFirst()
    if (!org) return res.status(400).json({ error: 'No organization found' })

    let created = 0
    let skipped = 0

    for (const seed of SEED_SKUS) {
      // Check if already seeded
      const existing = await prisma.transitionSku.findFirst({
        where: { materialCode: seed.materialCode, orgId: org.id },
      })
      if (existing) {
        skipped++
        continue
      }

      const sku = await prisma.transitionSku.create({
        data: {
          orgId: org.id,
          materialCode: seed.materialCode,
          skuName: seed.skuName,
          track: seed.track,
          currentCm: seed.currentCm,
          cmCode: seed.cmCode,
          processDescription: seed.processDescription,
          priority: seed.priority,
          overallStatus: seed.overallStatus,
          discoDecision: seed.discoDecision ?? null,
          lastLorealBatches: seed.lastLorealBatches ?? null,
        },
      })

      // Create default milestones based on track
      let milestoneNames: string[] = []
      if (seed.track === 'loreal_coman') milestoneNames = TRACK1_MILESTONES
      else if (seed.track === 'full_buy') milestoneNames = TRACK2_MILESTONES
      // Track 3 (disco_decision) gets no default milestones

      if (milestoneNames.length > 0) {
        await prisma.transitionMilestone.createMany({
          data: milestoneNames.map((name, idx) => ({
            transitionSkuId: sku.id,
            milestoneName: name,
            sortOrder: idx + 1,
            completed: false,
          })),
        })
      }

      created++
    }

    res.json({ created, skipped, total: SEED_SKUS.length })
  } catch (error) {
    console.error('[brandTransition] POST /seed error:', error)
    res.status(500).json({ error: 'Failed to seed transition SKUs' })
  }
})
