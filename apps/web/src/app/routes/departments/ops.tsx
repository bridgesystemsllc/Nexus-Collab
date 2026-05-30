import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Box,
  Calendar,
  CheckCircle2,
  Clock,
  Cog,
  DollarSign,
  Factory,
  LayoutGrid,
  List,
  Loader2,
  Package,
  Plus,
  Search,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'

// ─── Types ─────────────────────────────────────────────────
type OpsTab = 'sku' | 'inventory' | 'production' | 'brand'

const TABS: { key: OpsTab; label: string; icon: React.ElementType }[] = [
  { key: 'sku', label: 'SKU Pipeline', icon: Package },
  { key: 'inventory', label: 'Inventory Health', icon: Box },
  { key: 'production', label: 'Production Tracking', icon: Factory },
  { key: 'brand', label: 'Brand Transition', icon: TrendingUp },
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
              <div className="flex items-start gap-2 p-2 rounded-lg bg-[rgba(255,69,58,0.06)] border border-[rgba(255,69,58,0.15)]">
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
  const [viewMode, setViewMode] = useState<'board' | 'table'>('board')
  const [brandFilter, setBrandFilter] = useState('All')

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

  const brands = ['All', ...Array.from(new Set(items.map((item: any) => item.data?.brand).filter(Boolean)))]
  const filtered = brandFilter === 'All'
    ? items
    : items.filter((item: any) => item.data?.brand === brandFilter)
  const activeOrders = filtered.length
  const orderValue = filtered.reduce((sum: number, item: any) => sum + (item.data?.value ?? 0), 0)
  const emergency = filtered.filter((item: any) => item.data?.priority === 'emergency').length
  const coworkPending = filtered.filter((item: any) => item.data?.coworkPending).length

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="data-cell flex items-center gap-3 py-4">
          <Package size={18} className="text-[var(--accent)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Active Orders</p>
            <p className="text-2xl font-semibold tabular-nums">{activeOrders}</p>
          </div>
        </div>
        <div className="data-cell flex items-center gap-3 py-4">
          <DollarSign size={18} className="text-[var(--success)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Order Value</p>
            <p className="text-2xl font-semibold tabular-nums">${orderValue.toLocaleString()}</p>
          </div>
        </div>
        <div className="data-cell flex items-center gap-3 py-4">
          <AlertTriangle size={18} className="text-[var(--danger)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Emergency</p>
            <p className="text-2xl font-semibold tabular-nums">{emergency}</p>
          </div>
        </div>
        <div className="data-cell flex items-center gap-3 py-4">
          <Users size={18} className="text-[var(--warning)]" />
          <div>
            <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Cowork Pending</p>
            <p className="text-2xl font-semibold tabular-nums">{coworkPending}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit">
          <button
            onClick={() => setViewMode('board')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${viewMode === 'board' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
          >
            <LayoutGrid size={14} />
            Board
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${viewMode === 'table' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}
          >
            <List size={14} />
            Table
          </button>
        </div>

        <button className="btn-primary flex items-center gap-2 w-fit">
          <Plus size={15} />
          New Order
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {brands.map((brand) => (
          <button
            key={brand}
            onClick={() => setBrandFilter(brand)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              brandFilter === brand
                ? 'bg-[var(--accent)] text-white border-transparent'
                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
            }`}
          >
            {brand}
          </button>
        ))}
        <div className="relative min-w-[260px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search SO#, item#, description..."
          />
        </div>
        <span className="badge badge-emergency">Emergency</span>
        <span className="badge badge-accent">Cowork</span>
      </div>

      {viewMode === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>PO</th>
                <th>Product</th>
                <th>CM</th>
                <th>Qty</th>
                <th>Status</th>
                <th>Progress</th>
                <th>ETA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-mono text-xs text-[var(--accent)]">{d.poNumber}</td>
                    <td className="font-medium text-[var(--text-primary)]">{d.product}</td>
                    <td className="text-[var(--text-secondary)]">{d.cm}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.qty?.toLocaleString()}</td>
                    <td><span className="badge" style={{ background: `${statusColor(d.status)}20`, color: statusColor(d.status) }}>{d.status}</span></td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</td>
                    <td className="text-[var(--text-tertiary)]">{d.eta}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(new Set(filtered.map((item: any) => item.data?.cm || 'Unassigned'))).map((cm) => {
            const cmItems = filtered.filter((item: any) => (item.data?.cm || 'Unassigned') === cm)
            return (
              <div key={cm} className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                  <Factory size={15} className="text-[var(--accent)]" />
                  {cm}
                  <span className="text-xs text-[var(--text-tertiary)]">{cmItems.length} active</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {cmItems.map((item: any) => {
                    const d = item.data
                    const color = statusColor(d.status)
                    return (
                      <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                        <div className="flex items-center justify-between">
                          <span className="badge" style={{ background: `${color}20`, color }}>{d.status}</span>
                          <button className="text-xs text-[var(--accent)] hover:underline">Edit</button>
                        </div>
                        <h3 className="font-medium text-sm text-[var(--text-primary)]">{d.product}</h3>
                        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="font-mono">{d.poNumber}</span>
                          <span className="tabular-nums">Qty: {d.qty?.toLocaleString()}</span>
                          <span>Value: ${(d.value ?? 0).toLocaleString()}</span>
                          <span>ETA: {d.eta}</span>
                        </div>
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-[var(--text-tertiary)]">Progress</span>
                            <span className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${d.progress}%`, background: color }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                          <span>Cowork</span>
                          <span>Notes</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const FALLBACK_BRAND_TRANSITIONS = [
  { id: 'brand-1', data: { product: 'CD Scalp Detox Shampoo 8oz', from: "L'Oreal Legacy", to: 'Kareve SKU Master', owner: 'Operations', progress: 50, status: 'Awaiting Artwork', blocker: null } },
  { id: 'brand-2', data: { product: 'CD Scalp Cleansing Oil 6oz', from: 'Formula Lock', to: 'Component Sourcing', owner: 'Vendor Mgmt', progress: 33, status: 'Component Sourcing', blocker: 'TricorBraun MOQ pending' } },
  { id: 'brand-3', data: { product: 'CD Scalp Renew Serum 2oz', from: 'R&D Brief', to: 'Formula Approval', owner: 'R&D', progress: 16, status: 'Formula Pending', blocker: 'Stability testing' } },
]

function BrandTransitionTab({ items }: { items: any[] }) {
  const records = items.length > 0 ? items : FALLBACK_BRAND_TRANSITIONS

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {records.map((item: any) => {
        const d = item.data
        return (
          <div key={item.id} className="data-cell space-y-3">
            <div>
              <h3 className="font-medium text-sm text-[var(--text-primary)]">{d.product}</h3>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">{d.owner}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="truncate">{d.from}</span>
              <TrendingUp size={12} className="text-[var(--accent)] flex-shrink-0" />
              <span className="truncate">{d.to}</span>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--text-tertiary)]">Transition Progress</span>
                <span className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${d.progress}%` }} />
              </div>
            </div>
            <span className="badge badge-info">{d.status}</span>
            {d.blocker && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-[rgba(255,69,58,0.06)] border border-[rgba(255,69,58,0.15)]">
                <AlertTriangle size={13} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
                <span className="text-xs text-[var(--danger)]">{d.blocker}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function OpsPage() {
  const [activeTab, setActiveTab] = useState<OpsTab>('sku')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)

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

  // Organize module items by type
  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return { sku: [], inventory: [], production: [], brand: [] }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []

    return {
      sku: find('SKU_PIPELINE'),
      inventory: find('INVENTORY_HEALTH'),
      production: find('PRODUCTION_TRACKING'),
      brand: find('BRAND_TRANSITION'),
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

      {/* Tab Navigation */}
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit max-w-full overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
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
          ) : activeTab === 'production' ? (
            <ProductionTab items={moduleData.production} onSelect={(item) => setSelectedItem({ item, type: 'PRODUCTION_TRACKING' })} />
          ) : (
            <BrandTransitionTab items={moduleData.brand} />
          )}
        </div>
      </div>

      <ItemDetailDialog
        item={selectedItem?.item ?? null}
        moduleType={selectedItem?.type ?? null}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  )
}
