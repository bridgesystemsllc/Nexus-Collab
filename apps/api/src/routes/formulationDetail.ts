import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const formulationDetailRoutes: ReturnType<typeof Router> = Router()

// ─── List ingredients for a formulation ────────────────────
formulationDetailRoutes.get('/:formulationId/ingredients', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params

    const ingredients = await prisma.formulationIngredient.findMany({
      where: { formulationId },
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    })
    res.json(ingredients)
  } catch (error) {
    console.error('[formulation-detail] GET /:formulationId/ingredients error:', error)
    res.status(500).json({ error: 'Failed to fetch ingredients' })
  }
})

// ─── Create ingredient ─────────────────────────────────────
formulationDetailRoutes.post('/:formulationId/ingredients', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params
    const { inciName, percentage, ...rest } = req.body

    if (!inciName) return res.status(400).json({ error: 'inciName is required' })
    if (percentage === undefined || percentage === null) return res.status(400).json({ error: 'percentage is required' })

    const ingredient = await prisma.formulationIngredient.create({
      data: {
        formulationId,
        inciName,
        percentage,
        ...rest,
      },
    })
    res.status(201).json(ingredient)
  } catch (error) {
    console.error('[formulation-detail] POST ingredient error:', error)
    res.status(500).json({ error: 'Failed to create ingredient' })
  }
})

// ─── Bulk replace ingredients (transactional) ──────────────
formulationDetailRoutes.post('/:formulationId/ingredients/bulk', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params
    const { ingredients } = req.body

    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'ingredients must be an array' })
    }

    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing ingredients
      await tx.formulationIngredient.deleteMany({ where: { formulationId } })

      // Create new ones
      const created = await Promise.all(
        ingredients.map((ing: any) =>
          tx.formulationIngredient.create({
            data: {
              formulationId,
              ...ing,
            },
          })
        )
      )
      return created
    })

    res.status(201).json(result)
  } catch (error) {
    console.error('[formulation-detail] POST ingredients/bulk error:', error)
    res.status(500).json({ error: 'Failed to bulk replace ingredients' })
  }
})

// ─── Update single ingredient ──────────────────────────────
formulationDetailRoutes.patch('/ingredients/:id', async (req: Request, res: Response) => {
  try {
    const updated = await prisma.formulationIngredient.update({
      where: { id: req.params.id },
      data: req.body,
    })
    res.json(updated)
  } catch (error) {
    console.error('[formulation-detail] PATCH ingredient error:', error)
    res.status(500).json({ error: 'Failed to update ingredient' })
  }
})

// ─── Delete single ingredient ──────────────────────────────
formulationDetailRoutes.delete('/ingredients/:id', async (req: Request, res: Response) => {
  try {
    await prisma.formulationIngredient.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (error) {
    console.error('[formulation-detail] DELETE ingredient error:', error)
    res.status(500).json({ error: 'Failed to delete ingredient' })
  }
})

// ─── List procedure steps ──────────────────────────────────
formulationDetailRoutes.get('/:formulationId/procedure', async (req: Request, res: Response) => {
  try {
    const steps = await prisma.formulationProcedureStep.findMany({
      where: { formulationId: req.params.formulationId },
      orderBy: { stepNumber: 'asc' },
    })
    res.json(steps)
  } catch (error) {
    console.error('[formulation-detail] GET procedure error:', error)
    res.status(500).json({ error: 'Failed to fetch procedure steps' })
  }
})

// ─── Create procedure step ─────────────────────────────────
formulationDetailRoutes.post('/:formulationId/procedure', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params
    const { stepNumber, instruction, phaseReference, temperatureC, mixingSpeedRpm, durationMinutes } = req.body

    if (!stepNumber || !instruction) {
      return res.status(400).json({ error: 'stepNumber and instruction are required' })
    }

    const step = await prisma.formulationProcedureStep.create({
      data: {
        formulationId,
        stepNumber,
        instruction,
        phaseReference,
        temperatureC,
        mixingSpeedRpm,
        durationMinutes,
      },
    })
    res.status(201).json(step)
  } catch (error) {
    console.error('[formulation-detail] POST procedure error:', error)
    res.status(500).json({ error: 'Failed to create procedure step' })
  }
})

// ─── Update procedure step ─────────────────────────────────
formulationDetailRoutes.patch('/procedure/:id', async (req: Request, res: Response) => {
  try {
    const updated = await prisma.formulationProcedureStep.update({
      where: { id: req.params.id },
      data: req.body,
    })
    res.json(updated)
  } catch (error) {
    console.error('[formulation-detail] PATCH procedure error:', error)
    res.status(500).json({ error: 'Failed to update procedure step' })
  }
})

// ─── Delete procedure step ─────────────────────────────────
formulationDetailRoutes.delete('/procedure/:id', async (req: Request, res: Response) => {
  try {
    await prisma.formulationProcedureStep.delete({ where: { id: req.params.id } })
    res.status(204).send()
  } catch (error) {
    console.error('[formulation-detail] DELETE procedure error:', error)
    res.status(500).json({ error: 'Failed to delete procedure step' })
  }
})

// ─── Cost analysis ─────────────────────────────────────────
formulationDetailRoutes.get('/:formulationId/cost-analysis', async (req: Request, res: Response) => {
  try {
    const ingredients = await prisma.formulationIngredient.findMany({
      where: { formulationId: req.params.formulationId },
      orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    })

    // total_cost_per_kg = sum of (percentage/100 * costPerKg)
    let totalCostPerKg = 0
    const costItems: { inciName: string; phase: string; costContribution: number }[] = []
    const phaseMap: Record<string, number> = {}

    for (const ing of ingredients) {
      const cost = ing.costPerKg ? (ing.percentage / 100) * ing.costPerKg : 0
      totalCostPerKg += cost

      costItems.push({ inciName: ing.inciName, phase: ing.phase, costContribution: cost })

      if (!phaseMap[ing.phase]) phaseMap[ing.phase] = 0
      phaseMap[ing.phase] += cost
    }

    // breakdown_by_phase
    const breakdownByPhase = Object.entries(phaseMap).map(([phase, cost]) => ({ phase, cost: Math.round(cost * 10000) / 10000 }))

    // top 5 cost drivers
    costItems.sort((a, b) => b.costContribution - a.costContribution)
    const top5CostDrivers = costItems.slice(0, 5).map((item) => ({
      inciName: item.inciName,
      phase: item.phase,
      costContribution: Math.round(item.costContribution * 10000) / 10000,
    }))

    res.json({
      totalCostPerKg: Math.round(totalCostPerKg * 10000) / 10000,
      breakdownByPhase,
      top5CostDrivers,
    })
  } catch (error) {
    console.error('[formulation-detail] GET cost-analysis error:', error)
    res.status(500).json({ error: 'Failed to compute cost analysis' })
  }
})

// ─── List attachments for a formulation ────────────────────
formulationDetailRoutes.get('/:formulationId/attachments', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params

    const attachments = await prisma.attachment.findMany({
      where: {
        attachableType: 'formulation',
        attachableId: formulationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(attachments)
  } catch (error) {
    console.error('[formulation-detail] GET attachments error:', error)
    res.status(500).json({ error: 'Failed to fetch attachments' })
  }
})

// ─── Create file attachment ────────────────────────────────
const filePayloadSchema = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().optional(),
  mime_type: z.string().optional(),
  storage_url: z.string().optional(),
  onedrive_item_id: z.string().optional(),
  uploaded_via: z.string().optional().default('upload'),
})

formulationDetailRoutes.post('/:formulationId/attachments/file', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params
    const { module, createdBy, ...payloadData } = req.body
    const payload = filePayloadSchema.parse(payloadData)

    const attachment = await prisma.attachment.create({
      data: {
        attachableType: 'formulation',
        attachableId: formulationId,
        module: module || 'npd',
        type: 'file',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[formulation-detail] POST file attachment error:', error)
    res.status(500).json({ error: 'Failed to create file attachment' })
  }
})

// ─── Create comment attachment ─────────────────────────────
const commentPayloadSchema = z.object({
  body_html: z.string().optional(),
  body_plain: z.string().min(1),
  mentions: z.array(z.string()).optional().default([]),
  edited: z.boolean().optional().default(false),
  source: z.string().optional(),
})

formulationDetailRoutes.post('/:formulationId/attachments/comment', async (req: Request, res: Response) => {
  try {
    const { formulationId } = req.params
    const { module, createdBy, ...payloadData } = req.body
    const payload = commentPayloadSchema.parse(payloadData)

    const attachment = await prisma.attachment.create({
      data: {
        attachableType: 'formulation',
        attachableId: formulationId,
        module: module || 'npd',
        type: 'comment',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[formulation-detail] POST comment attachment error:', error)
    res.status(500).json({ error: 'Failed to create comment attachment' })
  }
})
