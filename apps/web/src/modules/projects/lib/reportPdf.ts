import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Report PDF ──────────────────────────────────────────────
// Rendered from the stored payload, never from live queries. Exporting a
// report published in March must produce March's numbers.
//
// The renderer is payload-shape-driven rather than report-type-driven: it walks
// the payload and renders whatever sections it finds. A new field added to a
// builder shows up in the PDF without a second edit here — and, more
// importantly, an old payload missing a field the current builder emits still
// renders instead of throwing.

const MARGIN = 14
const ACCENT: [number, number, number] = [26, 26, 26]

// Sections in the order a reader wants them, whichever report type this is.
// Anything not listed still renders, after these, in payload order.
const SECTION_ORDER = [
  'topAtRisk', 'healthChanges', 'timeline', 'milestonesNext30Days', 'upcomingGates',
  'overdueMilestones', 'blocked', 'blockedAging', 'inFlight', 'completedThisPeriod',
  'openRisks', 'checkins', 'checkinCompliance', 'nextPeriodCommitments',
  'topInitiatives', 'deliverables', 'lessonsLearned',
]

// Objects whose scalar fields belong in the headline block rather than a table.
const SCALAR_GROUPS = ['header', 'counts', 'budget', 'slip', 'dates', 'delivery', 'timeline']

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

function humanise(key: string): string {
  return SECTION_TITLES[key] ?? key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function cell(value: unknown): string {
  if (value == null) return '—'
  if (Array.isArray(value)) return value.map((v) => cell(v)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** `[{ key, count }]` — a distribution, rendered as one line rather than a table. */
function asDistribution(value: unknown): { key: string; count: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every(
    (v) => v && typeof v === 'object' && 'key' in v && 'count' in v && Object.keys(v).length === 2,
  )
    ? (value as { key: string; count: number }[])
    : null
}

/** Rows may not all share keys; the union keeps a column that only some rows have. */
function columnsOf(rows: Record<string, unknown>[]): string[] {
  const seen: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!seen.includes(key)) seen.push(key)
  }
  // Identifiers are useless in a printed report and eat a column each.
  return seen.filter((k) => k !== 'id' && !k.endsWith('Id'))
}

export interface ReportPdfInput {
  title: string
  reportType: string
  narrative?: string | null
  payload: Record<string, any>
  generatedAt?: string | null
  isPublished?: boolean
}

export function exportReportPdf(input: ReportPdfInput): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = MARGIN

  // ── Header ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(...ACCENT)
  const titleLines = doc.splitTextToSize(input.title, pageWidth - MARGIN * 2)
  doc.text(titleLines, MARGIN, y)
  y += titleLines.length * 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(120)
  const period = input.payload?.period
  const meta = [
    input.reportType.replace(/_/g, ' ').toLowerCase(),
    period?.start && period?.end ? `${period.start} to ${period.end}` : null,
    input.payload?.scope ?? null,
    // The generation time comes from the payload, not the clock — an export is
    // stamped with when the report was made, not when it was printed.
    input.generatedAt ? `generated ${String(input.generatedAt).slice(0, 10)}` : null,
    input.isPublished ? 'published' : 'draft',
  ].filter(Boolean).join('  ·  ')
  doc.text(meta, MARGIN, y)
  y += 5

  doc.setDrawColor(210)
  doc.line(MARGIN, y, pageWidth - MARGIN, y)
  y += 7

  // ── Narrative ──
  if (input.narrative) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40)
    const lines = doc.splitTextToSize(input.narrative, pageWidth - MARGIN * 2)
    // Paginate the narrative rather than letting it run off the page.
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(line, MARGIN, y)
      y += 5
    }
    y += 4
  }

  // ── Headline figures ──
  // Distributions ([{key, count}], what the builders' countBy emits) are folded
  // into this block as one line each. They arrive nested inside `counts`, where
  // a plain scalar walk would drop them and the PDF would silently omit the
  // status and health breakdowns entirely.
  const scalars: [string, string][] = []
  const collectScalars = (obj: Record<string, any>, prefix = '') => {
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'period' || key === 'reportType' || key === 'generatedAt') continue
      if (value == null) continue
      const dist = asDistribution(value)
      if (dist) {
        scalars.push([humanise(key), dist.map((d) => `${d.key} ${d.count}`).join(' · ')])
        continue
      }
      if (Array.isArray(value)) continue
      if (typeof value === 'object') {
        collectScalars(value, prefix ? `${prefix} · ${humanise(key)}` : humanise(key))
      } else {
        scalars.push([prefix ? `${prefix} · ${humanise(key)}` : humanise(key), cell(value)])
      }
    }
  }
  for (const group of SCALAR_GROUPS) {
    if (input.payload?.[group] && typeof input.payload[group] === 'object') {
      collectScalars(input.payload[group], humanise(group))
    }
  }
  // Top-level fields that are not in a named group — healthDistribution and
  // onTimeMilestonePercent on the exec rollup. Without this pass they would be
  // in the stored payload but absent from every rendering of it.
  const HEADER_FIELDS = new Set(['reportType', 'generatedAt', 'period', 'scope'])
  for (const [key, value] of Object.entries(input.payload ?? {})) {
    if (HEADER_FIELDS.has(key) || SCALAR_GROUPS.includes(key) || value == null) continue
    const dist = asDistribution(value)
    if (dist) {
      scalars.push([humanise(key), dist.map((d) => `${d.key} ${d.count}`).join(' · ')])
    } else if (!Array.isArray(value) && typeof value !== 'object') {
      scalars.push([humanise(key), cell(value)])
    }
  }

  if (scalars.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['', '']],
      body: scalars,
      theme: 'plain',
      showHead: false,
      styles: { fontSize: 8.5, cellPadding: 1.2, textColor: 40 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 62, textColor: 90 } },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Tables ──
  const arrayKeys = Object.keys(input.payload ?? {}).filter(
    (k) =>
      Array.isArray(input.payload[k]) &&
      input.payload[k].length > 0 &&
      // Already rendered as a one-line distribution above.
      !asDistribution(input.payload[k]),
  )
  const ordered = [
    ...SECTION_ORDER.filter((k) => arrayKeys.includes(k)),
    ...arrayKeys.filter((k) => !SECTION_ORDER.includes(k)),
  ]

  for (const key of ordered) {
    const raw = input.payload[key] as unknown[]

    // A grouped section ({ department, tasks: [...] }) flattens into one table
    // with the group as a leading column, rather than one table per group.
    const rows: Record<string, unknown>[] = []
    for (const item of raw) {
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

    const columns = columnsOf(rows)
    if (columns.length === 0) continue

    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = MARGIN
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...ACCENT)
    doc.text(humanise(key), MARGIN, y)
    y += 3

    autoTable(doc, {
      startY: y,
      head: [columns.map(humanise)],
      body: rows.map((r) => columns.map((c) => cell(r[c]))),
      theme: 'striped',
      headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
      styles: { fontSize: 7.5, cellPadding: 1.6, textColor: 40, overflow: 'linebreak' },
      margin: { left: MARGIN, right: MARGIN },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(160)
    doc.text(
      `Nexus · ${input.title}`,
      MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    )
    doc.text(
      `${i} / ${pages}`,
      pageWidth - MARGIN,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' },
    )
  }

  const safe = input.title.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-').slice(0, 80)
  doc.save(`${safe}.pdf`)
}
