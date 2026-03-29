import { useState, useMemo } from 'react'
import {
  Database,
  FileText,
  Filter,
  ListChecks,
  Package,
  Search,
  Factory,
  Beaker,
  Box,
  AlertTriangle,
  Repeat2,
  FlaskConical,
  Users,
} from 'lucide-react'
import { useEverything } from '@/hooks/useData'
import { TaskDetailDialog } from '@/components/TaskDetailDialog'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'

// ─── Filter Config ─────────────────────────────────────────
const TYPE_FILTERS: {
  key: string
  label: string
  icon: React.ElementType
  color: string
}[] = [
  { key: 'ALL', label: 'All', icon: Database, color: 'var(--accent)' },
  { key: 'BRIEFS', label: 'Briefs', icon: FileText, color: '#9B59B6' },
  { key: 'TASK', label: 'Tasks', icon: ListChecks, color: '#2F80ED' },
  { key: 'INVENTORY_HEALTH', label: 'Inventory', icon: Box, color: '#D97706' },
  { key: 'PRODUCTION_TRACKING', label: 'Production', icon: Factory, color: '#0F7B6C' },
  { key: 'DOCUMENT', label: 'Documents', icon: FileText, color: '#2F80ED' },
  { key: 'CM_PRODUCTIVITY', label: 'CM', icon: Users, color: '#E74C8B' },
  { key: 'TECH_TRANSFERS', label: 'Transfers', icon: Repeat2, color: '#EB5757' },
  { key: 'FORMULATIONS', label: 'Formulations', icon: FlaskConical, color: '#0F7B6C' },
  { key: 'SKU_PIPELINE', label: 'SKU Pipeline', icon: Package, color: '#7C3AED' },
]

// ─── Skeleton ──────────────────────────────────────────────
function TableSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, r) => (
        <div key={r} className="flex gap-4 py-3">
          <div className="skeleton h-5 w-20" />
          <div className="skeleton h-5 flex-1" />
          <div className="skeleton h-5 w-20" />
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-5 w-24" />
        </div>
      ))}
    </div>
  )
}

// ─── Type Badge ────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const config = TYPE_FILTERS.find((f) => f.key === type)
  const color = config?.color || 'var(--text-tertiary)'
  const label = config?.label || type

  return (
    <span
      className="badge text-xs"
      style={{
        background: `${color}20`,
        color,
      }}
    >
      {label}
    </span>
  )
}

// ─── Status Display ────────────────────────────────────────
function StatusDisplay({ status }: { status: string | null }) {
  if (!status) return <span className="text-[var(--text-tertiary)]">--</span>

  const statusMap: Record<string, string> = {
    emergency: 'badge-emergency',
    critical: 'badge-critical',
    CRITICAL: 'badge-critical',
    healthy: 'badge-healthy',
    overstock: 'badge-info',
    COMPLETE: 'badge-healthy',
    Complete: 'badge-healthy',
    'Formula Approved': 'badge-healthy',
    Approved: 'badge-healthy',
    Pass: 'badge-healthy',
    IN_PROGRESS: 'badge-info',
    'In Progress': 'badge-info',
    'In Formulation': 'badge-info',
    'In Review': 'badge-info',
    IN_REVIEW: 'badge-info',
    NOT_STARTED: 'badge-accent',
    BLOCKED: 'badge-emergency',
    'Brief Submitted': 'badge-accent',
    'Stability Testing': 'badge-critical',
    Draft: 'badge-accent',
    Planning: 'badge-critical',
    active: 'badge-healthy',
    attention: 'badge-critical',
  }

  return (
    <span className={`badge ${statusMap[status] || 'badge-accent'}`}>
      {status}
    </span>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function EverythingPage() {
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)

  // Build filters for the API
  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    if (typeFilter !== 'ALL') f.type = typeFilter
    if (search) f.search = search
    return f
  }, [typeFilter, search])

  const { data, isLoading } = useEverything(filters)

  const records: any[] = data?.records || []
  const kpis = data?.kpis || { total: 0, byType: {}, emergency: 0 }

  // Debounced search on Enter
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      setSearch(searchInput)
    }
  }

  // Count for active filter
  const activeFilterCount =
    typeFilter !== 'ALL' ? records.length : kpis.total

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database size={22} className="text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Everything
            </h1>
            <p className="text-sm text-[var(--text-tertiary)]">
              Unified database across all departments and modules
            </p>
          </div>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="stagger">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="data-cell flex items-center gap-3 py-3">
            <Database size={16} className="text-[var(--accent)]" />
            <div>
              <p className="kpi-number text-2xl">{kpis.total}</p>
              <p className="text-xs text-[var(--text-tertiary)]">
                Total Records
              </p>
            </div>
          </div>

          {Object.entries(kpis.byType as Record<string, number>)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 6)
            .map(([type, count]) => {
              const config = TYPE_FILTERS.find((f) => f.key === type)
              return (
                <div
                  key={type}
                  className="data-cell flex items-center gap-3 py-3 cursor-pointer"
                  onClick={() => setTypeFilter(type)}
                >
                  <div>
                    <p className="kpi-number text-xl tabular-nums">{count}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {config?.label || type}
                    </p>
                  </div>
                </div>
              )
            })}

          {kpis.emergency > 0 && (
            <div className="data-cell flex items-center gap-3 py-3" style={{ borderColor: 'var(--danger)' }}>
              <AlertTriangle
                size={16}
                className="text-[var(--danger)]"
              />
              <div>
                <p className="kpi-number text-xl text-[var(--danger)]">
                  {kpis.emergency}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Emergency
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search + Filters */}
      <div className="space-y-3">
        {/* Search Input */}
        <div className="relative max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <input
            type="text"
            placeholder="Search records... (press Enter)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-full pl-9 pr-4 py-2.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('')
                setSearchInput('')
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter size={14} className="text-[var(--text-tertiary)] mr-1" />
          {TYPE_FILTERS.map((filter) => {
            const isActive = typeFilter === filter.key
            const Icon = filter.icon
            return (
              <button
                key={filter.key}
                onClick={() => setTypeFilter(filter.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? 'border-transparent text-white'
                    : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
                }`}
                style={
                  isActive
                    ? { background: filter.color }
                    : { background: 'var(--bg-surface)' }
                }
              >
                <Icon size={12} />
                {filter.label}
                {isActive && filter.key !== 'ALL' && (
                  <span className="ml-1 opacity-80 tabular-nums">
                    {records.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Unified Table */}
      <div className="stagger">
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton />
            </div>
          ) : records.length === 0 ? (
            <div className="py-16 text-center">
              <Database
                size={32}
                className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-40"
              />
              <p className="text-sm text-[var(--text-tertiary)]">
                No records found
                {search && ` matching "${search}"`}
                {typeFilter !== 'ALL' && ` of type ${typeFilter}`}
              </p>
            </div>
          ) : (
            <table className="nexus-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Department</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record: any) => (
                  <tr
                    key={record.id}
                    className="clickable-row"
                    onClick={() => {
                      if (record.type === 'TASK') {
                        setSelectedTaskId(record.sourceId ?? record.id)
                      } else {
                        setSelectedItem({ item: { id: record.id, data: record.raw ?? record }, type: record.type })
                      }
                    }}
                  >
                    <td>
                      <TypeBadge type={record.type} />
                    </td>
                    <td className="font-medium text-[var(--text-primary)] max-w-[350px] truncate">
                      {record.title}
                    </td>
                    <td>
                      <StatusDisplay status={record.status} />
                    </td>
                    <td>
                      {record.department ? (
                        <span className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              background:
                                record.department.color || 'var(--accent)',
                            }}
                          />
                          {record.department.name}
                        </span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">--</span>
                      )}
                    </td>
                    <td className="text-[var(--text-tertiary)] tabular-nums text-xs whitespace-nowrap">
                      {record.createdAt
                        ? new Date(record.createdAt).toLocaleDateString(
                            'en-US',
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          )
                        : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Record count footer */}
      {!isLoading && records.length > 0 && (
        <p className="text-xs text-[var(--text-tertiary)] text-right tabular-nums">
          Showing {records.length} of {kpis.total} records
        </p>
      )}

      {/* Task Detail Dialog */}
      <TaskDetailDialog
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />

      {/* Item Detail Dialog */}
      <ItemDetailDialog
        item={selectedItem?.item ?? null}
        moduleType={selectedItem?.type ?? null}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  )
}
