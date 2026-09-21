import { useState } from 'react'
import {
  ListTodo,
  AlertTriangle,
  Loader2,
  RefreshCw,
  User,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import { useMyTasks, type MyTaskDTO } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_STARTED: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
  IN_PROGRESS: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  IN_REVIEW: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8B5CF6' },
  BLOCKED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
  COMPLETE: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
  HIGH: { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316' },
  MEDIUM: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  LOW: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false
  try {
    return new Date(dateStr).getTime() < Date.now()
  } catch {
    return false
  }
}

function TaskRow({ task }: { task: MyTaskDTO }) {
  const setPage = useAppStore((s) => s.setPage)
  const setSelectedDept = useAppStore((s) => s.setSelectedDept)
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.NOT_STARTED
  const overdue = isOverdue(task.dueDate) && task.status !== 'COMPLETE'

  const handleClick = () => {
    if (task.department?.id) {
      setSelectedDept(task.department.id)
    }
  }

  return (
    <div
      onClick={handleClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
            {task.title}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: priorityColor.bg, color: priorityColor.text }}
          >
            {task.priority}
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: statusColor.bg, color: statusColor.text }}
          >
            {task.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          {task.dueDate && (
            <span
              className={`flex items-center gap-1 text-[12px] ${
                overdue ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
              }`}
            >
              <Calendar size={11} />
              {formatDate(task.dueDate)}
              {overdue && <AlertTriangle size={10} />}
            </span>
          )}
          {task.department && (
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {task.department.name}
            </span>
          )}
          {task.project && (
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {task.project.title}
            </span>
          )}
        </div>
      </div>
      {task.owner ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
          style={{ background: 'var(--accent)' }}
          title={task.owner.name}
        >
          {task.owner.name?.[0]?.toUpperCase() || '?'}
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-tertiary)] bg-[var(--bg-surface)] shrink-0">
          <User size={14} />
        </div>
      )}
    </div>
  )
}

export function TasksPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, refetch, isFetching } = useMyTasks({
    open: true,
    followUp: false,
    page,
    limit: 50,
  })

  const tasks = data?.tasks ?? []
  const total = data?.total ?? 0

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--accent-secondary-light)', color: 'var(--accent-secondary)' }}
        >
          <ListTodo size={20} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Tasks
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Open tasks you created or are assigned to
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
          <span className="ml-3 text-[14px] text-[var(--text-secondary)]">
            Loading your tasks…
          </span>
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <AlertTriangle size={40} className="mx-auto text-[var(--danger)] mb-3 opacity-70" />
          <p className="text-[14px] text-[var(--text-primary)] font-medium">
            Couldn't load tasks
          </p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1 mb-4">
            Something went wrong. Please try again.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[14px] font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Retry
          </button>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={40} className="mx-auto text-[var(--success)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-primary)] font-medium">
            No open tasks
          </p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
            Nothing you created or are assigned to is open.
          </p>
          <p className="text-[12px] text-[var(--text-tertiary)] mt-2">
            Follow-Ups live under Follow-Ups in OVERVIEW.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
          {total > 50 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-[13px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-[13px] text-[var(--text-tertiary)]">
                Page {page} of {Math.ceil(total / 50)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 50 >= total}
                className="px-3 py-1.5 rounded-lg text-[13px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
