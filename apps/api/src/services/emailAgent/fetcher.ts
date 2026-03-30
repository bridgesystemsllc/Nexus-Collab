import { getGraphClient } from './graphClient'

export interface EmailData {
  messageId: string
  subject: string
  from: { email: string; name: string }
  bodyText: string
  attachments: {
    id: string
    name: string
    contentType: string
    size: number
    contentBytes: string
  }[]
  receivedAt: string
}

export async function fetchEmailById(messageId: string): Promise<EmailData> {
  const graphClient = await getGraphClient()
  const mailbox = process.env.AGENT_MAILBOX

  if (!mailbox) throw new Error('AGENT_MAILBOX not configured')

  const message = await graphClient
    .api(`/users/${mailbox}/messages/${messageId}`)
    .select('id,subject,from,body,receivedDateTime')
    .expand('attachments')
    .get()

  // Convert HTML to plain text (simple strip)
  let bodyText = message.body?.content || ''
  if (message.body?.contentType === 'html') {
    bodyText = bodyText
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // Strip reply chain
  bodyText = stripReplyChain(bodyText)

  const attachments = (message.attachments || [])
    .filter((a: any) => a.contentBytes && !a.isInline)
    .map((a: any) => ({
      id: a.id,
      name: a.name,
      contentType: a.contentType,
      size: a.size,
      contentBytes: a.contentBytes,
    }))

  return {
    messageId: message.id,
    subject: message.subject || '',
    from: {
      email: message.from?.emailAddress?.address || '',
      name: message.from?.emailAddress?.name || '',
    },
    bodyText,
    attachments,
    receivedAt: message.receivedDateTime,
  }
}

function stripReplyChain(text: string): string {
  const patterns = [
    /^-+\s*Original Message\s*-+/im,
    /^From:\s+.+\nSent:\s+/im,
    /^On .+ wrote:/im,
    /^_{5,}/m,
  ]
  for (const pattern of patterns) {
    const match = text.search(pattern)
    if (match > 50) return text.substring(0, match).trim()
  }
  return text.trim()
}
