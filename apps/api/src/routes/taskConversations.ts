import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { assertCan } from '../services/projects/policy'
import {
  resolveActor, loadProjectForPolicy, errorResponse,
  NotFoundError, ValidationError, ConflictError,
} from '../services/projects/context'
import { MicrosoftNotConnectedError } from '../lib/microsoftGraph'
import { logActivity } from '../services/projects/activity'
import * as conv from '../services/tasks/conversations'

// ─── Email and Teams conversations on a task ─────────────────
// Attach a mail thread or a Teams chat to a task and reply without leaving it.
//
// Every Graph call runs as the acting member, never as the shared mailbox. Two
// consequences that shape the routes: a member with no connected Microsoft
// account gets a 412 telling them to connect, and one member's attached thread
// is only readable by another member if they too have access to it in Outlook
// — the link stores identifiers, not content.

export const taskConversationRoutes: ReturnType<typeof Router> = Router()

function ok(res: Response, data: unknown, meta: Record<string, unknown> = {}) {
  return res.json({ data, meta })
}
function fail(res: Response, err: unknown) {
  // A lapsed or under-scoped Microsoft connection is a 412: the request was
  // well-formed, the precondition (a connected account) is not met. The client
  // uses it to show a Connect button rather than an error.
  if (err instanceof MicrosoftNotConnectedError) {
    return res.status(412).json({
      error: {
        code: 'MicrosoftNotConnected',
        message:
          'Connect your Microsoft account to use email and Teams here. ' +
          'If it is already connected, reconnect it — this feature needs permissions ' +
          'that were added after you last signed in.',
      },
    })
  }
  const { status, body } = errorResponse(err)
  return res.status(status).json(body)
}
function parseOrThrow<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value)
  if (!r.success) throw new ValidationError('Validation failed', r.error.flatten())
  return r.data
}

/** A task the actor may see, with the project the policy needs. */
async function requireTask(taskId: string, actorReq: Request) {
  const actor = await resolveActor(prisma, actorReq)
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, title: true, taskNumber: true, projectId: true, deletedAt: true, departmentId: true },
  })
  if (!task || task.deletedAt || !task.projectId) throw new NotFoundError('Task not found')
  const project = await loadProjectForPolicy(prisma, task.projectId)
  if (!project || project.deletedAt) throw new NotFoundError('Task not found')
  assertCan(actor, 'VIEW_PROJECT', project)
  return { actor, task, project }
}

// ─── Pickers ─────────────────────────────────────────────────
// Registered before /:taskId/* so "graph" is never read as a task id.

taskConversationRoutes.get('/graph/messages', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      z.object({
        search: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      req.query,
    )
    const messages = await conv.listMessages(actor.id, { search: q.search, limit: q.limit })
    return ok(res, messages, { total: messages.length, searched: !!q.search })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.get('/graph/chats', async (req: Request, res: Response) => {
  try {
    const actor = await resolveActor(prisma, req)
    const q = parseOrThrow(
      z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) }),
      req.query,
    )
    const chats = await conv.listChats(actor.id, q.limit)
    return ok(
      res,
      chats.map((c) => ({
        id: c.id,
        topic: c.topic ?? null,
        chatType: c.chatType ?? 'oneOnOne',
        memberNames: conv.memberNamesOf(c),
        lastUpdatedDateTime: c.lastUpdatedDateTime ?? null,
      })),
      {
        total: chats.length,
        // Said out loud because the ordering looks like recency and is not.
        ordering: 'By last membership or title change, which Graph exposes — not by last message.',
      },
    )
  } catch (err) {
    return fail(res, err)
  }
})

// ─── What is attached to a task ──────────────────────────────

taskConversationRoutes.get('/:taskId/conversations', async (req: Request, res: Response) => {
  try {
    const { task } = await requireTask(req.params.taskId as string, req)
    const [emails, chats] = await Promise.all([
      prisma.emailLink.findMany({ where: { taskId: task.id }, orderBy: { date: 'desc' } }),
      prisma.taskChatLink.findMany({
        where: { taskId: task.id },
        orderBy: { createdAt: 'desc' },
        include: { linkedBy: { select: { id: true, name: true } } },
      }),
    ])
    return ok(res, { emails, chats }, { total: emails.length + chats.length })
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Email ───────────────────────────────────────────────────

taskConversationRoutes.post('/:taskId/emails', async (req: Request, res: Response) => {
  try {
    const { actor, task, project } = await requireTask(req.params.taskId as string, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    const body = parseOrThrow(z.object({ messageId: z.string().min(1) }).strict(), req.body)

    // Fetched from Graph rather than trusted from the client: the subject,
    // sender and date are shown to other people, and a client-supplied one
    // could say anything.
    const message = await conv.getMessage(actor.id, body.messageId)

    const existing = await prisma.emailLink.findFirst({
      where: { taskId: task.id, messageId: message.id },
    })
    if (existing) throw new ConflictError('That email is already attached to this task')

    const link = await prisma.emailLink.create({
      data: {
        taskId: task.id,
        messageId: message.id,
        subject: message.subject ?? '(no subject)',
        fromAddr: message.from?.emailAddress?.address ?? 'unknown',
        toAddrs: (message.toRecipients ?? [])
          .map((r) => r.emailAddress?.address)
          .filter((a): a is string => !!a),
        date: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
        snippet: message.bodyPreview ?? null,
        // conversationId is what makes the thread view possible; without it an
        // attachment is a single message with no way back to its exchange.
        metadata: {
          conversationId: message.conversationId ?? null,
          webLink: message.webLink ?? null,
          fromName: message.from?.emailAddress?.name ?? null,
        } as object,
      },
    })

    await logActivity(prisma, {
      projectId: task.projectId!,
      actorId: actor.id,
      departmentId: task.departmentId,
      entityType: 'TASK',
      entityId: task.id,
      action: 'EMAIL_ATTACHED',
      summary: `Attached email "${link.subject}" to #${task.taskNumber} "${task.title}"`,
    })

    return res.status(201).json({ data: link, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.get('/emails/:linkId/thread', async (req: Request, res: Response) => {
  try {
    const link = await prisma.emailLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link?.taskId) throw new NotFoundError('Attachment not found')
    const { actor } = await requireTask(link.taskId, req)

    const conversationId = (link.metadata as any)?.conversationId as string | undefined
    if (!conversationId) {
      // Attached before conversationId was stored, or Graph omitted it. One
      // message is still better than an error.
      const single = await conv.getMessage(actor.id, link.messageId)
      return ok(res, [single], { partial: true, reason: 'No conversation id on this attachment' })
    }

    const thread = await conv.getThread(actor.id, conversationId)
    return ok(res, thread, { total: thread.length })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.post('/emails/:linkId/reply', async (req: Request, res: Response) => {
  try {
    const link = await prisma.emailLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link?.taskId) throw new NotFoundError('Attachment not found')
    const { actor, task, project } = await requireTask(link.taskId, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    const body = parseOrThrow(
      z.object({
        comment: z.string().min(1).max(20_000),
        // Reply-all is the default because a task thread usually has more than
        // two people on it, but replying only to the sender must be possible.
        replyAll: z.boolean().default(true),
        /** Reply to a specific message in the thread rather than the attached one. */
        messageId: z.string().optional(),
      }).strict(),
      req.body,
    )

    await conv.replyToMessage(actor.id, body.messageId ?? link.messageId, body.comment, body.replyAll)

    await logActivity(prisma, {
      projectId: task.projectId!,
      actorId: actor.id,
      departmentId: task.departmentId,
      entityType: 'TASK',
      entityId: task.id,
      action: 'EMAIL_REPLIED',
      summary: `Replied to "${link.subject}" on #${task.taskNumber} "${task.title}"`,
    })

    // Graph's /reply returns no body, so there is no id to hand back. The
    // client re-fetches the thread rather than optimistically appending
    // something it would be guessing at.
    return res.status(202).json({ data: { sent: true }, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.delete('/emails/:linkId', async (req: Request, res: Response) => {
  try {
    const link = await prisma.emailLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link?.taskId) throw new NotFoundError('Attachment not found')
    const { actor, task, project } = await requireTask(link.taskId, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    // Detaches the link only. The email itself is untouched — this is not a
    // control that should be able to delete someone's mail.
    await prisma.emailLink.delete({ where: { id: link.id } })
    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

// ─── Teams chats ─────────────────────────────────────────────

taskConversationRoutes.post('/:taskId/chats', async (req: Request, res: Response) => {
  try {
    const { actor, task, project } = await requireTask(req.params.taskId as string, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    const body = parseOrThrow(z.object({ chatId: z.string().min(1) }).strict(), req.body)

    // Read back from Graph: this both fetches the display fields and proves
    // the member is actually in the chat. A client-supplied id must not be
    // enough to attach a conversation they cannot see.
    const chat = await conv.getChat(actor.id, body.chatId)

    const existing = await prisma.taskChatLink.findUnique({
      where: { taskId_chatId: { taskId: task.id, chatId: chat.id } },
    })
    if (existing) throw new ConflictError('That chat is already attached to this task')

    const link = await prisma.taskChatLink.create({
      data: {
        taskId: task.id,
        chatId: chat.id,
        topic: chat.topic ?? null,
        chatType: chat.chatType ?? 'oneOnOne',
        memberNames: conv.memberNamesOf(chat),
        linkedById: actor.id,
      },
      include: { linkedBy: { select: { id: true, name: true } } },
    })

    await logActivity(prisma, {
      projectId: task.projectId!,
      actorId: actor.id,
      departmentId: task.departmentId,
      entityType: 'TASK',
      entityId: task.id,
      action: 'CHAT_ATTACHED',
      summary:
        `Attached Teams chat "${conv.chatLabel(link)}" to #${task.taskNumber} "${task.title}"`,
    })

    return res.status(201).json({ data: link, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.get('/chats/:linkId/messages', async (req: Request, res: Response) => {
  try {
    const link = await prisma.taskChatLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link) throw new NotFoundError('Attachment not found')
    const { actor } = await requireTask(link.taskId, req)

    const messages = await conv.getChatMessages(actor.id, link.chatId)
    return ok(res, messages, { total: messages.length })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.post('/chats/:linkId/reply', async (req: Request, res: Response) => {
  try {
    const link = await prisma.taskChatLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link) throw new NotFoundError('Attachment not found')
    const { actor, task, project } = await requireTask(link.taskId, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    const body = parseOrThrow(
      z.object({ content: z.string().min(1).max(10_000) }).strict(),
      req.body,
    )

    const sent = await conv.sendChatMessage(actor.id, link.chatId, body.content)

    await logActivity(prisma, {
      projectId: task.projectId!,
      actorId: actor.id,
      departmentId: task.departmentId,
      entityType: 'TASK',
      entityId: task.id,
      action: 'CHAT_REPLIED',
      summary: `Replied in "${conv.chatLabel(link)}" on #${task.taskNumber} "${task.title}"`,
    })

    return res.status(201).json({ data: sent ?? { sent: true }, meta: {} })
  } catch (err) {
    return fail(res, err)
  }
})

taskConversationRoutes.delete('/chats/:linkId', async (req: Request, res: Response) => {
  try {
    const link = await prisma.taskChatLink.findUnique({ where: { id: req.params.linkId as string } })
    if (!link) throw new NotFoundError('Attachment not found')
    const { actor, task, project } = await requireTask(link.taskId, req)
    assertCan(actor, 'EDIT_TASK_OWN_LANE', project, { departmentId: task.departmentId })

    // The conversation stays in Teams. Detaching is a Nexus-side action only.
    await prisma.taskChatLink.delete({ where: { id: link.id } })
    return res.status(204).send()
  } catch (err) {
    return fail(res, err)
  }
})

export default taskConversationRoutes
