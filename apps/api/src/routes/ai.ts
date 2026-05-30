import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const aiRoutes: ReturnType<typeof Router> = Router()

// ─── Gather context for AI ──────────────────────────────────
async function gatherContext() {
  const [tasks, inventory, pulses, activities] = await Promise.all([
    prisma.task.findMany({
      where: { status: { not: 'COMPLETE' } },
      include: {
        owner: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { priority: 'asc' },
      take: 20,
    }),
    prisma.moduleItem.findMany({
      where: { module: { type: 'INVENTORY_HEALTH' } },
      take: 10,
    }),
    prisma.pulse.findMany({
      where: { read: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.activity.findMany({
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 15,
    }),
  ])

  return {
    activeTasks: tasks.map((t: any) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      owner: t.owner?.name,
      dept: t.department?.name,
      dueDate: t.dueDate,
    })),
    inventoryAlerts: inventory.map((i: any) => {
      const d = i.data as any
      return { sku: d.sku, name: d.name, onHand: d.onHand, status: i.status }
    }),
    unreadPulses: pulses.map((p: any) => ({ type: p.type, message: p.message })),
    recentActivity: activities.map((a: any) => ({
      type: a.type,
      content: a.content,
      author: a.author?.name,
      date: a.createdAt,
    })),
  }
}

// ─── Chat endpoint ──────────────────────────────────────────
aiRoutes.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, history = [] } = req.body
    const context = await gatherContext()

    const systemPrompt = `You are NEXUS AI, an intelligent assistant for the Kareve Beauty Group operations platform.
You have access to the following real-time data:

ACTIVE TASKS (${context.activeTasks.length}):
${context.activeTasks.map((t: any) => `- [${t.priority}] ${t.title} (${t.status}) — ${t.owner || 'Unassigned'}, ${t.dept || 'No dept'}`).join('\n')}

INVENTORY ALERTS:
${context.inventoryAlerts.map((i: any) => `- ${i.sku} ${i.name}: ${i.onHand} on hand [${i.status}]`).join('\n')}

UNREAD NOTIFICATIONS (${context.unreadPulses.length}):
${context.unreadPulses.map((p: any) => `- [${p.type}] ${p.message}`).join('\n')}

RECENT ACTIVITY:
${context.recentActivity.slice(0, 5).map((a: any) => `- ${a.author}: ${a.content}`).join('\n')}

Respond concisely and actionably. When suggesting actions, be specific about what needs to happen and who should do it. Use bold for emphasis.`

    // If Anthropic API key is available, use Claude
    if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const messages = [
        ...history.map((h: any) => ({ role: h.role, content: h.content })),
        { role: 'user' as const, content: message },
      ]

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })

      const textContent = response.content.find((c: any) => c.type === 'text') as { text?: string } | undefined
      return res.json({ response: textContent?.text || 'No response generated.' })
    }

    // Fallback: generate a contextual response without API
    const fallbackResponse = generateFallbackBriefing(context)
    res.json({ response: fallbackResponse })
  } catch (error) {
    console.error('[ai] POST /chat error:', error)
    res.status(500).json({ error: 'AI chat failed' })
  }
})

// ─── Daily briefing ─────────────────────────────────────────
aiRoutes.get('/briefing', async (_req: Request, res: Response) => {
  try {
    const context = await gatherContext()

    if (process.env.ANTHROPIC_API_KEY) {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are NEXUS AI. Generate a concise morning briefing for an operations manager. Focus on: critical items needing attention, overdue tasks, inventory emergencies, and key updates. Use bullet points and bold for priorities.',
        messages: [{
          role: 'user',
          content: `Generate today's briefing based on this data:\n${JSON.stringify(context, null, 2)}`,
        }],
      })

      const textContent = response.content.find((c: any) => c.type === 'text') as { text?: string } | undefined
      return res.json({ briefing: textContent?.text || 'No briefing generated.' })
    }

    res.json({ briefing: generateFallbackBriefing(context) })
  } catch (error) {
    console.error('[ai] GET /briefing error:', error)
    res.status(500).json({ error: 'Failed to generate briefing' })
  }
})

// ─── Quick Actions ──────────────────────────────────────────

// Update overdue tasks
aiRoutes.post('/actions/update-overdue', async (_req: Request, res: Response) => {
  try {
    const now = new Date()
    const overdue = await prisma.task.findMany({
      where: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        dueDate: { lt: now },
      },
    })

    for (const task of overdue) {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS' },
      })
      await prisma.pulse.create({
        data: {
          type: 'ALERT',
          message: `Task "${task.title}" is overdue and has been escalated.`,
          deptName: 'Operations',
          targetId: task.ownerId || undefined,
        },
      })
    }

    res.json({ updated: overdue.length, tasks: overdue.map((t: any) => t.title) })
  } catch (error) {
    console.error('[ai] POST /actions/update-overdue error:', error)
    res.status(500).json({ error: 'Failed to update overdue tasks' })
  }
})

// Generate WOSR
aiRoutes.post('/actions/generate-wosr', async (_req: Request, res: Response) => {
  try {
    const context = await gatherContext()
    const wosr = `# Weekly Operations Status Report\n\n**Generated:** ${new Date().toLocaleDateString()}\n\n## Active Tasks: ${context.activeTasks.length}\n${context.activeTasks.map((t: any) => `- [${t.priority}] ${t.title} — ${t.status}`).join('\n')}\n\n## Inventory Alerts: ${context.inventoryAlerts.filter((i: any) => i.status === 'emergency' || i.status === 'critical').length}\n${context.inventoryAlerts.filter((i: any) => i.status === 'emergency' || i.status === 'critical').map((i: any) => `- ${i.name}: ${i.onHand} units [${i.status}]`).join('\n')}\n\n## Unread Notifications: ${context.unreadPulses.length}`

    res.json({ wosr })
  } catch (error) {
    console.error('[ai] POST /actions/generate-wosr error:', error)
    res.status(500).json({ error: 'Failed to generate WOSR' })
  }
})

// Trigger ERP sync
aiRoutes.post('/actions/sync-erp', async (_req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: 'ERP_KAREVE_SYNC' } })
    if (!integration) return res.status(404).json({ error: 'ERP integration not found' })

    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSyncAt: new Date(), syncCount: { increment: 1 } },
    })

    res.json({ success: true, message: 'ERP sync triggered' })
  } catch (error) {
    console.error('[ai] POST /actions/sync-erp error:', error)
    res.status(500).json({ error: 'Failed to trigger ERP sync' })
  }
})

// Escalate
aiRoutes.post('/actions/escalate', async (req: Request, res: Response) => {
  try {
    const { taskId, message } = req.body
    await prisma.pulse.create({
      data: {
        type: 'ALERT',
        message: message || 'Task escalated by NEXUS AI',
        deptName: 'Operations',
      },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[ai] POST /actions/escalate error:', error)
    res.status(500).json({ error: 'Failed to escalate' })
  }
})

// ─── Fallback briefing generator ────────────────────────────
function generateFallbackBriefing(context: any): string {
  const critical = context.activeTasks.filter((t: any) => t.priority === 'CRITICAL')
  const emergencies = context.inventoryAlerts.filter((i: any) => i.status === 'emergency')

  return `**Good morning — here's your NEXUS briefing.**

**Critical Tasks (${critical.length}):**
${critical.map((t: any) => `• **${t.title}** — ${t.status}, assigned to ${t.owner || 'Unassigned'}`).join('\n') || '• No critical tasks'}

**Inventory Emergencies (${emergencies.length}):**
${emergencies.map((i: any) => `• **${i.name}** — ${i.onHand} units on hand`).join('\n') || '• No emergencies'}

**Unread Notifications:** ${context.unreadPulses.length}
**Active Tasks:** ${context.activeTasks.length}

Ask me anything about your operations.`
}

// ─── Parse Brief from PDF/Word Document ──────────────────────
aiRoutes.post('/parse-brief-document', async (req: Request, res: Response) => {
  try {
    const { content, filename, mimeType } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Document content is required' })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const systemPrompt = `You are a document parser for KarEve Beauty Group's Nexus Collab system. Your job is to extract structured brief/PIB (Project Initiation Brief) data from uploaded PDF or Word documents.

Extract as many fields as possible from the document and return them as a JSON object matching this exact structure:

{
  "companyName": "string — company name, default 'KarEve, LLC'",
  "dateOfRequest": "string — YYYY-MM-DD format",
  "projectName": "string — product/project name",
  "brand": "string — must be one of: Carol's Daughter, Dermablend, Baxter of California, Ambi, AcneFree",
  "subBrand": "string",
  "contractManufacturer": "string — CM name",
  "projectObjective": "string — project goals/objective",
  "ingredients": "string — key ingredients mentioned",
  "targetAvailabilityDate": "string — YYYY-MM-DD",
  "targetFormulaDate": "string — YYYY-MM-DD",
  "targetStabilityDate": "string — YYYY-MM-DD",
  "targetScaleUpDate": "string — YYYY-MM-DD",
  "markets": ["array of strings — USA, Amazon, Canada, UK, Asia, Global, Other"],
  "targetRetailPrice": "string",
  "projectedAnnualVolume": "string",
  "moq": "string — minimum order quantity",
  "targetCostPerUnit": "string",
  "productDescription": "string",
  "consumerExperience": "string",
  "feel": "string — product texture/feel",
  "fragrance": "string",
  "appearance": "string",
  "restrictedIngredients": "string",
  "requestedIngredients": "string",
  "keyBenefits": "string",
  "copyClaims": "string — marketing claims",
  "clinicalClaims": "string",
  "typicalUsage": "string",
  "retailChain": "string — target retailers",
  "targetDemographics": "string",
  "intendedPackage": "string — primary packaging",
  "intendedClosure": "string",
  "packagingMaterial": "string",
  "labelType": "string",
  "labelArtwork": "string",
  "secondaryPackage": "string",
  "kitCombos": "string",
  "packagingCostPerUnit": "string",
  "casePackout": "string",
  "projectContacts": [{"name": "string", "role": "string", "email": "string"}],
  "teamMembers": [{"name": "string", "role": "string"}]
}

Rules:
- Only include fields you can confidently extract from the document
- For fields you cannot find, use empty string "" or empty array []
- Dates should be converted to YYYY-MM-DD format
- Brand MUST be one of the 5 listed brands if mentioned, otherwise empty string
- Return ONLY valid JSON — no preamble, no markdown, no explanation
- If the document doesn't appear to be a product brief, return { "error": "This document does not appear to be a product brief or PIB document", "confidence": 0 }
- Include a "confidence" field (0.0-1.0) indicating how confident you are this is a valid brief`

    const userMessage = `Parse the following document and extract all brief/PIB fields. The document is named "${filename || 'document'}" (${mimeType || 'unknown type'}).

DOCUMENT CONTENT:
${content}

Return the structured JSON.`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    let parsed
    try {
      parsed = JSON.parse(rawText)
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Failed to parse Claude response as JSON')
      }
    }

    if (parsed.error) {
      return res.status(422).json({ error: parsed.error, confidence: parsed.confidence || 0 })
    }

    res.json({
      briefData: parsed,
      confidence: parsed.confidence || 0.8,
      source: filename || 'uploaded document',
    })
  } catch (error: any) {
    console.error('[ai] POST /parse-brief-document error:', error)
    res.status(500).json({ error: error.message || 'Failed to parse document' })
  }
})
