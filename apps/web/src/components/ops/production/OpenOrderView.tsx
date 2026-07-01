import { useMemo, useState } from 'react'
import {
  Package,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  Download,
  RefreshCw,
  Eye,
  ChevronRight,
  ChevronDown,
  Search,
  Building2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { ALL_PO_STATUSES, PO_STATUS_COLORS } from './productionData'
import { readOpenOrder, isOpenOrderOverdue, downloadOpenOrdersCsv, type OpenOrderRow } from './openOrderCsv'

interface OpenOrderViewProps {
  items: any[]
  onOpen: (item: any) => void
  onRefresh?: () => void
}

const TERMINAL = new Set(['Received', 'Closed', 'Cancelled'])

function fmtNum(n: number): string {
  return (n || 0).toLocaleString()
}

/** ERP-parity KPI cards computed from the live + synced open-order shape. */
function useKpis(items: any[]) {
  return useMemo(() => {
    const rows = items.map((i) => readOpenOrder(i.data))
    const open = rows.filter((r) => !TERMINAL.has(r.poStatus))
    return {
      openOrders: open.length,
      totalLines: open.reduce((s, r) => s + r.lineCount, 0),
      unitsRemaining: open.reduce((s, r) => s + r.qtyRemaining, 0),
      unitsReceived: rows.reduce((s, r) => s + r.qtyReceived, 0),
      overdue: open.filter(isOpenOrderOverdue).length,
    }
  }, [items])
}

function KpiCard({
  label,
  value,
  sub,
  Icon,
  tone,
}: {
  label: string
  value: string
  sub: string
  Icon: React.ElementType
  tone: string
}) {
  return (
    <div className="data-cell py-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p>
        <Icon size={16} style={{ color: tone }} />
      </div>
      <p className="text-2xl font-semibold tabular-nums mt-1" style={{ color: tone }}>
        {value}
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{sub}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const color = PO_STATUS_COLORS[status] ?? 'var(--text-tertiary)'
  return (
    <span
      className="badge"
      style={{ background: `${color}22`, color }}
    >
      {status}
    </span>
  )
}

function EtaCell({ row }: { row: OpenOrderRow }) {
  const overdue = isOpenOrderOverdue(row)
  const label = row.eta || row.deliveryDue || '—'
  if (overdue) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--danger)]">
        <AlertTriangle size={13} />
        <span className="tabular-nums">{label}</span>
        <span className="badge" style={{ background: 'var(--danger)', color: '#fff' }}>Overdue</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[var(--success)]">
      <CheckCircle2 size={13} />
      <span className="tabular-nums text-[var(--text-secondary)]">{label}</span>
    </span>
  )
}

function ManufacturerGroup({
  name,
  items,
  onOpen,
}: {
  name: string
  items: any[]
  onOpen: (item: any) => void
}) {
  const [open, setOpen] = useState(true)
  const unitsRemaining = items.reduce((s, it) => s + readOpenOrder(it.data).qtyRemaining, 0)
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown size={16} className="text-[var(--text-tertiary)]" /> : <ChevronRight size={16} className="text-[var(--text-tertiary)]" />}
          <Building2 size={16} className="text-[var(--accent)]" />
          <span className="font-medium text-[var(--text-primary)]">{name}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{items.length} PO{items.length === 1 ? '' : 's'}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Units Remaining</p>
          <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmtNum(unitsRemaining)}</p>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>PO Status</th>
                <th>Urgency</th>
                <th>Order Date</th>
                <th>Delivery Due</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Qty Ordered</th>
                <th className="text-right">Qty Received</th>
                <th className="text-right">Qty Remaining</th>
                <th>ETA</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const row = readOpenOrder(it.data)
                return (
                  <tr key={it.id} className="clickable-row" onClick={() => onOpen(it)}>
                    <td className="font-mono text-xs text-[var(--accent)]">{row.poNumber || '—'}</td>
                    <td><StatusPill status={row.poStatus} /></td>
                    <td>
                      <span
                        className="badge"
                        style={
                          row.urgency === 'Urgent'
                            ? { background: 'var(--danger)', color: '#fff' }
                            : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
                        }
                      >
                        {row.urgency}
                      </span>
                    </td>
                    <td className="text-[var(--text-tertiary)]">{row.orderDate || '—'}</td>
                    <td className="text-[var(--text-tertiary)]">{row.deliveryDue || '—'}</td>
                    <td className="text-right tabular-nums text-[var(--text-secondary)]">{row.lineCount || '—'}</td>
                    <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmtNum(row.qtyOrdered)}</td>
                    <td className="text-right tabular-nums text-[var(--success)]">{fmtNum(row.qtyReceived)}</td>
                    <td className="text-right tabular-nums text-[var(--warning)]">{fmtNum(row.qtyRemaining)}</td>
                    <td><EtaCell row={row} /></td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          title="Open order"
                          onClick={(e) => { e.stopPropagation(); onOpen(it) }}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function OpenOrderView({ items, onOpen, onRefresh }: OpenOrderViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [mfrFilter, setMfrFilter] = useState('All')
  const [refreshing, setRefreshing] = useState(false)

  const manufacturers = useMemo(
    () => ['All', ...Array.from(new Set(items.map((i) => i.data?.cm).filter(Boolean))).sort()],
    [items],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((it) => {
      const row = readOpenOrder(it.data)
      if (statusFilter !== 'All' && row.poStatus !== statusFilter) return false
      if (mfrFilter !== 'All' && row.manufacturer !== mfrFilter) return false
      if (!q) return true
      return row.poNumber.toLowerCase().includes(q) || row.manufacturer.toLowerCase().includes(q)
    })
  }, [items, search, statusFilter, mfrFilter])

  const kpis = useKpis(filtered)

  const groups = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const it of filtered) {
      const name = it.data?.cm || 'Unassigned'
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(it)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await api.post('/integrations/erp/refresh-open-orders')
      onRefresh?.()
    } catch (err) {
      console.error('[open-orders] refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  const selectClass =
    'bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] px-3 py-1.5 focus:outline-none focus:border-[var(--accent)]'

  return (
    <div className="space-y-5">
      {/* KPI bar — ERP parity */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Open Orders" value={fmtNum(kpis.openOrders)} sub="Active purchase orders" Icon={Package} tone="var(--accent)" />
        <KpiCard label="Total Lines" value={fmtNum(kpis.totalLines)} sub="SKU line items" Icon={TrendingUp} tone="var(--info)" />
        <KpiCard label="Units Remaining" value={fmtNum(kpis.unitsRemaining)} sub="To be received" Icon={Boxes} tone="var(--warning)" />
        <KpiCard label="Units Received" value={fmtNum(kpis.unitsReceived)} sub="Received to date" Icon={CheckCircle2} tone="var(--success)" />
        <KpiCard label="Overdue" value={fmtNum(kpis.overdue)} sub="Past expected delivery" Icon={AlertTriangle} tone="var(--danger)" />
      </div>

      {/* Filters + actions */}
      <div className="flex items-center gap-2 flex-wrap justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
              placeholder="Search PO number or manufacturer..."
            />
          </div>
          <select className={selectClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            {ALL_PO_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className={selectClass} value={mfrFilter} onChange={(e) => setMfrFilter(e.target.value)}>
            {manufacturers.map((m) => (
              <option key={m} value={m}>{m === 'All' ? 'All Manufacturers' : m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
          <button
            onClick={() => downloadOpenOrdersCsv(filtered)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Grouped tables */}
      {groups.length === 0 ? (
        <div className="data-cell text-center py-10 text-sm text-[var(--text-tertiary)]">
          No open orders match your filters.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(([name, groupItems]) => (
            <ManufacturerGroup key={name} name={name} items={groupItems} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

export default OpenOrderView
