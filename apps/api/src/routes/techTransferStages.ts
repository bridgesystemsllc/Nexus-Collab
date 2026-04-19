import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const techTransferStageRoutes: ReturnType<typeof Router> = Router()

// ─── Stage templates by transfer type ──────────────────────
const STAGE_TEMPLATES: Record<string, string[]> = {
  formula_transfer: [
    'Brief Submitted', 'Planning', 'Document Transfer', 'Pilot Batch',
    'Pilot Review', 'Scale-up', 'Validation', 'Complete',
  ],
  packaging_transfer: [
    'Brief Submitted', 'Component Sourcing', 'Pilot Run', 'QC Review', 'Complete',
  ],
  full_transfer: [
    'Brief Submitted', 'Planning', 'Doc Transfer', 'RM Sourcing', 'Pilot Batch',
    'Scale-up', 'Regulatory Review', 'First Production', 'Validation', 'Complete',
  ],
  reformulation: [
    'Brief Submitted', 'Benchmark', 'Formula Development', 'Stability',
    'Pilot Batch', 'Scale-up', 'Validation', 'Complete',
  ],
}

// ─── List stages for a tech transfer ───────────────────────
techTransferStageRoutes.get('/:transferId/stages', async (req: Request, res: Response) => {
  try {
    const { transferId } = req.params

    const stages = await prisma.techTransferStage.findMany({
      where: { techTransferId: transferId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { stageOrder: 'asc' },
    })
    res.json(stages)
  } catch (error) {
    console.error('[tech-transfer-stages] GET /:transferId/stages error:', error)
    res.status(500).json({ error: 'Failed to fetch stages' })
  }
})

// ─── Seed default stages ───────────────────────────────────
techTransferStageRoutes.post('/:transferId/stages/seed', async (req: Request, res: Response) => {
  try {
    const { transferId } = req.params
    const { transferType } = req.body

    const template = STAGE_TEMPLATES[transferType]
    if (!template) {
      return res.status(400).json({ error: `Unknown transfer type: ${transferType}` })
    }

    // Check if stages already exist
    const existing = await prisma.techTransferStage.count({
      where: { techTransferId: transferId },
    })
    if (existing > 0) {
      return res.status(409).json({ error: 'Stages already exist for this transfer' })
    }

    const stages = await prisma.$transaction(
      template.map((name, idx) =>
        prisma.techTransferStage.create({
          data: {
            techTransferId: transferId,
            stageOrder: idx + 1,
            stageName: name,
            status: idx === 0 ? 'in_progress' : 'pending',
            startedAt: idx === 0 ? new Date() : undefined,
          },
        })
      )
    )

    res.status(201).json(stages)
  } catch (error) {
    console.error('[tech-transfer-stages] POST /:transferId/stages/seed error:', error)
    res.status(500).json({ error: 'Failed to seed stages' })
  }
})

// ─── Update a stage ────────────────────────────────────────
techTransferStageRoutes.patch('/:transferId/stages/:stageId', async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params
    const { status, assigneeUserId, notes } = req.body

    const data: any = {}
    if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId
    if (notes !== undefined) data.notes = notes

    if (status) {
      data.status = status
      if (status === 'complete') data.completedAt = new Date()
      if (status === 'in_progress') data.startedAt = new Date()
    }

    const updated = await prisma.techTransferStage.update({
      where: { id: stageId },
      data,
    })
    res.json(updated)
  } catch (error) {
    console.error('[tech-transfer-stages] PATCH stage error:', error)
    res.status(500).json({ error: 'Failed to update stage' })
  }
})

// ─── Advance to next stage ─────────────────────────────────
techTransferStageRoutes.post('/:transferId/stages/:stageId/advance', async (req: Request, res: Response) => {
  try {
    const { transferId, stageId } = req.params

    // Complete current stage
    const current = await prisma.techTransferStage.update({
      where: { id: stageId },
      data: { status: 'complete', completedAt: new Date() },
    })

    // Find next stage by stageOrder
    const nextStage = await prisma.techTransferStage.findFirst({
      where: {
        techTransferId: transferId,
        stageOrder: { gt: current.stageOrder },
      },
      orderBy: { stageOrder: 'asc' },
    })

    if (nextStage) {
      await prisma.techTransferStage.update({
        where: { id: nextStage.id },
        data: { status: 'in_progress', startedAt: new Date() },
      })
    }

    // Compute progress
    const allStages = await prisma.techTransferStage.findMany({
      where: { techTransferId: transferId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { stageOrder: 'asc' },
    })

    const completedCount = allStages.filter((s) => s.status === 'complete').length
    const progressPct = Math.round((completedCount / allStages.length) * 100)

    res.json({ stages: allStages, progressPct })
  } catch (error) {
    console.error('[tech-transfer-stages] POST advance error:', error)
    res.status(500).json({ error: 'Failed to advance stage' })
  }
})

// ─── Create a stage task ───────────────────────────────────
techTransferStageRoutes.post('/:transferId/stages/:stageId/tasks', async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params
    const { taskName, description, assigneeUserId, dueDate, sortOrder } = req.body

    if (!taskName) {
      return res.status(400).json({ error: 'taskName is required' })
    }

    const task = await prisma.techTransferStageTask.create({
      data: {
        stageId,
        taskName,
        description,
        assigneeUserId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        sortOrder: sortOrder ?? 0,
      },
    })
    res.status(201).json(task)
  } catch (error) {
    console.error('[tech-transfer-stages] POST stage task error:', error)
    res.status(500).json({ error: 'Failed to create stage task' })
  }
})

// ─── Update a stage task ───────────────────────────────────
techTransferStageRoutes.patch('/stage-tasks/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { taskName, status, assigneeUserId, dueDate, notes } = req.body

    const data: any = {}
    if (taskName !== undefined) data.taskName = taskName
    if (status !== undefined) data.status = status
    if (assigneeUserId !== undefined) data.assigneeUserId = assigneeUserId
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
    if (notes !== undefined) data.notes = notes

    const updated = await prisma.techTransferStageTask.update({
      where: { id: taskId },
      data,
    })
    res.json(updated)
  } catch (error) {
    console.error('[tech-transfer-stages] PATCH stage-task error:', error)
    res.status(500).json({ error: 'Failed to update stage task' })
  }
})

// ─── Delete a stage task ───────────────────────────────────
techTransferStageRoutes.delete('/stage-tasks/:taskId', async (req: Request, res: Response) => {
  try {
    await prisma.techTransferStageTask.delete({
      where: { id: req.params.taskId },
    })
    res.status(204).send()
  } catch (error) {
    console.error('[tech-transfer-stages] DELETE stage-task error:', error)
    res.status(500).json({ error: 'Failed to delete stage task' })
  }
})
