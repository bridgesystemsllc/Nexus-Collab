import { useState } from 'react'
import {
  ArrowLeft,
  MessageSquare,
  CheckSquare,
  FileText,
  Clock,
  User,
  Plus,
  ChevronDown,
  ChevronUp,
  Link2,
  Users,
  Send,
  AlertCircle,
  Calendar,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useCoworkSpace, useMembers, useCreateCoworkTask, usePostActivity } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'
import { TaskDetailDialog } from '@/components/TaskDetailDialog'

type Tab = 'activity' | 'tasks' | 'files'

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#EB5757',
  HIGH: '#D97706',
  MEDIUM: '#2F80ED',
  LOW: '#B4B0A8',
}

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: 'badge-info',
  IN_PROGRESS: 'badge-accent',
  IN_REVIEW: 'badge-critical',
  BLOCKED: 'badge-emergency',
  COMPLETE: 'badge-healthy',
}

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETE'] as const
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const
const ACTIVITY_TYPES = ['UPDATE', 'NOTE', 'SUBMISSION'] as const

const AVATAR_COLORS = [
  '#9B59B6', '#D97706', '#0F7B6C', '#2F80ED', '#EB5757',
  '#7C3AED', '#E74C8B', '#0F7B6C', '#D97706', '#2F80ED',
]

const LINK_CATEGORY_LABELS: Record<string, string> = {
  briefs: 'Brief',
  npd: 'NPD',
  artwork: 'Artwork',
  components: 'Component',
  transfers: 'Tech Transfer',
  formulations: 'Formulation',
}

const LINK_CATEGORY_ICONS: Record<string, string> = {
  briefs: '\u{1F4C4}',
  npd: '\u{1F680}',
  artwork: '\u{1F3A8}',
  components: '\u{1F9E9}',
  transfers: '\u{1F52C}',
  formulations: '\u{2697}\u{FE0F}',
}

function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CoworkDetailPage() {
  const selectedCoworkId = useAppStore((s) => s.selectedCoworkId)
  const setSelectedCowork = useAppStore((s) => s.setSelectedCowork)
  const { data: space, isLoading } = useCoworkSpace(selectedCoworkId ?? '')
  const [activeTab, setActiveTab] = useState<Tab>('activity')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-32 rounded-xl" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }

  if (!space) {
    return (
      <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-tertiary)' }}>
        <p className="text-lg">Space not found</p>
        <button className="btn-ghost mt-4" onClick={() => setSelectedCowork(null)}>
          Back to Spaces
        </button>
      </div>
    )
  }

  const isEmergency = space.type === 'EMERGENCY'
  const linkedMeta = space.linkedItem ?? space.metadata?.linkedItem
  const spaceMembers = space.members ?? []

  const tabs: { key: Tab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'activity', label: 'Activity', icon: MessageSquare },
    { key: 'tasks', label: 'Tasks', icon: CheckSquare },
    { key: 'files', label: 'Files', icon: FileText },
  ]

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => setSelectedCowork(null)}
        className="btn-ghost flex items-center gap-2 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Spaces
      </button>

      {/* Header */}
      <div
        className="data-cell"
        style={{
          ...(isEmergency
            ? {
                borderColor: 'var(--danger)',
                boxShadow: 'var(--shadow-md)',
              }
            : {}),
        }}
      >
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-2">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {space.name}
            </h1>
            <span className={`badge ${isEmergency ? 'badge-emergency' : 'badge-accent'}`}>
              {space.type}
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            {space.description}
          </p>

          {/* Linked Item Chip */}
          {linkedMeta && (
            <div className="flex items-center gap-1.5 mb-3">
              <span
                className="inline-flex items-center gap-1.5 text-[13px] px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: 'var(--accent-subtle)',
                  color: 'var(--accent)',
                  border: '1px solid var(--accent)',
                }}
              >
                <Link2 className="w-3.5 h-3.5" />
                {LINK_CATEGORY_ICONS[linkedMeta.category] ?? ''}{' '}
                {LINK_CATEGORY_LABELS[linkedMeta.category] ?? linkedMeta.category}:{' '}
                {linkedMeta.name}
              </span>
            </div>
          )}

          {/* Department tags + Members row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(space.deptNames ?? []).map((dept: string) => (
                <span key={dept} className="badge badge-info">
                  {dept}
                </span>
              ))}
            </div>

            {/* Members section */}
            <div className="flex items-center gap-2">
              {spaceMembers.length > 0 && (
                <div className="flex items-center -space-x-2">
                  {spaceMembers.slice(0, 5).map((member: any, idx: number) => {
                    const mName = member.name ?? member.user?.name ?? 'Unknown'
                    return (
                      <div
                        key={member.id ?? idx}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2 border-[var(--bg-elevated)]"
                        style={{ background: getAvatarColor(mName), zIndex: 10 - idx }}
                        title={mName}
                      >
                        {getInitials(mName)}
                      </div>
                    )
                  })}
                  {spaceMembers.length > 5 && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold border-2 border-[var(--bg-elevated)]"
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-tertiary)' }}
                    >
                      +{spaceMembers.length - 5}
                    </div>
                  )}
                </div>
              )}
              {spaceMembers.length > 0 && (
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {spaceMembers.length} member{spaceMembers.length !== 1 ? 's' : ''}
                </span>
              )}
              <button className="btn-ghost text-xs flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Manage Members
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg" style={{ background: 'var(--bg-surface)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.key ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === tab.key ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: activeTab === tab.key ? 'var(--shadow-xs)' : 'none',
              fontWeight: activeTab === tab.key ? 550 : 500,
            }}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'activity' && (
        <ActivityTab
          activities={space.activities ?? []}
          spaceId={selectedCoworkId!}
        />
      )}
      {activeTab === 'tasks' && (
        <TasksTab
          tasks={space.tasks ?? space.project?.tasks ?? []}
          spaceId={selectedCoworkId!}
          onSelectTask={setSelectedTaskId}
        />
      )}
      {activeTab === 'files' && <FilesTab documents={space.documents ?? []} />}

      <TaskDetailDialog taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  )
}

/* ─── Activity Tab ─────────────────────────────────────────── */
function ActivityTab({ activities, spaceId }: { activities: any[]; spaceId: string }) {
  const postActivity = usePostActivity()
  const [showForm, setShowForm] = useState(false)
  const [activityType, setActivityType] = useState<string>('UPDATE')
  const [content, setContent] = useState('')

  const handlePostUpdate = () => {
    if (!content.trim()) return
    postActivity.mutate(
      { spaceId, type: activityType, content: content.trim() },
      {
        onSuccess: () => {
          setContent('')
          setShowForm(false)
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      {/* Post Update Form */}
      {showForm ? (
        <div
          className="data-cell space-y-3"
          style={{ border: '1px solid var(--accent)', borderColor: 'var(--accent)' }}
        >
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Post Update</h4>
              <button onClick={() => setShowForm(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Type</label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Content</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your update..."
                rows={3}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={handlePostUpdate}
                disabled={!content.trim() || postActivity.isPending}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {postActivity.isPending ? 'Posting...' : 'Post'}
              </button>
            </div>
            {postActivity.isError && (
              <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--danger)' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                Failed to post update.
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Post Update
        </button>
      )}

      {/* Activity List */}
      {activities.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
          <p>No activity yet</p>
        </div>
      )}

      <div className="space-y-3 stagger">
        {activities.map((item: any) => {
          const authorName = item.author?.name ?? 'Unknown'
          const initials = getInitials(authorName)
          const bgColor = getAvatarColor(authorName)
          const timestamp = item.createdAt
            ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })
            : ''

          return (
            <div key={item.id} className="data-cell flex gap-4">
              <div className="relative z-10 flex gap-4 w-full">
                {/* Avatar */}
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold text-white"
                  style={{ background: bgColor }}
                >
                  {initials}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {authorName}
                    </span>
                    {item.author?.department?.name && (
                      <span className="badge badge-info text-[10px]">{item.author.department.name}</span>
                    )}
                    {item.type && (
                      <span className="badge badge-accent text-[10px]">{item.type}</span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {item.content}
                  </p>
                  {timestamp && (
                    <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                      {timestamp}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Tasks Tab ────────────────────────────────────────────── */
function TasksTab({
  tasks,
  spaceId,
  onSelectTask,
}: {
  tasks: any[]
  spaceId: string
  onSelectTask?: (id: string) => void
}) {
  const createTask = useCreateCoworkTask()
  const { data: members } = useMembers()
  const memberList = Array.isArray(members) ? members : []
  const [showAddForm, setShowAddForm] = useState(false)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')

  const resetForm = () => {
    setTitle('')
    setAssigneeId('')
    setPriority('MEDIUM')
    setDueDate('')
    setDescription('')
  }

  const handleAddTask = () => {
    if (!title.trim()) return
    createTask.mutate(
      {
        spaceId,
        title: title.trim(),
        assigneeId: assigneeId || undefined,
        priority,
        dueDate: dueDate || undefined,
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          resetForm()
          setShowAddForm(false)
        },
      }
    )
  }

  const toggleExpand = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId))
  }

  return (
    <div className="space-y-4">
      {/* Add Task */}
      {showAddForm ? (
        <div
          className="data-cell space-y-3"
          style={{ border: '1px solid var(--accent)' }}
        >
          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Add Task</h4>
              <button onClick={() => { setShowAddForm(false); resetForm() }} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Title <span className="text-[var(--danger)]">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask() }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Assignee</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  <option value="">Unassigned</option>
                  {memberList.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => { setShowAddForm(false); resetForm() }} className="btn-ghost text-xs">Cancel</button>
              <button
                onClick={handleAddTask}
                disabled={!title.trim() || createTask.isPending}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                {createTask.isPending ? 'Adding...' : 'Add Task'}
              </button>
            </div>
            {createTask.isError && (
              <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--danger)' }}>
                <AlertCircle className="w-3.5 h-3.5" />
                Failed to add task.
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      )}

      {/* Tasks List */}
      {tasks.length === 0 && !showAddForm && (
        <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <CheckSquare className="w-10 h-10 mb-3 opacity-40" />
          <p>No tasks assigned</p>
        </div>
      )}

      <div className="space-y-3 stagger">
        {tasks.map((task: any) => {
          const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.LOW
          const statusClass = STATUS_BADGE[task.status] ?? 'badge-info'
          const ownerName = task.owner?.name ?? 'Unassigned'
          const initials = getInitials(ownerName)
          const bgColor = getAvatarColor(ownerName)
          const dueDateObj = task.dueDate ? new Date(task.dueDate) : null
          const isOverdue = dueDateObj && dueDateObj < new Date() && task.status !== 'COMPLETE'
          const isExpanded = expandedTaskId === task.id

          return (
            <div
              key={task.id}
              className="data-cell transition-colors"
              style={{ borderLeftWidth: '3px', borderLeftColor: priorityColor }}
            >
              <div className="relative z-10">
                {/* Main row - clickable */}
                <div
                  className="cursor-pointer"
                  onClick={() => toggleExpand(task.id)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1">
                      <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {task.title}
                      </h4>
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                      )}
                    </div>
                    <span className={`badge ml-2 flex-shrink-0 ${statusClass}`}>
                      {task.status?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {/* Owner avatar */}
                    <span className="flex items-center gap-1.5">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold text-white"
                        style={{ background: bgColor }}
                      >
                        {initials}
                      </div>
                      {ownerName}
                    </span>

                    {/* Priority */}
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ background: priorityColor }} />
                      {task.priority}
                    </span>

                    {/* Due date */}
                    {dueDateObj && (
                      <span
                        className="flex items-center gap-1"
                        style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}
                      >
                        <Clock className="w-3 h-3" />
                        {dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {isOverdue && ' (overdue)'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div
                    className="mt-3 pt-3 space-y-3"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    {/* Description */}
                    {task.description && (
                      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {task.description}
                      </p>
                    )}

                    {/* Notes */}
                    {task.notes && task.notes.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Notes</p>
                        {task.notes.map((note: any, idx: number) => (
                          <div key={idx} className="text-[12px] px-2 py-1.5 rounded" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}>
                            {note.content ?? note}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectTask?.(task.id) }}
                        className="btn-ghost text-xs"
                      >
                        Open Full Detail
                      </button>
                      {task.status !== 'COMPLETE' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onSelectTask?.(task.id) }}
                          className="btn-primary text-xs flex items-center gap-1"
                        >
                          <CheckSquare className="w-3 h-3" />
                          Mark Complete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Files Tab ────────────────────────────────────────────── */
function FilesTab({ documents }: { documents: any[] }) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
        <FileText className="w-10 h-10 mb-3 opacity-40" />
        <p>No files uploaded</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
      {documents.map((doc: any) => (
        <div key={doc.id} className="data-cell">
          <div className="relative z-10 flex flex-col items-center text-center">
            <FileText className="w-10 h-10 mb-3" style={{ color: 'var(--accent)' }} />
            <h4 className="text-sm font-medium truncate w-full" style={{ color: 'var(--text-primary)' }}>
              {doc.name}
            </h4>
            <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {doc.type && <span className="badge badge-accent text-[10px]">{doc.type}</span>}
              {doc.size != null && <span>{formatSize(doc.size)}</span>}
            </div>
            {doc.createdAt && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
                {new Date(doc.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
