import { useState, useMemo } from 'react'
import {
  ArrowRight,
  Beaker,
  CheckCircle2,
  Clock,
  FileText,
  FlaskConical,
  Loader2,
  Repeat2,
  Sparkles,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
]

// ─── Skeleton ──────────────────────────────────────────────
function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-5 flex-1"
              style={{ maxWidth: c === 0 ? '240px' : '120px' }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="data-cell space-y-3">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// ─── Phase Progress Bar ────────────────────────────────────
function PhaseBar({ phase, total }: { phase: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{
            background:
              i < phase ? 'var(--accent)' : 'var(--border-default)',
          }}
        />
      ))}
      <span className="text-xs text-[var(--text-tertiary)] ml-1.5 tabular-nums">
        {phase}/{total}
      </span>
    </div>
  )
}

// ─── Status Badge ──────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'Formula Approved': 'badge-healthy',
    'In Formulation': 'badge-info',
    'Stability Testing': 'badge-critical',
    'Brief Submitted': 'badge-accent',
    'Approved': 'badge-healthy',
    'In Review': 'badge-info',
    'Draft': 'badge-accent',
    'Complete': 'badge-healthy',
    'In Progress': 'badge-info',
    'Planning': 'badge-critical',
    'Pass': 'badge-healthy',
    'Testing': 'badge-critical',
    'Pending': 'badge-accent',
  }

  return (
    <span className={`badge ${map[status] || 'badge-accent'}`}>
      {status}
    </span>
  )
}

// ─── Active Briefs Tab ─────────────────────────────────────
function BriefsTab({ items }: { items: any[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No active briefs found.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <th>Brief Name</th>
            <th>Brand</th>
            <th>CM</th>
            <th>Status</th>
            <th>Phase Progress</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const d = item.data
            return (
              <tr key={item.id}>
                <td className="font-medium text-[var(--text-primary)]">
                  {d.name}
                </td>
                <td className="text-[var(--text-secondary)]">{d.brand}</td>
                <td className="text-[var(--text-secondary)]">{d.cm}</td>
                <td>
                  <StatusBadge status={d.status} />
                </td>
                <td className="min-w-[160px]">
                  <PhaseBar phase={d.phase} total={d.totalPhases} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── CM Productivity Tab ───────────────────────────────────
function CMTab({ items }: { items: any[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No CM data found.
      </p>
    )
  }

  function percentColor(val: number): string {
    if (val >= 90) return 'var(--success)'
    if (val >= 80) return 'var(--warning)'
    return 'var(--danger)'
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item: any) => {
        const d = item.data
        return (
          <div key={item.id} className="data-cell space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--text-primary)]">
                {d.name}
              </h3>
              {d.status === 'attention' && (
                <span className="badge badge-critical">Attention</span>
              )}
            </div>

            <div className="text-xs text-[var(--text-tertiary)]">
              {(d.brands || []).join(', ')}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-[var(--text-tertiary)]">On-Time</p>
                <p
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: percentColor(d.onTime) }}
                >
                  {d.onTime}%
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-tertiary)]">Quality</p>
                <p
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: percentColor(d.quality) }}
                >
                  {d.quality}%
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
              <span>{d.activePOs} active POs</span>
              <span>{d.openIssues} issues</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tech Transfers Tab ────────────────────────────────────
function TransfersTab({ items }: { items: any[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No tech transfers found.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {items.map((item: any) => {
        const d = item.data
        return (
          <div key={item.id} className="data-cell space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-[var(--text-primary)]">
                {d.product}
              </h3>
              <StatusBadge status={d.status} />
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="truncate">{d.from}</span>
              <ArrowRight size={12} className="text-[var(--accent)] flex-shrink-0" />
              <span className="truncate">{d.to}</span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--text-tertiary)]">Progress</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {d.progress}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${d.progress}%`,
                    background:
                      d.progress === 100 ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Target: {d.target}
              </span>
              <span>{d.docs} docs</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Formulations Tab ──────────────────────────────────────
function FormulationsTab({ items }: { items: any[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No formulations found.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Version</th>
            <th>Status</th>
            <th>Stability</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const d = item.data
            return (
              <tr key={item.id}>
                <td className="font-medium text-[var(--text-primary)]">
                  {d.product}
                </td>
                <td>
                  <span className="badge badge-accent font-mono text-xs">
                    {d.ver}
                  </span>
                </td>
                <td>
                  <StatusBadge status={d.status} />
                </td>
                <td>
                  <StatusBadge status={d.stability} />
                </td>
                <td className="text-[var(--text-secondary)] max-w-[300px] truncate">
                  {d.changes}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function RDPage() {
  const [activeTab, setActiveTab] = useState<RDTab>('briefs')

  // Find R&D department from departments list
  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const rdDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_RD') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading } = useDepartment(
    rdDept?.id || ''
  )

  const isLoading = deptsLoading || detailLoading

  // Organize module items by type
  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return { briefs: [], cm: [], transfers: [], formulations: [] }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: rdDept?.color ? `${rdDept.color}20` : 'var(--accent-subtle)' }}
        >
          {rdDept?.icon || <Beaker size={20} />}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            R&D Department
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Formulations, briefs, tech transfers, CM coordination
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="stagger">
        <div>
          {isLoading ? (
            activeTab === 'briefs' || activeTab === 'formulations' ? (
              <TableSkeleton />
            ) : (
              <CardsSkeleton />
            )
          ) : activeTab === 'briefs' ? (
            <BriefsTab items={tabContent.briefs} />
          ) : activeTab === 'cm' ? (
            <CMTab items={tabContent.cm} />
          ) : activeTab === 'transfers' ? (
            <TransfersTab items={tabContent.transfers} />
          ) : (
            <FormulationsTab items={tabContent.formulations} />
          )}
        </div>
      </div>
    </div>
  )
}
