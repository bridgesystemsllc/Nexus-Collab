import type { ReportType } from './payload'

// ─── Report HTML ─────────────────────────────────────────────
// The emailed rendering of a stored payload. Shape-driven for the same reason
// the viewer and the PDF are: a report emailed in March must still render from
// its own payload after the builders have moved on, so nothing here may assume
// a field exists.
//
// Deliberately table-based with inline styles. Outlook ignores <style> blocks
// and most of flexbox; a layout that looks better in a browser and collapses in
// a mail client is worse than one that is plain everywhere.

const TYPE_LABELS: Record<ReportType, string> = {
  PROJECT_UPDATE: 'Project update',
  STATUS_UPDATE: 'Status update',
  EXECUTIVE_ROLLUP: 'Executive rollup',
  DEPARTMENT_DIGEST: 'Department digest',
  CLOSEOUT: 'Closeout',
}

const SECTION_TITLES: Record<string, string> = {
  topAtRisk: 'Needs attention',
  healthChanges: 'Health changed this period',
  milestonesNext30Days: 'Milestones — next 30 days',
  upcomingGates: 'Upcoming gates',
  overdueMilestones: 'Overdue milestones',
  blocked: 'Blocked',
  blockedAging: 'Blocked — longest first',
  inFlight: 'In flight',
  completedThisPeriod: 'Completed this period',
  openRisks: 'Open risks and issues',
  checkins: 'Check-ins',
  checkinCompliance: 'Check-in compliance',
  nextPeriodCommitments: 'Committed next period',
  topInitiatives: 'Top initiatives',
  deliverables: 'Deliverables',
  lessonsLearned: 'Lessons learned',
}

const SECTION_ORDER = Object.keys(SECTION_TITLES)
const SCALAR_GROUPS = ['header', 'counts', 'budget', 'slip', 'dates', 'delivery', 'timeline']
const HEADER_FIELDS = new Set(['reportType', 'generatedAt', 'period', 'scope'])

/** Email bodies are assembled from stored data; every value gets escaped. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function humanise(key: string): string {
  return SECTION_TITLES[key] ?? key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function display(value: unknown): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.length ? value.map(display).join(', ') : '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function asDistribution(value: unknown): { key: string; count: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every(
    (v) => v && typeof v === 'object' && 'key' in v && 'count' in v && Object.keys(v).length === 2,
  )
    ? (value as { key: string; count: number }[])
    : null
}

export interface ReportEmailInput {
  title: string
  reportType: ReportType
  narrative?: string | null
  payload: Record<string, any>
  /** Deep link back into Nexus, so the email is an alert rather than the archive. */
  viewUrl?: string | null
}

export function renderReportEmail(input: ReportEmailInput): string {
  const p = input.payload ?? {}
  const parts: string[] = []

  const period = p.period?.start && p.period?.end ? `${p.period.start} — ${p.period.end}` : null
  const subtitle = [TYPE_LABELS[input.reportType] ?? input.reportType, period, p.scope]
    .filter(Boolean)
    .join(' · ')

  parts.push(`
    <h1 style="margin:0 0 4px;font:600 20px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
      ${escapeHtml(input.title)}
    </h1>
    <p style="margin:0 0 20px;font:400 12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#888">
      ${escapeHtml(subtitle)}
    </p>`)

  if (input.narrative) {
    const paragraphs = input.narrative
      .split(/\n{2,}/)
      .map((t) => `<p style="margin:0 0 10px">${escapeHtml(t)}</p>`)
      .join('')
    parts.push(`
      <div style="font:400 14px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2a2a2a;margin-bottom:20px">
        ${paragraphs}
      </div>`)
  }

  // ── Headline figures ──
  const facts: [string, string][] = []
  const collect = (obj: Record<string, any>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue
      const dist = asDistribution(value)
      if (dist) {
        facts.push([humanise(key), dist.map((d) => `${d.key} ${d.count}`).join(' · ')])
        continue
      }
      if (Array.isArray(value)) continue
      if (typeof value === 'object') collect(value, `${prefix} · ${humanise(key)}`)
      else facts.push([`${prefix} · ${humanise(key)}`, display(value)])
    }
  }
  for (const group of SCALAR_GROUPS) {
    if (p[group] && typeof p[group] === 'object') collect(p[group], humanise(group))
  }
  for (const [key, value] of Object.entries(p)) {
    if (HEADER_FIELDS.has(key) || SCALAR_GROUPS.includes(key) || value == null) continue
    const dist = asDistribution(value)
    if (dist) facts.push([humanise(key), dist.map((d) => `${d.key} ${d.count}`).join(' · ')])
    else if (!Array.isArray(value) && typeof value !== 'object') facts.push([humanise(key), display(value)])
  }

  if (facts.length > 0) {
    parts.push(`
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:24px">
        ${facts.map(([label, value]) => `
          <tr>
            <td style="padding:5px 0;border-bottom:1px solid #eee;font:400 12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#888">${escapeHtml(label)}</td>
            <td style="padding:5px 0;border-bottom:1px solid #eee;font:500 12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a;text-align:right">${escapeHtml(value)}</td>
          </tr>`).join('')}
      </table>`)
  }

  // ── Tables ──
  const arrayKeys = Object.keys(p).filter(
    (k) => Array.isArray(p[k]) && p[k].length > 0 && !asDistribution(p[k]),
  )
  const ordered = [
    ...SECTION_ORDER.filter((k) => arrayKeys.includes(k)),
    ...arrayKeys.filter((k) => !SECTION_ORDER.includes(k)),
  ]

  for (const key of ordered) {
    const rows: Record<string, unknown>[] = []
    for (const item of p[key] as unknown[]) {
      if (item && typeof item === 'object' && Array.isArray((item as any).tasks)) {
        const group = (item as any).department ?? (item as any).name ?? ''
        for (const t of (item as any).tasks) rows.push({ group, ...(t as object) })
      } else if (item && typeof item === 'object') {
        rows.push(item as Record<string, unknown>)
      } else {
        rows.push({ value: item })
      }
    }
    if (rows.length === 0) continue

    const columns: string[] = []
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (k !== 'id' && !k.endsWith('Id') && !columns.includes(k)) columns.push(k)
      }
    }
    if (columns.length === 0) continue

    parts.push(`
      <h2 style="margin:0 0 6px;font:600 13px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1a1a1a">
        ${escapeHtml(humanise(key))}
      </h2>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-bottom:22px">
        <tr>${columns.map((c) => `
          <th style="padding:6px 8px;background:#1a1a1a;color:#fff;font:600 11px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-align:left;white-space:nowrap">${escapeHtml(humanise(c))}</th>`).join('')}
        </tr>
        ${rows.map((row, i) => `
        <tr style="background:${i % 2 ? '#fafafa' : '#fff'}">${columns.map((c) => `
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font:400 11px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2a2a2a;vertical-align:top">${escapeHtml(display(row[c]))}</td>`).join('')}
        </tr>`).join('')}
      </table>`)
  }

  if (input.viewUrl) {
    parts.push(`
      <p style="margin:8px 0 0">
        <a href="${escapeHtml(input.viewUrl)}" style="display:inline-block;padding:9px 16px;border-radius:8px;background:#1a1a1a;color:#fff;font:500 12px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;text-decoration:none">
          Open in Nexus
        </a>
      </p>`)
  }

  parts.push(`
    <p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #eee;font:400 11px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#aaa">
      Sent by Nexus. This report is a snapshot — its figures will not change.
    </p>`)

  return `<div style="max-width:720px;margin:0 auto;padding:24px;background:#fff">${parts.join('')}</div>`
}
