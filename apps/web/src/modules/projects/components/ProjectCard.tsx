import { AlertTriangle, Lock, CalendarDays } from 'lucide-react'
import { HealthDot } from './HealthRing'
import { DepartmentLaneChips } from './DepartmentLaneChips'
import { STATUS_LABELS, PRIORITY_COLORS, toPercent, type ProjectSummary } from '../types'

// ─── Project card ────────────────────────────────────────────
// The card and the table row show the same facts; this is the scannable
// version. Slip is surfaced as a badge rather than buried in a date, because
// "12 days late" is the thing an operator reacts to.

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  // The whole app operates on America/New_York; rendering in the viewer's
  // local zone would show a different date to a colleague on a call.
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  })
}

export function slipDays(project: ProjectSummary): number {
  if (!project.baselineEndDate || !project.targetEndDate) return 0
  const base = new Date(project.baselineEndDate).getTime()
  const target = new Date(project.targetEndDate).getTime()
  if (!Number.isFinite(base) || !Number.isFinite(target)) return 0
  const days = Math.round((target - base) / 86_400_000)
  return days > 0 ? days : 0
}

export function SlipBadge({ days }: { days: number }) {
  if (days <= 0) return null
  // Past a fortnight the slip is no longer a wobble; colour it accordingly.
  const tone = days > 14 ? 'var(--danger)' : 'var(--warning)'
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
      style={{ background: `${tone}14`, color: tone }}
      title={`Target end date is ${days} day${days === 1 ? '' : 's'} past the approved baseline`}
    >
      +{days}d
    </span>
  )
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--bg-overlay)] overflow-hidden">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(0, Math.min(100, percent))}%`,
          background: 'var(--accent-secondary)',
        }}
      />
    </div>
  )
}

export function ProjectCard({
  project,
  onOpen,
  highlightDepartmentId,
}: {
  project: ProjectSummary
  onOpen: (id: string) => void
  highlightDepartmentId?: string
}) {
  const percent = toPercent(project.percentComplete)
  const slip = slipDays(project)
  const openBlockers = project._count?.risks ?? 0

  return (
    <button
      onClick={() => onOpen(project.id)}
      className="group text-left w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 transition-all duration-200 hover:border-[var(--border-strong)] hover:shadow-md active:scale-[0.995]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
              {project.projectNumber ?? '—'}
            </span>
            {project.isConfidential && (
              <Lock size={11} className="text-[var(--text-tertiary)]" aria-label="Confidential" />
            )}
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: PRIORITY_COLORS[project.priority] }}
              title={`${project.priority.toLowerCase()} priority`}
            />
          </div>
          <p className="font-medium text-sm text-[var(--text-primary)] leading-snug line-clamp-2">
            {project.title}
          </p>
          {project.projectType && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{project.projectType.label}</p>
          )}
        </div>
        <HealthDot band={project.healthBand} score={project.health} />
      </div>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-tertiary)]">{STATUS_LABELS[project.status] ?? project.status}</span>
          <span className="tabular-nums text-[var(--text-secondary)] font-medium">{percent}%</span>
        </div>
        <ProgressBar percent={percent} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <DepartmentLaneChips
          departments={project.departments}
          max={3}
          highlightDepartmentId={highlightDepartmentId}
        />
        <div className="flex items-center gap-2 shrink-0">
          {openBlockers > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[11px] text-[var(--warning)]"
              title={`${openBlockers} open risk${openBlockers === 1 ? '' : 's'}`}
            >
              <AlertTriangle size={11} />
              {openBlockers}
            </span>
          )}
          <SlipBadge days={slip} />
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] whitespace-nowrap">
            <CalendarDays size={11} />
            {formatDate(project.targetEndDate)}
          </span>
        </div>
      </div>
    </button>
  )
}
