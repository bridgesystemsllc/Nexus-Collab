import type { PrismaClient } from '@prisma/client'
import { runGeodisImport, type RunImportResult } from './runImport'
import type { MatchedFeed } from './feedRouter'
import { isMailConfigured, sendTeamEmail } from '../emailAgent/sendMail'

// ─── Matched feed email → import + notification ──────────────
// The deterministic counterpart to the Claude pipeline. Once feedRouter has
// claimed an email, everything from here is rule-based: no model call, no
// action plan, no executor.

export interface FeedEmailInput {
  prisma: PrismaClient
  feed: MatchedFeed
  from: { email: string; name?: string }
  subject: string
  // Attachment resolved to bytes by the caller, which owns the Graph client.
  attachment: { name: string; content: Buffer } | null
}

export async function handleFeedEmail(input: FeedEmailInput): Promise<RunImportResult> {
  const { prisma, feed, from, attachment } = input

  if (!attachment) {
    const message =
      `The ${feed.config.warehouse} inventory email arrived with no spreadsheet attached, ` +
      `so nothing was imported.`
    await prisma.syncLog.create({
      data: {
        integrationId: feed.integrationId,
        status: 'error',
        recordsProcessed: 0,
        errors: { message } as object,
        completedAt: new Date(),
      },
    })
    const result: RunImportResult = { ok: false, status: 'file_error', message }
    await notify(prisma, feed, result, from)
    return result
  }

  const result = await runGeodisImport({
    prisma,
    buffer: attachment.content,
    filename: attachment.name,
  })

  await notify(prisma, feed, result, from)
  return result
}

// Every outcome is announced in-app; anything other than a clean import also
// replies to the sender. A silent failure on an automated feed is the worst
// case — stock would quietly go stale with nobody aware.
async function notify(
  prisma: PrismaClient,
  feed: MatchedFeed,
  result: RunImportResult,
  from: { email: string; name?: string },
): Promise<void> {
  const warehouse = feed.config.warehouse

  await prisma.pulse
    .create({
      data: {
        type: result.ok ? 'SIGNAL' : 'ALERT',
        message: `${warehouse} inventory import: ${result.message}`,
        deptName: 'Operations',
        metadata: {
          integrationId: feed.integrationId,
          status: result.status,
          ...(result.foundHeaders ? { foundHeaders: result.foundHeaders } : {}),
        } as object,
      },
    })
    .catch((err) => console.error('[inventoryImport] pulse failed:', err?.message))

  if (result.ok) return
  if (!isMailConfigured()) return
  if (!from.email) return

  const subject = `${warehouse} inventory import ${result.status === 'held' ? 'held' : 'failed'}`
  const detail = result.foundHeaders
    ? `<p>Columns found in the file: <code>${escapeHtml(result.foundHeaders.join(', '))}</code></p>`
    : ''

  await sendTeamEmail({
    subject,
    html:
      `<p>${escapeHtml(result.message)}</p>${detail}` +
      `<p>No inventory figures were changed. Re-send a corrected report, or apply this one ` +
      `manually from Operations &rsaquo; Inventory in Nexus.</p>`,
    recipients: [{ email: from.email, name: from.name }],
  }).catch((err) => console.error('[inventoryImport] reply failed:', err?.message))
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
