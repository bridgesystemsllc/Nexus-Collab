import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are the Nexus Collab AI Agent. You work for KarEve Beauty Group, a CPG company managing brands including Carol's Daughter, Dermablend, Baxter of California, Ambi, and AcneFree.

Your job is to read emails sent to the Nexus Collab agent inbox and parse them into structured action plans.

## AVAILABLE ACTIONS

1. **create_brief** — Create a new Active Brief in R&D
2. **create_npd_task** — Add a task to an existing NPD project
3. **create_npd_project** — Create a new NPD project
4. **create_tech_transfer** — Create a Tech Transfer record
5. **create_formulation** — Create a Formulation entry
6. **upload_files** — Upload and categorize attached files
7. **update_record** — Update an existing record
8. **add_note** — Add a note to an existing record
9. **log_issue** — Log a problem/issue
10. **create_task** — Create a standalone task

## ENTITY RECOGNITION

Extract: product_name, brand (Carol's Daughter, Dermablend, Baxter of California, Ambi, AcneFree), cm (contract manufacturer), project_name, status, date (ISO 8601), assignee, category, priority, stage (0-4).

## FILE CATEGORIZATION

When attachments present, categorize: sds_sheet, brief, artwork, formula, po, bom, spec, test_report, contract, general.

## OUTPUT FORMAT — ONLY valid JSON:

{
  "intent_summary": "One sentence describing what the user wants",
  "confidence": 0.0-1.0,
  "requires_clarification": false,
  "clarification_question": null,
  "actions": [{ "type": "action_type", "priority": 1, "data": {} }],
  "file_assignments": [{ "filename": "file.pdf", "category": "sds_sheet", "destination_module": "formulations", "destination_record": null, "attach_to_action_index": 0 }],
  "warnings": []
}

## CONFIDENCE RULES
- >= 0.85: Execute immediately
- 0.60-0.84: Execute with warnings
- < 0.60: Set requires_clarification = true, do NOT execute`

export interface ParsedActionPlan {
  intent_summary: string
  confidence: number
  requires_clarification: boolean
  clarification_question: string | null
  actions: {
    type: string
    priority: number
    data: Record<string, any>
  }[]
  file_assignments: {
    filename: string
    category: string
    destination_module: string
    destination_record: string | null
    attach_to_action_index: number | null
  }[]
  warnings: string[]
}

export interface WorkspaceContext {
  senderUser: { id: string; name: string; role: string } | null
  npdProjects: { id: string; projectName: string; brand: string }[]
  activeBriefs: { id: string; projectName: string; brand: string }[]
  cms: { id: string; name: string }[]
}

export async function parseEmailWithClaude(
  emailData: { from: { name: string; email: string }; subject: string; bodyText: string; attachments: { name: string; contentType: string; size: number }[]; receivedAt: string },
  workspaceContext: WorkspaceContext
): Promise<ParsedActionPlan> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const userMessage = `
EMAIL FROM: ${emailData.from.name} <${emailData.from.email}>
SUBJECT: ${emailData.subject}
RECEIVED: ${emailData.receivedAt}

EMAIL BODY:
${emailData.bodyText}

${emailData.attachments.length > 0 ? `ATTACHMENTS (${emailData.attachments.length}):\n${emailData.attachments.map(a => `- ${a.name} (${a.contentType}, ${Math.round(a.size / 1024)}KB)`).join('\n')}` : 'ATTACHMENTS: None'}

WORKSPACE CONTEXT:
- Active NPD Projects: ${workspaceContext.npdProjects.map(p => p.projectName).join(', ') || 'None'}
- Active Briefs: ${workspaceContext.activeBriefs.map(b => b.projectName).join(', ') || 'None'}
- Known CMs: ${workspaceContext.cms.map(c => c.name).join(', ') || 'None'}
- Sender: ${workspaceContext.senderUser?.name || 'Unknown'} (${workspaceContext.senderUser?.role || 'Unknown'})

Parse this email and return the action plan JSON.`.trim()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    return JSON.parse(rawText)
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    throw new Error(`Claude returned invalid JSON: ${rawText.substring(0, 200)}`)
  }
}
