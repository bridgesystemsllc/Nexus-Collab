import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Box,
  Calendar,
  CheckCircle2,
  Clock,
  Cog,
  Factory,
  Loader2,
  Package,
  Plus,
  TrendingUp,
  Truck,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'
import { CreateModuleItemDialog } from '@/components/CreateModuleItemDialog'

// ─── Types ─────────────────────────────────────────────────
type OpsTab = 'sku' | 'inventory' | 'production'

const TABS: { key: OpsTab; label: string; icon: React.ElementType }[] = [
  { key: 'sku', label: 'SKU Pipeline', icon: Package },
  { key: 'inventory', label: 'Inventory Health', icon: Box },
  { key: 'production', label: 'Production Tracking', icon: Factory },
]

// ─── Skeleton ──────────────────────────────────────────────
function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-5 flex-1" />
          <div className="skeleton h-5 w-16" />
          <div className="skeleton h-5 w-16" />
          <div className="skeleton h-5 w-20" />
          <div className="skeleton h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="data-cell space-y-3">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-3 w-3/4" />
          <div className="skeleton h-2 w-full" />
        </div>
      ))}
    </div>
  )
}

// ─── Step Progression ──────────────────────────────────────
function StepProgression({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }).map((_, i) => {
        const isComplete = i < step
        const isCurrent = i === step - 1
        return (
          <div key={i} className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full border-2 transition-colors ${
                isComplete
                  ? 'bg-[var(--accent)] border-[var(--accent)]'
                  : 'bg-transparent border-[var(--border-default)]'
              } ${isCurrent ? 'ring-2 ring-[var(--accent-glow)]' : ''}`}
            />
            {i < total - 1 && (
              <div
                className="w-4 h-0.5 mx-0.5"
                style={{
                  background: isComplete
                    ? 'var(--accent)'
                    : 'var(--border-default)',
                }}
              />
            )}
          </div>
        )
      })}
      <span className="text-xs text-[var(--text-tertiary)] ml-2 tabular-nums">
        {step}/{total}
      </span>
    </div>
  )
}

// ─── SKU Pipeline Tab ──────────────────────────────────────
function SKUPipelineTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No SKUs in pipeline.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {items.map((item: any) => {
        const d = item.data
        return (
          <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
            <div>
              <h3 className="font-medium text-sm text-[var(--text-primary)]">
                {d.name}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                <span className="font-mono">{d.sku}</span>
                <span className="font-mono">{d.upc}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="badge badge-info">{d.status}</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                {d.owner}
              </span>
            </div>

            <StepProgression step={d.step} total={d.totalSteps} />

            {d.blocker && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
                <AlertTriangle
                  size={13}
                  className="text-[var(--danger)] mt-0.5 flex-shrink-0"
                />
                <span className="text-xs text-[var(--danger)]">
                  {d.blocker}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Inventory Health Tab ──────────────────────────────────
function InventoryHealthTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No inventory data found.
      </p>
    )
  }

  const statusConfig: Record<string, { badge: string; rowClass: string }> = {
    emergency: { badge: 'badge-emergency', rowClass: 'emergency' },
    critical: { badge: 'badge-critical', rowClass: '' },
    healthy: { badge: 'badge-healthy', rowClass: '' },
    overstock: { badge: 'badge-info', rowClass: '' },
  }

  // Sort: emergency first, then critical, healthy, overstock
  const sortOrder: Record<string, number> = {
    emergency: 0,
    critical: 1,
    healthy: 2,
    overstock: 3,
  }
  const sorted = [...items].sort(
    (a, b) =>
      (sortOrder[a.data?.status] ?? 99) - (sortOrder[b.data?.status] ?? 99)
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product Name</th>
            <th>On-Hand</th>
            <th>Committed</th>
            <th>Available</th>
            <th>Coverage (Mo)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item: any) => {
            const d = item.data
            const cfg = statusConfig[d.status] || {
              badge: 'badge-accent',
              rowClass: '',
            }
            return (
              <tr key={item.id} className={`clickable-row ${cfg.rowClass}`} onClick={() => onSelect(item)}>
                <td className="font-mono text-xs text-[var(--text-secondary)]">
                  {d.sku}
                </td>
                <td className="font-medium text-[var(--text-primary)]">
                  {d.name}
                </td>
                <td className="tabular-nums text-[var(--text-secondary)]">
                  {d.onHand?.toLocaleString()}
                </td>
                <td className="tabular-nums text-[var(--text-secondary)]">
                  {d.committed?.toLocaleString()}
                </td>
                <td className="tabular-nums text-[var(--text-secondary)]">
                  {d.available?.toLocaleString()}
                </td>
                <td className="tabular-nums">
                  <span
                    style={{
                      color:
                        d.coverageMonths === 0
                          ? 'var(--danger)'
                          : d.coverageMonths < 1
                            ? 'var(--warning)'
                            : d.coverageMonths > 20
                              ? 'var(--info)'
                              : 'var(--text-secondary)',
                    }}
                  >
                    {d.coverageMonths}
                  </span>
                </td>
                <td>
                  <span className={`badge ${cfg.badge}`}>{d.status}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Production Tracking Tab ───────────────────────────────
function ProductionTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No production orders found.
      </p>
    )
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'QC Review':
        return 'var(--success)'
      case 'In Production':
        return 'var(--info)'
      case 'Production Scheduled':
        return 'var(--accent)'
      case 'Awaiting Materials':
        return 'var(--warning)'
      default:
        return 'var(--text-tertiary)'
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item: any) => {
        const d = item.data
        const color = statusColor(d.status)
        return (
          <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-[var(--accent)]">
                {d.poNumber}
              </span>
              <span
                className="badge"
                style={{
                  background: `${color}20`,
                  color,
                }}
              >
                {d.status}
              </span>
            </div>

            <h3 className="font-medium text-sm text-[var(--text-primary)]">
              {d.product}
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
              <div className="flex items-center gap-1">
                <Factory size={11} className="text-[var(--text-tertiary)]" />
                {d.cm}
              </div>
              <div className="flex items-center gap-1">
                <Package size={11} className="text-[var(--text-tertiary)]" />
                <span className="tabular-nums">
                  {d.qty?.toLocaleString()}
                </span>
              </div>
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
                    background: color,
                  }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
              <Calendar size={11} />
              ETA: {d.eta}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tab → module type mapping ──────────────────────────────
const TAB_MODULE_TYPE: Record<OpsTab, string> = {
  sku: 'SKU_PIPELINE',
  inventory: 'INVENTORY_HEALTH',
  production: 'PRODUCTION_TRACKING',
}

// ─── Main Page ─────────────────────────────────────────────
export function OpsPage() {
  const [activeTab, setActiveTab] = useState<OpsTab>('sku')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  // Find Operations department from departments list
  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const opsDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_OPS') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading } = useDepartment(
    opsDept?.id || ''
  )

  const isLoading = deptsLoading || detailLoading

  // Organize module items AND ids by type
  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return {
        sku: [], inventory: [], production: [],
        moduleIds: { SKU_PIPELINE: '', INVENTORY_HEALTH: '', PRODUCTION_TRACKING: '' },
      }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) => modules.find((m: any) => m.type === type)?.items || []
    const findId = (type: string) => modules.find((m: any) => m.type === type)?.id || ''

    return {
      sku: find('SKU_PIPELINE'),
      inventory: find('INVENTORY_HEALTH'),
      production: find('PRODUCTION_TRACKING'),
      moduleIds: {
        SKU_PIPELINE: findId('SKU_PIPELINE'),
        INVENTORY_HEALTH: findId('INVENTORY_HEALTH'),
        PRODUCTION_TRACKING: findId('PRODUCTION_TRACKING'),
      },
    }
  }, [deptDetail])

  // Emergency count for header badge
  const emergencyCount = useMemo(
    () =>
      moduleData.inventory.filter(
        (i: any) => i.data?.status === 'emergency'
      ).length,
    [moduleData.inventory]
  )

  const activeModuleType = TAB_MODULE_TYPE[activeTab]
  const activeModuleId = moduleData.moduleIds[activeModuleType as keyof typeof moduleData.moduleIds] ?? ''

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{
            background: opsDept?.color
              ? `${opsDept.color}20`
              : 'var(--accent-subtle)',
          }}
        >
          {opsDept?.icon || <Cog size={20} />}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Operations
            </h1>
            {emergencyCount > 0 && (
              <span className="badge badge-emergency">
                <AlertTriangle size={11} />
                {emergencyCount} emergency
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">
            SKU pipeline, inventory, production tracking
          </p>
        </div>
      </div>

<<<<<<< HEAD
      {/* Tab Navigation + New button */}
      <div className="flex items-center justify-between gap-4">
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
                {tab.key === 'inventory' && emergencyCount > 0 && !isActive && (
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)]" />
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          disabled={isLoading || !activeModuleId}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          <Plus size={15} />
          New {TABS.find(t => t.key === activeTab)?.label?.split(' ')[0]}
        </button>
  
      </div>

      {/* Tab Content */}
      <div className="stagger">
        <div>
          {isLoading ? (
            activeTab === 'inventory' ? (
              <TableSkeleton />
            ) : (
              <CardsSkeleton />
            )
          ) : activeTab === 'sku' ? (
            <SKUPipelineTab items={moduleData.sku} onSelect={(item) => setSelectedItem({ item, type: 'SKU_PIPELINE' })} />
          ) : activeTab === 'inventory' ? (
            <InventoryHealthTab items={moduleData.inventory} onSelect={(item) => setSelectedItem({ item, type: 'INVENTORY_HEALTH' })} />
          ) : (
            <ProductionTab items={moduleData.production} onSelect={(item) => setSelectedItem({ item, type: 'PRODUCTION_TRACKING' })} />
          )}
        </div>
      </div>

      <ItemDetailDialog
        item={selectedItem?.item ?? null}
        moduleType={selectedItem?.type ?? null}
        onClose={() => setSelectedItem(null)}
      />

      <CreateModuleItemDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        moduleType={activeModuleType}
        moduleId={activeModuleId}
        deptId={opsDept?.id ?? ''}
      />
    </div>
  )
}
