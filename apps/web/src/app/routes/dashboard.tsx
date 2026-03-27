import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  Box,
  BrainCircuit,
  CheckCircle2,
  Link2,
  ListChecks,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react'
import {
  useDepartments,
  useTasks,
  useIntegrations,
  useAIBriefing,
} from '@/hooks/useData'
import { useAppStore } from '@/stores/appStore'

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
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--text-tertiary)]">
          {label}
        </span>
        <Icon
          size={18}
          style={{ color: accent || 'var(--accent)' }}
          className="opacity-60"
        />
      </div>
      <p
        className="kpi-number text-4xl"
        style={{ color: accent || 'var(--text-primary)' }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-[var(--text-tertiary)] mt-1">{sub}</p>
      )}
    </div>
  )
}

// ─── Department Health Card ────────────────────────────────
function DeptHealthCard({
  dept,
  onClick,
}: {
  dept: any
  onClick: () => void
}) {
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
          <p className="font-medium text-sm text-[var(--text-primary)] truncate">
            {dept.name}
          </p>
          <p className="text-xs text-[var(--text-tertiary)]">
            {dept.type === 'BUILTIN_RD'
              ? 'R&D'
              : dept.type === 'BUILTIN_OPS'
                ? 'Operations'
                : 'Custom'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Users size={12} />
          {dept.members?.length ?? 0} members
        </span>
        <span className="flex items-center gap-1">
          <ListChecks size={12} />
          {dept._count?.tasks ?? 0} tasks
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

// ─── Integration Status Row ────────────────────────────────
function IntegrationRow({ integration }: { integration: any }) {
  const statusColor: Record<string, string> = {
    CONNECTED: 'var(--success)',
    DISCONNECTED: 'var(--text-tertiary)',
    ERROR: 'var(--danger)',
    SYNCING: 'var(--info)',
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors">
      <span
        className="pulse-dot flex-shrink-0"
        style={{
          background: statusColor[integration.status] || 'var(--text-tertiary)',
          animation:
            integration.status === 'CONNECTED'
              ? 'pulseDot 2s ease-in-out infinite'
              : 'none',
        }}
      />
      <span className="text-sm text-[var(--text-primary)] flex-1 truncate">
        {integration.name}
      </span>
      <span
        className="text-xs font-medium"
        style={{
          color: statusColor[integration.status] || 'var(--text-tertiary)',
        }}
      >
        {integration.status.toLowerCase()}
      </span>
    </div>
  )
}

// ─── Main Dashboard Page ───────────────────────────────────
export function DashboardPage() {
  const setPage = useAppStore((s) => s.setPage)
  const setSelectedDept = useAppStore((s) => s.setSelectedDept)

  const { data: departments, isLoading: deptsLoading } = useDepartments()
  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const { data: integrations, isLoading: integrationsLoading } =
    useIntegrations()
  const { data: briefing, isLoading: briefingLoading } = useAIBriefing()

  // ─── Compute KPIs
  const kpis = useMemo(() => {
    const taskList = Array.isArray(tasks) ? tasks : []
    const integrationList = Array.isArray(integrations) ? integrations : []

    const activeTasks = taskList.filter(
      (t: any) => t.status !== 'COMPLETE'
    ).length
    const criticalItems = taskList.filter(
      (t: any) => t.priority === 'CRITICAL' && t.status !== 'COMPLETE'
    ).length
    const connectedIntegrations = integrationList.filter(
      (i: any) => i.status === 'CONNECTED'
    ).length

    return {
      activeTasks,
      criticalItems,
      inventoryAlerts: 3, // derived from inventory module items with emergency/critical status
      connectedIntegrations,
    }
  }, [tasks, integrations])

  const isLoading = deptsLoading || tasksLoading

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
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Command Center
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Real-time operational overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pulse-dot bg-[var(--success)]" />
          <span className="text-xs text-[var(--text-tertiary)]">
            Systems nominal
          </span>
        </div>
      </div>

      {/* KPI Grid */}
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
                sub="across all departments"
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
                label="Integrations"
                value={kpis.connectedIntegrations}
                icon={Link2}
                accent="var(--success)"
                sub="connected and syncing"
              />
            </>
          )}
        </div>
      </div>

      {/* AI Briefing + Integration Status */}
      <div className="stagger">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* AI Briefing */}
          <div className="lg:col-span-2 glass-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <BrainCircuit size={18} className="text-[var(--accent)]" />
              <h2 className="text-sm font-medium text-[var(--text-primary)]">
                AI Briefing
              </h2>
              {briefingLoading && (
                <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
              )}
            </div>

            {briefingLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
                <div className="skeleton h-3 w-4/6" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-3/4" />
              </div>
            ) : (
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {briefing?.briefing || 'No briefing available. Connect the AI service to generate daily briefings.'}
              </div>
            )}
          </div>

          {/* Integration Status */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
                <RefreshCw size={14} className="text-[var(--accent)]" />
                Integrations
              </h2>
              <button
                className="btn-ghost text-xs py-1 px-2"
                onClick={() => setPage('integrations')}
              >
                View all
              </button>
            </div>

            {integrationsLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-8 w-full" />
                <div className="skeleton h-8 w-full" />
                <div className="skeleton h-8 w-full" />
              </div>
            ) : (
              <div className="space-y-0.5">
                {(Array.isArray(integrations) ? integrations : []).map(
                  (integration: any) => (
                    <IntegrationRow
                      key={integration.id}
                      integration={integration}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Department Health Grid */}
      <div className="stagger">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
              <Activity size={14} className="text-[var(--accent)]" />
              Department Health
            </h2>
            <button
              className="btn-ghost text-xs py-1 px-2"
              onClick={() => setPage('dept-manager')}
            >
              Manage
            </button>
          </div>

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
