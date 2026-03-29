import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog } from './Dialog'
import { useCreateTask, useCreateCoworkTask } from '@/hooks/useData'

interface CreateTaskDialogProps {
  open: boolean
  onClose: () => void
  coworkSpaceId?: string
}

const inputCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors'
const labelCls = 'block text-xs font-medium text-[var(--text-tertiary)] mb-1 uppercase tracking-wider'
const selectCls =
  'w-full px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-colors appearance-none'

const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#FF453A',
  HIGH: '#FF9F0A',
  MEDIUM: '#64D2FF',
  LOW: '#6E6E73',
}
const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'COMPLETE', label: 'Complete' },
]
const EFFORT_OPTIONS = ['XS', 'S', 'M', 'L', 'XL']

export function CreateTaskDialog({ open, onClose, coworkSpaceId }: CreateTaskDialogProps) {
  const createGlobalTask = useCreateTask()
  const createCoworkTask = useCreateCoworkTask(coworkSpaceId ?? '')
  const createTask = coworkSpaceId ? createCoworkTask : createGlobalTask

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [status, setStatus] = useState('NOT_STARTED')
  const [effort, setEffort] = useState('')
  const [dueDate, setDueDate] = useState('')

  function reset() {
    setTitle('')
    setDescription('')
    setPriority('MEDIUM')
    setStatus('NOT_STARTED')
    setEffort('')
    setDueDate('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const payload: any = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      effort: effort || undefined,
      dueDate: dueDate || undefined,
    }
    createTask.mutate(payload, {
      onSuccess: () => {
        reset()
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Task" wide>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={labelCls}>Title *</label>
          <input
            className={inputCls}
            placeholder="Task title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </div>

        <div>
          <label className={labelCls}>Description</label>
          <textarea
            className={inputCls}
            rows={3}
            placeholder="Optional description..."
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Priority</label>
            <select className={selectCls} value={priority} onChange={e => setPriority(e.target.value)}>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[priority] }} />
              <span className="text-xs text-[var(--text-tertiary)]">{priority}</span>
            </div>
          </div>

          <div>
            <label className={labelCls}>Status</label>
            <select className={selectCls} value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Effort</label>
            <select className={selectCls} value={effort} onChange={e => setEffort(e.target.value)}>
              <option value="">None</option>
              {EFFORT_OPTIONS.map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Due Date</label>
            <input
              className={inputCls}
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => { reset(); onClose() }}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || createTask.isPending}
            className="px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
          >
            {createTask.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Task
          </button>
        </div>
      </form>
    </Dialog>
  )
}
