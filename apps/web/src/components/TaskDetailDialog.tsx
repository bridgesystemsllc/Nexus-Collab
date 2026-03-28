import { useState } from 'react'
import {
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  User,
} from 'lucide-react'
import { Dialog } from './Dialog'
import { useTask, useUpdateTask, useAddTaskNote } from '@/hooks/useData'

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#FF453A',
  HIGH: '#FF9F0A',
  MEDIUM: '#64D2FF',
  LOW: '#6E6E73',
}

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started', badge: 'badge-info' },
  { value: 'IN_PROGRESS', label: 'In Progress', badge: 'badge-accent' },
  { value: 'IN_REVIEW', label: 'In Review', badge: 'badge-critical' },
  { value: 'BLOCKED', label: 'Blocked', badge: 'badge-emergency' },
  { value: 'COMPLETE', label: 'Complete', badge: 'badge-healthy' },
]

const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']

interface TaskDetailDialogProps {
  taskId: string | null
  onClose: () => void
}

export function TaskDetailDialog({ taskId, onClose }: TaskDetailDialogProps) {
  const { data: task, isLoading } = useTask(taskId ?? '')
  const updateTask = useUpdateTask()
  const addNote = useAddTaskNote()
  const [noteText, setNoteText] = useState('')
  const [activeSection, setActiveSection] = useState<'details' | 'notes' | 'subtasks'>('details')
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [showPriorityMenu, setShowPriorityMenu] = useState(false)

  function handleStatusChange(status: string) {
    if (!taskId) return
    updateTask.mutate({ id: taskId, status })
    setShowStatusMenu(false)
  }

  function handlePriorityChange(priority: string) {
    if (!taskId) return
    updateTask.mutate({ id: taskId, priority })
    setShowPriorityMenu(false)
  }

  function handleAddNote() {
    if (!taskId || !noteText.trim()) return
    addNote.mutate({ id: taskId, content: noteText.trim() }, {
      onSuccess: () => setNoteText(''),
    })
  }

  const statusConfig = STATUS_OPTIONS.find(s => s.value === task?.status)
  const priorityColor = PRIORITY_COLORS[task?.priority] ?? PRIORITY_COLORS.LOW
  const dueDate = task?.dueDate ? new Date(task.dueDate) : null
  const isOverdue = dueDate && dueDate < new Date() && task?.status !== 'COMPLETE'

  return (
    <Dialog
      open={!!taskId}
      onClose={onClose}
      title={isLoading ? 'Loading...' : task?.title ?? 'Task'}
      subtitle={task?.department?.name}
      wide
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : !task ? (
        <p className="text-center py-12 text-[var(--text-tertiary)]">Task not found</p>
      ) : (
        <div className="space-y-5">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Dropdown */}
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
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                    >
                      <span className={`badge text-[10px] ${opt.badge}`}>{opt.label}</span>
                      {task.status === opt.value && <CheckCircle2 size={12} className="ml-auto text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Priority Dropdown */}
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
                  {PRIORITY_OPTIONS.map(p => (
                    <button
                      key={p}
                      onClick={() => handlePriorityChange(p)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-2"
                    >
                      <div className="w-2 h-2 rounded-full" style={{ background: PRIORITY_COLORS[p] }} />
                      {p}
                      {task.priority === p && <CheckCircle2 size={12} className="ml-auto text-[var(--accent)]" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Due Date */}
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

            {/* Owner */}
            {task.owner && (
              <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] ml-auto">
                <User size={13} />
                {task.owner.name}
              </span>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div className="text-sm text-[var(--text-secondary)] leading-relaxed p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
              {task.description}
            </div>
          )}

          {/* Brands */}
          {task.brandNames?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.brandNames.map((brand: string) => (
                <span key={brand} className="badge badge-info text-xs">{brand}</span>
              ))}
            </div>
          )}

          {/* Section Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--bg-base)]">
            {[
              { key: 'details' as const, label: 'Details', icon: FileText, count: (task.documents?.length ?? 0) + (task.emails?.length ?? 0) },
              { key: 'notes' as const, label: 'Notes', icon: MessageSquare, count: task.notes?.length ?? 0 },
              { key: 'subtasks' as const, label: 'Subtasks', icon: CheckSquare, count: task.subtasks?.length ?? 0 },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveSection(tab.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: activeSection === tab.key ? 'var(--accent)' : 'transparent',
                  color: activeSection === tab.key ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <tab.icon size={13} />
                {tab.label}
                {tab.count > 0 && (
                  <span className="tabular-nums opacity-70">({tab.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* Section Content */}
          {activeSection === 'details' && (
            <div className="space-y-3">
              {/* Documents */}
              {task.documents?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Documents</p>
                  <div className="space-y-1.5">
                    {task.documents.map((doc: any) => (
                      <div key={doc.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                        <FileText size={14} className="text-[var(--accent)]" />
                        <span className="text-sm text-[var(--text-primary)]">{doc.name}</span>
                        {doc.type && <span className="badge badge-accent text-[10px] ml-auto">{doc.type}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Emails */}
              {task.emails?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">Linked Emails</p>
                  <div className="space-y-1.5">
                    {task.emails.map((email: any) => (
                      <div key={email.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                        <Mail size={14} className="text-[var(--info)]" />
                        <span className="text-sm text-[var(--text-primary)]">{email.subject ?? email.messageId}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!task.documents?.length && !task.emails?.length) && (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">No documents or emails linked</p>
              )}

              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[var(--border-subtle)]">
                {task.effort && (
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Effort</p>
                    <p className="text-sm text-[var(--text-secondary)]">{task.effort}</p>
                  </div>
                )}
                {task.project && (
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Project</p>
                    <p className="text-sm text-[var(--text-secondary)]">{task.project.title}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-[var(--text-tertiary)]">Created</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {task.completedAt && (
                  <div>
                    <p className="text-xs text-[var(--text-tertiary)]">Completed</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {new Date(task.completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'notes' && (
            <div className="space-y-3">
              {/* Add Note */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddNote() }}
                  placeholder="Add a note..."
                  className="flex-1 px-3 py-2 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || addNote.isPending}
                  className="px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  {addNote.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>

              {/* Notes List */}
              {task.notes?.length > 0 ? (
                <div className="space-y-2">
                  {task.notes.map((note: any) => (
                    <div key={note.id} className="p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{note.content}</p>
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
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">No notes yet</p>
              )}
            </div>
          )}

          {activeSection === 'subtasks' && (
            <div className="space-y-2">
              {task.subtasks?.length > 0 ? (
                task.subtasks.map((sub: any) => {
                  const subStatus = STATUS_OPTIONS.find(s => s.value === sub.status)
                  return (
                    <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
                      <CheckSquare
                        size={16}
                        className={sub.status === 'COMPLETE' ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}
                      />
                      <span
                        className={`flex-1 text-sm ${sub.status === 'COMPLETE' ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {sub.title}
                      </span>
                      <span className={`badge text-[10px] ${subStatus?.badge ?? 'badge-accent'}`}>
                        {subStatus?.label ?? sub.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )
                })
              ) : (
                <p className="text-sm text-[var(--text-tertiary)] text-center py-6">No subtasks</p>
              )}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
