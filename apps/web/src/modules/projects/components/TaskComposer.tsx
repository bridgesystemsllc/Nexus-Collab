import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useCreateTask } from '../hooks/useProjects'

// Compact create-task form. Deeper fields (subtask line items, richer
// metadata) are sub-project B — this exists so you can add a task without
// leaving the board.
//
// The department lane is defaulted and validated here because
// CREATE_TASK_OWN_LANE denies a task with no lane, and denies a lane the
// actor does not hold. Catching it client-side turns a 403 into a hint.

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

interface Props {
  projectId: string
  defaultStatus: string
  defaultDepartmentId: string | null
  onClose: () => void
  onCreated: () => void
}

export function TaskComposer({
  projectId, defaultStatus, defaultDepartmentId, onClose, onCreated,
}: Props) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<string>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateTask(projectId)

  const submit = async () => {
    if (!title.trim()) { setError('A title is required'); return }
    if (!defaultDepartmentId) {
      setError('You must belong to a department lane on this project to add a task')
      return
    }
    setError(null)
    try {
      await create.mutateAsync({
        title: title.trim(),
        status: defaultStatus,
        departmentId: defaultDepartmentId,
        priority,
        ...(dueDate ? { dueDate } : {}),
      })
      onCreated()
    } catch (err: any) {
      setError(err?.message ?? 'Could not create the task')
    }
  }

  const field = `w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]`

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">New task</span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={14} />
        </button>
      </div>

      <input
        autoFocus
        value={title}
        placeholder="What needs doing?"
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
        }}
        className={field}
      />

      <div className="flex gap-2">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
      </div>

      {error && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-2.5 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={create.isPending}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'var(--accent-secondary)' }}
        >
          {create.isPending && <Loader2 size={12} className="animate-spin" />}
          Add task
        </button>
      </div>
    </div>
  )
}
