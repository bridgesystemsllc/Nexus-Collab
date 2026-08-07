import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, FileBarChart, X } from 'lucide-react'
import * as client from '../api/projectsClient'
import { useModalBehaviour } from '../lib/useModalBehaviour'
import type { ReportSummary } from '../api/projectsClient'
import { useProjectScope } from '../context/ProjectScopeContext'
import { ReportViewer } from './ReportsPanel'
import { formatDate } from './ProjectCard'

// ─── Portfolio reports ───────────────────────────────────────
// The cross-project reports: a weekly status update, an executive rollup, and a
// per-department digest.
//
// Which one this offers is decided by scope, not by a dropdown. Inside a
// department you get that department's digest; from the portfolio view you get
// the rollup. Same component, different scope — the module is written once.

export function PortfolioReports({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { departmentId, isPortfolio, label } = useProjectScope()
  const [openId, setOpenId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Escape closes, Tab is trapped, focus returns to the opener.
  const dialogRef = useModalBehaviour(onClose)

  const listKey = ['projects', 'portfolio-reports', departmentId ?? 'all']
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () =>
      client.fetchPortfolioReports(departmentId ? { departmentId } : undefined),
  })

  const generate = useMutation({
    mutationFn: (reportType: 'STATUS_UPDATE' | 'EXECUTIVE_ROLLUP' | 'DEPARTMENT_DIGEST') =>
      client.generatePortfolioReport({
        reportType,
        ...(reportType === 'DEPARTMENT_DIGEST' && departmentId ? { departmentId } : {}),
      }),
    onSuccess: (res) => {
      setError(null)
      setOpenId(res.data.reportId)
      qc.invalidateQueries({ queryKey: listKey })
    },
    onError: (err: any) => setError(err?.message ?? 'Could not generate that report'),
  })

  const reports: ReportSummary[] = data?.data ?? []

  const options: { type: 'STATUS_UPDATE' | 'EXECUTIVE_ROLLUP' | 'DEPARTMENT_DIGEST'; label: string; blurb: string }[] =
    isPortfolio || !departmentId
      ? [
          { type: 'STATUS_UPDATE', label: 'Status update', blurb: 'What needs attention this week' },
          { type: 'EXECUTIVE_ROLLUP', label: 'Executive rollup', blurb: 'Health, slip and spend across the portfolio' },
        ]
      : [
          { type: 'DEPARTMENT_DIGEST', label: `${label} digest`, blurb: 'What this department owns and owes' },
          { type: 'STATUS_UPDATE', label: 'Status update', blurb: `Projects ${label} is on` },
        ]

  // Portalled for the same reason the report viewer is: an animated (and
  // therefore transformed) ancestor would capture `position: fixed`.
  return createPortal(
    <div
      className="projects-module fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Portfolio reports"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-xl rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Reports</h2>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
              {departmentId ? label : 'All departments'} · each report is a snapshot and never changes after it is made
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

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
              <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
              <span className="flex-1 text-[var(--text-primary)]">{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {options.map((o) => (
              <button
                key={o.type}
                onClick={() => { setError(null); generate.mutate(o.type) }}
                disabled={generate.isPending}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2.5 text-left hover:border-[var(--border-strong)] disabled:opacity-50 transition-colors"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                  <FileBarChart size={12} /> {o.label}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{o.blurb}</p>
              </button>
            ))}
          </div>
          {generate.isPending && (
            <p className="text-[11px] text-[var(--text-tertiary)]">Generating…</p>
          )}

          <section>
            <h3 className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5">Recent</h3>
            {isLoading ? (
              <p className="text-xs text-[var(--text-tertiary)]">Loading…</p>
            ) : reports.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)]">Nothing generated yet.</p>
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
                          {formatDate(r.createdAt)}
                          {r.project ? ` · ${r.project.projectNumber ?? r.project.title}` : ''}
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
        </div>
      </div>

      {openId && (
        <ReportViewer
          reportId={openId}
          onClose={() => setOpenId(null)}
          canPublish
          invalidateKey={listKey}
        />
      )}
    </div>,
    document.body,
  )
}
