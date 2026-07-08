import { useState, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Box,
  Boxes,
  ClipboardList,
  Cog,
  DollarSign,
  Factory,
  Loader2,
  Mail,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { api } from '@/lib/api'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'
import { AddToCowork, type AddToCoworkItem } from '@/components/shared/AddToCowork'
import { OpenOrderImport } from '@/components/ops/production/OpenOrderImport'
import { ProductionEmailModal } from '@/components/ops/production/ProductionEmailModal'
import { ProductionOrderDrawer } from '@/components/ops/production/ProductionOrderDrawer'
import { CMTab } from '@/components/cm/CMTab'
import { ComponentsTab } from '@/components/ops/ComponentsTab'
import { BOMTab } from '@/components/ops/BOMTab'
import { brandLabel } from '@/components/ops/brandLabel'
import { useAppStore } from '@/stores/appStore'

// Relative "synced 5m ago" label for ERP-sourced rows.
function relativeTime(dateStr: string): string {
  const then = new Date(dateStr).getTime()
  if (!Number.isFinite(then)) return ''
  const diffMs = Date.now() - then
  if (diffMs < 60_000) return 'just now'
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ─── Types ─────────────────────────────────────────────────
type OpsTab = 'sku' | 'inventory' | 'production' | 'brand' | 'components' | 'bom' | 'cm'

const TABS: { key: OpsTab; label: string; icon: React.ElementType }[] = [
  { key: 'sku', label: 'SKU Pipeline', icon: Package },
  { key: 'inventory', label: 'Inventory Health', icon: Box },
  { key: 'production', label: 'Production Tracking', icon: Factory },
  { key: 'brand', label: 'Brand Transition', icon: TrendingUp },
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

function isErp(d: any): boolean {
  return d?.source === 'ERP_KAREVE'
}

/** Compact On-Hand / Available + "ERP · synced …" chip. Hidden when no ERP data. */
function ErpCell({ d }: { d: any }) {
  const hasStock = d?.onHand != null || d?.available != null
  if (!isErp(d) && !hasStock) return <span className="text-[var(--text-tertiary)]">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      {hasStock && (
        <span className="text-xs tabular-nums text-[var(--text-secondary)]">
          {d.onHand != null && <>OH <strong className="text-[var(--text-primary)]">{Number(d.onHand).toLocaleString()}</strong></>}
          {d.onHand != null && d.available != null && <span className="text-[var(--text-tertiary)]"> · </span>}
          {d.available != null && <>Avail <strong className="text-[var(--text-primary)]">{Number(d.available).toLocaleString()}</strong></>}
        </span>
      )}
      {isErp(d) && (
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
          <span className="badge badge-info px-1.5 py-0">ERP</span>
          {d.lastSyncedAt && <span>synced {relativeTime(d.lastSyncedAt)}</span>}
        </span>
      )}
    </div>
  )
}

function SyncFromErpButton({ departmentId }: { departmentId: string | null }) {
  const qc = useQueryClient()
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')

  const onSync = async () => {
    setSyncing(true)
    setNote('')
    try {
      const res = await api.post('/integrations/ERP_KAREVE_SYNC/sync')
      // The sync runs asynchronously on the server (records are written a beat
      // after the request returns), so poll the log until it completes before
      // invalidating — otherwise the refetch races ahead of the fresh data and
      // the table keeps showing the pre-sync snapshot.
      const logId: string | undefined = res?.data?.syncLogId
      if (logId) {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 700))
          try {
            const logs = await api.get('/integrations/ERP_KAREVE_SYNC/logs')
            const log = (logs?.data || []).find((l: any) => l.id === logId)
            if (log && log.status !== 'RUNNING') break
          } catch {
            break
          }
        }
      }
      if (departmentId) await qc.invalidateQueries({ queryKey: ['department', departmentId] })
      setNote('Synced from ERP')
      setTimeout(() => setNote(''), 4000)
    } catch (err: any) {
      const status = err?.response?.status
      setNote(status === 404 || status === 400 ? 'ERP not configured' : 'Sync failed')
      setTimeout(() => setNote(''), 4000)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">{note}</span>}
      <button
        onClick={onSync}
        disabled={syncing}
        title="Pull on-hand / availability from the KarEve ERP"
        className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50 w-fit"
      >
        {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Sync from ERP
      </button>
    </div>
  )
}

// ─── SKU Pipeline Tab ──────────────────────────────────────
function SKUPipelineTab({ items, moduleId, departmentId, onSelect }: TabProps) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('table')
  const [brandFilter, setBrandFilter] = useState('All')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  const brands = ['All', ...Array.from(new Set(items.map((i: any) => i.data?.brand).filter(Boolean)))]
  const filtered = brandFilter === 'All' ? items : items.filter((i: any) => i.data?.brand === brandFilter)

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  // Clamp the current page when the list or page size shrinks (e.g. after
  // changing the brand filter or per-page count) so we never land past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  // Reset to the first page whenever the filtered set changes.
  useEffect(() => {
    setPage(1)
  }, [brandFilter, pageSize])

  const pageStart = (page - 1) * pageSize
  const paged = filtered.slice(pageStart, pageStart + pageSize)

  const openCreate = () =>
    openForm({ formType: 'opsSku', mode: 'create', context: { moduleId, departmentId } })
  const openEdit = (item: any) =>
    openForm({ formType: 'opsSku', mode: 'edit', recordId: item.id, context: { moduleId, departmentId, initialData: item.data } })

  const cowork = (d: any, id: string): AddToCoworkItem => ({
    name: d.name || d.sku || 'SKU',
    type: 'SKU',
    id,
    description: `SKU ${d.sku || ''} — ${d.status || ''}`.trim(),
  })

  return (
    <div className="space-y-4">
      <TabHeader title="SKUs in pipeline" count={filtered.length} view={view} onView={setView} onNew={openCreate} newLabel="New SKU">
        <SyncFromErpButton departmentId={departmentId} />
      </TabHeader>

      {brands.length > 1 && (
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
              {brand === 'All' ? 'All' : brandLabel(brand)}
            </button>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-[var(--text-secondary)]">
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} of {filtered.length}
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

      {filtered.length === 0 ? (
        <EmptyState text="No SKUs in pipeline." />
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>SKU</th>
                <th>UPC</th>
                <th>Status</th>
                <th>Progress</th>
                <th>ERP</th>
                <th>Owner</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-medium text-[var(--text-primary)]">{d.name}</td>
                    <td><BrandBadge brand={d.brand} /></td>
                    <td className="font-mono text-xs text-[var(--text-secondary)]">{d.sku}</td>
                    <td className="font-mono text-xs text-[var(--text-tertiary)]">{d.upc}</td>
                    <td><span className="badge badge-info">{d.status}</span></td>
                    <td><StepProgression step={d.step} total={d.totalSteps} /></td>
                    <td><ErpCell d={d} /></td>
                    <td className="text-[var(--text-secondary)]">{d.owner}</td>
                    <td><div className="flex justify-end"><RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} /></div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {paged.map((item: any) => {
            const d = item.data
            return (
              <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium text-sm text-[var(--text-primary)]">{d.name}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                      <span className="font-mono">{d.sku}</span>
                      <span className="font-mono">{d.upc}</span>
                    </div>
                  </div>
                  <RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BrandBadge brand={d.brand} />
                    <span className="badge badge-info">{d.status}</span>
                  </div>
                  <span className="text-xs text-[var(--text-tertiary)]">{d.owner}</span>
                </div>
                <StepProgression step={d.step} total={d.totalSteps} />
                {(isErp(d) || d.onHand != null || d.available != null) && (
                  <div className="pt-1 border-t border-[var(--border-subtle)]">
                    <ErpCell d={d} />
                  </div>
                )}
                {d.blocker && (
                  <div className="flex items-start gap-2 p-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
                    <AlertTriangle size={13} className="text-[var(--danger)] mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-[var(--danger)]">{d.blocker}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {filtered.length > 0 && totalPages > 1 && (
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

// ─── Inventory Health Tab ──────────────────────────────────
function InventoryHealthTab({ items, moduleId, departmentId, onSelect }: TabProps) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('table')
  const [brandFilter, setBrandFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)

  const openCreate = () =>
    openForm({ formType: 'opsInventory', mode: 'create', context: { moduleId, departmentId } })
  const openEdit = (item: any) =>
    openForm({ formType: 'opsInventory', mode: 'edit', recordId: item.id, context: { moduleId, departmentId, initialData: item.data } })

  const statusConfig: Record<string, { badge: string; rowClass: string }> = {
    emergency: { badge: 'badge-emergency', rowClass: 'emergency' },
    critical: { badge: 'badge-critical', rowClass: '' },
    healthy: { badge: 'badge-healthy', rowClass: '' },
    overstock: { badge: 'badge-info', rowClass: '' },
  }
  const sortOrder: Record<string, number> = { emergency: 0, critical: 1, healthy: 2, overstock: 3 }

  const brands = ['All', ...Array.from(new Set(items.map((item: any) => item.data?.brand).filter(Boolean)))]
  const statuses = [
    'All',
    ...Array.from(new Set(items.map((item: any) => item.data?.status).filter(Boolean))).sort(
      (a: any, b: any) => (sortOrder[a] ?? 99) - (sortOrder[b] ?? 99),
    ),
  ]
  const filtered = items.filter((item: any) => {
    const d = item.data || {}
    if (brandFilter !== 'All' && d.brand !== brandFilter) return false
    if (statusFilter !== 'All' && d.status !== statusFilter) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => (sortOrder[a.data?.status] ?? 99) - (sortOrder[b.data?.status] ?? 99))

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // Clamp the current page when the list or page size shrinks (e.g. after
  // changing a filter or the per-page count) so we never land past the end.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])
  // Reset to the first page whenever the filtered set or page size changes.
  useEffect(() => {
    setPage(1)
  }, [brandFilter, statusFilter, pageSize])

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

  return (
    <div className="space-y-4">
      <TabHeader title="Inventory records" count={filtered.length} view={view} onView={setView} onNew={openCreate} newLabel="New Record" />

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
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.onHand?.toLocaleString()}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.committed?.toLocaleString()}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.available?.toLocaleString()}</td>
                    <td className="tabular-nums"><span style={{ color: coverageColor(d.coverageMonths) }}>{d.coverageMonths}</span></td>
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
                <div className="hidden sm:flex items-center gap-6 text-xs text-[var(--text-secondary)] tabular-nums">
                  <span>On-hand <strong className="text-[var(--text-primary)]">{d.onHand?.toLocaleString()}</strong></span>
                  <span>Available <strong className="text-[var(--text-primary)]">{d.available?.toLocaleString()}</strong></span>
                  <span style={{ color: coverageColor(d.coverageMonths) }}>{d.coverageMonths} mo</span>
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
function ProductionTab({ items, moduleId, departmentId, onSelect }: TabProps) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('table')
  const [brandFilter, setBrandFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [emailItem, setEmailItem] = useState<any>(null)
  const [detailItem, setDetailItem] = useState<any>(null)

  const openCreate = () =>
    openForm({ formType: 'opsProduction', mode: 'create', context: { moduleId, departmentId } })
  const openEdit = (item: any) =>
    openForm({ formType: 'opsProduction', mode: 'edit', recordId: item.id, context: { moduleId, departmentId, initialData: item.data } })

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
  const q = search.toLowerCase()
  const filtered = items.filter((item: any) => {
    const d = item.data || {}
    if (brandFilter !== 'All' && d.brand !== brandFilter) return false
    if (!q) return true
    return [d.poNumber, d.product, d.sku, d.cm].some((v: any) => (v ?? '').toString().toLowerCase().includes(q))
  })

  const activeOrders = filtered.length
  const orderValue = filtered.reduce((sum: number, item: any) => sum + (item.data?.value ?? 0), 0)
  const emergency = filtered.filter((item: any) => item.data?.priority === 'emergency').length
  const coworkPending = filtered.filter((item: any) => item.data?.coworkPending).length

  const cowork = (d: any, id: string): AddToCoworkItem => ({
    name: d.product || d.poNumber || 'Production Order',
    type: 'Production Order',
    id,
    description: `${d.poNumber || ''} — ${d.cm || ''} (${d.status || ''})`.trim(),
  })

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

      <TabHeader title="Production orders" count={filtered.length} view={view} onView={setView} onNew={openCreate} newLabel="New Order">
        <OpenOrderImport items={items} moduleId={moduleId} departmentId={departmentId} />
      </TabHeader>

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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search PO#, SKU, item#, description..."
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text="No production orders found." />
      ) : view === 'table' ? (
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
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => setDetailItem(item)}>
                    <td className="font-mono text-xs text-[var(--accent)]">{d.poNumber}</td>
                    <td className="font-medium text-[var(--text-primary)]">{d.product}</td>
                    <td className="text-[var(--text-secondary)]">{d.cm}</td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.qty?.toLocaleString()}</td>
                    <td><span className="badge" style={{ background: `${statusColor(d.status)}20`, color: statusColor(d.status) }}>{d.status}</span></td>
                    <td className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</td>
                    <td className="text-[var(--text-tertiary)]">{d.eta}</td>
                    <td>
                      <div className="flex justify-end items-center gap-1">
                        <button
                          title="Create production update email"
                          onClick={(e) => { e.stopPropagation(); setEmailItem(item) }}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Mail size={15} />
                        </button>
                        <RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} />
                      </div>
                    </td>
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
                      <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setDetailItem(item)}>
                        <div className="flex items-center justify-between">
                          <span className="badge" style={{ background: `${color}20`, color }}>{d.status}</span>
                          <div className="flex items-center gap-1">
                            <button
                              title="Create production update email"
                              onClick={(e) => { e.stopPropagation(); setEmailItem(item) }}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              <Mail size={15} />
                            </button>
                            <RowActions cowork={cowork(d, item.id)} onEdit={() => openEdit(item)} />
                          </div>
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
                        {d.cmNotes && (
                          <p className="text-xs text-[var(--text-tertiary)] line-clamp-2 pt-1 border-t border-[var(--border-subtle)]">{d.cmNotes}</p>
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

      <ProductionEmailModal item={emailItem} open={!!emailItem} onClose={() => setEmailItem(null)} />
      <ProductionOrderDrawer open={!!detailItem} item={detailItem} moduleId={moduleId} departmentId={departmentId} onClose={() => setDetailItem(null)} />
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
  sku: 'SKU_PIPELINE',
  inventory: 'INVENTORY_HEALTH',
  production: 'PRODUCTION_TRACKING',
  brand: 'BRAND_TRANSITION',
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
  const [activeTab, setActiveTab] = useState<OpsTab>('sku')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)
  const openForm = useAppStore((s) => s.openForm)

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
  const { data: rdDetail, refetch: refetchRd } = useDepartment(rdDept?.id || '')
  const cmModule = useMemo(() => {
    const mods = (rdDetail?.modules as any[]) || []
    return mods.find((m: any) => m.type === 'CM_PRODUCTIVITY') || null
  }, [rdDetail])

  const isLoading = deptsLoading || detailLoading

  const modules = (deptDetail?.modules as any[]) || []
  const moduleByType = (type: string) => modules.find((m: any) => m.type === type) || null

  const moduleData = useMemo(() => {
    const find = (type: string) => modules.find((m: any) => m.type === type)?.items || []
    return {
      sku: find('SKU_PIPELINE'),
      inventory: find('INVENTORY_HEALTH'),
      production: find('PRODUCTION_TRACKING'),
      brand: find('BRAND_TRANSITION'),
      components: find('COMPONENTS'),
      bom: find('BILL_OF_MATERIALS'),
    }
  }, [deptDetail])

  const moduleIds = {
    sku: moduleByType('SKU_PIPELINE')?.id ?? null,
    inventory: moduleByType('INVENTORY_HEALTH')?.id ?? null,
    production: moduleByType('PRODUCTION_TRACKING')?.id ?? null,
    brand: moduleByType('BRAND_TRANSITION')?.id ?? null,
    components: moduleByType('COMPONENTS')?.id ?? null,
    bom: moduleByType('BILL_OF_MATERIALS')?.id ?? null,
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
          {isLoading ? (
            activeTab === 'inventory' ? <TableSkeleton /> : <CardsSkeleton />
          ) : activeTab === 'sku' ? (
            <SKUPipelineTab items={moduleData.sku} moduleId={moduleIds.sku} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'SKU_PIPELINE' })} />
          ) : activeTab === 'inventory' ? (
            <InventoryHealthTab items={moduleData.inventory} moduleId={moduleIds.inventory} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'INVENTORY_HEALTH' })} />
          ) : activeTab === 'production' ? (
            <ProductionTab items={moduleData.production} moduleId={moduleIds.production} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'PRODUCTION_TRACKING' })} />
          ) : activeTab === 'components' ? (
            <ComponentsTab items={moduleData.components} moduleId={moduleIds.components} departmentId={deptId} onRefresh={() => refetchDept()} />
          ) : activeTab === 'bom' ? (
            <BOMTab items={moduleData.bom} moduleId={moduleIds.bom} departmentId={deptId} onRefresh={() => refetchDept()} components={moduleData.components} skuItems={moduleData.sku} />
          ) : activeTab === 'cm' ? (
            <CMTab items={cmModule?.items || []} moduleId={cmModule?.id ?? null} departmentId={rdDept?.id ?? null} onRefresh={() => refetchRd()} productionItems={moduleData.production} />
          ) : (
            <BrandTransitionTab items={moduleData.brand} moduleId={moduleIds.brand} departmentId={deptId} onSelect={(item) => setSelectedItem({ item, type: 'BRAND_TRANSITION' })} />
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
