import { getGraphClient } from './graphClient'

export interface ConfirmationData {
  originalEmail: { from: { email: string; name: string }; subject: string }
  parsedPlan: { intent_summary: string; warnings: string[] }
  executionResults: { action: string; success: boolean; result?: any; error?: string }[]
}

export async function sendConfirmationEmail(data: ConfirmationData): Promise<void> {
  const mailbox = process.env.AGENT_MAILBOX
  if (!mailbox) {
    console.warn('[EmailAgent] AGENT_MAILBOX not set — skipping confirmation email')
    return
  }

  let graphClient
  try {
    graphClient = await getGraphClient()
  } catch {
    console.warn('[EmailAgent] Cannot send confirmation — Graph client not available')
    return
  }

  const { originalEmail, parsedPlan, executionResults } = data
  const allSucceeded = executionResults.every((r) => r.success)
  const successActions = executionResults.filter((r) => r.success)
  const failedActions = executionResults.filter((r) => !r.success)

  const subject = allSucceeded
    ? `✅ Done: ${parsedPlan.intent_summary}`
    : `⚠️ Partial: ${parsedPlan.intent_summary}`

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

  const successRows = successActions
    .map((r) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;">✅ <strong>${formatAction(r.action)}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;">${r.result?.name || r.result?.filename || ''}</td><td style="padding:8px 12px;border-bottom:1px solid #E5E7EB;">${r.result?.url ? `<a href="${baseUrl}${r.result.url}" style="color:#7C3AED;">View →</a>` : '—'}</td></tr>`)
    .join('')

  const failRows = failedActions
    .map((r) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #FEE2E2;color:#DC2626;">❌ ${formatAction(r.action)}</td><td colspan="2" style="padding:8px 12px;color:#DC2626;">${r.error}</td></tr>`)
    .join('')

  const htmlBody = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#F9FAFB;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
<div style="background:#111827;padding:24px 28px;"><span style="color:#F5F5F7;font-size:18px;font-weight:700;">⬡ Nexus Collab Agent</span><p style="color:#A1A1A6;margin:8px 0 0;font-size:13px;">${parsedPlan.intent_summary}</p></div>
<div style="padding:24px 28px;">
${parsedPlan.warnings?.length ? `<div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:12px;margin:0 0 16px;">⚠️ ${parsedPlan.warnings.join(' | ')}</div>` : ''}
<table style="width:100%;border-collapse:collapse;font-size:14px;"><thead><tr style="background:#F3F4F6;"><th style="padding:8px 12px;text-align:left;">Action</th><th style="padding:8px 12px;text-align:left;">Record</th><th style="padding:8px 12px;text-align:left;">Link</th></tr></thead><tbody>${successRows}${failRows}</tbody></table>
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;"><a href="${baseUrl}" style="display:inline-block;background:#7C3AED;color:#fff;padding:10px 20px;border-radius:980px;text-decoration:none;font-size:14px;">Open Nexus Collab →</a></div>
</div>
<div style="background:#F9FAFB;padding:16px 28px;border-top:1px solid #E5E7EB;"><p style="margin:0;color:#9CA3AF;font-size:12px;">Performed by Nexus Collab AI Agent</p></div>
</div></body></html>`

  try {
    await graphClient.api(`/users/${mailbox}/sendMail`).post({
      message: {
        subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: originalEmail.from.email, name: originalEmail.from.name } }],
      },
    })
  } catch (err) {
    console.error('[EmailAgent] Failed to send confirmation:', err)
  }
}

function formatAction(type: string): string {
  const map: Record<string, string> = {
    create_brief: 'New Brief Created',
    create_npd_task: 'NPD Task Added',
    create_npd_project: 'NPD Project Created',
    create_tech_transfer: 'Tech Transfer Created',
    create_formulation: 'Formulation Created',
    upload_file: 'File Uploaded',
    update_record: 'Record Updated',
    add_note: 'Note Added',
    log_issue: 'Issue Logged',
    create_task: 'Task Created',
  }
  return map[type] || type
}
