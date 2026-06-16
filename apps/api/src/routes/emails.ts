import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { isMailConfigured, sendTeamEmail } from '../services/emailAgent/sendMail'

export const emailRoutes: ReturnType<typeof Router> = Router()

// ─── Validation ─────────────────────────────────────────────
// Body for a production-update email. The subject + HTML body are composed
// client-side; we only validate shape and guard against obvious abuse.
const MAX_RECIPIENTS = 50

const recipientSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().optional(),
})

const productionUpdateSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  subject: z.string().trim().min(1),
  html: z.string().min(1),
  itemId: z.string().optional(),
})

// Strip anything that could leak a token, secret, or internal Graph detail out
// of an error before returning it to the client.
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]') // JWTs
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(0, 300)
}

// ─── POST /emails/production-update ──────────────────────────
// Sends a production-update email to a list of recipients via the shared agent
// mailbox. Any authenticated team member may send — it's an internal update,
// not an admin-gated action.
//
// Responses:
//   not configured → 200 { sent:false, configured:false }  (UI falls back to copy)
//   sent           → 200 { sent:true, configured:true, messageId? }
//   graph failure  → 502 { sent:false, configured:true, error:<sanitized> }
//   bad body       → 400 { error, details? }
emailRoutes.post('/production-update', async (req: Request, res: Response) => {
  const parsed = productionUpdateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_request',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  // Config gate: never attempt or fake a send when creds/mailbox are missing.
  if (!isMailConfigured()) {
    return res.json({ sent: false, configured: false })
  }

  const { recipients, subject, html, itemId } = parsed.data

  try {
    const result = await sendTeamEmail({ subject, html, recipients })
    console.log(
      `[emails] production-update sent to ${recipients.length} recipient(s)` +
        (itemId ? ` for item ${itemId}` : '')
    )
    return res.json({ sent: true, configured: true, messageId: result.messageId })
  } catch (err) {
    console.error('[emails] production-update send failed:', err)
    return res.status(502).json({
      sent: false,
      configured: true,
      error: sanitizeError(err),
    })
  }
})
