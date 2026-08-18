import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, Ban, Check, CheckSquare, ChevronRight, Clock, GitBranch,
  ListTree, Plus, Square, Trash2, X,
} from 'lucide-react'
import * as client from '../api/projectsClient'
import { useModalBehaviour } from '../lib/useModalBehaviour'
import { formatDate } from './ProjectCard'
import { TaskConversations } from './TaskConversations'
import {
  TASK_STATUS_LABELS, PRIORITY_COLORS, type ProjectTask, type TaskStatus, type Priority,
} from '../types'

// ─── Task detail ─────────────────────────────────────────────
// Replaces a five-row read-only panel. Everything shown here already existed
// in the API and was simply never surfaced: description, dates, estimate,
// checklist, dependency counts, blocked reason — and now subtasks.
//
// Editing is field-at-a-time against the existing PATCH route rather than a
// form with a save button. A drawer someone opens to change one date should
// not make them commit a whole record.

const STATUSES: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE', 'CANCELLED']
const PRIORITIES: Priority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

interface Props {
  task: ProjectTask
  projectId: string
  canEdit: boolean
  members?: { id: string; name: string }[]
  onClose: () => void
  /** Opening a subtask swaps the drawer's subject rather than stacking drawers. */
  onOpenTask?: (task: ProjectTask) => void
}

export function TaskDetailDrawer({
  task, projectId, canEdit, members = [], onClose, onOpenTask,
}: Props) {
  const ref = useModalBehaviour<HTMLElement>(onClose)
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [newSubtask, setNewSubtask] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [newChecklist, setNewChecklist] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: ['projects'] })
  const onError = (err: any) => setError(err?.message ?? 'That change could not be saved')

  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.updateTask(task.id, body),
    onSuccess: () => { setError(null); refresh() },
    onError,
  })
  const setStatus = useMutation({
    mutationFn: (status: string) => client.setTaskStatus(task.id, status),
    onSuccess: () => { setError(null); refresh() },
    onError,
  })
  const addSubtask = useMutation({
    mutationFn: (title: string) =>
      client.createTask(projectId, {
        title,
        // A subtask inherits its parent's lane. Putting it elsewhere would make
        // it a cross-department request, which is not what "break this down"
        // means.
        departmentId: task.departmentId,
        parentId: task.id,
      }),
    onSuccess: () => { setNewSubtask(''); setAddingSubtask(false); setError(null); refresh() },
    onError,
  })
  const subtaskStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => client.setTaskStatus(id, status),
    onSuccess: () => { setError(null); refresh() },
    onError,
  })
  const addChecklist = useMutation({
    mutationFn: (label: string) => client.addChecklistItem(task.id, label),
    onSuccess: () => { setNewChecklist(''); setError(null); refresh() },
    onError,
  })
  const toggleChecklist = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) =>
      client.updateChecklistItem(id, { isDone }),
    onSuccess: () => { setError(null); refresh() },
    onError,
  })

  const subtasks = (task as any).subtasks as ProjectTask[] | undefined
  const progress = (task as any).subtaskProgress as
    | { done: number; total: number; percentComplete: number }
    | null
    | undefined
  const isSubtask = !!task.parentId
  const checklist = task.checklist ?? []
  const checklistDone = checklist.filter((c) => c.isDone).length

  const field =
    'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] disabled:opacity-60'

  return (
    <div
      className="projects-module fixed inset-0 z-50 flex justify-end bg-black/20"
      onClick={onClose}
      role="presentation"
    >
      <aside
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-lg overflow-y-auto border-l border-[var(--border-default)] bg-[var(--bg-elevated)] p-5"
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--text-tertiary)]">#{task.taskNumber ?? '–'}</span>
              {isSubtask && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-overlay)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                  <ListTree size={9} /> subtask
                </span>
              )}
              {task.isCrossDept && task.acceptanceStatus === 'PENDING' && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px]" style={{ background: 'rgba(255,159,10,0.12)', color: 'var(--warning)' }}>
                  awaiting acceptance
                </span>
              )}
            </div>
            {canEdit ? (
              <input
                defaultValue={task.title}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== task.title) update.mutate({ title: v })
                  else if (!v) e.target.value = task.title
                }}
                className="mt-1 w-full bg-transparent text-base font-medium text-[var(--text-primary)] focus:outline-none"
                aria-label="Task title"
              />
            ) : (
              <h3 className="mt-0.5 text-base font-medium text-[var(--text-primary)]">{task.title}</h3>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <X size={15} />
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'rgba(255,69,58,0.08)' }}>
            <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
            <span className="flex-1 text-[var(--text-primary)]">{error}</span>
            <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
          </div>
        )}

        {task.status === 'BLOCKED' && task.blockedReason && (
          <div className="mb-3 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'rgba(255,69,58,0.06)' }}>
            <p className="flex items-center gap-1.5 font-medium" style={{ color: 'var(--danger)' }}>
              <Ban size={11} /> Blocked
            </p>
            <p className="mt-0.5 text-[var(--text-secondary)]">{task.blockedReason}</p>
            {task.blockedSince && (
              <p className="mt-0.5 text-[var(--text-tertiary)]">since {formatDate(task.blockedSince)}</p>
            )}
          </div>
        )}

        {/* Fields */}
        <div className="grid grid-cols-2 gap-2.5">
          <Labelled label="Status">
            <select
              value={task.status}
              disabled={!canEdit}
              onChange={(e) => setStatus.mutate(e.target.value)}
              className={field}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
            </select>
          </Labelled>
          <Labelled label="Priority">
            <select
              value={task.priority}
              disabled={!canEdit}
              onChange={(e) => update.mutate({ priority: e.target.value })}
              className={field}
              style={{ color: PRIORITY_COLORS[task.priority] }}
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p.toLowerCase()}</option>)}
            </select>
          </Labelled>
          <Labelled label="Assignee">
            <select
              value={task.ownerId ?? ''}
              disabled={!canEdit}
              onChange={(e) => update.mutate({ ownerId: e.target.value || null })}
              className={field}
            >
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              {/* The current owner may not be in the passed list; never hide them. */}
              {task.owner && !members.some((m) => m.id === task.owner!.id) && (
                <option value={task.owner.id}>{task.owner.name}</option>
              )}
            </select>
          </Labelled>
          <Labelled label="Lane">
            <p className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
              {task.department?.name ?? '—'}
            </p>
          </Labelled>
          <Labelled label="Start">
            <input
              type="date" disabled={!canEdit} className={field}
              defaultValue={task.startDate?.slice(0, 10) ?? ''}
              onChange={(e) => update.mutate({ startDate: e.target.value || null })}
            />
          </Labelled>
          <Labelled label="Due">
            <input
              type="date" disabled={!canEdit} className={field}
              defaultValue={task.dueDate?.slice(0, 10) ?? ''}
              onChange={(e) => update.mutate({ dueDate: e.target.value || null })}
            />
          </Labelled>
          <Labelled label="Estimate (hours)">
            <input
              type="number" min="0" step="0.5" disabled={!canEdit} className={field}
              defaultValue={task.estimatedHours != null ? String(task.estimatedHours) : ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                if (v !== (task.estimatedHours == null ? null : Number(task.estimatedHours))) {
                  update.mutate({ estimatedHours: v })
                }
              }}
            />
          </Labelled>
          <Labelled label="Phase">
            <p className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
              {task.phase?.name ?? 'Unphased'}
            </p>
          </Labelled>
        </div>

        {/* Description */}
        <Section title="Description">
          <textarea
            rows={3}
            disabled={!canEdit}
            defaultValue={task.description ?? ''}
            placeholder={canEdit ? 'What does done look like?' : 'No description'}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v !== (task.description ?? '')) update.mutate({ description: v || null })
            }}
            className={`${field} resize-y leading-relaxed`}
          />
        </Section>

        {/* Subtasks */}
        {!isSubtask && (
          <Section
            title="Subtasks"
            icon={ListTree}
            badge={progress ? `${progress.done}/${progress.total}` : undefined}
            action={canEdit ? (
              <button
                onClick={() => setAddingSubtask(true)}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <Plus size={10} /> Add
              </button>
            ) : undefined}
          >
            {progress && progress.total > 0 && (
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-overlay)]">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${progress.percentComplete}%`, background: 'var(--success)' }}
                />
              </div>
            )}

            {(!subtasks || subtasks.length === 0) && !addingSubtask && (
              <p className="text-[11px] text-[var(--text-tertiary)]">
                No subtasks.{canEdit ? ' Break this down if it is more than one piece of work.' : ''}
              </p>
            )}

            <ul className="space-y-1">
              {(subtasks ?? []).map((s) => {
                const done = s.status === 'COMPLETE'
                return (
                  <li key={s.id} className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-2 py-1.5">
                    <button
                      disabled={!canEdit || subtaskStatus.isPending}
                      onClick={() => subtaskStatus.mutate({ id: s.id, status: done ? 'NOT_STARTED' : 'COMPLETE' })}
                      aria-label={done ? `Reopen ${s.title}` : `Complete ${s.title}`}
                      className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--success)] disabled:opacity-50"
                    >
                      {done ? <CheckSquare size={13} style={{ color: 'var(--success)' }} /> : <Square size={13} />}
                    </button>
                    <button
                      onClick={() => onOpenTask?.(s)}
                      disabled={!onOpenTask}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className={`text-[11px] ${done ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-primary)]'}`}>
                        {s.title}
                      </span>
                      {(s.owner || s.dueDate) && (
                        <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">
                          {s.owner?.name}{s.owner && s.dueDate ? ' · ' : ''}
                          {s.dueDate ? formatDate(s.dueDate) : ''}
                        </span>
                      )}
                    </button>
                    {onOpenTask && <ChevronRight size={11} className="shrink-0 text-[var(--text-tertiary)]" />}
                  </li>
                )
              })}
            </ul>

            {addingSubtask && (
              <form
                onSubmit={(e) => { e.preventDefault(); if (newSubtask.trim()) addSubtask.mutate(newSubtask.trim()) }}
                className="mt-1.5 flex gap-1.5"
              >
                <input
                  autoFocus value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="What needs doing?" className={field}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtask('') } }}
                />
                <button
                  type="submit" disabled={!newSubtask.trim() || addSubtask.isPending}
                  className="shrink-0 rounded-lg px-2.5 text-[11px] font-medium text-white disabled:opacity-50"
                  style={{ background: 'var(--accent-secondary)' }}
                >
                  {addSubtask.isPending ? '…' : 'Add'}
                </button>
              </form>
            )}
          </Section>
        )}

        {/* Checklist */}
        <Section
          title="Checklist"
          icon={CheckSquare}
          badge={checklist.length ? `${checklistDone}/${checklist.length}` : undefined}
        >
          {checklist.length === 0 && (
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Nothing on the checklist.{canEdit ? ' Use it for steps too small to be subtasks.' : ''}
            </p>
          )}
          <ul className="space-y-1">
            {checklist.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button
                  disabled={!canEdit}
                  onClick={() => toggleChecklist.mutate({ id: c.id, isDone: !c.isDone })}
                  aria-label={c.isDone ? `Uncheck ${c.label}` : `Check ${c.label}`}
                  className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--success)] disabled:opacity-50"
                >
                  {c.isDone ? <CheckSquare size={13} style={{ color: 'var(--success)' }} /> : <Square size={13} />}
                </button>
                <span className={`text-[11px] ${c.isDone ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-secondary)]'}`}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
          {canEdit && (
            <form
              onSubmit={(e) => { e.preventDefault(); if (newChecklist.trim()) addChecklist.mutate(newChecklist.trim()) }}
              className="mt-1.5 flex gap-1.5"
            >
              <input
                value={newChecklist} onChange={(e) => setNewChecklist(e.target.value)}
                placeholder="Add a step" className={field}
              />
              <button
                type="submit" disabled={!newChecklist.trim() || addChecklist.isPending}
                className="shrink-0 rounded-lg border border-[var(--border-default)] px-2.5 text-[11px] text-[var(--text-secondary)] disabled:opacity-50"
              >
                <Plus size={11} />
              </button>
            </form>
          )}
        </Section>

        {/* Email and Teams */}
        <TaskConversations taskId={task.id} canEdit={canEdit} />

        {/* Dependencies — counts only; the Gantt is where they are edited. */}
        {(task._count?.dependenciesIn || task._count?.dependenciesOut) ? (
          <Section title="Dependencies" icon={GitBranch}>
            <p className="text-[11px] text-[var(--text-secondary)]">
              {task._count?.dependenciesIn ?? 0} blocking this · {task._count?.dependenciesOut ?? 0} waiting on it
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">
              Edit them on the Timeline, where the ripple is visible.
            </p>
          </Section>
        ) : null}

        <p className="mt-4 border-t border-[var(--border-subtle)] pt-2 text-[10px] text-[var(--text-tertiary)]">
          {task.completedAt ? `Completed ${formatDate(task.completedAt)}` : `Created in ${task.department?.name ?? 'no lane'}`}
        </p>
      </aside>
    </div>
  )
}

// ─── Layout primitives ───────────────────────────────────────

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      {children}
    </div>
  )
}

function Section({
  title, icon: Icon, badge, action, children,
}: {
  title: string
  icon?: React.ElementType
  badge?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-primary)]">
          {Icon && <Icon size={11} className="text-[var(--text-tertiary)]" />}
          {title}
          {badge && <span className="font-normal tabular-nums text-[var(--text-tertiary)]">{badge}</span>}
        </h4>
        {action}
      </div>
      {children}
    </section>
  )
}
