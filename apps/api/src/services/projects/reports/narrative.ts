import type { ReportType } from './payload'

// ─── Report narrative drafting ───────────────────────────────
// Turns a report payload into a short written summary. The draft is always
// human-editable and is NEVER auto-published — §7 of the spec is explicit, and
// an exec brief that publishes itself is a liability rather than a feature.
//
// The model is given the payload and told not to restate it. The value of a
// narrative is the reading of the data — what moved, what slipped, who is
// blocked on whom — not a prose rendering of a table the reader can already see.

const MODEL = 'claude-opus-5'

export interface NarrativeResult {
  narrative: string | null
  /** Why no narrative was produced, when narrative is null. */
  skippedReason?: string
  model?: string
  usage?: { inputTokens: number; outputTokens: number }
}

export function isNarrativeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

const TONE_BY_TYPE: Record<ReportType, string> = {
  PROJECT_UPDATE:
    'You are briefing the project team and its sponsor on one initiative. Lead with whether it is on track.',
  STATUS_UPDATE:
    'You are briefing an operations director on a portfolio. Lead with what needs their attention this week.',
  EXECUTIVE_ROLLUP:
    'You are briefing an executive. Lead with the single most important thing. Be ruthless about length.',
  DEPARTMENT_DIGEST:
    'You are briefing one department on its own work. Lead with what that department owns and owes.',
  CLOSEOUT:
    'You are writing the closing summary of a finished project. Lead with whether it delivered what it set out to.',
}

const SYSTEM = `You draft the narrative section of an operations report for KarEve Beauty Group.

Write as an operations director briefing a colleague. Plain prose, no headings, no
bullet lists, no markdown. Two to four short paragraphs.

What to write:
- What actually moved this period, and what it means.
- What slipped, by how much, and the consequence.
- What is blocked and on whom — name the department, not just the task.
- What happens next period.

What NOT to write:
- Do not restate the data tables. The reader can already see the numbers; your
  job is the reading of them. Cite a figure only when it carries the point.
- No filler openings ("This report covers..."), no closing pleasantries, no
  recommendations the data does not support.
- Do not invent anything. If the payload does not say it, it did not happen.
- If the period was genuinely uneventful, say so in one sentence rather than
  padding it out.`

/**
 * Draft a narrative for a report payload.
 *
 * Never throws. A missing API key, a refusal, or an API failure returns
 * `narrative: null` with a reason — report generation must not fail because
 * the optional prose could not be written.
 */
export async function draftNarrative(
  reportType: ReportType,
  payload: unknown,
  opts: { title?: string } = {},
): Promise<NarrativeResult> {
  if (!isNarrativeConfigured()) {
    return { narrative: null, skippedReason: 'ANTHROPIC_API_KEY is not configured' }
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Narrative writing is a summarisation task, not a reasoning one; low
      // effort keeps latency and cost down without hurting the output.
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `${TONE_BY_TYPE[reportType]}\n\n` +
            `Report: ${opts.title ?? reportType}\n\n` +
            `Payload:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    })

    // A safety classifier can decline; the call still returns 200 with an
    // empty or partial content array, so stop_reason must be checked before
    // reading content.
    if (response.stop_reason === 'refusal') {
      return { narrative: null, skippedReason: 'The model declined to draft this narrative' }
    }

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (!text) {
      return { narrative: null, skippedReason: 'The model returned no text' }
    }

    return {
      narrative: text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  } catch (err: any) {
    // Drafting is best-effort. Log the cause and let the report generate
    // without prose rather than failing the whole request.
    console.error('[reports] narrative drafting failed:', err?.message ?? err)
    return {
      narrative: null,
      skippedReason: `Narrative could not be drafted: ${err?.message ?? 'unknown error'}`,
    }
  }
}

/**
 * Summarise a period's check-in responses into one paragraph plus a
 * deduplicated blocker list with owners (spec §7, job 2).
 */
export async function summariseCheckins(
  checkins: {
    department: string
    confidence?: string | null
    progress?: string | null
    blockers?: string | null
    needs?: string | null
  }[],
): Promise<{ summary: string | null; blockers: { blocker: string; owner: string }[]; skippedReason?: string }> {
  if (checkins.length === 0) {
    return { summary: null, blockers: [], skippedReason: 'No check-ins were answered this period' }
  }
  if (!isNarrativeConfigured()) {
    return { summary: null, blockers: [], skippedReason: 'ANTHROPIC_API_KEY is not configured' }
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: {
        effort: 'low',
        // Structured output, so the blocker list is machine-usable rather than
        // prose the UI would have to parse.
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              blockers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    blocker: { type: 'string' },
                    owner: { type: 'string' },
                  },
                  required: ['blocker', 'owner'],
                  additionalProperties: false,
                },
              },
            },
            required: ['summary', 'blockers'],
            additionalProperties: false,
          },
        },
      },
      system:
        'You consolidate departmental check-in responses. Write one short paragraph ' +
        'covering the period across all departments. Then list the distinct blockers — ' +
        'merge duplicates that are the same underlying problem reported by different ' +
        'departments, and attribute each to the department that must resolve it, not the ' +
        'one that reported it. Invent nothing.',
      messages: [
        { role: 'user', content: JSON.stringify(checkins, null, 2) },
      ],
    })

    if (response.stop_reason === 'refusal') {
      return { summary: null, blockers: [], skippedReason: 'The model declined this summary' }
    }

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Parse defensively: strip fences and fall back rather than throwing.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned)
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : null,
      blockers: Array.isArray(parsed.blockers)
        ? parsed.blockers.filter(
            (b: any) => typeof b?.blocker === 'string' && typeof b?.owner === 'string',
          )
        : [],
    }
  } catch (err: any) {
    console.error('[reports] check-in summary failed:', err?.message ?? err)
    return {
      summary: null,
      blockers: [],
      skippedReason: `Summary could not be generated: ${err?.message ?? 'unknown error'}`,
    }
  }
}
