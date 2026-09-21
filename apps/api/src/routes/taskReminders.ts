import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const taskReminderRoutes: ReturnType<typeof Router> = Router()

// ─── List reminders for a task ──────────────────────────────
taskReminderRoutes.get('/:taskId/reminders', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params

    const reminders = await prisma.taskReminder.findMany({
      where: { taskId },
      orderBy: { remindAt: 'asc' },
    })

    res.json(reminders)
  } catch (error) {
    console.error('[task-reminders] GET /:taskId/reminders error:', error)
    res.status(500).json({ error: 'Failed to fetch reminders' })
  }
})

// ─── Create reminder ────────────────────────────────────────
const createReminderSchema = z.object({
  remindAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date'),
  recipientId: z.string().min(1),
  message: z.string().optional(),
})

taskReminderRoutes.post('/:taskId/reminders', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const data = createReminderSchema.parse(req.body)
    const createdById = (req as any).member?.id || req.body.createdById

    const task = await prisma.task.findUnique({ where: { id: taskId } })
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const recipient = await prisma.member.findUnique({ where: { id: data.recipientId } })
    if (!recipient) {
      return res.status(400).json({ error: 'Recipient not found' })
    }

    const reminder = await prisma.taskReminder.create({
      data: {
        taskId,
        remindAt: new Date(data.remindAt),
        recipientId: data.recipientId,
        message: data.message,
        createdById,
        status: 'PENDING',
      },
    })

    res.status(201).json(reminder)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    console.error('[task-reminders] POST /:taskId/reminders error:', error)
    res.status(500).json({ error: 'Failed to create reminder' })
  }
})

// ─── Update reminder ────────────────────────────────────────
const updateReminderSchema = z.object({
  remindAt: z.string().refine((s) => !isNaN(Date.parse(s)), 'Invalid date').optional(),
  recipientId: z.string().min(1).optional(),
  message: z.string().optional(),
  status: z.enum(['PENDING', 'SENT', 'CANCELLED']).optional(),
})

taskReminderRoutes.patch('/reminders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const data = updateReminderSchema.parse(req.body)

    const existing = await prisma.taskReminder.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' })
    }

    if (existing.status === 'SENT' && data.status !== 'SENT') {
      return res.status(400).json({ error: 'Cannot modify a sent reminder' })
    }

    const updateData: any = { ...data }
    if (data.remindAt) updateData.remindAt = new Date(data.remindAt)

    const reminder = await prisma.taskReminder.update({
      where: { id },
      data: updateData,
    })

    res.json(reminder)
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors })
    }
    console.error('[task-reminders] PATCH /reminders/:id error:', error)
    res.status(500).json({ error: 'Failed to update reminder' })
  }
})

// ─── Delete reminder ────────────────────────────────────────
taskReminderRoutes.delete('/reminders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.taskReminder.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ error: 'Reminder not found' })
    }

    await prisma.taskReminder.delete({ where: { id } })

    res.status(204).send()
  } catch (error) {
    console.error('[task-reminders] DELETE /reminders/:id error:', error)
    res.status(500).json({ error: 'Failed to delete reminder' })
  }
})
