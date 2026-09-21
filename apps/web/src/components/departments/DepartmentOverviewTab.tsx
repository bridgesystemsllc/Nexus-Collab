import { useMemo } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  Box,
  CheckCircle2,
  ClipboardList,
  Clock,
  Factory,
  FileText,
  FlaskConical,
  FolderKanban,
  Loader2,
  Package,
  Radar,
  Repeat2,
  Rocket,
  Target,
  Users,
} from 'lucide-react'
import { OOR_RISK_META, type OorRiskLevel } from '@nexus/shared'
import { useDepartmentOverview, type LowStockSku, type AtRiskOpenOrder } from '@/hooks/useData'
import { StatusBadge } from '@/components/shared/TablePrimitives'
import { AddToCowork } from '@/components/shared/AddToCowork'

interface DepartmentOverviewTabProps {
  departmentId: string | null
  departmentName?: string
  onNavigateToTab?: (tab: string) => void
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days < 0) {
      const futureDays = Math.abs(days)
      if (futureDays === 0) return 'Today'
      if (futureDays === 1) return 'Tomorrow'
      if (futureDays < 7) return `in ${futureDays} days`
      if (futureDays < 30) return `in ${Math.floor(futureDays / 7)}w`
      return `in ${Math.floor(futureDays / 30)}mo`
    }
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    return `${Math.floor(days / 30)}mo ago`
  } catch {
    return dateStr
  }
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

const PRIORITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.15)', text: '#EF4444' },
  HIGH: { bg: 'rgba(249, 115, 22, 0.15)', text: '#F97316' },
  MEDIUM: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3B82F6' },
  LOW: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6B7280' },
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  briefs: FileText,
  transfers: Repeat2,
  formulations: FlaskConical,
  npd: Rocket,
  inventory: Box,
  production: Factory,
  bom: ClipboardList,
  modules: Package,
}

const MODULE_LABELS: Record<string, string> = {
  briefs: 'Active Briefs',
  transfers: 'Tech Transfers',
  formulations: 'Formulations',
  npd: 'NPD Pipeline',
  inventory: 'Inventory Health',
  production: 'Production Tracking',
  bom: 'Bill of Materials',
  modules: 'Custom Modules',
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  onClick,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  onClick?: () => void
}) {
  return (
    <div
      className={`data-cell flex items-center gap-4 py-4 ${onClick ? 'cursor-pointer hover:border-[var(--accent)] transition-colors' : ''}`}
      onClick={onClick}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `${color}20` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  )
}

function TaskRow({ task, compact = false }: { task: any; compact?: boolean }) {
  const priorityColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.MEDIUM

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors">
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
          <StatusBadge status={task.status} />
        </div>
        {!compact && (
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
            {task.project?.title && <span>{task.project.title} · </span>}
            {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}
          </p>
        )}
      </div>
      {task.owner && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
          style={{ background: 'var(--accent)' }}
          title={task.owner.name}
        >
          {task.owner.avatar ? (
            <img
              src={task.owner.avatar}
              alt={task.owner.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            task.owner.name?.[0]?.toUpperCase() || '?'
          )}
        </div>
      )}
      <AddToCowork
        item={{
          name: task.title,
          type: 'Task',
          id: task.id,
          description: task.description || `${task.priority} priority task`,
        }}
        variant="icon"
      />
    </div>
  )
}

function ProjectRow({ project }: { project: any }) {
  const health = project.health ?? 100
  const healthColor =
    health >= 80 ? 'var(--success)' : health >= 50 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
            {project.title}
          </span>
          <StatusBadge status={project.status} />
        </div>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
          {project.ownerDepartment?.name && <span>{project.ownerDepartment.name} · </span>}
          {project.targetEndDate ? `Target ${formatDate(project.targetEndDate)}` : 'No target date'}
          {project._count?.tasks !== undefined && ` · ${project._count.tasks} tasks`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: healthColor }}
          title={`Health: ${health}%`}
        />
        {project.projectManager && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
            style={{ background: 'var(--accent)' }}
            title={project.projectManager.name}
          >
            {project.projectManager.avatar ? (
              <img
                src={project.projectManager.avatar}
                alt={project.projectManager.name}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              project.projectManager.name?.[0]?.toUpperCase() || '?'
            )}
          </div>
        )}
      </div>
      <AddToCowork
        item={{
          name: project.title,
          type: 'Project',
          id: project.id,
          description: project.description || `${project.status} project`,
        }}
        variant="icon"
      />
    </div>
  )
}

function ModuleItemRow({ item, moduleKey }: { item: any; moduleKey: string }) {
  const data = item.data || {}
  const name = data.projectName || data.product || data.name || data.sku || 'Untitled'
  const status = data.briefStatus || data.status || item.status

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">
            {name}
          </span>
          {status && <StatusBadge status={status} />}
        </div>
        {data.brand && (
          <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{data.brand}</p>
        )}
      </div>
      <AddToCowork
        item={{
          name,
          type: MODULE_LABELS[moduleKey] || 'Item',
          id: item.id,
          description: data.description || status || '',
        }}
        variant="icon"
      />
    </div>
  )
}

export function DepartmentOverviewTab({
  departmentId,
  departmentName,
  onNavigateToTab,
}: DepartmentOverviewTabProps) {
  const { data, isLoading, isError } = useDepartmentOverview(departmentId || '')

  // Sort by dueDate first (nulls last), then by priority for actor's items
  const sortByDueDate = (a: any, b: any) => {
    const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
    const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
    if (aDate !== bDate) return aDate - bDate
    const aPri = PRIORITY_ORDER[a.priority] ?? 99
    const bPri = PRIORITY_ORDER[b.priority] ?? 99
    return aPri - bPri
  }

  const urgentTasks = useMemo(() => {
    if (!data?.pendingTasks) return []
    return [...data.pendingTasks]
      .filter((t: any) => t.priority === 'CRITICAL' || t.priority === 'HIGH')
      .sort(sortByDueDate)
      .slice(0, 5)
  }, [data])

  const moduleStats = useMemo(() => {
    if (!data?.openModuleItems) return []
    return Object.entries(data.openModuleItems)
      .filter(([_, items]) => items.length > 0)
      .map(([key, items]) => ({
        key,
        label: MODULE_LABELS[key] || key,
        icon: MODULE_ICONS[key] || Package,
        count: items.length,
        items: items.slice(0, 3),
      }))
  }, [data])

  if (!departmentId) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
        <p className="text-[14px] text-[var(--text-tertiary)]">No department selected</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
        <span className="ml-3 text-[14px] text-[var(--text-secondary)]">Loading overview...</span>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="text-center py-12">
        <AlertTriangle size={40} className="mx-auto text-[var(--danger)] mb-3 opacity-50" />
        <p className="text-[14px] text-[var(--text-tertiary)]">Failed to load overview</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Tasks"
          value={data.pendingTasks?.length || 0}
          icon={ClipboardList}
          color="var(--warning)"
          onClick={onNavigateToTab ? () => onNavigateToTab('tasks-followup') : undefined}
        />
        <StatCard
          label="Assigned Tasks"
          value={data.assignedTasks?.length || 0}
          icon={Users}
          color="var(--accent)"
          onClick={onNavigateToTab ? () => onNavigateToTab('tasks-followup') : undefined}
        />
        <StatCard
          label="Open Projects"
          value={data.openProjects?.length || 0}
          icon={FolderKanban}
          color="var(--success)"
          onClick={onNavigateToTab ? () => onNavigateToTab('projects') : undefined}
        />
        <StatCard
          label="Module Items"
          value={Object.values(data.openModuleItems || {}).flat().length}
          icon={Package}
          color="var(--info)"
        />
      </div>

      {/* Operations Radar — BUILTIN_OPS only */}
      {((data.lowStockSkus?.length ?? 0) > 0 || (data.atRiskOpenOrders?.length ?? 0) > 0) && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Radar size={14} className="text-[var(--danger)]" />
            Operations Radar
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Low Stock SKUs — Top 10 */}
            {(data.lowStockSkus?.length ?? 0) > 0 && (
              <div className="data-cell space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Box size={16} className="text-[var(--warning)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">Low Stock SKUs</span>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{data.lowStockSkus!.length}</span>
                </div>
                <div className="space-y-2">
                  {data.lowStockSkus!.slice(0, 10).map((item: LowStockSku) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                      onClick={() => onNavigateToTab?.('inventory')}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] text-[var(--accent)] truncate">{item.sku}</span>
                        </div>
                        {item.description && (
                          <p className="text-[11px] text-[var(--text-tertiary)] truncate">{item.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-semibold tabular-nums text-[var(--danger)]">{item.qtyOnHand}</p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">of {item.reorderPoint}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {(data.lowStockSkus?.length ?? 0) > 10 && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center">
                    +{data.lowStockSkus!.length - 10} more
                  </p>
                )}
              </div>
            )}

            {/* At-Risk Open Orders — Top 5 */}
            {(data.atRiskOpenOrders?.length ?? 0) > 0 && (
              <div className="data-cell space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Factory size={16} className="text-[var(--danger)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">At-Risk Open Orders</span>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{data.atRiskOpenOrders!.length}</span>
                </div>
                <div className="space-y-2">
                  {data.atRiskOpenOrders!.slice(0, 5).map((order: AtRiskOpenOrder) => {
                    const riskMeta = OOR_RISK_META[order.riskLevel as OorRiskLevel]
                    return (
                      <div
                        key={order.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                        onClick={() => onNavigateToTab?.('po-tracking')}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-[12px] text-[var(--accent)]">{order.customerPoNumber || '—'}</span>
                            {riskMeta && (
                              <span
                                className="badge text-[10px]"
                                style={{
                                  background: `var(--${riskMeta.tone === 'danger' ? 'danger' : 'warning'})20`,
                                  color: `var(--${riskMeta.tone === 'danger' ? 'danger' : 'warning'})`,
                                }}
                              >
                                {riskMeta.label}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--text-tertiary)] truncate">
                            {order.itemNumber && <span className="font-mono">{order.itemNumber}</span>}
                            {order.itemNumber && order.description && ' — '}
                            {order.description}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[12px] font-semibold tabular-nums text-[var(--text-secondary)]">{order.qtyRemaining.toLocaleString()}</p>
                          {order.requiredDeliveryDate && (
                            <p className="text-[10px] text-[var(--text-tertiary)]">
                              Due {formatDate(order.requiredDeliveryDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {(data.atRiskOpenOrders?.length ?? 0) > 5 && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center">
                    +{data.atRiskOpenOrders!.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Urgent Tasks */}
      {urgentTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--warning)]" />
              Urgent Tasks
            </h3>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('tasks-followup')}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {urgentTasks.map((task: any) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Open Projects - sorted by targetEndDate (due-date first) */}
      {data.openProjects && data.openProjects.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <FolderKanban size={14} className="text-[var(--accent)]" />
              Open Projects
            </h3>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('projects')}
                className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div className="space-y-2">
            {[...data.openProjects]
              .sort((a: any, b: any) => {
                const aDate = a.targetEndDate ? new Date(a.targetEndDate).getTime() : Infinity
                const bDate = b.targetEndDate ? new Date(b.targetEndDate).getTime() : Infinity
                return aDate - bDate
              })
              .slice(0, 5)
              .map((project: any) => (
                <ProjectRow key={project.id} project={project} />
              ))}
          </div>
        </div>
      )}

      {/* Module Items by Category */}
      {moduleStats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
            <Package size={14} className="text-[var(--accent)]" />
            Open Module Items
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {moduleStats.map(({ key, label, icon: Icon, count, items }) => (
              <div key={key} className="data-cell space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-[var(--accent)]" />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums">{count}</span>
                </div>
                <div className="space-y-2">
                  {items.map((item: any) => (
                    <ModuleItemRow key={item.id} item={item} moduleKey={key} />
                  ))}
                </div>
                {count > 3 && (
                  <p className="text-xs text-[var(--text-tertiary)] text-center">
                    +{count - 3} more
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {data.pendingTasks?.length === 0 &&
        data.openProjects?.length === 0 &&
        moduleStats.length === 0 && (
          <div className="text-center py-12">
            <CheckCircle2 size={40} className="mx-auto text-[var(--success)] mb-3 opacity-50" />
            <p className="text-[14px] text-[var(--text-primary)] font-medium">All caught up!</p>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
              No pending tasks or open items in {departmentName || 'this department'}
            </p>
          </div>
        )}
    </div>
  )
}
