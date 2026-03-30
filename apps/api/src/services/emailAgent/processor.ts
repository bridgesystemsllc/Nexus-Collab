import { fetchEmailById, type EmailData } from './fetcher'
import { parseEmailWithClaude, type WorkspaceContext } from './claudeParser'
import { executeActionPlan, setExecutorPrisma } from './executor'
import { sendConfirmationEmail } from './confirmationSender'
import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient

export function setProcessorPrisma(p: PrismaClient) {
  prisma = p
  setExecutorPrisma(p)
}

export async function processIncomingEmail(messageId: string): Promise<void> {
  console.log(`[EmailAgent] Processing message: ${messageId}`)

  // 1. Fetch email
  let emailData: EmailData
  try {
    emailData = await fetchEmailById(messageId)
  } catch (err: any) {
    console.error(`[EmailAgent] Failed to fetch email ${messageId}:`, err.message)
    return
  }

  const senderEmail = emailData.from.email.toLowerCase()

  // 2. Check authorized senders
  const authorizedSenders = (process.env.AUTHORIZED_SENDERS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (authorizedSenders.length > 0 && !authorizedSenders.includes(senderEmail)) {
    console.warn(`[EmailAgent] Unauthorized sender: ${senderEmail}`)
    return
  }

  // 3. Check for duplicate processing (use EmailAgentLog if table exists, otherwise skip)
  let logEntry: any = null
  try {
    // Try to find existing log
    const existing = await (prisma as any).emailAgentLog?.findFirst({ where: { messageId } })
    if (existing) {
      console.log(`[EmailAgent] Already processed: ${messageId}`)
      return
    }

    // Create log entry
    logEntry = await (prisma as any).emailAgentLog?.create({
      data: {
        messageId,
        senderEmail,
        subject: emailData.subject,
        status: 'processing',
        receivedAt: new Date(emailData.receivedAt),
      },
    })
  } catch {
    // EmailAgentLog table might not exist yet — continue anyway
    console.log('[EmailAgent] EmailAgentLog table not available — continuing without dedup')
  }

  // 4. Build workspace context
  const workspaceContext = await buildWorkspaceContext(senderEmail)

  // 5. Parse with Claude
  let parsedPlan
  try {
    parsedPlan = await parseEmailWithClaude(emailData, workspaceContext)
    console.log(`[EmailAgent] Intent: ${parsedPlan.intent_summary} (confidence: ${parsedPlan.confidence})`)
  } catch (err: any) {
    console.error('[EmailAgent] Parse error:', err.message)
    if (logEntry?.id) {
      await (prisma as any).emailAgentLog?.update({
        where: { id: logEntry.id },
        data: { status: 'parse_error', error: err.message },
      }).catch(() => {})
    }
    return
  }

  // 6. If clarification needed, don't execute
  if (parsedPlan.requires_clarification) {
    console.log(`[EmailAgent] Clarification needed: ${parsedPlan.clarification_question}`)
    if (logEntry?.id) {
      await (prisma as any).emailAgentLog?.update({
        where: { id: logEntry.id },
        data: { status: 'awaiting_clarification', parsedPlan },
      }).catch(() => {})
    }
    // Send clarification email
    await sendConfirmationEmail({
      originalEmail: emailData,
      parsedPlan: { intent_summary: parsedPlan.clarification_question || 'Could you clarify your request?', warnings: [] },
      executionResults: [],
    })
    return
  }

  // 7. Execute
  const executionResults = await executeActionPlan(parsedPlan, emailData, senderEmail)
  console.log(`[EmailAgent] Executed ${executionResults.length} actions — ${executionResults.filter(r => r.success).length} succeeded`)

  // 8. Send confirmation
  await sendConfirmationEmail({
    originalEmail: emailData,
    parsedPlan,
    executionResults,
  })

  // 9. Update log
  if (logEntry?.id) {
    const status = executionResults.every((r) => r.success) ? 'complete' : 'partial'
    await (prisma as any).emailAgentLog?.update({
      where: { id: logEntry.id },
      data: { status, parsedPlan, executionResults },
    }).catch(() => {})
  }
}

async function buildWorkspaceContext(senderEmail: string): Promise<WorkspaceContext> {
  // Find sender
  let senderUser: WorkspaceContext['senderUser'] = null
  try {
    const member = await prisma.member.findFirst({ where: { email: senderEmail } })
    if (member) senderUser = { id: member.id, name: member.name, role: member.role }
  } catch {}

  // Find R&D department and modules
  const rdDept = await prisma.department.findFirst({ where: { type: 'BUILTIN_RD' } })
  let npdProjects: WorkspaceContext['npdProjects'] = []
  let activeBriefs: WorkspaceContext['activeBriefs'] = []
  let cms: WorkspaceContext['cms'] = []

  if (rdDept) {
    const modules = await prisma.departmentModule.findMany({
      where: { departmentId: rdDept.id },
      include: { items: true },
    })

    // NPD projects
    const npdModule = modules.find((m) => m.type === 'NPD_PIPELINE')
    if (npdModule) {
      npdProjects = npdModule.items.map((item) => {
        const d = item.data as any
        return { id: item.id, projectName: d.projectName || '', brand: d.brand || '' }
      })
    }

    // Active briefs
    const briefsModule = modules.find((m) => m.type === 'BRIEFS')
    if (briefsModule) {
      activeBriefs = briefsModule.items.map((item) => {
        const d = item.data as any
        return { id: item.id, projectName: d.projectName || d.name || '', brand: d.brand || '' }
      })
    }

    // CMs
    const cmModule = modules.find((m) => m.type === 'CM_PRODUCTIVITY')
    if (cmModule) {
      cms = cmModule.items.map((item) => {
        const d = item.data as any
        return { id: item.id, name: d.name || '' }
      })
    }
  }

  return { senderUser, npdProjects, activeBriefs, cms }
}
