import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const pulseRoutes: ReturnType<typeof Router> = Router()

// ─── List pulse notifications ───────────────────────────────
pulseRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { type, page = '1', limit = '20' } = req.query
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string)

    const where: any = {}
    if (type) where.type = type

    const [pulses, total, unread] = await Promise.all([
      prisma.pulse.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.pulse.count({ where }),
      prisma.pulse.count({ where: { read: false } }),
    ])

    res.json({ pulses, total, unread })
  } catch (error) {
    console.error('[pulse] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch pulse notifications' })
  }
})

// ─── Mark as read ───────────────────────────────────────────
pulseRoutes.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    const pulse = await prisma.pulse.update({
      where: { id: req.params.id as string },
      data: { read: true },
    })
    res.json(pulse)
  } catch (error) {
    console.error('[pulse] PATCH /:id/read error:', error)
    res.status(500).json({ error: 'Failed to mark as read' })
  }
})

// ─── Mark all as read ───────────────────────────────────────
pulseRoutes.post('/read-all', async (_req: Request, res: Response) => {
  try {
    const result = await prisma.pulse.updateMany({
      where: { read: false },
      data: { read: true },
    })
    res.json({ success: true, updated: result.count })
  } catch (error) {
    console.error('[pulse] POST /read-all error:', error)
    res.status(500).json({ error: 'Failed to mark all as read' })
  }
})
