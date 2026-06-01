import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  Save,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import { FullPageForm } from '@/components/shared/FullPageForm'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { TaskAttachments } from '@/components/shared/TaskAttachments'
import { useAppStore, type ActiveForm } from '@/stores/appStore'
import {
  useTask,
  useUpdateTask,
  useCreateTask,
  useDeleteTask,
  useAddTaskNote,
  useMembers,
  useDepartments,
} from '@/hooks/useData'

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started', badge: 'badge-info' },
  { value: 'IN_PROGRESS', label: 'In Progress', badge: 'badge-accent' },
  { value: 'IN_REVIEW', label: 'In Review', badge: 'badge-critical' },
  { value: 'BLOCKED', label: 'Blocked', badge: 'badge-emergency' },
  { value: 'COMPLETE', label: 'Complete', badge: 'badge-healthy' },
]

const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'var(--danger)',
  HIGH: 'var(--warning)',
  MEDIUM: 'var(--accent)',
  LOW: 'var(--text-tertiary)',
}

function toDateInput(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

/**
 * Full-page task detail / edit form. Registered in the form registry under the
 * `task` form type. Reads the task id from the page-routing store
 * (`activeForm.recordId`), shows the full task — owner/contact, department, due
 * date, priority, status, description, subtasks and notes — and persists edits
 * and quick actions through the existing task APIs. Includes the shared
 * "Add to Co-work space" action.
 */
export function TaskDetailForm({ form: activeForm }: { form: ActiveForm }) {
  const closeForm = useAppStore((s) => s.closeForm)
  const qc = useQueryClient()
  const taskId = activeForm.recordId ?? ''

  const { data: task, isLoading } = useTask(taskId)
  const updateTask = useUpdateTask()
  const createTask = useCreateTask()
  const deleteTask = useDeleteTask()
  const addNote = useAddTaskNote()
  const { data: members } = useMembers()
  const { data: departments } = useDepartments()

  const memberList = Array.isArray(members) ? members : []
  const deptList = Array.isArray(departments) ? departments : []

  // ─── Editable field state (title + description committed via Save) ────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [noteText, setNoteText] = useState('')
  const [subtaskText, setSubtaskText] = useState('')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title ?? '')
      setDescription(task.description ?? '')
    }
  }, [task?.id])

  const refreshTask = () => {
    if (taskId) qc.invalidateQueries({ queryKey: ['task', taskId] })
  }

  function patch(data: Record<string, any>, onDone?: () => void) {
    if (!taskId) return
    setSaveError('')
    updateTask.mutate(
      { id: taskId, ...data },
      {
        onSuccess: () => { refreshTask(); onDone?.() },
        onError: (err: any) =>
          setSaveError(err?.response?.data?.error || err?.message || 'Failed to save changes'),
      },
    )
  }

  function handleStatusChange(status: string) {
    patch({ status, completedAt: status === 'COMPLETE' ? new Date().toISOString() : null })
    setShowStatusMenu(false)
  }

  function handlePriorityChange(priority: string) {
    patch({ priority })
    setShowPriorityMenu(false)
  }

  function toggleSubtask(sub: any) {
    const next = sub.status === 'COMPLETE' ? 'IN_PROGRESS' : 'COMPLETE'
    updateTask.mutate(
      { id: sub.id, status: next, completedAt: next === 'COMPLETE' ? new Date().toISOString() : null },
      { onSuccess: refreshTask },
    )
  }

  function handleAddSubtask() {
    if (!taskId || !subtaskText.trim()) return
    setSaveError('')
    createTask.mutate(
      { title: subtaskText.trim(), parentId: taskId, departmentId: task?.departmentId ?? undefined },
      {
        onSuccess: () => { setSubtaskText(''); refreshTask() },
        onError: (err: any) =>
          setSaveError(err?.response?.data?.error || err?.message || 'Failed to add subtask'),
      },
    )
  }

  function handleDeleteSubtask(sub: any) {
    setSaveError('')
    deleteTask.mutate(sub.id, {
      onSuccess: refreshTask,
      onError: (err: any) =>
        setSaveError(err?.response?.data?.error || err?.message || 'Failed to delete subtask'),
    })
  }

  function handleAddNote() {
    if (!taskId || !noteText.trim()) return
    addNote.mutate(
      { id: taskId, content: noteText.trim() },
      { onSuccess: () => { setNoteText(''); refreshTask() } },
    )
  }

  const dirty =
    !!task && (title.trim() !== (task.title ?? '') || (description ?? '') !== (task.description ?? ''))

  function handleSaveDetails() {
    if (!dirty || !title.trim()) return
    patch({ title: title.trim(), description: description })
  }

  const statusConfig = STATUS_OPTIONS.find((s) => s.value === task?.status)
  const priorityColor = PRIORITY_COLORS[task?.priority] ?? PRIORITY_COLORS.LOW
  const dueDate = task?.dueDate ? new Date(task.dueDate) : null
  const isOverdue = dueDate && dueDate < new Date() && task?.status !== 'COMPLETE'

  const footer = (
    <>
      <span className="text-[12px] text-[var(--danger)]">{saveError}</span>
      <div className="flex items-center gap-3 ml-auto">
        {task && (
          <AddToCowork
            item={{ name: task.title, type: 'Task', id: task.id, description: task.description }}
            variant="ghost"
            label="Add to Co-work space"
          />
        )}
        <button
          onClick={handleSaveDetails}
          disabled={!dirty || !title.trim() || updateTask.isPending}
          className="flex items-center gap-1.5 btn-primary px-5 py-2.5 rounded-lg text-[14px] disabled:opacity-50"
        >
          {updateTask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={15} />}
          Save Changes
        </button>
      </div>
    </>
  )

  return (
    <FullPageForm
      title={isLoading ? 'Loading…' : task?.title ?? 'Task'}
      subtitle={task?.department?.name ?? undefined}
      onBack={closeForm}
      backLabel="Back to Command Center"
      footer={task ? footer : undefined}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : !task ? (
        <p className="text-center py-16 text-[var(--text-tertiary)]">Task not found</p>
      ) : (
        <div className="space-y-6">
          {/* ─── Action Bar: status / priority / due / owner ───── */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status */}
            <div className="relative">
              <button
                onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false) }}
                className={`badge ${statusConfig?.badge ?? 'badge-accent'} cursor-pointer flex items-center gap-1.5`}
              >
                {statusConfig?.label ?? task.status?.replace(/_/g, ' ')}
                <ChevronDown size={12} />
              </button>
              {showStatusMenu && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-lg py-1 min-w-[160px]">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                    >
                      <span className={`badge text-[10px] ${opt.badge}`}>{opt.label}</span>
                      {task.status === opt.value && <Check size={12} className="ml-auto text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Priority */}
            <div className="relative">
              <button
                onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false) }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] cursor-pointer transition-colors"
              >
                <div className="w-2 h-2 rounded-full" style={{ background: priorityColor }} />
                {task.priority}
                <ChevronDown size={12} />
              </button>
              {showPriorityMenu && (
                <div className="absolute top-full left-0 mt-1 z-20 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl shadow-lg py-1 min-w-[130px]">
                  {PRIORITY_OPTIONS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[p] }} />
                      {p}
                      {task.priority === p && <Check size={12} className="ml-auto text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {dueDate && (
              <span
                className="flex items-center gap-1.5 text-xs"
                style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}
              >
                <Clock size={13} />
                {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {isOverdue && ' (overdue)'}
              </span>
            )}

            {task.owner && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] ml-auto">
                <User size={13} />
                {task.owner.name}
              </span>
            )}
          </div>

          {/* ─── Core editable fields ──────────────────────────── */}
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)] transition-colors"
                placeholder="Task title"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3.5 py-2.5 rounded-lg text-[14px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)] transition-colors resize-y"
                placeholder="Add a description…"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Owner / contact */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Owner / contact</label>
                <select
                  value={task.ownerId ?? ''}
                  onChange={(e) => patch({ ownerId: e.target.value || null })}
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Unassigned</option>
                  {memberList.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Department</label>
                <select
                  value={task.departmentId ?? ''}
                  onChange={(e) => patch({ departmentId: e.target.value || null })}
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">None</option>
                  {deptList.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Due date */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Due date</label>
                <input
                  type="date"
                  value={toDateInput(task.dueDate)}
                  onChange={(e) => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] text-[var(--text-primary)] bg-[var(--bg-input)] border border-[var(--border-subtle)] outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            {task.brandNames?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {task.brandNames.map((brand: string) => (
                  <span key={brand} className="badge badge-info text-xs">{brand}</span>
                ))}
              </div>
            )}
          </div>

          {/* ─── Subtasks ──────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckSquare size={15} className="text-[var(--accent)]" />
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Subtasks{task.subtasks?.length ? ` (${task.subtasks.length})` : ''}
              </h3>
            </div>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubtask() }}
                placeholder="Add a subtask…"
                className="flex-1 px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                onClick={handleAddSubtask}
                disabled={!subtaskText.trim() || createTask.isPending}
                className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                title="Add subtask"
              >
                {createTask.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>
            {task.subtasks?.length > 0 ? (
              <div className="space-y-1.5">
                {task.subtasks.map((sub: any) => {
                  const done = sub.status === 'COMPLETE'
                  return (
                    <div
                      key={sub.id}
                      className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]"
                    >
                      <button
                        onClick={() => toggleSubtask(sub)}
                        className="flex-shrink-0 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all"
                        style={{
                          borderColor: done ? 'var(--accent)' : 'var(--border-strong)',
                          background: done ? 'var(--accent)' : 'transparent',
                        }}
                        title={done ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {done && <Check size={11} className="text-white" strokeWidth={3} />}
                      </button>
                      <span
                        className={`flex-1 text-sm ${done ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {sub.title}
                      </span>
                      <span
                        className={`badge text-[10px] ${STATUS_OPTIONS.find((s) => s.value === sub.status)?.badge ?? 'badge-accent'}`}
                      >
                        {STATUS_OPTIONS.find((s) => s.value === sub.status)?.label ?? sub.status?.replace(/_/g, ' ')}
                      </span>
                      <button
                        onClick={() => handleDeleteSubtask(sub)}
                        disabled={deleteTask.isPending}
                        className="flex-shrink-0 p-1 rounded-md text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--bg-overlay)] transition-all disabled:opacity-40"
                        title="Delete subtask"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] py-2">No subtasks yet</p>
            )}
          </div>

          {/* ─── Notes ─────────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={15} className="text-[var(--accent)]" />
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Notes{task.notes?.length ? ` (${task.notes.length})` : ''}
              </h3>
            </div>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote() }}
                placeholder="Add a note…"
                className="flex-1 px-3 py-2 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim() || addNote.isPending}
                className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {addNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>

            {task.notes?.length > 0 ? (
              <div className="space-y-2">
                {task.notes.map((note: any) => (
                  <div key={note.id} className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-tertiary)]">
                      {note.author?.name && <span>{note.author.name}</span>}
                      {note.createdAt && (
                        <span>{new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-tertiary)] py-1">No notes yet</p>
            )}
          </div>

          {/* ─── Attachments (files / emails / comments) ───────── */}
          <div className="pt-1 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-2 mb-1 mt-3">
              <Calendar size={15} className="text-[var(--accent)]" />
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Attachments</h3>
            </div>
            <TaskAttachments taskId={task.id} module="task" />
          </div>
        </div>
      )}
    </FullPageForm>
  )
}
