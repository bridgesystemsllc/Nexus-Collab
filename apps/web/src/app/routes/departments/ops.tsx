import { useState, useMemo, useEffect, Fragment } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Boxes,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Cog,
  DollarSign,
  Eye,
  Factory,
  FolderKanban,
  LayoutDashboard,
  LayoutGrid,
  Mail,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Table2,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { api } from '@/lib/api'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'
import { GeodisFeedHeader } from '@/components/ops/inventory/GeodisFeedHeader'
import { DepartmentProjectsTab } from '@/modules/projects/ProjectsModule'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { AddToCowork, type AddToCoworkItem } from '@/components/shared/AddToCowork'
import { OpenOrderImport } from '@/components/ops/production/OpenOrderImport'
import { OpenOrdersView, OpenOrderDrawer } from '@/components/ops/production/OpenOrdersView'
import { toOpenOrder, toProductionShape, type OpenOrder } from '@/components/ops/production/openOrderData'
import { ProductionEmailModal } from '@/components/ops/production/ProductionEmailModal'
import { ProductionOrderDrawer } from '@/components/ops/production/ProductionOrderDrawer'
import { CMTab } from '@/components/cm/CMTab'
import { ComponentsTab } from '@/components/ops/ComponentsTab'
import { BOMTab } from '@/components/ops/BOMTab'
import { PoTrackingOverlay, type PoTrackingScope } from '@/components/ops/poTracking/PoTrackingTab'
import { brandLabel } from '@/components/ops/brandLabel'
import { useAppStore } from '@/stores/appStore'


// ─── Types ─────────────────────────────────────────────────
type OpsTab = 'projects' | 'inventory' | 'production' | 'components' | 'bom' | 'cm'

const TABS: { key: OpsTab; label: string; icon: React.ElementType }[] = [
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'inventory', label: 'Inventory Health', icon: Box },
  { key: 'production', label: 'Production Tracking', icon: Factory },
  { key: 'components', label: 'Components', icon: Boxes },
  { key: 'bom', label: 'Bill of Materials', icon: ClipboardList },
  { key: 'cm', label: 'CM Productivity', icon: Users },
]

interface TabProps {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  onSelect: (item: any) => void
}

// ─── Skeletons ─────────────────────────────────────────────
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

// ─── Removed Tab Frame ─────────────────────────────────────
function RemovedTabFrame({ onBack, onCatalog }: { onBack: () => void; onCatalog: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mb-6">
        <Package size={32} className="text-[var(--text-tertiary)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        SKU Pipeline has been removed
      </h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-8">
        This Operations tab is no longer part of Nexus. SKU records are still in the workspace.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ArrowLeft size={16} />
          Back to Operations
        </button>
        <button
          onClick={onCatalog}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
        >
          <LayoutDashboard size={16} />
          Open Product Catalog
        </button>
      </div>
    </div>
  )
}

// ─── Removed Brand Transition Frame ────────────────────────
function RemovedBrandFrame({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mb-6">
        <TrendingUp size={32} className="text-[var(--text-tertiary)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        Brand Transition has been removed
      </h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-8">
        Brand records stay.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <ArrowLeft size={16} />
        Back to Operations
      </button>
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
                  background: isComplete ? 'var(--accent)' : 'var(--border-default)',
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

// ─── Shared bits ───────────────────────────────────────────
function TabHeader({
  title,
  count,
  view,
  onView,
  onNew,
  newLabel,
  children,
}: {
  title: string
  count: number
  view: ViewMode
  onView: (v: ViewMode) => void
  onNew?: () => void
  newLabel: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-[var(--text-primary)]">{title}</h2>
        <span className="text-xs text-[var(--text-tertiary)]">{count}</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {children}
        <ViewToggle value={view} onChange={onView} />
        {onNew && (
          <button onClick={onNew} className="btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-lg w-fit">
            <Plus size={15} />
            {newLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function RowActions({ cowork, onEdit }: { cowork: AddToCoworkItem; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <AddToCowork item={cowork} variant="icon" />
      <button
        onClick={onEdit}
        title="Edit"
        aria-label="Edit"
        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <Pencil size={15} />
      </button>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">{text}</p>
}

// ─── SKU Pipeline: brand badge + ERP surfacing ─────────────
function BrandBadge({ brand }: { brand?: string }) {
  if (!brand) return <span className="text-[var(--text-tertiary)]">—</span>
  return <span className="badge badge-accent whitespace-nowrap">{brandLabel(brand)}</span>
}



// ─── Inventory Health Tab ──────────────────────────────────
// A row's warehouse, plus the one piece of state that only exists for feed-fed
// rows: a SKU the supplier stopped reporting is held at zero rather than
// deleted, and that distinction has to be visible or it reads as real zero
// stock with no explanation.
function WarehouseTag({ warehouse, missingSince }: { warehouse?: string; missingSince?: string | null }) {
  const isGeodis = warehouse === 'GEODIS'
  if (missingSince) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
        style={{ background: 'rgba(255, 159, 10, 0.12)', color: 'var(--warning)' }}
        title={`Not on the ${isGeodis ? 'Geodis' : ''} report since ${new Date(missingSince).toLocaleDateString()}`}
      >
        {isGeodis ? 'Geodis' : 'KarEve'} · dropped
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={
        isGeodis
          ? { background: 'var(--accent-subtle)', color: 'var(--accent)' }
          : { background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }
      }
    >
      {isGeodis ? 'Geodis' : 'KarEve'}
    </span>
  )
}

// Warehouses are separate INVENTORY_HEALTH modules, so a SKU stocked in both
// appears once per warehouse. The tab blends them into one list and lets the
// segmented control narrow it, which is why every row carries __warehouse and
// __moduleId — the row still needs to know where it came from to be edited.
type WarehouseFilter = 'All' | 'KAREVE' | 'GEODIS'

function InventoryHealthTab({
  items,
  geodisItems = [],
  moduleId,
  geodisModuleId = null,
  departmentId,
  onSelect,
}: TabProps & { geodisItems?: any[]; geodisModuleId?: string | null }) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('table')
  const [brandFilter, setBrandFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>('All')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  const hasGeodis = geodisItems.length > 0 || !!geodisModuleId

  // Manual records always belong to the KarEve module. Geodis rows are owned by
  // the feed and overwritten on every import, so hand-editing them would be
  // silently undone — "New Record" is hidden while viewing Geodis alone.
  const openCreate = () =>
    openForm({ formType: 'opsInventory', mode: 'create', context: { moduleId, departmentId } })
  const openEdit = (item: any) =>
    openForm({
      formType: 'opsInventory',
      mode: 'edit',
      recordId: item.id,
      context: { moduleId: item.__moduleId ?? moduleId, departmentId, initialData: item.data },
    })

  const statusConfig: Record<string, { badge: string; rowClass: string }> = {
    emergency: { badge: 'badge-emergency', rowClass: 'emergency' },
    critical: { badge: 'badge-critical', rowClass: '' },
    healthy: { badge: 'badge-healthy', rowClass: '' },
    overstock: { badge: 'badge-info', rowClass: '' },
  }
  const sortOrder: Record<string, number> = { emergency: 0, critical: 1, healthy: 2, overstock: 3 }

  // Tag each row with its warehouse and owning module before blending, so the
  // filters, the column, and the edit target all read from one source.
  const allItems = useMemo(
    () => [
      ...items.map((i: any) => ({ ...i, __warehouse: 'KAREVE', __moduleId: moduleId })),
      ...geodisItems.map((i: any) => ({ ...i, __warehouse: 'GEODIS', __moduleId: geodisModuleId })),
    ],
    [items, geodisItems, moduleId, geodisModuleId],
  )

  const warehouseScoped = allItems.filter(
    (item: any) => warehouseFilter === 'All' || item.__warehouse === warehouseFilter,
  )

  // Brand and status options follow the warehouse in view — offering a filter
  // that can only ever return nothing is worse than offering fewer.
  const brands = ['All', ...Array.from(new Set(warehouseScoped.map((item: any) => item.data?.brand).filter(Boolean)))]
  const statuses = [
    'All',
    ...Array.from(new Set(warehouseScoped.map((item: any) => item.data?.status).filter(Boolean))).sort(
      (a: any, b: any) => (sortOrder[a] ?? 99) - (sortOrder[b] ?? 99),
    ),
  ]
  const filtered = warehouseScoped.filter((item: any) => {
    const d = item.data || {}
    if (brandFilter !== 'All' && d.brand !== brandFilter) return false
    if (statusFilter !== 'All' && d.status !== statusFilter) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => (sortOrder[a.data?.status] ?? 99) - (sortOrder[b.data?.status] ?? 99))

  const geodisCount = allItems.filter((i: any) => i.__warehouse === 'GEODIS').length

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamp the current page when the list or page size shrinks (e.g. after
  // changing a filter or the per-page count) so we never land past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  // Reset to the first page whenever the filtered set or page size changes.
  useEffect(() => {
    setPage(1)
  }, [brandFilter, statusFilter, warehouseFilter, pageSize])

  // Switching warehouse can strip the option the brand/status chips are set to,
  // which would show an empty table with no obvious cause. Clear them instead.
  useEffect(() => {
    setBrandFilter('All')
    setStatusFilter('All')
  }, [warehouseFilter])

  const pageStart = (page - 1) * pageSize
  const paged = sorted.slice(pageStart, pageStart + pageSize)

  const cowork = (d: any, id: string): AddToCoworkItem => ({
    name: d.name || d.sku || 'Inventory',
    type: 'Inventory',
    id,
    description: `SKU ${d.sku || ''} — ${d.status || ''} (${d.available ?? 0} available)`.trim(),
  })

  const coverageColor = (m: number) =>
    m === 0 ? 'var(--danger)' : m < 1 ? 'var(--warning)' : m > 20 ? 'var(--info)' : 'var(--text-secondary)'

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'bg-[var(--accent)] text-white border-transparent'
        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
    }`

  const segment = (active: boolean) =>
    `relative px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
      active
        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
    }`

  return (
    <div className="space-y-4">
      <TabHeader
        title="Inventory records"
        count={filtered.length}
        view={view}
        onView={setView}
        onNew={warehouseFilter === 'GEODIS' ? undefined : openCreate}
        newLabel="New Record"
      >
        {hasGeodis && (
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-[var(--bg-overlay)] border border-[var(--border-subtle)]">
            {([
              ['All', 'All', allItems.length],
              ['KAREVE', 'KarEve', items.length],
              ['GEODIS', 'Geodis', geodisCount],
            ] as [WarehouseFilter, string, number][]).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setWarehouseFilter(key)}
                className={segment(warehouseFilter === key)}
              >
                {label}
                <span className="ml-1.5 tabular-nums text-[var(--text-tertiary)]">{count}</span>
              </button>
            ))}
          </div>
        )}
      </TabHeader>

      {hasGeodis && warehouseFilter !== 'KAREVE' && <GeodisFeedHeader itemCount={geodisCount} />}

      {brands.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mr-1">Brand</span>
          {brands.map((brand) => (
            <button key={brand} onClick={() => setBrandFilter(brand)} className={chip(brandFilter === brand)}>
              {brand === 'All' ? 'All' : brandLabel(brand)}
            </button>
          ))}
        </div>
      )}

      {statuses.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mr-1">Status</span>
          {statuses.map((status) => (
            <button key={status} onClick={() => setStatusFilter(status)} className={chip(statusFilter === status)}>
              {status === 'All' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + pageSize, sorted.length)} of {sorted.length}
            {' · '}Page {page} of {totalPages}
          </span>
          <label className="flex items-center gap-2">
            <span>Per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState text="No inventory data found." />
      ) : sorted.length === 0 ? (
        <EmptyState text="No inventory records match these filters." />
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Brand</th>
                {hasGeodis && <th>Warehouse</th>}
                <th>On-Hand</th>
                <th>Committed</th>
                <th>Available</th>
                <th>Coverage (Mo)</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item: any) => {
                const d = item.data
                const cfg = statusConfig[d.status] || { badge: 'badge-accent', rowClass: '' }
                return (
                  <tr key={item.id} className={`clickable-row ${cfg.rowClass}`} onClick={() => onSelect(item)}>
                    <td className="font-mono text-xs text-[var(--text-secondary)]">{d.sku}</td>
                    <td className="font-medium text-[var(--text-primary)]">{d.name}</td>
                    <td>{d.brand ? <BrandBadge brand={d.brand} /> : <span className="text-[var(--text-tertiary)]">—</span>}</td>
                    {hasGeodis && <td><WarehouseTag warehouse={item.__warehouse} missingSince={d.missingSince} /></td>}
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.onHand?.toLocaleString()}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.committed?.toLocaleString()}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.available?.toLocaleString()}</td>
                    <td className="tabular-nums">
                      {d.coverageMonths == null ? (
                        // Feed-fed warehouses carry no demand figure, so coverage
                        // is genuinely unknown rather than zero. An empty cell
                        // reads as a missing value; say so explicitly.
                        <span className="text-[var(--text-tertiary)]" title="No monthly demand set for this SKU">—</span>
                      ) : (
                        <span style={{ color: coverageColor(d.coverageMonths) }}>{d.coverageMonths}</span>
                      )}
                    </td>
                    <td><span className={`badge ${cfg.badge}`}>{d.status}</span></td>
                    <td><div className="flex justify-end"><RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} /></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {paged.map((item: any) => {
            const d = item.data
            const cfg = statusConfig[d.status] || { badge: 'badge-accent', rowClass: '' }
            return (
              <div key={item.id} className="data-cell flex items-center gap-4 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-[var(--text-primary)] truncate">{d.name}</p>
                  <p className="font-mono text-xs text-[var(--text-tertiary)]">{d.sku}</p>
                </div>
                {d.brand && <BrandBadge brand={d.brand} />}
                {hasGeodis && <WarehouseTag warehouse={item.__warehouse} missingSince={d.missingSince} />}
                <div className="hidden sm:flex items-center gap-6 text-xs text-[var(--text-secondary)] tabular-nums">
                  <span>On-hand <strong className="text-[var(--text-primary)]">{d.onHand?.toLocaleString()}</strong></span>
                  <span>Available <strong className="text-[var(--text-primary)]">{d.available?.toLocaleString()}</strong></span>
                  {d.coverageMonths == null ? (
                    <span className="text-[var(--text-tertiary)]">— mo</span>
                  ) : (
                    <span style={{ color: coverageColor(d.coverageMonths) }}>{d.coverageMonths} mo</span>
                  )}
                </div>
                <span className={`badge ${cfg.badge}`}>{d.status}</span>
                <RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} />
              </div>
            )
          })}
        </div>
      )}

      {sorted.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-xs text-[var(--text-tertiary)]">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Production Tracking Tab ───────────────────────────────
// All three layouts (Table / Board / Open Orders) render the SAME dataset — the
// ERP-synced OPEN_ORDERS module — so the tabs never diverge. Table/Board are the
// production-tracker look; Open Orders is the ERP grouped view.
function ProductionTab({
  departmentId,
  openOrders,
  openOrderModuleId,
  onRefresh,
}: TabProps & {
  openOrders: any[]
  openOrderModuleId: string | null
  onRefresh: () => void
}) {
  const [view, setView] = useState<ViewMode>('table')
  const [mode, setMode] = useState<'production' | 'openOrders'>('production')
  const [mfrFilter, setMfrFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<OpenOrder | null>(null)
  const [emailItem, setEmailItem] = useState<any>(null)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [refreshing, setRefreshing] = useState(false)
  const [trackingScope, setTrackingScope] = useState<PoTrackingScope | null>(null)

  const toggleRow = (id: string) => setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))

  const coworkItem = (o: OpenOrder): AddToCoworkItem => ({
    name: `${o.poNumber} — ${o.manufacturer}`,
    type: 'Open Order',
    id: o.id,
    description: `${o.poStatus} · ${o.qtyRemaining.toLocaleString()} remaining`,
  })

  const orders = useMemo(() => (openOrders || []).map(toOpenOrder), [openOrders])
  const manufacturers = useMemo(
    () => ['All', ...Array.from(new Set(orders.map((o) => o.manufacturer))).sort()],
    [orders],
  )

  const q = search.toLowerCase()
  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (mfrFilter !== 'All' && o.manufacturer !== mfrFilter) return false
        if (!q) return true
        const hay = `${o.poNumber} ${o.manufacturer} ${o.lines
          .map((l) => `${l.sku} ${l.description}`)
          .join(' ')}`.toLowerCase()
        return hay.includes(q)
      }),
    [orders, mfrFilter, q],
  )

  const lineValue = (o: OpenOrder) => o.lines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0)
  const activePOs = filtered.length
  const orderValue = filtered.reduce((s, o) => s + lineValue(o), 0)
  const urgent = filtered.filter((o) => o.urgency === 'Urgent').length
  const unitsRemaining = filtered.reduce((s, o) => s + o.qtyRemaining, 0)

  function statusColor(status: string): string {
    switch (status) {
      case 'Received':
      case 'Shipped':
        return 'var(--success)'
      case 'In Production':
        return 'var(--info)'
      case 'Acknowledged':
        return 'var(--accent)'
      case 'Sent to Vendor':
        return 'var(--warning)'
      default:
        return 'var(--text-tertiary)'
    }
  }
  const receivedPct = (o: OpenOrder) =>
    o.qtyOrdered > 0 ? Math.round((o.qtyReceived / o.qtyOrdered) * 100) : 0
  const productLabel = (o: OpenOrder) =>
    o.lines.length === 0
      ? '—'
      : o.lines.length === 1
        ? o.lines[0].description || o.lines[0].sku
        : `${o.lines[0].description || o.lines[0].sku} +${o.lines.length - 1} more`

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await api.post('/integrations/erp/refresh-open-orders')
      onRefresh()
    } catch (err) {
      console.error('[production] refresh failed', err)
    } finally {
      setRefreshing(false)
    }
  }

  const seg = mode === 'openOrders' ? 'openOrders' : view === 'table' ? 'table' : 'board'
  const SEGMENTS = [
    { key: 'table', label: 'Table', icon: Table2 },
    { key: 'board', label: 'Board', icon: LayoutGrid },
    { key: 'openOrders', label: 'Open Orders', icon: ShoppingCart },
  ] as const
  const selectSeg = (key: 'table' | 'board' | 'openOrders') => {
    if (key === 'openOrders') setMode('openOrders')
    else {
      setMode('production')
      setView(key === 'table' ? 'table' : 'list')
    }
  }

  return (
    <div className="space-y-5">
      {/* Header: title + 3-way view toggle (Table / Board / Open Orders) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">
            {mode === 'openOrders' ? 'Open orders' : 'Production orders'}
          </h2>
          <span className="text-xs text-[var(--text-tertiary)]">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            {SEGMENTS.map(({ key, label, icon: Icon }) => {
              const active = seg === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSeg(key)}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-all ${
                    active
                      ? 'bg-[var(--accent)] text-white shadow-sm'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              )
            })}
          </div>
          {mode === 'production' && (
            <>
              <OpenOrderImport items={openOrders} moduleId={openOrderModuleId} departmentId={departmentId} />
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-colors disabled:opacity-60"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                {refreshing ? 'Syncing…' : 'Refresh from ERP'}
              </button>
            </>
          )}
        </div>
      </div>

      {mode === 'openOrders' ? (
        <>
          <OpenOrdersView
            items={openOrders}
            moduleId={openOrderModuleId}
            onRefresh={onRefresh}
            onOpenTracking={setTrackingScope}
          />
        </>
      ) : (
        <div className="space-y-5">
          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="data-cell flex items-center gap-3 py-4">
              <Package size={18} className="text-[var(--accent)]" />
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Active POs</p>
                <p className="text-2xl font-semibold tabular-nums">{activePOs}</p>
              </div>
            </div>
            <div className="data-cell flex items-center gap-3 py-4">
              <DollarSign size={18} className="text-[var(--success)]" />
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Order Value</p>
                <p className="text-2xl font-semibold tabular-nums">${Math.round(orderValue).toLocaleString()}</p>
              </div>
            </div>
            <div className="data-cell flex items-center gap-3 py-4">
              <AlertTriangle size={18} className="text-[var(--danger)]" />
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Urgent</p>
                <p className="text-2xl font-semibold tabular-nums">{urgent}</p>
              </div>
            </div>
            <div className="data-cell flex items-center gap-3 py-4">
              <Package size={18} className="text-[var(--warning)]" />
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Units Remaining</p>
                <p className="text-2xl font-semibold tabular-nums">{unitsRemaining.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Manufacturer filter + search */}
          <div className="flex items-center gap-2 flex-wrap">
            {manufacturers.map((mfr) => (
              <button
                key={mfr}
                onClick={() => setMfrFilter(mfr)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  mfrFilter === mfr
                    ? 'bg-[var(--accent)] text-white border-transparent'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {mfr}
              </button>
            ))}
            <div className="relative min-w-[260px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                placeholder="Search PO#, manufacturer, SKU..."
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="data-cell text-center py-12 text-sm text-[var(--text-tertiary)]">
              No open orders. Click <span className="text-[var(--text-secondary)] font-medium">Refresh from ERP</span> to pull the latest purchase orders.
            </div>
          ) : view === 'table' ? (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="nexus-table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>PO</th>
                    <th>Product</th>
                    <th>Manufacturer</th>
                    <th>Qty Ordered</th>
                    <th>Status</th>
                    <th>Received</th>
                    <th>ETA</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const color = statusColor(o.poStatus)
                    const isOpen = expandedRows[o.id]
                    const lastNote = o.notes.length > 0 ? o.notes[o.notes.length - 1] : null
                    const expandable = o.lines.length > 0 || o.notes.length > 0
                    return (
                      <Fragment key={o.id}>
                        <tr className="clickable-row" onClick={() => toggleRow(o.id)}>
                          <td className="text-[var(--text-tertiary)]">
                            {expandable && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                          </td>
                          <td className="font-mono text-xs text-[var(--accent)]">{o.poNumber}</td>
                          <td className="font-medium text-[var(--text-primary)]">{productLabel(o)}</td>
                          <td className="text-[var(--text-secondary)]">{o.manufacturer}</td>
                          <td className="tabular-nums text-[var(--text-secondary)]">{o.qtyOrdered.toLocaleString()}</td>
                          <td>
                            <span className="badge" style={{ background: `${color}20`, color }}>{o.poStatus}</span>
                          </td>
                          <td className="tabular-nums text-[var(--text-secondary)]">{receivedPct(o)}%</td>
                          <td className="text-[var(--text-tertiary)]">{o.eta || '—'}</td>
                          <td>
                            <div className="flex justify-end items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                title="Email CM production update"
                                onClick={() => setEmailItem(toProductionShape(o))}
                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                              >
                                <Mail size={15} />
                              </button>
                              <AddToCowork variant="icon" item={coworkItem(o)} />
                              <button
                                title="View / edit PO"
                                onClick={() => setDetail(o)}
                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                              >
                                <Eye size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-[var(--bg-base)]">
                            <td></td>
                            <td colSpan={8} className="py-3">
                              <div className="space-y-3">
                                {/* Products in this PO */}
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                                    Products in this PO
                                  </p>
                                  {o.lines.length === 0 ? (
                                    <p className="text-xs text-[var(--text-tertiary)]">No line items on this PO.</p>
                                  ) : (
                                    <div className="rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                                      {o.lines.map((l) => (
                                        <div key={l.lineNo} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                                          <span className="text-[var(--text-secondary)] min-w-0">
                                            <span className="font-mono text-[var(--text-tertiary)]">{l.sku}</span> {l.description}
                                          </span>
                                          <span className="flex items-center gap-4 tabular-nums text-[var(--text-tertiary)] shrink-0">
                                            <span>Ord {l.qtyOrdered.toLocaleString()}</span>
                                            <span className="text-[var(--success)]">Rec {l.qtyReceived.toLocaleString()}</span>
                                            <span>${l.unitPrice.toFixed(2)}</span>
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                {/* Last update */}
                                {lastNote && (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">
                                      Last update
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)]">{lastNote.noteText}</p>
                                    <p className="text-[10px] text-[var(--text-tertiary)]">
                                      {lastNote.createdBy}
                                      {lastNote.noteDate ? ` · ${lastNote.noteDate}` : ''}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-6">
              {Array.from(new Set(filtered.map((o) => o.manufacturer))).map((mfr) => {
                const mfrOrders = filtered.filter((o) => o.manufacturer === mfr)
                return (
                  <div key={mfr} className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                      <Factory size={15} className="text-[var(--accent)]" />
                      {mfr}
                      <span className="text-xs text-[var(--text-tertiary)]">{mfrOrders.length} POs</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {mfrOrders.map((o) => {
                        const color = statusColor(o.poStatus)
                        const pct = receivedPct(o)
                        const lastNote = o.notes.length > 0 ? o.notes[o.notes.length - 1] : null
                        return (
                          <div key={o.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setDetail(o)}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="badge" style={{ background: `${color}20`, color }}>{o.poStatus}</span>
                                {o.urgency === 'Urgent' && (
                                  <span className="badge" style={{ background: 'var(--danger)20', color: 'var(--danger)' }}>Urgent</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  title="Email CM production update"
                                  onClick={() => setEmailItem(toProductionShape(o))}
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                                >
                                  <Mail size={15} />
                                </button>
                                <AddToCowork variant="icon" item={coworkItem(o)} />
                              </div>
                            </div>
                            <h3 className="font-medium text-sm text-[var(--text-primary)]">{productLabel(o)}</h3>
                            <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                              <span className="font-mono">{o.poNumber}</span>
                              <span className="tabular-nums">Qty: {o.qtyOrdered.toLocaleString()}</span>
                              <span className="tabular-nums">Remaining: {o.qtyRemaining.toLocaleString()}</span>
                              <span>ETA: {o.eta || '—'}</span>
                            </div>
                            <div>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="text-[var(--text-tertiary)]">Received</span>
                                <span className="tabular-nums text-[var(--text-secondary)]">{pct}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                              </div>
                            </div>
                            {lastNote && (
                              <div className="pt-1 border-t border-[var(--border-subtle)]">
                                <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Last update</p>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-2">{lastNote.noteText}</p>
                                <p className="text-[10px] text-[var(--text-tertiary)]">
                                  {lastNote.createdBy}
                                  {lastNote.noteDate ? ` · ${lastNote.noteDate}` : ''}
                                </p>
                              </div>
                            )}
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
      )}

      {/* Shared PO detail/edit drawer for Table + Board */}
      <OpenOrderDrawer
        order={detail}
        moduleId={openOrderModuleId}
        onClose={() => setDetail(null)}
        onRefresh={onRefresh}
        onOpenTracking={() => {
          if (!detail) return
          setDetail(null)
          setTrackingScope({ kind: 'po', value: detail.poNumber, label: detail.poNumber })
        }}
      />
      {trackingScope ? <PoTrackingOverlay scope={trackingScope} onClose={() => setTrackingScope(null)} /> : null}

      {/* CM production-update email (row/card quick action) */}
      <ProductionEmailModal item={emailItem} open={!!emailItem} onClose={() => setEmailItem(null)} />
    </div>
  )
}

// ─── Brand Transition Tab ──────────────────────────────────
function BrandTransitionTab({ items, moduleId, departmentId, onSelect }: TabProps) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('list')

  const openCreate = () =>
    openForm({ formType: 'opsBrand', mode: 'create', context: { moduleId, departmentId } })
  const openEdit = (item: any) =>
    openForm({ formType: 'opsBrand', mode: 'edit', recordId: item.id, context: { moduleId, departmentId, initialData: item.data } })

  const cowork = (d: any, id: string): AddToCoworkItem => ({
    name: d.product || 'Brand Transition',
    type: 'Brand Transition',
    id,
    description: `${d.from || ''} → ${d.to || ''} (${d.status || ''})`.trim(),
  })

  return (
    <div className="space-y-4">
      <TabHeader title="Brand transitions" count={items.length} view={view} onView={setView} onNew={openCreate} newLabel="New Transition" />

      {items.length === 0 ? (
        <EmptyState text="No brand transitions found." />
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>From</th>
                <th>To</th>
                <th>Owner</th>
                <th>Progress</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-medium text-[var(--text-primary)]">{d.product}</td>
                    <td className="text-[var(--text-secondary)]">{d.from}</td>
                    <td className="text-[var(--text-secondary)]">{d.to}</td>
                    <td className="text-[var(--text-secondary)]">{d.owner}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</td>
                    <td><span className="badge badge-info">{d.status}</span></td>
                    <td><div className="flex justify-end"><RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} /></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {items.map((item: any) => {
            const d = item.data
            return (
              <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm text-[var(--text-primary)]">{d.product}</h3>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">{d.owner}</p>
                  </div>
                  <RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} />
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
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
const MODULE_TYPE_BY_TAB: Record<OpsTab, string> = {
  // Projects is not a DepartmentModule — it owns its own tables and fetches
  // its own data, so it has no module type to resolve.
  projects: '',
  inventory: 'INVENTORY_HEALTH',
  production: 'PRODUCTION_TRACKING',
  components: 'COMPONENTS',
  bom: 'BILL_OF_MATERIALS',
  cm: 'CM_PRODUCTIVITY',
}

const FORM_TYPE_BY_MODULE: Record<string, string> = {
  SKU_PIPELINE: 'opsSku',
  INVENTORY_HEALTH: 'opsInventory',
  PRODUCTION_TRACKING: 'opsProduction',
  BRAND_TRANSITION: 'opsBrand',
  COMPONENTS: 'component',
  BILL_OF_MATERIALS: 'bom',
}

const COWORK_TYPE_BY_MODULE: Record<string, string> = {
  SKU_PIPELINE: 'SKU',
  INVENTORY_HEALTH: 'Inventory',
  PRODUCTION_TRACKING: 'Production Order',
  BRAND_TRANSITION: 'Brand Transition',
  COMPONENTS: 'Component',
  BILL_OF_MATERIALS: 'BOM',
}

export function OpsPage() {
  const [activeTab, setActiveTab] = useState<OpsTab>('projects')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)
  const [showRemovedFrame, setShowRemovedFrame] = useState(false)
  const [showRemovedBrandFrame, setShowRemovedBrandFrame] = useState(false)
  const openForm = useAppStore((s) => s.openForm)
  const setPage = useAppStore((s) => s.setPage)

  // Handle legacy ?tab=sku and ?tab=brand URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tabParam = params.get('tab')?.toLowerCase()
    if (tabParam === 'sku' || tabParam === 'sku-pipeline') {
      setShowRemovedFrame(true)
    }
    if (tabParam === 'brand' || tabParam === 'opsbrand') {
      setShowRemovedBrandFrame(true)
    }
  }, [])

  const dismissRemovedFrame = () => {
    setShowRemovedFrame(false)
    // Clean up URL param
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState({}, '', url.pathname + url.search)
  }

  const dismissRemovedBrandFrame = () => {
    setShowRemovedBrandFrame(false)
    // Clean up URL param
    const url = new URL(window.location.href)
    url.searchParams.delete('tab')
    window.history.replaceState({}, '', url.pathname + url.search)
  }

  const goToProductCatalog = () => {
    setShowRemovedFrame(false)
    setPage('product-catalog')
  }

  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const opsDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_OPS') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading, refetch: refetchDept } = useDepartment(opsDept?.id || '')

  // CM Productivity is one shared module owned by R&D, surfaced here in Operations
  // (and in Finance) — edits write to the same module, so all three stay in sync.
  const rdDept = useMemo(
    () => (Array.isArray(departments) ? departments.find((d: any) => d.type === 'BUILTIN_RD') : null),
    [departments],
  )
  const { data: rdDetail, isLoading: rdDetailLoading, isError: rdDetailError, refetch: refetchRd } = useDepartment(rdDept?.id || '')
  const cmModule = useMemo(() => {
    const mods = (rdDetail?.modules as any[]) || []
    return mods.find((m: any) => m.type === 'CM_PRODUCTIVITY') || null
  }, [rdDetail])

  const isLoading = deptsLoading || detailLoading

  const modules = (deptDetail?.modules as any[]) || []
  const moduleByType = (type: string) => modules.find((m: any) => m.type === type) || null

  // Geodis stock is a second INVENTORY_HEALTH module, identified by the
  // warehouse tag its provisioning writes into module config rather than by
  // name, so renaming it in the UI cannot break the split.
  const inventoryModules = modules.filter((m: any) => m.type === 'INVENTORY_HEALTH')
  const geodisModule =
    inventoryModules.find((m: any) => (m.config as any)?.warehouse === 'GEODIS') || null
  const kareveInventoryModule =
    inventoryModules.find((m: any) => m.id !== geodisModule?.id) || null

  const moduleData = useMemo(() => {
    const find = (type: string) => modules.find((m: any) => m.type === type)?.items || []
    return {
      sku: find('SKU_PIPELINE'),
      inventory: kareveInventoryModule?.items || [],
      geodisInventory: geodisModule?.items || [],
      production: find('PRODUCTION_TRACKING'),
      brand: find('BRAND_TRANSITION'),
      components: find('COMPONENTS'),
      bom: find('BILL_OF_MATERIALS'),
      openOrders: find('OPEN_ORDERS'),
    }
  }, [deptDetail])

  const moduleIds = {
    sku: moduleByType('SKU_PIPELINE')?.id ?? null,
    // Manual inventory records belong to the KarEve module specifically, not
    // just the first INVENTORY_HEALTH module found.
    inventory: kareveInventoryModule?.id ?? null,
    geodisInventory: geodisModule?.id ?? null,
    production: moduleByType('PRODUCTION_TRACKING')?.id ?? null,
    brand: moduleByType('BRAND_TRANSITION')?.id ?? null,
    components: moduleByType('COMPONENTS')?.id ?? null,
    bom: moduleByType('BILL_OF_MATERIALS')?.id ?? null,
    openOrders: moduleByType('OPEN_ORDERS')?.id ?? null,
  }

  const emergencyCount = useMemo(
    () => moduleData.inventory.filter((i: any) => i.data?.status === 'emergency').length,
    [moduleData.inventory]
  )

  const deptId = opsDept?.id ?? null

  // Detail dialog → Edit opens the matching full-page form
  const editSelected = () => {
    if (!selectedItem) return
    const moduleType = selectedItem.type
    const formType = FORM_TYPE_BY_MODULE[moduleType]
    const mod = moduleByType(moduleType)
    if (!formType || !mod) return
    setSelectedItem(null)
    openForm({ formType, mode: 'edit', recordId: selectedItem.item.id, context: { moduleId: mod.id, departmentId: deptId, initialData: selectedItem.item.data } })
  }

  const selectedCowork: AddToCoworkItem | undefined = selectedItem
    ? {
        name: selectedItem.item.data?.name || selectedItem.item.data?.product || selectedItem.item.data?.poNumber || 'Item',
        type: COWORK_TYPE_BY_MODULE[selectedItem.type] || 'Item',
        id: selectedItem.item.id,
      }
    : undefined

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: opsDept?.color ? `${opsDept.color}20` : 'var(--accent-subtle)' }}
        >
          {opsDept?.icon || <Cog size={20} />}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">Operations</h1>
            {emergencyCount > 0 && (
              <span className="badge badge-emergency">
                <AlertTriangle size={11} />
                {emergencyCount} emergency
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--text-tertiary)]">SKU pipeline, inventory, production tracking</p>
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
          {showRemovedFrame ? (
            <RemovedTabFrame onBack={dismissRemovedFrame} onCatalog={goToProductCatalog} />
          ) : showRemovedBrandFrame ? (
            <RemovedBrandFrame onBack={dismissRemovedBrandFrame} />
          ) : activeTab === 'projects' ? (
            <DepartmentProjectsTab
              departmentId={deptId}
              departmentName="Operations"
              departmentCode="OPERATIONS"
            />
          ) : isLoading ? (
            activeTab === 'inventory' ? <TableSkeleton /> : <CardsSkeleton />
          ) : activeTab === 'inventory' ? (
            <InventoryHealthTab items={moduleData.inventory} geodisItems={moduleData.geodisInventory} moduleId={moduleIds.inventory} geodisModuleId={moduleIds.geodisInventory} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'INVENTORY_HEALTH' })} />
          ) : activeTab === 'production' ? (
            <ProductionTab items={moduleData.production} moduleId={moduleIds.production} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'PRODUCTION_TRACKING' })} openOrders={moduleData.openOrders} openOrderModuleId={moduleIds.openOrders} onRefresh={() => refetchDept()} />
          ) : activeTab === 'components' ? (
            <ComponentsTab items={moduleData.components} moduleId={moduleIds.components} departmentId={deptId} onRefresh={() => refetchDept()} />
          ) : activeTab === 'bom' ? (
            <BOMTab items={moduleData.bom} moduleId={moduleIds.bom} departmentId={deptId} onRefresh={() => refetchDept()} components={moduleData.components} skuItems={moduleData.sku} />
          ) : (
            <CMTab items={cmModule?.items || []} moduleId={cmModule?.id ?? null} departmentId={rdDept?.id ?? null} onRefresh={() => refetchRd()} productionItems={moduleData.production} isLoading={rdDetailLoading} isError={rdDetailError} onRetry={() => refetchRd()} />
          )}
        </div>
      </div>

      <ItemDetailDialog
        item={selectedItem?.item ?? null}
        moduleType={selectedItem?.type ?? null}
        onClose={() => setSelectedItem(null)}
        onEdit={selectedItem ? editSelected : undefined}
        coworkItem={selectedCowork}
      />
    </div>
  )
}
