import { useState, useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  Box,
  BrainCircuit,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Grid3X3,
  Link2,
  List,
  ListChecks,
  Loader2,
  MessageSquare,
  Plus,
  Users,
} from 'lucide-react'
import {
  useDepartments,
  useTasks,
  useUpdateTask,
  useCoworkSpaces,
  useAIBriefing,
  usePulse,
} from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'
import { useUserStore } from '@/stores/userStore'
import { ModuleHeader } from '@/components/ModuleHeader'

// ─── Skeleton Helpers ──────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="data-cell">
      <div className="skeleton h-4 w-24 mb-3" />
      <div className="skeleton h-10 w-20 mb-2" />
      <div className="skeleton h-3 w-32" />
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="glass-card p-6">
      <div className="skeleton h-5 w-40 mb-4" />
      <div className="space-y-2">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-3/4" />
        <div className="skeleton h-3 w-5/6" />
      </div>
    </div>
  )
}

// ─── KPI Card ──────────────────────────────────────────────
function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  accent?: string
  sub?: string
}) {
  return (
    <div className="data-cell relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
          {label}
        </span>
        <Icon size={18} style={{ color: accent || 'var(--accent)' }} />
      </div>
      <p
        className="kpi-number text-[40px] leading-none"
        style={{ color: accent || 'var(--text-primary)' }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[12px] text-[var(--text-secondary)] mt-1.5">{sub}</p>
      )}
    </div>
  )
}

// ─── Department Health Card with Status Badges (Edit 3) ───
function DeptHealthCard({
  dept,
  tasks,
  onClick,
}: {
  dept: any
  tasks: any[]
  onClick: () => void
}) {
  const deptTasks = tasks.filter((t: any) => t.departmentId === dept.id)
  const pending = deptTasks.filter((t: any) => t.status === 'NOT_STARTED').length
  const highPriority = deptTasks.filter((t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH').length
  const overdue = deptTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETE').length
  const needsAttention = deptTasks.filter((t: any) => t.status === 'BLOCKED').length

  return (
    <button
      onClick={onClick}
      className="data-cell text-left w-full cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg"
          style={{ background: `${dept.color}20` }}
        >
          {dept.icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium text-[14px] text-[var(--text-primary)] truncate">
            {dept.name}
          </p>
          <p className="text-[12px] text-[var(--text-secondary)]">
            {dept.type === 'BUILTIN_RD'
              ? 'R&D'
              : dept.type === 'BUILTIN_OPS'
                ? 'Operations'
                : 'Custom'}
          </p>
        </div>
      </div>

      {/* Status Badges (Edit 3) */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {pending > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(255,159,10,0.15)] text-[#FF9F0A]">
            <Clock size={10} /> {pending}
          </span>
        )}
        {highPriority > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(255,69,58,0.15)] text-[#FF453A]">
            <AlertTriangle size={10} /> {highPriority}
          </span>
        )}
        {overdue > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(255,69,58,0.15)] text-[#FF453A]">
            <Calendar size={10} /> {overdue}
          </span>
        )}
        {needsAttention > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)]">
            <Bell size={10} /> {needsAttention}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {dept.members?.length ?? 0} members
        </span>
        <span className="flex items-center gap-1">
          <ListChecks size={12} />
          {dept._count?.tasks ?? deptTasks.length} tasks
        </span>
      </div>

      <div
        className="absolute bottom-0 left-0 h-0.5 rounded-full"
        style={{
          width: '100%',
          background: `linear-gradient(90deg, ${dept.color}, transparent)`,
          opacity: 0.4,
        }}
      />
    </button>
  )
}

// ─── Briefing Task Item (interactive checklist row) ───────
function BriefingTaskItem({
  task,
  accentColor,
  onToggle,
  onNavigate,
}: {
  task: any
  accentColor: string
  onToggle: (id: string) => void
  onNavigate: (task: any) => void
}) {
  const isComplete = task.status === 'COMPLETE'
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !isComplete
  const dueLabel = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  const priorityColors: Record<string, string> = {
    CRITICAL: 'var(--danger)',
    HIGH: 'var(--warning)',
    MEDIUM: 'var(--accent)',
    LOW: 'var(--text-tertiary)',
  }

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-[var(--bg-hover)] transition-colors group">
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(task.id) }}
        className="flex-shrink-0 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-all"
        style={{
          borderColor: isComplete ? accentColor : 'var(--border-strong)',
          background: isComplete ? accentColor : 'transparent',
        }}
      >
        {isComplete && <Check size={10} className="text-white" strokeWidth={3} />}
      </button>

      {/* Task info — clickable to navigate */}
      <button
        onClick={() => onNavigate(task)}
        className="flex-1 min-w-0 text-left"
      >
        <span
          className={`text-[13px] font-medium block truncate ${
            isComplete
              ? 'line-through text-[var(--text-tertiary)]'
              : 'text-[var(--text-primary)]'
          }`}
        >
          {task.title}
        </span>
        <div className="flex items-center gap-2 mt-0.5">
          {task.priority && (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: priorityColors[task.priority] || 'var(--accent)' }}
            />
          )}
          {task.owner?.name && (
            <span className="text-[11px] text-[var(--text-tertiary)] truncate">{task.owner.name}</span>
          )}
          {task.department?.name && (
            <span className="text-[11px] text-[var(--text-tertiary)] truncate">{task.department.name}</span>
          )}
        </div>
      </button>

      {/* Due date */}
      {dueLabel && (
        <span
          className={`text-[11px] tabular-nums flex-shrink-0 font-medium ${
            isOverdue ? 'text-[var(--danger)]' : 'text-[var(--text-tertiary)]'
          }`}
        >
          {isOverdue && '⚠ '}{dueLabel}
        </span>
      )}

      {/* Navigate arrow on hover */}
      <ChevronRight
        size={12}
        className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      />
    </div>
  )
}

// ─── AI Briefing — Interactive Checklists ─────────────────
function AIBriefingCard({
  briefing,
  isLoading,
  userName,
  taskCount,
  criticalCount,
  overdueCount,
  allTasks,
  onTaskToggle,
  onTaskNavigate,
}: {
  briefing: any
  isLoading: boolean
  userName: string
  taskCount: number
  criticalCount: number
  overdueCount: number
  allTasks: any[]
  onTaskToggle: (id: string) => void
  onTaskNavigate: (task: any) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ priorities: true })

  const toggle = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Build real task lists for each section
  const priorityTasks = allTasks
    .filter((t: any) => t.status !== 'COMPLETE')
    .sort((a: any, b: any) => {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
    })
    .slice(0, 8)

  const criticalTasks = allTasks
    .filter((t: any) => (t.priority === 'CRITICAL' || t.status === 'BLOCKED') && t.status !== 'COMPLETE')

  const overdueTasks = allTasks
    .filter((t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETE')
    .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())

  const upcomingTasks = allTasks
    .filter((t: any) => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= sevenDaysFromNow && t.status !== 'COMPLETE')
    .sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 8)

  const sections = [
    {
      key: 'priorities',
      title: "Today's Priorities",
      icon: CheckSquare,
      color: 'var(--accent)',
      count: priorityTasks.length,
      summary: `${taskCount} active task${taskCount !== 1 ? 's' : ''} across your departments`,
      tasks: priorityTasks,
      emptyMessage: 'No active tasks — you\'re all caught up!',
    },
    {
      key: 'alerts',
      title: 'Critical Alerts',
      icon: AlertTriangle,
      color: 'var(--danger)',
      count: criticalTasks.length,
      summary: criticalTasks.length > 0
        ? `${criticalTasks.length} critical item${criticalTasks.length !== 1 ? 's' : ''} requiring immediate action`
        : 'No critical alerts at this time',
      tasks: criticalTasks,
      emptyMessage: 'No critical alerts — all clear.',
    },
    {
      key: 'overdue',
      title: 'Overdue Items',
      icon: Clock,
      color: 'var(--warning)',
      count: overdueTasks.length,
      summary: overdueTasks.length > 0
        ? `${overdueTasks.length} item${overdueTasks.length !== 1 ? 's' : ''} past due date`
        : 'All items are on schedule',
      tasks: overdueTasks,
      emptyMessage: 'No overdue items — everything is on track.',
    },
    {
      key: 'deadlines',
      title: 'Upcoming Deadlines',
      icon: Calendar,
      color: 'var(--info)',
      count: upcomingTasks.length,
      summary: upcomingTasks.length > 0
        ? `${upcomingTasks.length} deadline${upcomingTasks.length !== 1 ? 's' : ''} in the next 7 days`
        : 'No upcoming deadlines this week',
      tasks: upcomingTasks,
      emptyMessage: 'No deadlines in the next 7 days.',
    },
  ]

  return (
    <div className="lg:col-span-2 glass-card p-6 border-l-[3px] border-l-[var(--accent)]">
      <div className="flex items-center gap-2 mb-5">
        <BrainCircuit size={18} className="text-[var(--accent)]" />
        <h2 className="text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.02em]">
          {userName}'s Briefing
        </h2>
        {isLoading && (
          <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-5/6" />
          <div className="skeleton h-3 w-4/6" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {sections.map((section) => {
            const Icon = section.icon
            const isExpanded = expanded[section.key]
            return (
              <div key={section.key} className="rounded-xl overflow-hidden">
                <button
                  onClick={() => toggle(section.key)}
                  className="w-full flex items-center gap-3 p-3 rounded-[10px] hover:bg-[var(--bg-elevated)] transition-colors text-left"
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: `${section.color}20` }}
                  >
                    <Icon size={14} style={{ color: section.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-[var(--text-primary)]">
                        {section.title}
                      </span>
                      {section.count > 0 && (
                        <span
                          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: `${section.color}20`, color: section.color }}
                        >
                          {section.count}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
                      {section.summary}
                    </p>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-[var(--text-tertiary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Expanded: real task checklist */}
                {isExpanded && (
                  <div className="pb-2 animate-fade-in">
                    {section.tasks.length > 0 ? (
                      <div className="ml-4 border-l-2 border-[var(--border-subtle)] pl-2">
                        {section.tasks.map((task: any) => (
                          <BriefingTaskItem
                            key={task.id}
                            task={task}
                            accentColor={section.color}
                            onToggle={onTaskToggle}
                            onNavigate={onTaskNavigate}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="ml-12 text-[13px] text-[var(--text-tertiary)] py-2">
                        {section.emptyMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Co-Worker Spaces Widget (Edit 5 — replaces Integrations) ─
function CoworkerSpacesWidget() {
  const { data: spaces, isLoading } = useCoworkSpaces()
  const setSelectedCowork = useAppStore((s) => s.setSelectedCowork)
  const setPage = useAppStore((s) => s.setPage)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const spaceList = Array.isArray(spaces) ? spaces : []
  // TODO: filter by currentUser membership when auth is integrated
  const userSpaces = spaceList

  const activeCount = userSpaces.length

  if (isLoading) {
    return (
      <div className="glass-card p-5">
        <div className="skeleton h-5 w-32 mb-4" />
        <div className="space-y-2">
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)] tracking-[-0.02em] flex items-center gap-2">
            <Users size={16} className="text-[var(--accent)]" />
            Co-Worker Spaces
          </h2>
          <p className="text-[24px] font-bold text-[var(--text-primary)] tabular-nums mt-1">{activeCount}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 ${viewMode === 'grid' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >
              <Grid3X3 size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 ${viewMode === 'list' ? 'bg-[var(--accent-subtle)] text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
            >
              <List size={14} />
            </button>
          </div>
          <button
            className="btn-ghost text-[12px] py-1 px-2"
            onClick={() => setPage('cowork')}
          >
            View all
          </button>
        </div>
      </div>

      {userSpaces.length === 0 ? (
        <div className="text-center py-6">
          <Users size={24} className="mx-auto mb-2 text-[var(--text-tertiary)] opacity-40" />
          <p className="text-[13px] text-[var(--text-tertiary)]">No active spaces</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 gap-2">
          {userSpaces.slice(0, 4).map((space: any) => {
            const isRecent = space.updatedAt && (Date.now() - new Date(space.updatedAt).getTime()) < 24 * 60 * 60 * 1000
            return (
              <button
                key={space.id}
                onClick={() => setSelectedCowork(space.id)}
                className="flex flex-col items-center gap-2 p-3 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:-translate-y-[1px] transition-all cursor-pointer text-center"
              >
                <div className="relative">
                  <div className="w-10 h-10 rounded-[10px] bg-[var(--accent-subtle)] flex items-center justify-center">
                    <MessageSquare size={18} className="text-[var(--accent)]" />
                  </div>
                  {isRecent && (
                    <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--success)] pulse-dot" />
                  )}
                </div>
                <span className="text-[12px] font-medium text-[var(--text-primary)] line-clamp-1">{space.name}</span>
                <span className="text-[11px] text-[var(--text-tertiary)]">{space.memberIds?.length ?? 0} members</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="space-y-1">
          {userSpaces.slice(0, 5).map((space: any) => {
            const isRecent = space.updatedAt && (Date.now() - new Date(space.updatedAt).getTime()) < 24 * 60 * 60 * 1000
            return (
              <button
                key={space.id}
                onClick={() => setSelectedCowork(space.id)}
                className="w-full flex items-center gap-3 p-2.5 rounded-[8px] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer text-left"
              >
                <div className="relative flex-shrink-0">
                  <MessageSquare size={16} className="text-[var(--accent)]" />
                  {isRecent && (
                    <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--success)] pulse-dot" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{space.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] truncate">{space.description}</p>
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)] flex-shrink-0">
                  {space.memberIds?.length ?? 0}
                </span>
                <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard Page ───────────────────────────────────
export function DashboardPage() {
  const setPage = useAppStore((s) => s.setPage)
  const setSelectedDept = useAppStore((s) => s.setSelectedDept)
  const currentUser = useUserStore((s) => s.currentUser)
  const firstName = currentUser?.firstName || 'User'

  const { data: departments, isLoading: deptsLoading } = useDepartments()
  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const { data: briefing, isLoading: briefingLoading } = useAIBriefing()
  const updateTask = useUpdateTask()

  // ─── Compute KPIs (scoped to current user — Edit 1)
  const { kpis, allTasks } = useMemo(() => {
    const taskList = Array.isArray(tasks) ? tasks : (tasks as any)?.tasks ?? []
    // TODO: filter by currentUser.id when ownerId is reliably set
    const userTasks = taskList

    const activeTasks = userTasks.filter(
      (t: any) => t.status !== 'COMPLETE'
    ).length
    const criticalItems = userTasks.filter(
      (t: any) => t.priority === 'CRITICAL' && t.status !== 'COMPLETE'
    ).length
    const overdueItems = userTasks.filter(
      (t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETE'
    ).length

    return {
      kpis: {
        activeTasks,
        criticalItems,
        overdueItems,
        inventoryAlerts: 3,
      },
      allTasks: userTasks,
    }
  }, [tasks])

  const isLoading = deptsLoading || tasksLoading

  // ─── Task checklist handlers
  function handleTaskToggle(taskId: string) {
    const task = allTasks.find((t: any) => t.id === taskId)
    if (!task) return
    const newStatus = task.status === 'COMPLETE' ? 'IN_PROGRESS' : 'COMPLETE'
    updateTask.mutate({
      id: taskId,
      status: newStatus,
      completedAt: newStatus === 'COMPLETE' ? new Date().toISOString() : null,
    })
  }

  function handleTaskNavigate(task: any) {
    // Navigate to the Everything page where tasks are visible
    setPage('everything')
  }

  // ─── Navigation helpers
  function handleDeptClick(dept: any) {
    if (dept.type === 'BUILTIN_RD') {
      setPage('rd')
    } else if (dept.type === 'BUILTIN_OPS') {
      setPage('ops')
    } else {
      setSelectedDept(dept.id)
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Page Header — user-scoped (Edit 1) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
            {firstName}'s Command Center
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-0.5">
            Real-time operational overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pulse-dot bg-[var(--success)]" />
          <span className="text-[12px] text-[var(--text-secondary)]">
            Systems nominal
          </span>
        </div>
      </div>

      {/* KPI Grid — user-scoped labels (Edit 1) */}
      <div className="stagger">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            <>
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
              <KpiSkeleton />
            </>
          ) : (
            <>
              <KpiCard
                label="Active Tasks"
                value={kpis.activeTasks}
                icon={ListChecks}
                accent="var(--accent)"
                sub={`${firstName}'s assigned tasks`}
              />
              <KpiCard
                label="Critical Items"
                value={kpis.criticalItems}
                icon={AlertTriangle}
                accent="var(--danger)"
                sub="requiring immediate action"
              />
              <KpiCard
                label="Inventory Alerts"
                value={kpis.inventoryAlerts}
                icon={Box}
                accent="var(--warning)"
                sub="emergency & critical SKUs"
              />
              <KpiCard
                label="Co-Worker Spaces"
                value={0}
                icon={Users}
                accent="var(--success)"
                sub="active collaborations"
              />
            </>
          )}
        </div>
      </div>

      {/* AI Briefing (Edit 2) + Co-Worker Spaces (Edit 5 — replaces Integrations) */}
      <div className="stagger">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AIBriefingCard
            briefing={briefing}
            isLoading={briefingLoading}
            userName={firstName}
            taskCount={kpis.activeTasks}
            criticalCount={kpis.criticalItems}
            overdueCount={kpis.overdueItems}
            allTasks={allTasks}
            onTaskToggle={handleTaskToggle}
            onTaskNavigate={handleTaskNavigate}
          />
          <CoworkerSpacesWidget />
        </div>
      </div>

      {/* Department Health Grid (Edit 3 — with status badges) */}
      <div className="stagger">
        <div>
          <ModuleHeader
            icon={Activity}
            title="Department Health"
          >
            <button
              className="btn-ghost text-[12px] py-1 px-2"
              onClick={() => setPage('dept-manager')}
            >
              Manage
            </button>
          </ModuleHeader>

          {deptsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {(Array.isArray(departments) ? departments : []).map(
                (dept: any) => (
                  <DeptHealthCard
                    key={dept.id}
                    dept={dept}
                    tasks={allTasks}
                    onClick={() => handleDeptClick(dept)}
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
