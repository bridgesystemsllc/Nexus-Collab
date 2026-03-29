import { useState } from 'react'
import { ArrowLeft, MessageSquare, CheckSquare, FileText, Clock, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useCoworkSpace } from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'
import { TaskDetailDialog } from '@/components/TaskDetailDialog'
import { CreateTaskDialog } from '@/components/CreateTaskDialog'

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

const AVATAR_COLORS = [
  '#9B59B6', '#D97706', '#0F7B6C', '#2F80ED', '#EB5757',
  '#7C3AED', '#E74C8B', '#0F7B6C', '#D97706', '#2F80ED',
]

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
  const [createTaskOpen, setCreateTaskOpen] = useState(false)

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
          <div className="flex flex-wrap gap-1.5">
            {(space.deptNames ?? []).map((dept: string) => (
              <span key={dept} className="badge badge-info">
                {dept}
              </span>
            ))}
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
      {activeTab === 'activity' && <ActivityTab activities={space.activities ?? []} />}
      {activeTab === 'tasks' && (
        <TasksTab
          tasks={space.tasks ?? space.project?.tasks ?? []}
          onSelectTask={setSelectedTaskId}
          onCreateTask={() => setCreateTaskOpen(true)}
        />
      )}
      {activeTab === 'files' && <FilesTab documents={space.documents ?? []} />}

      <TaskDetailDialog taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
      <CreateTaskDialog
        open={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        coworkSpaceId={selectedCoworkId ?? undefined}
      />
    </div>
  )
}

/* ─── Activity Tab ─────────────────────────────────────────── */
function ActivityTab({ activities }: { activities: any[] }) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
        <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
        <p>No activity yet</p>
      </div>
    )
  }

  return (
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
  )
}

/* ─── Tasks Tab ────────────────────────────────────────────── */
function TasksTab({ tasks, onSelectTask, onCreateTask }: { tasks: any[]; onSelectTask?: (id: string) => void; onCreateTask?: () => void }) {
  return (
    <div className="space-y-3 stagger">
      <div className="flex items-center justify-end">
        <button
          onClick={onCreateTask}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={15} />
          New Task
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="flex flex-col items-center py-16" style={{ color: 'var(--text-tertiary)' }}>
          <CheckSquare className="w-10 h-10 mb-3 opacity-40" />
          <p>No tasks yet — create the first one</p>
        </div>
      )}

      {tasks.map((task: any) => {
        const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.LOW
        const statusClass = STATUS_BADGE[task.status] ?? 'badge-info'
        const ownerName = task.owner?.name ?? 'Unassigned'
        const initials = getInitials(ownerName)
        const bgColor = getAvatarColor(ownerName)
        const dueDate = task.dueDate ? new Date(task.dueDate) : null
        const isOverdue = dueDate && dueDate < new Date() && task.status !== 'COMPLETE'

        return (
          <div
            key={task.id}
            className="data-cell cursor-pointer hover:border-[var(--accent)] transition-colors"
            style={{ borderLeftWidth: '3px', borderLeftColor: priorityColor }}
            onClick={() => onSelectTask?.(task.id)}
          >
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-2">
                <h4 className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                  {task.title}
                </h4>
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
                {dueDate && (
                  <span
                    className="flex items-center gap-1"
                    style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-tertiary)' }}
                  >
                    <Clock className="w-3 h-3" />
                    {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {isOverdue && ' (overdue)'}
                  </span>
                )}
              </div>
            </div>
          </div>
        )
      })}
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
