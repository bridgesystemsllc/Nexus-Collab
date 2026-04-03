import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { processIncomingEmail, setProcessorPrisma } from '../services/emailAgent/processor'

export const emailAgentRoutes: ReturnType<typeof Router> = Router()

// Initialize prisma in the processor on first request
let initialized = false
function ensureInit() {
  if (!initialized) {
    setProcessorPrisma(prisma)
    initialized = true
  }
}

// ─── Microsoft Graph Webhook (receives email notifications) ──
emailAgentRoutes.post('/webhook', async (req: Request, res: Response) => {
  // Graph validation handshake — must respond with validationToken
  if (req.query.validationToken) {
    return res.status(200).contentType('text/plain').send(req.query.validationToken as string)
  }

  ensureInit()

  const notifications = req.body?.value || []
  for (const notification of notifications) {
    // Validate clientState
    if (notification.clientState !== process.env.AGENT_WEBHOOK_SECRET) {
      console.warn('[EmailAgent] Invalid clientState — ignoring')
      continue
    }

    // Process async — respond 202 immediately
    const resourceId = notification.resourceData?.id
    if (resourceId) {
      processIncomingEmail(resourceId).catch((err) =>
        console.error('[EmailAgent] Processing error:', err)
      )
    }
  }

  res.sendStatus(202)
})

// ─── Get agent status ────────────────────────────────────────
emailAgentRoutes.get('/status', async (_req: Request, res: Response) => {
  try {
    const mailbox = process.env.AGENT_MAILBOX || null
    const hasGraphCreds = !!(process.env.GRAPH_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID)
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY
    const authorizedSenders = (process.env.AUTHORIZED_SENDERS || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)

    // Get log stats if table exists
    let totalProcessed = 0
    let lastProcessed: any = null
    try {
      totalProcessed = await (prisma as any).emailAgentLog?.count() || 0
      lastProcessed = await (prisma as any).emailAgentLog?.findFirst({
        orderBy: { createdAt: 'desc' },
      })
    } catch {}

    res.json({
      active: !!(mailbox && hasGraphCreds && hasAnthropicKey),
      mailbox,
      hasGraphCreds,
      hasAnthropicKey,
      authorizedSenders,
      totalProcessed,
      lastProcessed: lastProcessed
        ? { subject: lastProcessed.subject, status: lastProcessed.status, processedAt: lastProcessed.createdAt }
        : null,
    })
  } catch (error) {
    console.error('[EmailAgent] Status error:', error)
    res.status(500).json({ error: 'Failed to get agent status' })
  }
})

// ─── Get agent logs ──────────────────────────────────────────
emailAgentRoutes.get('/logs', async (req: Request, res: Response) => {
  try {
    let logs: any[] = []
    try {
      logs = await (prisma as any).emailAgentLog?.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }) || []
    } catch {}
    res.json(logs)
  } catch (error) {
    console.error('[EmailAgent] Logs error:', error)
    res.status(500).json({ error: 'Failed to get agent logs' })
  }
})

// ─── Update authorized senders ───────────────────────────────
emailAgentRoutes.put('/authorized-senders', async (req: Request, res: Response) => {
  try {
    // In production, this would update a DB record. For now, return current env value.
    // The actual sender list is managed via AUTHORIZED_SENDERS env var or a DB table.
    const { senders } = req.body
    if (!Array.isArray(senders)) {
      return res.status(400).json({ error: 'senders must be an array of email addresses' })
    }
    // Store to DB if EmailAgentConfig table exists, else just acknowledge
    res.json({ success: true, senders })
  } catch (error) {
    console.error('[EmailAgent] Update senders error:', error)
    res.status(500).json({ error: 'Failed to update authorized senders' })
  }
})

// ─── Test the agent with a simulated email ───────────────────
emailAgentRoutes.post('/test', async (req: Request, res: Response) => {
  ensureInit()

  try {
    const { subject, body, fromEmail, fromName } = req.body
    if (!subject || !body) {
      return res.status(400).json({ error: 'subject and body are required' })
    }

    // Import parser directly for testing without Graph API
    const { parseEmailWithClaude } = await import('../services/emailAgent/claudeParser')

    const emailData = {
      from: { email: fromEmail || 'test@example.com', name: fromName || 'Test User' },
      subject,
      bodyText: body,
      attachments: [],
      receivedAt: new Date().toISOString(),
    }

    // Build workspace context inline for the test route
    const rdDept = await prisma.department.findFirst({ where: { type: 'BUILTIN_RD' } })
    const workspaceContext: any = {
      senderUser: null,
      npdProjects: [],
      activeBriefs: [],
      cms: [],
    }

    if (rdDept) {
      const modules = await prisma.departmentModule.findMany({
        where: { departmentId: rdDept.id },
        include: { items: true },
      })
      const npdModule = modules.find((m: any) => m.type === 'NPD_PIPELINE')
      if (npdModule) {
        workspaceContext.npdProjects = npdModule.items.map((item: any) => ({
          id: item.id,
          projectName: (item.data as any).projectName || '',
          brand: (item.data as any).brand || '',
        }))
      }
      const briefsModule = modules.find((m: any) => m.type === 'BRIEFS')
      if (briefsModule) {
        workspaceContext.activeBriefs = briefsModule.items.map((item: any) => ({
          id: item.id,
          projectName: (item.data as any).projectName || (item.data as any).name || '',
          brand: (item.data as any).brand || '',
        }))
      }
      const cmModule = modules.find((m: any) => m.type === 'CM_PRODUCTIVITY')
      if (cmModule) {
        workspaceContext.cms = cmModule.items.map((item: any) => ({
          id: item.id,
          name: (item.data as any).name || '',
        }))
      }
    }

    // Parse
    const parsedPlan = await parseEmailWithClaude(emailData, workspaceContext)

    // Execute if confidence is high enough
    let executionResults: any[] = []
    if (!parsedPlan.requires_clarification && parsedPlan.confidence >= 0.6) {
      const { executeActionPlan, setExecutorPrisma } = await import('../services/emailAgent/executor')
      setExecutorPrisma(prisma)
      executionResults = await executeActionPlan(parsedPlan, emailData, fromEmail || 'test@example.com')
    }

    res.json({ parsedPlan, executionResults })
  } catch (error: any) {
    console.error('[EmailAgent] Test error:', error)
    res.status(500).json({ error: error.message })
  }
})
