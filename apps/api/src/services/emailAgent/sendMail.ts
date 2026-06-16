import { getGraphClient } from './graphClient'
import { isMicrosoftConfigured } from '../../lib/microsoftGraph'

// ─── Production / team update sender (app-only Graph) ─────────
// Sends an arbitrary HTML email (subject + body composed by the caller, e.g.
// the client-side "Send production update" composer) to a list of recipients
// from the shared agent mailbox. This reuses the exact sendMail shape proven by
// confirmationSender.ts so behavior matches the existing working integration.

export interface MailRecipient {
  email: string
  name?: string
}

export interface SendTeamEmailInput {
  subject: string
  html: string
  recipients: MailRecipient[]
}

export interface SendTeamEmailResult {
  sent: boolean
  messageId?: string
}

// "Configured" requires BOTH the app-only Graph credentials (tenant/client id +
// secret, under GRAPH_* or MICROSOFT_*/AZURE_* names — mirrors
// isMicrosoftConfigured) AND a from-mailbox (AGENT_MAILBOX). Without both we
// cannot send, so the route returns a clean not-configured response instead of
// faking a send.
export function isMailConfigured(): boolean {
  return isMicrosoftConfigured() && !!process.env.AGENT_MAILBOX
}

// Sends the email via Microsoft Graph. Throws on any Graph error so the caller
// can map it to a 502 with a sanitized message — this function never fakes a
// send. Callers should gate on isMailConfigured() first.
export async function sendTeamEmail({
  subject,
  html,
  recipients,
}: SendTeamEmailInput): Promise<SendTeamEmailResult> {
  const mailbox = process.env.AGENT_MAILBOX
  if (!mailbox) {
    throw new Error('AGENT_MAILBOX not configured')
  }
  if (!recipients.length) {
    throw new Error('At least one recipient is required')
  }

  const graphClient = await getGraphClient()

  const toRecipients = recipients.map((r) => ({
    emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) },
  }))

  await graphClient.api(`/users/${mailbox}/sendMail`).post({
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients,
    },
  })

  // Graph sendMail returns 202 Accepted with no body / message id. We surface a
  // synthetic confirmation token so the UI can show a sent state.
  return { sent: true, messageId: `sent-${Date.now()}` }
}
