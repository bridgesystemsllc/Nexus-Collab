import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Download, FileText, Send, Sparkles, Check, X, Pencil,
} from 'lucide-react'
import * as client from '../api/projectsClient'
import type { ReportSummary } from '../api/projectsClient'
import { exportReportPdf } from '../lib/reportPdf'
import { formatDate } from './ProjectCard'

// ─── Reports ─────────────────────────────────────────────────
// Everything on this screen reads the stored payload. Nothing here recomputes a
// report — reopening one from March must show March's numbers, and the only way
// to guarantee that is to never look at live data on this path.
//
// The AI narrative is a draft. It arrives editable and unpublished, and
// publishing is a separate deliberate click, because a report that mails itself
// out is a liability rather than a feature.

interface Props {
  projectId: string
  projectStatus: string
  canGenerate: boolean
}

const TYPE_LABELS: Record<string, string> = {
  PROJECT_UPDATE: 'Project update',
  STATUS_UPDATE: 'Status update',
  EXECUTIVE_ROLLUP: 'Executive rollup',
  DEPARTMENT_DIGEST: 'Department digest',
  CLOSEOUT: 'Closeout',
}

export function ReportsPanel({ projectId, projectStatus, canGenerate }: Props) {
  const qc = useQueryClient()
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'reports', projectId],
    queryFn: () => client.fetchProjectReports(projectId),
  })

  const generate = useMutation({
    mutationFn: (reportType: 'PROJECT_UPDATE' | 'CLOSEOUT') =>
      client.generateProjectReport(projectId, { reportType }),
    onSuccess: (res) => {
      setError(null)
      setOpenId(res.data.reportId)
      qc.invalidateQueries({ queryKey: ['projects', 'reports', projectId] })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not generate that report'),
  })

  const reports: ReportSummary[] = data?.data ?? []
  const narrativeAvailable = (data?.meta as any)?.narrativeAvailable !== false
  const closeoutAllowed = projectStatus === 'COMPLETED' || projectStatus === 'ARCHIVED'

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">Loading reports…</p>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <span className="flex-1 text-[var(--text-primary)]">{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
        </div>
      )}

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-xs font-medium text-[var(--text-primary)]">Reports</h3>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              Each report is a snapshot. Once generated, its numbers never change —
              reopen one next quarter and it still says what it said today.
            </p>
          </div>
          {canGenerate && (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => { setError(null); generate.mutate('PROJECT_UPDATE') }}
                disabled={generate.isPending}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                style={{ background: 'var(--accent-secondary)' }}
              >
                <FileText size={11} />
                {generate.isPending ? 'Generating…' : 'New update'}
              </button>
              <button
                onClick={() => { setError(null); generate.mutate('CLOSEOUT') }}
                disabled={generate.isPending || !closeoutAllowed}
                title={closeoutAllowed ? undefined : 'Available once the project is completed'}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:hover:text-[var(--text-secondary)] transition-colors"
              >
                Closeout
              </button>
            </div>
          )}
        </div>

        {!narrativeAvailable && (
          <p className="mb-3 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
            <Sparkles size={11} />
            Written summaries are off — no Anthropic API key is configured. Reports still
            generate with full data.
          </p>
        )}

        {reports.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">
            No reports yet.{canGenerate ? ' Generate one to capture where the project stands right now.' : ''}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setOpenId(r.id)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-left hover:border-[var(--border-strong)] transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">{r.title}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">
                      {TYPE_LABELS[r.reportType] ?? r.reportType}
                      {r.periodStart && r.periodEnd ? ` · ${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` : ''}
                      {r.generatedByUser ? ` · ${r.generatedByUser.name}` : ''}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={
                      r.isPublished
                        ? { background: 'rgba(50,215,75,0.12)', color: 'var(--success)' }
                        : { background: 'var(--bg-overlay)', color: 'var(--text-tertiary)' }
                    }
                  >
                    {r.isPublished ? 'Published' : 'Draft'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openId && (
        <ReportViewer
          reportId={openId}
          onClose={() => setOpenId(null)}
          canPublish={canGenerate}
          invalidateKey={['projects', 'reports', projectId]}
        />
      )}
    </div>
  )
}

// ─── Viewer ──────────────────────────────────────────────────

export function ReportViewer({
  reportId, onClose, canPublish, invalidateKey,
}: {
  reportId: string
  onClose: () => void
  canPublish: boolean
  invalidateKey: unknown[]
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['projects', 'report', reportId],
    queryFn: () => client.fetchReport(reportId),
  })
  const report = data?.data

  const saveNarrative = useMutation({
    mutationFn: (text: string) => client.updateReportNarrative(reportId, text),
    onSuccess: () => {
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['projects', 'report', reportId] })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not save'),
  })

  const publish = useMutation({
    mutationFn: () => client.publishReport(reportId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', 'report', reportId] })
      qc.invalidateQueries({ queryKey: invalidateKey })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not publish'),
  })

  // Portalled to the body on purpose. The detail view animates its tab panel
  // with a transform, and a transformed ancestor makes `position: fixed`
  // resolve against that ancestor instead of the viewport — the modal lands
  // inside the panel rather than over the page.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading || !report ? (
          <p className="p-10 text-center text-sm text-[var(--text-tertiary)]">Loading report…</p>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">{report.title}</h2>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                  {TYPE_LABELS[report.reportType] ?? report.reportType}
                  {report.periodStart && report.periodEnd
                    ? ` · ${formatDate(report.periodStart)} – ${formatDate(report.periodEnd)}`
                    : ''}
                  {' · '}
                  {report.isPublished
                    ? `published ${formatDate(report.publishedAt ?? report.createdAt)}`
                    : 'draft'}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-overlay)] transition-colors"
              >
                <X size={15} />
              </button>
            </header>

            <div className="max-h-[65vh] overflow-y-auto px-5 py-4 space-y-5">
              {error && (
                <div role="alert" className="rounded-lg px-3 py-2 text-xs text-[var(--text-primary)]" style={{ background: 'rgba(255,69,58,0.08)' }}>
                  {error}
                </div>
              )}

              {/* Narrative */}
              <section>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <h3 className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    <Sparkles size={11} /> Summary
                  </h3>
                  {canPublish && !report.isPublished && !editing && (
                    <button
                      onClick={() => { setDraft(report.narrative ?? ''); setEditing(true) }}
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <Pencil size={10} /> Edit
                    </button>
                  )}
                </div>

                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={8}
                      className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-xs text-[var(--text-primary)] leading-relaxed focus:outline-none focus:border-[var(--border-strong)]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveNarrative.mutate(draft)}
                        disabled={saveNarrative.isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-50"
                        style={{ background: 'var(--accent-secondary)' }}
                      >
                        <Check size={11} /> {saveNarrative.isPending ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : report.narrative ? (
                  <div className="space-y-2 text-xs leading-relaxed text-[var(--text-primary)]">
                    {report.narrative.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-tertiary)]">
                    No written summary — the data below is the report.
                  </p>
                )}
              </section>

              <PayloadView payload={report.payload} />
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-5 py-3">
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    exportReportPdf({
                      title: report.title,
                      reportType: report.reportType,
                      narrative: report.narrative,
                      payload: report.payload,
                      generatedAt: report.payload?.generatedAt ?? report.createdAt,
                      isPublished: report.isPublished,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <Download size={11} /> PDF
                </button>
                <a
                  href={client.reportExportUrl(report.id, 'csv')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                >
                  <Download size={11} /> CSV
                </a>
              </div>
              {canPublish && !report.isPublished && (
                <button
                  onClick={() => { setError(null); publish.mutate() }}
                  disabled={publish.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: 'var(--accent-secondary)' }}
                >
                  <Send size={11} /> {publish.isPending ? 'Publishing…' : 'Publish'}
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// ─── Payload rendering ───────────────────────────────────────
// Driven by the payload's shape, not by the report type. An old snapshot
// missing a field the current builder emits still renders, which is the point
// of storing the payload rather than a rendered document.

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

/**
 * `[{ key, count }]` — what the builders' countBy produces. Worth detecting
 * because a two-column "Key / Count" table is a poor way to show a
 * distribution, and because these arrive nested inside `counts`, where a naive
 * scalar walk drops them entirely.
 */
function asDistribution(value: unknown): { key: string; count: number }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.every(
    (v) => v && typeof v === 'object' && 'key' in v && 'count' in v && Object.keys(v).length === 2,
  )
    ? (value as { key: string; count: number }[])
    : null
}

function PayloadView({ payload }: { payload: Record<string, any> }) {
  if (!payload) return null

  const facts: [string, string][] = []
  const distributions: [string, { key: string; count: number }[]][] = []

  const collect = (obj: Record<string, any>, prefix: string) => {
    for (const [key, value] of Object.entries(obj)) {
      if (value == null) continue
      const dist = asDistribution(value)
      if (dist) { distributions.push([humanise(key), dist]); continue }
      if (Array.isArray(value)) continue
      if (typeof value === 'object') collect(value, `${prefix} · ${humanise(key)}`)
      else facts.push([`${prefix} · ${humanise(key)}`, display(value)])
    }
  }
  for (const group of SCALAR_GROUPS) {
    if (payload[group] && typeof payload[group] === 'object') collect(payload[group], humanise(group))
  }

  // Top-level scalars that live outside a named group — onTimeMilestonePercent
  // on the exec rollup. Without this they are in the stored payload but never
  // shown, which is the one failure mode a snapshot viewer cannot have.
  const HEADER_FIELDS = new Set(['reportType', 'generatedAt', 'period', 'scope'])
  for (const [key, value] of Object.entries(payload)) {
    if (HEADER_FIELDS.has(key) || SCALAR_GROUPS.includes(key) || value == null) continue
    if (Array.isArray(value) || typeof value === 'object') continue
    facts.push([humanise(key), display(value)])
  }

  const arrayKeys = Object.keys(payload).filter((k) => {
    if (!Array.isArray(payload[k]) || payload[k].length === 0) return false
    const dist = asDistribution(payload[k])
    if (dist) { distributions.push([humanise(k), dist]); return false }
    return true
  })
  const ordered = [
    ...SECTION_ORDER.filter((k) => arrayKeys.includes(k)),
    ...arrayKeys.filter((k) => !SECTION_ORDER.includes(k)),
  ]

  return (
    <div className="space-y-5">
      {distributions.length > 0 && (
        <section className="flex flex-wrap gap-x-6 gap-y-2">
          {distributions.map(([label, rows]) => (
            <div key={label}>
              <p className="text-[11px] font-medium text-[var(--text-secondary)] mb-1">{label}</p>
              <div className="flex flex-wrap gap-1.5">
                {rows.map((r) => (
                  <span
                    key={r.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]"
                  >
                    {r.key.replace(/_/g, ' ').toLowerCase()}
                    <b className="text-[var(--text-primary)] tabular-nums">{r.count}</b>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {facts.length > 0 && (
        <section>
          <h3 className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">At a glance</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            {facts.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3 border-b border-[var(--border-subtle)] py-1">
                <dt className="text-[11px] text-[var(--text-tertiary)] truncate">{label}</dt>
                <dd className="text-[11px] text-[var(--text-primary)] tabular-nums text-right">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {ordered.map((key) => {
        const rows: Record<string, unknown>[] = []
        for (const item of payload[key] as unknown[]) {
          if (item && typeof item === 'object' && Array.isArray((item as any).tasks)) {
            const group = (item as any).department ?? (item as any).name ?? ''
            for (const t of (item as any).tasks) rows.push({ group, ...(t as object) })
          } else if (item && typeof item === 'object') {
            rows.push(item as Record<string, unknown>)
          } else {
            rows.push({ value: item })
          }
        }
        if (rows.length === 0) return null

        const columns: string[] = []
        for (const row of rows) {
          for (const k of Object.keys(row)) {
            if (k !== 'id' && !k.endsWith('Id') && !columns.includes(k)) columns.push(k)
          }
        }
        if (columns.length === 0) return null

        return (
          <section key={key}>
            <h3 className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">
              {humanise(key)}
              <span className="ml-1.5 text-[var(--text-tertiary)] font-normal">{rows.length}</span>
            </h3>
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-overlay)]">
                    {columns.map((c) => (
                      <th key={c} className="px-2.5 py-1.5 text-left font-medium text-[var(--text-tertiary)] whitespace-nowrap">
                        {humanise(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0">
                      {columns.map((c) => (
                        <td key={c} className="px-2.5 py-1.5 text-[var(--text-primary)] tabular-nums align-top">
                          {display(row[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
