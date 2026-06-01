import { useState } from 'react'
import {
  ArrowLeft,
  MessageSquare,
  CheckSquare,
  FileText,
  Clock,
  User,
  Plus,
  ChevronUp,
  Link2,
  Users,
  Send,
  AlertCircle,
  Calendar,
  Mail,
  Trash2,
  X,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useCoworkSpace, useMembers, useCreateCoworkTask, usePostActivity, useUpdateCoworkSpace, useAttachCoworkFile } from '@/hooks/useData'
import { api } from '@/lib/api'
import { useAppStore } from '@/stores/appStore'

type Tab = 'activity' | 'tasks' | 'files' | 'emails'

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
  const { data: space, isLoading, refetch } = useCoworkSpace(selectedCoworkId ?? '')
  const [activeTab, setActiveTab] = useState<Tab>('activity')
  const [showManageMembers, setShowManageMembers] = useState(false)

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
    { key: 'emails', label: 'Emails', icon: Mail },
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
              <button
                onClick={() => setShowManageMembers(true)}
                className="btn-ghost text-xs flex items-center gap-1"
              >
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
          members={spaceMembers}
        />
      )}
      {activeTab === 'tasks' && (
        <TasksTab
          tasks={space.tasks ?? space.project?.tasks ?? []}
          spaceId={selectedCoworkId!}
        />
      )}
      {activeTab === 'files' && <FilesTab documents={space.documents ?? []} spaceId={space.id} onRefresh={refetch} />}

      {activeTab === 'emails' && <EmailsTab spaceId={space.id} emails={space.emails ?? []} onRefresh={refetch} />}

      {showManageMembers && (
        <ManageMembersDialog
          spaceId={space.id}
          currentMemberIds={space.memberIds ?? []}
          onClose={() => setShowManageMembers(false)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}

/* ─── Activity Tab ─────────────────────────────────────────── */
function ActivityTab({ activities, spaceId, members }: { activities: any[]; spaceId: string; members: any[] }) {
  const postActivity = usePostActivity()
  const [showForm, setShowForm] = useState(false)
  const [activityType, setActivityType] = useState<string>('UPDATE')
  const [content, setContent] = useState('')
  const [taggedMemberIds, setTaggedMemberIds] = useState<string[]>([])

  const toggleTag = (id: string) =>
    setTaggedMemberIds((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))

  const handlePostUpdate = () => {
    if (!content.trim()) return
    const taggedMembers = members
      .filter((m: any) => taggedMemberIds.includes(m.id))
      .map((m: any) => ({ id: m.id, name: m.name ?? m.user?.name ?? 'Unknown' }))
    postActivity.mutate(
      {
        spaceId,
        type: activityType,
        content: content.trim(),
        metadata: taggedMembers.length ? { taggedMembers } : undefined,
      },
      {
        onSuccess: () => {
          setContent('')
          setTaggedMemberIds([])
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
            {members.length > 0 && (
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Tag coworkers</label>
                <div className="flex flex-wrap gap-1.5">
                  {members.map((m: any) => {
                    const mName = m.name ?? m.user?.name ?? 'Unknown'
                    const active = taggedMemberIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleTag(m.id)}
                        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors"
                        style={{
                          background: active ? 'var(--accent-subtle)' : 'var(--bg-surface)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                      >
                        <span
                          className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white"
                          style={{ background: getAvatarColor(mName) }}
                        >
                          {getInitials(mName)}
                        </span>
                        {mName}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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
                  {Array.isArray(item.metadata?.taggedMembers) && item.metadata.taggedMembers.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {item.metadata.taggedMembers.map((tm: any) => (
                        <span
                          key={tm.id}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)', border: '1px solid var(--accent)' }}
                        >
                          <User className="w-3 h-3" />
                          {tm.name}
                        </span>
                      ))}
                    </div>
                  )}
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
}: {
  tasks: any[]
  spaceId: string
}) {
  const openForm = useAppStore((s) => s.openForm)
  const openTaskDetail = (id: string) => openForm({ formType: 'task', mode: 'edit', recordId: id })
  const createTask = useCreateCoworkTask()
  const { data: members } = useMembers()
  const memberList = Array.isArray(members) ? members : []
  const [showAddForm, setShowAddForm] = useState(false)

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

          return (
            <div
              key={task.id}
              className="data-cell transition-colors cursor-pointer"
              style={{ borderLeftWidth: '3px', borderLeftColor: priorityColor }}
              onClick={() => openTaskDetail(task.id)}
            >
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-1">
                    <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {task.title}
                    </h4>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Files Tab ────────────────────────────────────────────── */
function FilesTab({ documents, spaceId, onRefresh }: { documents: any[]; spaceId: string; onRefresh: () => void }) {
  const attachFile = useAttachCoworkFile()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  const handleAttach = () => {
    if (!name.trim()) return
    attachFile.mutate(
      { spaceId, name: name.trim(), storageUrl: url.trim() || undefined, type: 'OTHER' },
      {
        onSuccess: () => {
          setName('')
          setUrl('')
          setShowForm(false)
          onRefresh()
        },
      }
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {documents.length} file{documents.length !== 1 ? 's' : ''} linked to this space
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 btn-primary px-3 py-2 rounded-lg text-[13px]"
        >
          <Plus size={14} /> Add File
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="p-4 rounded-xl border border-[var(--accent)] bg-[var(--accent-subtle)] space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">Add a File Link</h4>
            <button onClick={() => setShowForm(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">
              Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Document name"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="btn-ghost text-xs">Cancel</button>
            <button
              onClick={handleAttach}
              disabled={!name.trim() || attachFile.isPending}
              className="btn-primary text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {attachFile.isPending ? 'Adding...' : 'Add File'}
            </button>
          </div>
          {attachFile.isError && (
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--danger)' }}>
              <AlertCircle className="w-3.5 h-3.5" />
              Failed to add file.
            </div>
          )}
        </div>
      )}

      {/* File List */}
      {documents.length === 0 && !showForm ? (
        <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <FileText className="w-10 h-10 mb-3 opacity-40" />
          <p>No files uploaded</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {documents.map((doc: any) => {
            const Card = (
              <div className="relative z-10 flex flex-col items-center text-center">
                <FileText className="w-10 h-10 mb-3" style={{ color: 'var(--accent)' }} />
                <h4 className="text-sm font-medium truncate w-full" style={{ color: 'var(--text-primary)' }}>
                  {doc.name}
                </h4>
                <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {doc.type && <span className="badge badge-accent text-[10px]">{doc.type}</span>}
                  {doc.size != null && doc.size > 0 && <span>{formatSize(doc.size)}</span>}
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
            )
            return doc.storageUrl ? (
              <a key={doc.id} href={doc.storageUrl} target="_blank" rel="noopener noreferrer" className="data-cell hover:border-[var(--accent)] transition-colors">
                {Card}
              </a>
            ) : (
              <div key={doc.id} className="data-cell">{Card}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Manage Members Dialog ─────────────────────────────────── */
function ManageMembersDialog({
  spaceId,
  currentMemberIds,
  onClose,
  onSaved,
}: {
  spaceId: string
  currentMemberIds: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const { data: members } = useMembers()
  const updateSpace = useUpdateCoworkSpace()
  const [selected, setSelected] = useState<string[]>(currentMemberIds)
  const memberList = Array.isArray(members) ? members : []

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))

  const handleSave = () => {
    updateSpace.mutate(
      { spaceId, memberIds: selected },
      {
        onSuccess: () => {
          onSaved()
          onClose()
        },
      }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="w-full max-w-md rounded-xl border border-[var(--border-default)] overflow-hidden flex flex-col max-h-[80vh]" style={{ background: 'var(--bg-elevated)' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Manage Members</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 overflow-y-auto space-y-1">
          {memberList.length === 0 && (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-tertiary)' }}>No members available</p>
          )}
          {memberList.map((m: any) => {
            const mName = m.name ?? m.user?.name ?? 'Unknown'
            const checked = selected.includes(m.id)
            return (
              <label
                key={m.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--bg-hover)]"
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(m.id)} className="accent-[var(--accent)]" />
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                  style={{ background: getAvatarColor(mName) }}
                >
                  {getInitials(mName)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>{mName}</p>
                  {(m.role || m.department?.name) && (
                    <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)' }}>
                      {m.role ?? m.department?.name}
                    </p>
                  )}
                </div>
              </label>
            )
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="btn-ghost text-xs">Cancel</button>
          <button onClick={handleSave} disabled={updateSpace.isPending} className="btn-primary text-xs">
            {updateSpace.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Emails Tab ─────────────────────────────────────────────
function EmailsTab({
  spaceId,
  emails,
  onRefresh,
}: {
  spaceId: string
  emails: any[]
  onRefresh: () => void
}) {
  const [showAttach, setShowAttach] = useState(false)
  const [form, setForm] = useState({
    subject: '',
    fromAddr: '',
    toAddrs: '',
    date: new Date().toISOString().slice(0, 10),
    snippet: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleAttach = async () => {
    if (!form.subject.trim()) return
    setSubmitting(true)
    try {
      await api.post(`/cowork/${spaceId}/emails`, {
        subject: form.subject.trim(),
        fromAddr: form.fromAddr.trim(),
        toAddrs: form.toAddrs.split(',').map((e: string) => e.trim()).filter(Boolean),
        date: form.date || new Date().toISOString(),
        snippet: form.snippet.trim(),
      })
      setForm({ subject: '', fromAddr: '', toAddrs: '', date: new Date().toISOString().slice(0, 10), snippet: '' })
      setShowAttach(false)
      onRefresh()
    } catch (err) {
      console.error('Failed to attach email:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (emailId: string) => {
    try {
      await api.delete(`/cowork/${spaceId}/emails/${emailId}`)
      onRefresh()
    } catch (err) {
      console.error('Failed to remove email:', err)
    }
  }

  const formatEmailDate = (d: string) => {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch { return d }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-secondary)]">
          {emails.length} email{emails.length !== 1 ? 's' : ''} linked to this space
        </p>
        <button
          onClick={() => setShowAttach(!showAttach)}
          className="flex items-center gap-1.5 btn-primary px-3 py-2 rounded-lg text-[13px]"
        >
          <Mail size={14} /> Attach Email
        </button>
      </div>

      {/* Attach Form */}
      {showAttach && (
        <div className="p-4 rounded-xl border border-[var(--accent)] bg-[var(--accent-subtle)] space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h4 className="text-[14px] font-semibold text-[var(--text-primary)]">Attach an Email</h4>
            <button onClick={() => setShowAttach(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={16} />
            </button>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">
              Subject <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Email subject line"
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">From</label>
              <input
                type="email"
                value={form.fromAddr}
                onChange={(e) => setForm({ ...form, fromAddr: e.target.value })}
                placeholder="sender@example.com"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">To (comma-separated)</label>
              <input
                type="text"
                value={form.toAddrs}
                onChange={(e) => setForm({ ...form, toAddrs: e.target.value })}
                placeholder="recipient@example.com"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">Summary / Snippet</label>
            <textarea
              value={form.snippet}
              onChange={(e) => setForm({ ...form, snippet: e.target.value })}
              rows={3}
              placeholder="Key points from the email relevant to this space..."
              className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAttach(false)} className="btn-ghost px-3 py-2 text-[13px]">Cancel</button>
            <button
              onClick={handleAttach}
              disabled={!form.subject.trim() || submitting}
              className="btn-primary flex items-center gap-1.5 px-4 py-2 text-[13px] disabled:opacity-40"
            >
              {submitting ? 'Attaching...' : 'Attach Email'}
            </button>
          </div>
        </div>
      )}

      {/* Email List */}
      {emails.length === 0 && !showAttach ? (
        <div className="flex flex-col items-center py-16 text-[var(--text-tertiary)]">
          <Mail className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-[14px]">No emails linked yet</p>
          <p className="text-[12px] mt-1">Attach relevant emails to keep your team in context.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {emails.map((email: any) => (
            <div
              key={email.id}
              className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors group"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--accent-subtle)] flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mail size={16} className="text-[var(--accent)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[var(--text-primary)] truncate">
                  {email.subject}
                </p>
                <div className="flex items-center gap-3 mt-1 text-[12px] text-[var(--text-secondary)]">
                  {email.fromAddr && (
                    <span className="flex items-center gap-1">
                      <User size={10} /> {email.fromAddr}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock size={10} /> {formatEmailDate(email.date)}
                  </span>
                  {(email.toAddrs || []).length > 0 && (
                    <span className="text-[var(--text-tertiary)]">
                      To: {email.toAddrs.slice(0, 2).join(', ')}{email.toAddrs.length > 2 ? ` +${email.toAddrs.length - 2}` : ''}
                    </span>
                  )}
                </div>
                {email.snippet && (
                  <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed line-clamp-3">
                    {email.snippet}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemove(email.id)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-all flex-shrink-0"
                title="Remove email"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
