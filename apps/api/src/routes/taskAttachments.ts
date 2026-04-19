import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'

export const taskAttachmentRoutes: ReturnType<typeof Router> = Router()

// ─── List attachments for a task ────────────────────────────
taskAttachmentRoutes.get('/:taskId/attachments', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { module } = req.query as Record<string, string>

    const where: any = { taskId, deletedAt: null }
    if (module) where.module = module

    const attachments = await prisma.taskAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    res.json(attachments)
  } catch (error) {
    console.error('[task-attachments] GET /:taskId/attachments error:', error)
    res.status(500).json({ error: 'Failed to fetch attachments' })
  }
})

// ─── Create email attachment ────────────────────────────────
const emailPayloadSchema = z.object({
  thread_id: z.string().optional(),
  subject: z.string().min(1),
  sender_name: z.string().optional(),
  sender_email: z.string().optional(),
  received_at: z.string().optional(),
  snippet: z.string().optional(),
  message_count: z.number().optional().default(1),
  source: z.string().optional().default('forward'),
  forward_content: z.string().optional(),
})

taskAttachmentRoutes.post('/:taskId/attachments/email', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { module, createdBy, ...payloadData } = req.body
    const payload = emailPayloadSchema.parse(payloadData)

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        module: module || 'npd',
        type: 'email',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[task-attachments] POST email error:', error)
    res.status(500).json({ error: 'Failed to create email attachment' })
  }
})

// ─── Create file attachment ─────────────────────────────────
const filePayloadSchema = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().optional(),
  mime_type: z.string().optional(),
  storage_url: z.string().optional(),
  onedrive_item_id: z.string().optional(),
  uploaded_via: z.string().optional().default('upload'),
})

taskAttachmentRoutes.post('/:taskId/attachments/file', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { module, createdBy, ...payloadData } = req.body
    const payload = filePayloadSchema.parse(payloadData)

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        module: module || 'npd',
        type: 'file',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[task-attachments] POST file error:', error)
    res.status(500).json({ error: 'Failed to create file attachment' })
  }
})

// ─── Create file from URL ───────────────────────────────────
taskAttachmentRoutes.post('/:taskId/attachments/file/url', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { module, createdBy, url, filename } = req.body

    if (!url) return res.status(400).json({ error: 'URL is required' })

    const payload = {
      filename: filename || url.split('/').pop() || 'linked-file',
      storage_url: url,
      uploaded_via: 'url',
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        module: module || 'npd',
        type: 'file',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error) {
    console.error('[task-attachments] POST file/url error:', error)
    res.status(500).json({ error: 'Failed to create file attachment from URL' })
  }
})

// ─── Create comment ─────────────────────────────────────────
const commentPayloadSchema = z.object({
  body_html: z.string().optional(),
  body_plain: z.string().min(1),
  mentions: z.array(z.string()).optional().default([]),
  edited: z.boolean().optional().default(false),
  source: z.string().optional(),
})

taskAttachmentRoutes.post('/:taskId/attachments/comment', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params
    const { module, createdBy, ...payloadData } = req.body
    const payload = commentPayloadSchema.parse(payloadData)

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        module: module || 'npd',
        type: 'comment',
        payload: payload as any,
        createdBy,
      },
    })
    res.status(201).json(attachment)
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors })
    console.error('[task-attachments] POST comment error:', error)
    res.status(500).json({ error: 'Failed to create comment' })
  }
})

// ─── Update attachment (edit comment body) ──────────────────
taskAttachmentRoutes.patch('/attachments/:id', async (req: Request, res: Response) => {
  try {
    const attachment = await prisma.taskAttachment.findUnique({ where: { id: req.params.id as string } })
    if (!attachment || attachment.deletedAt) {
      return res.status(404).json({ error: 'Attachment not found' })
    }

    if (attachment.type !== 'comment') {
      return res.status(400).json({ error: 'Only comments can be edited' })
    }

    const existingPayload = attachment.payload as any
    const updated = await prisma.taskAttachment.update({
      where: { id: req.params.id as string },
      data: {
        payload: {
          ...existingPayload,
          body_plain: req.body.body_plain ?? existingPayload.body_plain,
          body_html: req.body.body_html ?? existingPayload.body_html,
          edited: true,
        },
      },
    })
    res.json(updated)
  } catch (error) {
    console.error('[task-attachments] PATCH error:', error)
    res.status(500).json({ error: 'Failed to update attachment' })
  }
})

// ─── Soft delete attachment ─────────────────────────────────
taskAttachmentRoutes.delete('/attachments/:id', async (req: Request, res: Response) => {
  try {
    const attachment = await prisma.taskAttachment.findUnique({ where: { id: req.params.id as string } })
    if (!attachment || attachment.deletedAt) {
      return res.status(404).json({ error: 'Attachment not found' })
    }

    await prisma.taskAttachment.update({
      where: { id: req.params.id as string },
      data: { deletedAt: new Date() },
    })
    res.status(204).send()
  } catch (error) {
    console.error('[task-attachments] DELETE error:', error)
    res.status(500).json({ error: 'Failed to delete attachment' })
  }
})
