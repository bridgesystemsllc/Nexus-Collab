import { useMemo, useState } from 'react'
import { AlertTriangle, GitBranch, Inbox, Lock, ArrowRightLeft, Plus } from 'lucide-react'
import { useSetTaskStatus } from '../hooks/useProjects'
import { Toast, type ToastData } from '@/components/shared/Toast'
import { useProjectScope, useDefaultBoardGrouping } from '../context/ProjectScopeContext'
import {
  BOARD_COLUMNS, TASK_STATUS_LABELS, PRIORITY_COLORS,
  type ProjectTask, type TaskStatus,
} from '../types'
import { formatDate } from './ProjectCard'
import { TaskComposer } from './TaskComposer'

// ─── Task board ──────────────────────────────────────────────
// Swimlanes by department inside a collab (where "who is doing what" is the
// question) and by status inside a department (where everyone is the same
// department and lanes would collapse to one column).
//
// Drag updates status optimistically. A card that waits for a round trip
// before moving feels broken; on failure the board rolls back and the server's
// reason is shown rather than silently reverting.

interface Props {
  projectId: string
  tasks: ProjectTask[]
  onOpenTask: (task: ProjectTask) => void
  currentMemberId?: string | null
  canCreate: boolean
}

export function TaskBoard({ projectId, tasks, onOpenTask, currentMemberId, canCreate }: Props) {
  const defaultGrouping = useDefaultBoardGrouping()
  const { departmentId: scopeDeptId } = useProjectScope()
  const [grouping, setGrouping] = useState<'status' | 'department'>(defaultGrouping)
  const [mineOnly, setMineOnly] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [overColumn, setOverColumn] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A drag can happen anywhere on a long board, so a rolled-back move is
  // announced at the viewport rather than in a banner that may be scrolled
  // out of sight. Silently snapping back is the failure mode to avoid.
  const [toast, setToast] = useState<ToastData | null>(null)
  // Which column's composer is open, or null. One at a time.
  const [composerFor, setComposerFor] = useState<string | null>(null)

  const setStatus = useSetTaskStatus(projectId)

  const visible = useMemo(() => {
    let list = tasks.filter((t) => t.status !== 'CANCELLED')
    if (mineOnly && currentMemberId) list = list.filter((t) => t.ownerId === currentMemberId)
    return list
  }, [tasks, mineOnly, currentMemberId])

  const columns = useMemo(() => {
    if (grouping === 'status') {
      return BOARD_COLUMNS.map((status) => ({
        key: status,
        label: TASK_STATUS_LABELS[status],
        color: null as string | null,
        tasks: visible.filter((t) => t.status === status),
        droppableStatus: status,
      }))
    }
    // Department swimlanes: one column per department present on the board.
    const byDept = new Map<string, { name: string; color: string | null; tasks: ProjectTask[] }>()
    for (const t of visible) {
      const id = t.departmentId ?? 'unassigned'
      const entry = byDept.get(id)
      if (entry) entry.tasks.push(t)
      else byDept.set(id, {
        name: t.department?.name ?? 'Unassigned',
        color: t.department?.color ?? null,
        tasks: [t],
      })
    }
    return [...byDept.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, v]) => ({
        key: id, label: v.name, color: v.color, tasks: v.tasks,
        // Dropping into a department column would mean reassigning the lane,
        // which is a permissioned move, not a status change. Not draggable.
        droppableStatus: null as TaskStatus | null,
      }))
  }, [visible, grouping])

  const onDrop = (status: TaskStatus | null) => {
    const taskId = dragging
    setDragging(null)
    setOverColumn(null)
    if (!taskId || !status) return

    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === status) return

    // A pending cross-department request is not yet this team's work; the
    // server refuses the move, so say so before making the round trip.
    if (task.acceptanceStatus === 'PENDING') {
      setError('Accept this cross-department request before working on it.')
      return
    }

    setError(null)
    setStatus.mutate(
      { taskId, status },
      {
        onError: (err: any) => {
          const message = err?.message ?? 'Could not move that task'
          // Both: the toast catches the eye wherever the user is looking, the
          // banner persists so the reason is still there once it fades.
          setToast({ message, type: 'error' })
          setError(message)
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          {(['status', 'department'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGrouping(g)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                grouping === g
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {g === 'status' ? 'By status' : 'By department'}
            </button>
          ))}
        </div>

        {currentMemberId && (
          <button
            onClick={() => setMineOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              mineOnly
                ? 'bg-[var(--accent-secondary)] text-white border-transparent'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            My tasks only
          </button>
        )}

        {canCreate && (
          <button
            type="button"
            onClick={() => setComposerFor(columns[0]?.key ?? null)}
            className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium text-white inline-flex items-center gap-1.5"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <Plus size={13} />
            New task
          </button>
        )}
      </div>

      <Toast toast={toast} onDismiss={() => setToast(null)} duration={4000} />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs"
          style={{ background: 'rgba(255,159,10,0.08)', color: 'var(--text-primary)' }}
        >
          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            Dismiss
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="space-y-3">
          <EmptyBoard mineOnly={mineOnly} />
          {canCreate && composerFor === null && (
            <div className="max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setComposerFor(columns[0]?.key ?? null)}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium text-white inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent-secondary)' }}
              >
                <Plus size={13} />
                Add the first task
              </button>
            </div>
          )}
          {canCreate && composerFor !== null && (
            <div className="max-w-sm mx-auto">
              <TaskComposer
                projectId={projectId}
                defaultStatus="NOT_STARTED"
                defaultDepartmentId={scopeDeptId ?? null}
                onClose={() => setComposerFor(null)}
                onCreated={() => setComposerFor(null)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (!col.droppableStatus) return
                e.preventDefault()
                setOverColumn(col.key)
              }}
              onDragLeave={() => setOverColumn((c) => (c === col.key ? null : c))}
              onDrop={() => onDrop(col.droppableStatus)}
              className={`flex-1 min-w-[240px] rounded-xl border p-2 transition-colors ${
                overColumn === col.key
                  ? 'border-[var(--accent-secondary)] bg-[var(--accent-secondary-light)]'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
              }`}
            >
              <div className="flex items-center justify-between px-1.5 py-1 mb-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
                  {col.color && (
                    <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  )}
                  {col.label}
                </span>
                <span className="tabular-nums text-[11px] text-[var(--text-tertiary)]">
                  {col.tasks.length}
                </span>
              </div>

              {canCreate && composerFor === col.key ? (
                <TaskComposer
                  projectId={projectId}
                  defaultStatus={col.droppableStatus ?? 'NOT_STARTED'}
                  defaultDepartmentId={scopeDeptId ?? null}
                  onClose={() => setComposerFor(null)}
                  onCreated={() => setComposerFor(null)}
                />
              ) : canCreate ? (
                <button
                  type="button"
                  onClick={() => setComposerFor(col.key)}
                  aria-label={`Add a task to ${col.label}`}
                  className="w-full rounded-lg border border-dashed border-[var(--border-subtle)] py-1.5
                    text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]
                    hover:border-[var(--accent)] transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Plus size={12} />
                  Add
                </button>
              ) : null}

              <div className="space-y-1.5">
                {col.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    draggable={grouping === 'status'}
                    isDragging={dragging === task.id}
                    onDragStart={() => setDragging(task.id)}
                    onDragEnd={() => { setDragging(null); setOverColumn(null) }}
                    onOpen={() => onOpenTask(task)}
                    showDepartment={grouping === 'status' && !scopeDeptId}
                  />
                ))}
                {col.tasks.length === 0 && (
                  <p className="px-1.5 py-4 text-center text-[11px] text-[var(--text-tertiary)]">
                    Nothing here
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task, draggable, isDragging, onDragStart, onDragEnd, onOpen, showDepartment,
}: {
  task: ProjectTask
  draggable: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onOpen: () => void
  showDepartment: boolean
}) {
  const pending = task.acceptanceStatus === 'PENDING'
  const deps = (task._count?.dependenciesIn ?? 0) + (task._count?.dependenciesOut ?? 0)

  return (
    <div
      draggable={draggable && !pending}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      role="button"
      tabIndex={0}
      className={`rounded-lg border bg-[var(--bg-elevated)] p-2.5 cursor-pointer transition-all duration-150 hover:border-[var(--border-strong)] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-secondary)] ${
        isDragging ? 'opacity-40' : ''
      } ${pending ? 'border-dashed border-[var(--warning)]' : 'border-[var(--border-subtle)]'}`}
    >
      {pending && (
        <div
          className="flex items-center gap-1 mb-1.5 text-[10px] font-medium uppercase tracking-wide"
          style={{ color: 'var(--warning)' }}
        >
          <ArrowRightLeft size={10} />
          Awaiting acceptance
        </div>
      )}

      <div className="flex items-start gap-2">
        <span
          className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: PRIORITY_COLORS[task.priority] }}
          title={`${task.priority.toLowerCase()} priority`}
        />
        <p className="text-xs text-[var(--text-primary)] leading-snug flex-1 line-clamp-3">
          {task.title}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">
            #{task.taskNumber ?? '–'}
          </span>
          {showDepartment && task.department && (
            <span
              className="rounded px-1 py-0.5 text-[10px] font-medium truncate"
              style={{
                background: `${task.department.color ?? 'var(--text-tertiary)'}14`,
                color: task.department.color ?? 'var(--text-tertiary)',
              }}
            >
              {task.department.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {task.status === 'BLOCKED' && (
            <span title={task.blockedReason ?? 'Blocked'} className="inline-flex">
              <Lock size={10} style={{ color: 'var(--danger)' }} />
            </span>
          )}
          {deps > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--text-tertiary)]" title={`${deps} dependencies`}>
              <GitBranch size={10} />
              {deps}
            </span>
          )}
          {task.dueDate && (
            <span
              className="text-[10px] whitespace-nowrap"
              style={{ color: task.isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}
            >
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.owner && (
            <span
              className="w-5 h-5 rounded-full bg-[var(--accent-secondary-light)] text-[9px] font-medium text-[var(--accent-secondary)] flex items-center justify-center shrink-0"
              title={task.owner.name}
            >
              {task.owner.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyBoard({ mineOnly }: { mineOnly: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
      <Inbox size={28} className="mx-auto text-[var(--text-tertiary)] mb-2" />
      <p className="text-sm text-[var(--text-secondary)]">
        {mineOnly ? 'Nothing assigned to you on this project' : 'No tasks yet'}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">
        {mineOnly ? 'Turn off "My tasks only" to see the full board.' : 'Add the first task to get moving.'}
      </p>
    </div>
  )
}
