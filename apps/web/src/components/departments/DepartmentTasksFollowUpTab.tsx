import { useState, useMemo, useEffect } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  Eye,
  Filter,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask, useMembers } from '@/hooks/useData'
import { StatusBadge, ActionsMenu, DeleteConfirmDialog } from '@/components/shared/TablePrimitives'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { Dialog } from '@/components/Dialog'

interface DepartmentTasksFollowUpTabProps {
  departmentId: string | null
  departmentName?: string
  orgId?: string
}

const TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE'] as const
const TASK_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NOT_STARTED: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
  IN_PROGRESS: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  IN_REVIEW: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8B5CF6' },
  BLOCKED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
  COMPLETE: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10B981' },
  PENDING: { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
  HIGH: { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316' },
  MEDIUM: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  LOW: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function isOverdue(dateStr: string): boolean {
  if (!dateStr) return false
  try {
    return new Date(dateStr).getTime() < Date.now()
  } catch {
    return false
  }
}

interface TaskFormData {
  title: string
  description: string
  status: string
  priority: string
  dueDate: string
  ownerId: string
  tags: string[]
}

const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  status: 'NOT_STARTED',
  priority: 'MEDIUM',
  dueDate: '',
  ownerId: '',
  tags: [],
}

function TaskFormModal({
  open,
  onClose,
  departmentId,
  initialData,
  mode = 'create',
  taskId,
}: {
  open: boolean
  onClose: () => void
  departmentId: string
  initialData?: Partial<TaskFormData>
  mode?: 'create' | 'edit'
  taskId?: string
}) {
  const [form, setForm] = useState<TaskFormData>({ ...EMPTY_FORM, ...initialData })
  const [tagInput, setTagInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { data: members = [] } = useMembers()
  const createTask = useCreateTask()
  const updateTask = useUpdateTask()

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initialData })
      setTagInput('')
      setError('')
      setSubmitting(false)
    }
  }, [open, initialData])

  const handleAddTag = () => {
    const tag = tagInput.trim()
    if (tag && !form.tags.includes(tag)) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Title is required')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || undefined,
        departmentId,
        ownerId: form.ownerId || undefined,
      }

      if (mode === 'edit' && taskId) {
        await updateTask.mutateAsync({ id: taskId, ...payload })
      } else {
        await createTask.mutateAsync(payload)
      }

      onClose()
    } catch (err: any) {
      const msg = err?.response?.data?.error
      if (typeof msg === 'string') {
        setError(msg)
      } else if (err?.response?.status === 403) {
        setError('You do not have permission to perform this action')
      } else {
        setError(err?.message || 'Failed to save task')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const memberList = Array.isArray(members) ? members : []

  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === 'edit' ? 'Edit Task' : 'New Task'}
      subtitle={mode === 'edit' ? 'Update task details' : 'Create a new task or follow-up'}
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--danger-light)] text-[var(--danger)] text-[13px]">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Title *
          </label>
          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Task title..."
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="Task description..."
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none resize-y focus:border-[var(--accent)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Priority
            </label>
            <select
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Due Date
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Assign To
            </label>
            <select
              value={form.ownerId}
              onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Unassigned</option>
              {memberList.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Tags
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[12px] font-medium"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="p-0.5 rounded-full hover:bg-[var(--accent)]/20"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {form.tags.length === 0 && !form.tags.includes('follow-up') && (
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, tags: [...prev.tags, 'follow-up'] }))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-[var(--border-default)] text-[12px] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Tag size={10} /> Add follow-up tag
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              placeholder="Add custom tag..."
              className="flex-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-3 py-2 rounded-lg border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={submitting} className="btn-ghost px-4 py-2 text-[14px]">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-[14px] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving...
              </>
            ) : mode === 'edit' ? (
              'Save Changes'
            ) : (
              <>
                <Plus size={14} /> Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function AssignModal({
  open,
  onClose,
  task,
  onAssign,
}: {
  open: boolean
  onClose: () => void
  task: any
  onAssign: (ownerId: string) => Promise<void>
}) {
  const [selectedMember, setSelectedMember] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')
  const { data: members = [] } = useMembers()

  useEffect(() => {
    if (open) {
      setSelectedMember(task?.ownerId || '')
      setError('')
      setAssigning(false)
    }
  }, [open, task])

  const handleAssign = async () => {
    setAssigning(true)
    setError('')
    try {
      await onAssign(selectedMember)
      onClose()
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setError('You do not have permission to assign this task')
      } else {
        setError(err?.message || 'Failed to assign task')
      }
    } finally {
      setAssigning(false)
    }
  }

  const memberList = Array.isArray(members) ? members : []

  if (!open) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign Task"
      subtitle={task?.title}
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--danger-light)] text-[var(--danger)] text-[13px]">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
            Assign To
          </label>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          >
            <option value="">Unassigned</option>
            {memberList.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} disabled={assigning} className="btn-ghost px-4 py-2 text-[14px]">
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={assigning}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-[14px] disabled:opacity-50"
          >
            {assigning ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Assigning...
              </>
            ) : (
              <>
                <User size={14} /> Assign
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export function DepartmentTasksFollowUpTab({
  departmentId,
  departmentName,
}: DepartmentTasksFollowUpTabProps) {
  const [view, setView] = useState<ViewMode>('list')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [followUpOnly, setFollowUpOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTask, setEditingTask] = useState<any>(null)
  const [assigningTask, setAssigningTask] = useState<any>(null)
  const [deletingTask, setDeletingTask] = useState<{ id: string; name: string } | null>(null)

  const { data, isLoading, refetch } = useTasks({ dept: departmentId || '' })
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()

  const tasks = useMemo(() => {
    const list = data?.tasks || []
    let filtered = list

    if (statusFilter !== 'all') {
      filtered = filtered.filter((t: any) => t.status === statusFilter)
    }

    if (followUpOnly) {
      filtered = filtered.filter((t: any) => t.brandNames?.includes('follow-up'))
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (t: any) =>
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.owner?.name?.toLowerCase().includes(q)
      )
    }

    return filtered
  }, [data, statusFilter, followUpOnly, search])

  const handleAssign = async (ownerId: string) => {
    if (!assigningTask) return
    await updateTask.mutateAsync({ id: assigningTask.id, ownerId: ownerId || null })
    refetch()
  }

  const handleDelete = async () => {
    if (!deletingTask) return
    await deleteTask.mutateAsync(deletingTask.id)
    setDeletingTask(null)
    refetch()
  }

  const handleQuickStatusChange = async (taskId: string, newStatus: string) => {
    await updateTask.mutateAsync({ id: taskId, status: newStatus })
    refetch()
  }

  if (!departmentId) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
        <p className="text-[14px] text-[var(--text-tertiary)]">No department selected</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <ViewToggle value={view} onChange={setView} />

          <div className="flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              All
            </button>
            {TASK_STATUSES.filter((s) => s !== 'COMPLETE').map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  statusFilter === s
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s.replace(/_/g, ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={() => setFollowUpOnly(!followUpOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              followUpOnly
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Tag size={12} /> Follow-up
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-8 pr-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
          >
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
          <span className="ml-3 text-[14px] text-[var(--text-secondary)]">Loading tasks...</span>
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle2 size={40} className="mx-auto text-[var(--success)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-primary)] font-medium">No tasks found</p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1 mb-4">
            {statusFilter !== 'all' || followUpOnly || search
              ? 'Try adjusting your filters'
              : `Create your first task for ${departmentName || 'this department'}`}
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary px-5 py-2.5 rounded-lg text-[14px]"
          >
            Create Task
          </button>
        </div>
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Assignee</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task: any) => {
                const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
                const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.NOT_STARTED
                const overdue = isOverdue(task.dueDate) && task.status !== 'COMPLETE'

                return (
                  <tr key={task.id} className="clickable-row">
                    <td className="font-medium text-[var(--text-primary)]">
                      <div className="flex items-center gap-2">
                        {task.title}
                        {task.brandNames?.includes('follow-up') && (
                          <span className="badge text-[10px]" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
                            follow-up
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className="badge text-[11px]"
                        style={{ background: priorityColor.bg, color: priorityColor.text }}
                      >
                        {task.priority}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge text-[11px]"
                        style={{ background: statusColor.bg, color: statusColor.text }}
                      >
                        {task.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={overdue ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}>
                      {formatDate(task.dueDate)}
                      {overdue && <AlertTriangle size={11} className="inline ml-1" />}
                    </td>
                    <td>
                      {task.owner ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ background: 'var(--accent)' }}
                          >
                            {task.owner.name?.[0]?.toUpperCase() || '?'}
                          </div>
                          <span className="text-[13px] text-[var(--text-secondary)]">
                            {task.owner.name}
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAssigningTask(task)}
                          className="text-[13px] text-[var(--text-tertiary)] hover:text-[var(--accent)] flex items-center gap-1"
                        >
                          <User size={12} /> Assign
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork
                          item={{
                            name: task.title,
                            type: 'Task',
                            id: task.id,
                            description: task.description || `${task.priority} priority task`,
                          }}
                          variant="icon"
                        />
                        <ActionsMenu
                          actions={[
                            { label: 'Edit', icon: Edit3, onClick: () => setEditingTask(task) },
                            { label: 'Assign', icon: User, onClick: () => setAssigningTask(task) },
                            {
                              label: task.status === 'COMPLETE' ? 'Reopen' : 'Complete',
                              icon: CheckCircle2,
                              onClick: () =>
                                handleQuickStatusChange(
                                  task.id,
                                  task.status === 'COMPLETE' ? 'NOT_STARTED' : 'COMPLETE'
                                ),
                            },
                            {
                              label: 'Delete',
                              icon: Trash2,
                              onClick: () => setDeletingTask({ id: task.id, name: task.title }),
                              danger: true,
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task: any) => {
            const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM
            const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.NOT_STARTED
            const overdue = isOverdue(task.dueDate) && task.status !== 'COMPLETE'

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
                      {task.title}
                    </span>
                    <span
                      className="badge text-[10px]"
                      style={{ background: priorityColor.bg, color: priorityColor.text }}
                    >
                      {task.priority}
                    </span>
                    <span
                      className="badge text-[10px]"
                      style={{ background: statusColor.bg, color: statusColor.text }}
                    >
                      {task.status.replace(/_/g, ' ')}
                    </span>
                    {task.brandNames?.includes('follow-up') && (
                      <span className="badge text-[10px]" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
                        follow-up
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[12px] mt-0.5 ${
                      overdue ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
                    }`}
                  >
                    {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
                    {overdue && ' (overdue)'}
                    {task.project?.title && ` · ${task.project.title}`}
                  </p>
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
                  <button
                    onClick={() => setAssigningTask(task)}
                    className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)]"
                    title="Assign"
                  >
                    <User size={16} />
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <AddToCowork
                    item={{
                      name: task.title,
                      type: 'Task',
                      id: task.id,
                      description: task.description || `${task.priority} priority task`,
                    }}
                    variant="icon"
                  />
                  <ActionsMenu
                    actions={[
                      { label: 'Edit', icon: Edit3, onClick: () => setEditingTask(task) },
                      { label: 'Assign', icon: User, onClick: () => setAssigningTask(task) },
                      {
                        label: task.status === 'COMPLETE' ? 'Reopen' : 'Complete',
                        icon: CheckCircle2,
                        onClick: () =>
                          handleQuickStatusChange(
                            task.id,
                            task.status === 'COMPLETE' ? 'NOT_STARTED' : 'COMPLETE'
                          ),
                      },
                      {
                        label: 'Delete',
                        icon: Trash2,
                        onClick: () => setDeletingTask({ id: task.id, name: task.title }),
                        danger: true,
                      },
                    ]}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <TaskFormModal
        open={showCreateModal || !!editingTask}
        onClose={() => {
          setShowCreateModal(false)
          setEditingTask(null)
          refetch()
        }}
        departmentId={departmentId}
        mode={editingTask ? 'edit' : 'create'}
        taskId={editingTask?.id}
        initialData={
          editingTask
            ? {
                title: editingTask.title,
                description: editingTask.description || '',
                status: editingTask.status,
                priority: editingTask.priority,
                dueDate: editingTask.dueDate?.split('T')[0] || '',
                ownerId: editingTask.ownerId || '',
                tags: editingTask.brandNames || [],
              }
            : undefined
        }
      />

      {/* Assign Modal */}
      <AssignModal
        open={!!assigningTask}
        onClose={() => setAssigningTask(null)}
        task={assigningTask}
        onAssign={handleAssign}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingTask}
        itemName={deletingTask?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeletingTask(null)}
      />
    </div>
  )
}
