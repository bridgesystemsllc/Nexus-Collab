import { useState } from 'react'
import {
  ArrowLeft, CalendarDays, Users, Target, FileText, Activity as ActivityIcon,
  GitBranch, Lock, Share2,
} from 'lucide-react'
import { useProject, useProjectHealth, useTasks, useProjectTimeline } from '../hooks/useProjects'
import { useProjectScope } from '../context/ProjectScopeContext'
import { HealthRing } from '../components/HealthRing'
import { DepartmentLaneChips } from '../components/DepartmentLaneChips'
import { TaskBoard } from '../components/TaskBoard'
import { TimelineGantt } from '../components/TimelineGantt'
import { ProgressBar, SlipBadge, formatDate, slipDays } from '../components/ProjectCard'
import { STATUS_LABELS, toPercent, type ProjectTask } from '../types'

// ─── Project detail ──────────────────────────────────────────
// The same component under every scope. In a collab it gains a "shared via"
// banner and pre-filters to the viewer's lane; nothing else differs, because a
// second copy of this screen is exactly what the module must not have.

type Tab = 'overview' | 'tasks' | 'timeline' | 'activity'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', icon: Target },
  { key: 'tasks', label: 'Tasks', icon: GitBranch },
  { key: 'timeline', label: 'Timeline', icon: CalendarDays },
  { key: 'activity', label: 'Activity', icon: ActivityIcon },
]

export function ProjectDetailView({
  projectId, onBack, currentMemberId,
}: { projectId: string; onBack: () => void; currentMemberId?: string | null }) {
  const { isCollab, label: scopeLabel, departmentId } = useProjectScope()
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null)

  const { data: project, isLoading, isError, error } = useProject(projectId)
  const { data: health } = useProjectHealth(projectId)
  // In a department scope, default the board to that department's lane — the
  // user came here from their own tab and wants their own work first.
  const { data: tasks = [] } = useTasks(projectId)
  // Only fetched once the Timeline tab is opened; it is the heaviest payload
  // on this screen and most visits never look at it.
  const { data: timeline, isLoading: timelineLoading } = useProjectTimeline(
    tab === 'timeline' ? projectId : null,
  )

  if (isLoading) return <DetailSkeleton onBack={onBack} />
  if (isError || !project) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <div className="rounded-xl border border-[var(--border-subtle)] py-12 text-center">
          <p className="text-sm text-[var(--text-primary)]">Could not load this project</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {(error as any)?.message ?? 'It may have been deleted, or you may not have access.'}
          </p>
        </div>
      </div>
    )
  }

  const percent = toPercent(project.percentComplete)
  const slip = slipDays(project)
  const laneTasks = departmentId ? tasks.filter((t) => t.departmentId === departmentId) : tasks

  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />

      {isCollab && (
        <div
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'var(--accent-secondary-light)', color: 'var(--accent-secondary)' }}
        >
          <Share2 size={13} />
          Shared via {scopeLabel}
        </div>
      )}

      {/* Persistent header */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-start gap-4">
          <HealthRing
            score={health?.score ?? project.health}
            band={health?.band ?? project.healthBand}
            penalties={health?.penalties ?? []}
            size={64}
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs text-[var(--text-tertiary)]">
                {project.projectNumber ?? '—'}
              </span>
              <span className="badge badge-info">{STATUS_LABELS[project.status] ?? project.status}</span>
              {project.isConfidential && (
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                  <Lock size={10} /> Confidential
                </span>
              )}
            </div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-snug">
              {project.title}
            </h1>
            {project.projectType && (
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{project.projectType.label}</p>
            )}

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Progress">
                <div className="flex items-center gap-2">
                  <ProgressBar percent={percent} />
                  <span className="tabular-nums text-xs font-medium text-[var(--text-primary)]">{percent}%</span>
                </div>
              </Metric>
              <Metric label="Target end">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-primary)]">
                  {formatDate(project.targetEndDate)}
                  <SlipBadge days={slip} />
                </span>
              </Metric>
              <Metric label="Project manager">
                <span className="text-xs text-[var(--text-primary)]">
                  {project.projectManager?.name ?? 'Unassigned'}
                </span>
              </Metric>
              <Metric label="Tasks">
                <span className="tabular-nums text-xs text-[var(--text-primary)]">
                  {project._count?.tasks ?? tasks.length}
                </span>
              </Metric>
            </div>

            <div className="mt-3">
              <DepartmentLaneChips
                departments={project.departments}
                max={6}
                highlightDepartmentId={departmentId}
                size="md"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit max-w-full overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? 'text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
              style={active ? { background: 'var(--accent-secondary)' } : undefined}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="stagger">
        {tab === 'overview' && <OverviewTab project={project} health={health} />}
        {tab === 'tasks' && (
          <TaskBoard
            projectId={projectId}
            tasks={departmentId && laneTasks.length > 0 ? tasks : tasks}
            onOpenTask={setSelectedTask}
            currentMemberId={currentMemberId}
          />
        )}
        {tab === 'timeline' && (
          <TimelineGantt
            data={timeline?.data}
            isLoading={timelineLoading}
            // Rescheduling is a project-manager action; the server enforces
            // it either way, this just avoids offering a drag that will 403.
            canReschedule={project.projectManager?.id === currentMemberId || !currentMemberId}
          />
        )}
        {tab === 'activity' && <ActivityPlaceholder />}
      </div>

      {selectedTask && (
        <TaskDrawer task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  )
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] mb-1">{label}</p>
      {children}
    </div>
  )
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
    >
      <ArrowLeft size={14} />
      All initiatives
    </button>
  )
}

function OverviewTab({ project, health }: { project: any; health: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Panel title="Business case" icon={FileText}>
          <Prose text={project.businessCase} empty="No business case recorded yet." />
        </Panel>
        <Panel title="Success criteria" icon={Target}>
          <Prose text={project.successCriteria} empty="No success criteria recorded yet." />
        </Panel>
        {project.description && (
          <Panel title="Description" icon={FileText}>
            <Prose text={project.description} empty="" />
          </Panel>
        )}
      </div>

      <div className="space-y-4">
        {/* The health breakdown is the point of the score — surfaced, not hidden. */}
        <Panel title="Health breakdown" icon={ActivityIcon}>
          {!health ? (
            <p className="text-xs text-[var(--text-tertiary)]">Calculating…</p>
          ) : health.penalties.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Nothing is dragging this score down.
            </p>
          ) : (
            <ul className="space-y-2">
              {health.penalties.map((p: any) => (
                <li key={p.code} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-[var(--text-secondary)] leading-snug">{p.label}</span>
                  <span className="tabular-nums font-medium shrink-0" style={{ color: 'var(--danger)' }}>
                    −{p.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Team" icon={Users}>
          {project.members?.length ? (
            <ul className="space-y-1.5">
              {project.members.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--text-primary)]">{m.member.name}</span>
                  <span className="text-[var(--text-tertiary)]">
                    {m.role.replace(/_/g, ' ').toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)]">No members added yet.</p>
          )}
        </Panel>

        <Panel title="Key dates" icon={CalendarDays}>
          <dl className="space-y-1.5 text-xs">
            <Row label="Start" value={formatDate(project.startDate)} />
            <Row label="Target end" value={formatDate(project.targetEndDate)} />
            <Row
              label="Baseline"
              value={project.baselineEndDate ? formatDate(project.baselineEndDate) : 'Not baselined'}
            />
            {project.actualEndDate && <Row label="Actual end" value={formatDate(project.actualEndDate)} />}
          </dl>
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)] mb-3">
        <Icon size={13} className="text-[var(--text-tertiary)]" />
        {title}
      </h3>
      {children}
    </section>
  )
}

function Prose({ text, empty }: { text?: string | null; empty: string }) {
  if (!text?.trim()) return <p className="text-xs text-[var(--text-tertiary)]">{empty}</p>
  return <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{text}</p>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-[var(--text-primary)]">{value}</dd>
    </div>
  )
}

function TaskDrawer({ task, onClose }: { task: ProjectTask; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/20"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      role="presentation"
    >
      <aside
        className="w-full max-w-md h-full overflow-y-auto bg-[var(--bg-elevated)] border-l border-[var(--border-default)] p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <span className="font-mono text-xs text-[var(--text-tertiary)]">#{task.taskNumber ?? '–'}</span>
            <h3 className="text-base font-medium text-[var(--text-primary)] mt-0.5">{task.title}</h3>
          </div>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-sm">
            Close
          </button>
        </div>

        {task.acceptanceStatus === 'PENDING' && (
          <div
            className="rounded-lg px-3 py-2 text-xs mb-4"
            style={{ background: 'rgba(255,159,10,0.10)', color: 'var(--text-primary)' }}
          >
            Requested by {task.requestedBy?.name ?? 'another department'} — awaiting acceptance
            by {task.department?.name ?? 'this lane'}.
          </div>
        )}

        {task.blockedReason && (
          <div
            className="rounded-lg px-3 py-2 text-xs mb-4"
            style={{ background: 'rgba(255,69,58,0.08)', color: 'var(--text-primary)' }}
          >
            <strong>Blocked:</strong> {task.blockedReason}
          </div>
        )}

        <dl className="space-y-2 text-xs">
          <Row label="Status" value={task.status.replace(/_/g, ' ').toLowerCase()} />
          <Row label="Lane" value={task.department?.name ?? '—'} />
          <Row label="Assignee" value={task.owner?.name ?? 'Unassigned'} />
          <Row label="Priority" value={task.priority.toLowerCase()} />
          <Row label="Due" value={formatDate(task.dueDate)} />
        </dl>

        {task.description && (
          <p className="mt-4 text-sm text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
            {task.description}
          </p>
        )}

        {!!task.checklist?.length && (
          <div className="mt-4">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-2">Checklist</p>
            <ul className="space-y-1">
              {task.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input type="checkbox" checked={c.isDone} readOnly className="accent-[var(--accent-secondary)]" />
                  <span className={c.isDone ? 'line-through text-[var(--text-tertiary)]' : ''}>{c.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}

// Phase 9 fills this in. A labelled placeholder beats a blank panel.
function ActivityPlaceholder() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
      <ActivityIcon size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
      <p className="text-sm text-[var(--text-secondary)]">Activity feed arrives with the reports phase</p>
    </div>
  )
}

function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4">
      <BackButton onBack={onBack} />
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 animate-pulse">
        <div className="flex gap-4">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-overlay)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-[var(--bg-overlay)]" />
            <div className="h-5 w-2/3 rounded bg-[var(--bg-overlay)]" />
            <div className="h-1.5 w-full rounded bg-[var(--bg-overlay)] mt-4" />
          </div>
        </div>
      </div>
    </div>
  )
}
