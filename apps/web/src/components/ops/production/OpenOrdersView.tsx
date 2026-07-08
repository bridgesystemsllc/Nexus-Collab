import { useState, useMemo, useCallback, useEffect, Fragment } from 'react'
import {
  Search,
  ChevronRight,
  ChevronDown,
  Building2,
  Package,
  Layers,
  Truck,
  CircleCheck,
  CalendarClock,
  RefreshCw,
  Eye,
  X,
  Flame,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  toOpenOrder,
  groupByManufacturer,
  openOrderKpis,
  PO_STATUSES,
  type OpenOrder,
} from './openOrderData'

// ─── Open Orders view ───────────────────────────────────────
// Mirrors the KarEve ERP "Open Order Tracking" screen: POs grouped by
// manufacturer, each expandable into its per-SKU line items, with status pills,
// urgency chips, and qty ordered/received/remaining. Reads the OPEN_ORDERS
// module (synced from the ERP); edits to status/urgency/notes PATCH the item and
// (dry-run until the ERP write endpoint is live) push back to the ERP.

interface OpenOrdersViewProps {
  items: any[]
  moduleId: string | null
  onRefresh: () => void
}

/** Semantic color for a PO lifecycle status. */
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

function fmt(n: number): string {
  return n.toLocaleString()
}

function KpiCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="data-cell flex items-center gap-3 py-4">
      <Icon size={18} style={{ color: tone ?? 'var(--accent)' }} />
      <div>
        <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">{label}</p>
        <p
          className="text-2xl font-semibold tabular-nums"
          style={tone ? { color: tone } : undefined}
        >
          {fmt(value)}
        </p>
      </div>
    </div>
  )
}

export function OpenOrdersView({ items, moduleId, onRefresh }: OpenOrdersViewProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [mfrFilter, setMfrFilter] = useState('All')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<OpenOrder | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const orders = useMemo(() => items.map(toOpenOrder), [items])

  const manufacturers = useMemo(
    () => ['All', ...Array.from(new Set(orders.map((o) => o.manufacturer))).sort()],
    [orders],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter((o) => {
      if (statusFilter !== 'All' && o.poStatus !== statusFilter) return false
      if (mfrFilter !== 'All' && o.manufacturer !== mfrFilter) return false
      if (q) {
        const hay = `${o.poNumber} ${o.manufacturer}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [orders, search, statusFilter, mfrFilter])

  const kpis = useMemo(() => openOrderKpis(filtered), [filtered])
  const groups = useMemo(() => groupByManufacturer(filtered), [filtered])

  const toggleRow = useCallback((id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])
  const toggleGroup = useCallback((mfr: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [mfr]: !prev[mfr] }))
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await api.post('/integrations/erp/refresh-open-orders')
      onRefresh()
    } catch (err) {
      console.error('[open-orders] refresh failed', err)
    } finally {
      setRefreshing(false)
    }
  }, [onRefresh])

  return (
    <div className="space-y-5" style={{ animation: 'fadeUp 0.4s var(--ease-spring, ease) both' }}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCell icon={Package} label="Active POs" value={kpis.activePOs} />
        <KpiCell icon={Layers} label="SKU Line Items" value={kpis.lineItems} />
        <KpiCell icon={Truck} label="To Be Received" value={kpis.toReceive} tone="var(--warning)" />
        <KpiCell icon={CircleCheck} label="Received to Date" value={kpis.received} tone="var(--success)" />
        <KpiCell icon={CalendarClock} label="Past Expected Delivery" value={kpis.pastDue} tone="var(--danger)" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative min-w-[240px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            placeholder="Search PO number or manufacturer..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="All">All Statuses</option>
          {PO_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={mfrFilter}
          onChange={(e) => setMfrFilter(e.target.value)}
          className="px-3 py-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg text-xs text-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent)]"
        >
          {manufacturers.map((m) => (
            <option key={m} value={m}>
              {m === 'All' ? 'All Manufacturers' : m}
            </option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)] transition-colors disabled:opacity-60"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Syncing…' : 'Refresh from ERP'}
        </button>
      </div>

      {/* Grouped manufacturer → PO → lines */}
      {groups.length === 0 ? (
        <div className="data-cell text-center py-12 text-sm text-[var(--text-tertiary)]">
          No open orders. Click <span className="text-[var(--text-secondary)] font-medium">Refresh from ERP</span> to pull the latest purchase orders.
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const collapsed = collapsedGroups[g.manufacturer]
            return (
              <div
                key={g.manufacturer}
                className="rounded-xl border border-[var(--border-subtle)] overflow-hidden"
              >
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(g.manufacturer)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <ChevronDown
                      size={16}
                      className="text-[var(--text-tertiary)] transition-transform"
                      style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }}
                    />
                    <Building2 size={16} className="text-[var(--accent)]" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{g.manufacturer}</span>
                    <span className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      {g.poCount} {g.poCount === 1 ? 'PO' : 'POs'}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Units Remaining</p>
                    <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{fmt(g.unitsRemaining)}</p>
                  </div>
                </button>

                {/* PO table */}
                {!collapsed && (
                  <div className="overflow-x-auto border-t border-[var(--border-subtle)]">
                    <table className="nexus-table w-full">
                      <thead>
                        <tr>
                          <th className="w-8"></th>
                          <th>PO Number</th>
                          <th>Status</th>
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
                        {g.orders.map((o) => {
                          const color = statusColor(o.poStatus)
                          const isOpen = expanded[o.id]
                          return (
                            <Fragment key={o.id}>
                              <tr
                                className="clickable-row"
                                onClick={() => toggleRow(o.id)}
                              >
                                <td className="text-[var(--text-tertiary)]">
                                  {o.lines.length > 0 &&
                                    (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                                </td>
                                <td>
                                  <div className="font-mono text-xs text-[var(--accent)]">{o.poNumber}</div>
                                  {o.orderDate && (
                                    <div className="text-[10px] text-[var(--text-tertiary)]">{o.orderDate}</div>
                                  )}
                                </td>
                                <td>
                                  <span className="badge" style={{ background: `${color}20`, color }}>
                                    {o.poStatus}
                                  </span>
                                </td>
                                <td>
                                  {o.urgency === 'Urgent' ? (
                                    <span
                                      className="badge inline-flex items-center gap-1"
                                      style={{ background: 'var(--danger)20', color: 'var(--danger)' }}
                                    >
                                      <Flame size={11} /> Urgent
                                    </span>
                                  ) : (
                                    <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                                      Normal
                                    </span>
                                  )}
                                </td>
                                <td className="text-[var(--text-secondary)] text-xs">{o.orderDate || '—'}</td>
                                <td className="text-[var(--text-secondary)] text-xs">{o.deliveryDue || '—'}</td>
                                <td className="text-right tabular-nums text-[var(--accent)]">{o.lines.length}</td>
                                <td className="text-right tabular-nums text-[var(--text-secondary)]">{fmt(o.qtyOrdered)}</td>
                                <td className="text-right tabular-nums text-[var(--success)]">{fmt(o.qtyReceived)}</td>
                                <td className="text-right tabular-nums text-[var(--warning)]">{fmt(o.qtyRemaining)}</td>
                                <td className="text-xs">
                                  {o.eta ? (
                                    <span className="inline-flex items-center gap-1 text-[var(--success)]">
                                      <CircleCheck size={12} /> {o.eta}
                                    </span>
                                  ) : (
                                    <span className="text-[var(--text-tertiary)]">—</span>
                                  )}
                                </td>
                                <td>
                                  <div className="flex justify-end">
                                    <button
                                      title="View / edit PO"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDetail(o)
                                      }}
                                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
                                    >
                                      <Eye size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {isOpen &&
                                o.lines.map((l) => (
                                  <tr key={`${o.id}-${l.lineNo}`} className="bg-[var(--bg-base)]">
                                    <td></td>
                                    <td colSpan={2} className="text-xs text-[var(--text-secondary)]">
                                      <span className="font-mono text-[var(--text-tertiary)]">{l.sku}</span>{' '}
                                      {l.description}
                                    </td>
                                    <td colSpan={4}></td>
                                    <td className="text-right tabular-nums text-xs text-[var(--text-secondary)]">{fmt(l.qtyOrdered)}</td>
                                    <td className="text-right tabular-nums text-xs text-[var(--success)]">{fmt(l.qtyReceived)}</td>
                                    <td colSpan={2} className="text-right tabular-nums text-xs text-[var(--text-tertiary)]">
                                      ${l.unitPrice.toFixed(2)}
                                    </td>
                                    <td></td>
                                  </tr>
                                ))}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <OpenOrderDrawer
        order={detail}
        moduleId={moduleId}
        onClose={() => setDetail(null)}
        onRefresh={onRefresh}
      />
    </div>
  )
}

// ─── Edit drawer ────────────────────────────────────────────
// Edits the Nexus-side view of a PO: poStatus, urgency, and an appended note.
// Saves PATCH the OPEN_ORDERS item, then push the ERP-owned fields back to the
// ERP (dry-run until the ERP write endpoint is live).
function OpenOrderDrawer({
  order,
  moduleId,
  onClose,
  onRefresh,
}: {
  order: OpenOrder | null
  moduleId: string | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [status, setStatus] = useState('')
  const [urgency, setUrgency] = useState<'Normal' | 'Urgent'>('Normal')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync local form to the selected order whenever it changes.
  useEffect(() => {
    if (order) {
      setStatus(order.poStatus)
      setUrgency(order.urgency)
      setNote('')
    }
  }, [order])

  const save = useCallback(async () => {
    if (!order || !moduleId) return
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const notes = [...order.notes]
      if (note.trim()) {
        notes.push({
          id: `nexus-note-${order.id}-${now}`,
          noteDate: now.slice(0, 10),
          noteText: note.trim(),
          createdBy: 'Nexus',
          createdAt: now,
        })
      }
      const data = {
        ...(order as any),
        poStatus: status,
        urgency,
        notes,
      }
      delete (data as any).id
      await api.patch(`/departments/_/modules/${moduleId}/items/${order.id}`, {
        data,
        status,
      })
      // Push ERP-owned fields back (dry-run until the ERP write endpoint is live).
      await api.post(`/integrations/erp/push-open-order/${order.id}`).catch(() => {})
      onRefresh()
      onClose()
    } catch (err) {
      console.error('[open-orders] save failed', err)
    } finally {
      setSaving(false)
    }
  }, [order, moduleId, status, urgency, note, onRefresh, onClose])

  if (!order) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md h-full bg-[var(--bg-surface)] border-l border-[var(--border-default)] shadow-2xl overflow-y-auto"
        style={{ animation: 'slideInRight 0.28s var(--ease-spring, ease) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[var(--bg-surface)]/90 backdrop-blur border-b border-[var(--border-subtle)]">
          <div>
            <p className="font-mono text-sm text-[var(--accent)]">{order.poNumber}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{order.manufacturer}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="data-cell py-3">
              <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Ordered</p>
              <p className="text-base font-semibold tabular-nums">{fmt(order.qtyOrdered)}</p>
            </div>
            <div className="data-cell py-3">
              <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Received</p>
              <p className="text-base font-semibold tabular-nums text-[var(--success)]">{fmt(order.qtyReceived)}</p>
            </div>
            <div className="data-cell py-3">
              <p className="text-[10px] uppercase tracking-[0.06em] text-[var(--text-tertiary)]">Remaining</p>
              <p className="text-base font-semibold tabular-nums text-[var(--warning)]">{fmt(order.qtyRemaining)}</p>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">PO Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--bg-input,var(--bg-elevated))] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              {PO_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Urgency */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Urgency</label>
            <div className="flex gap-2">
              {(['Normal', 'Urgent'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className="flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all"
                  style={{
                    background: urgency === u ? (u === 'Urgent' ? 'var(--danger)' : 'var(--accent)') : 'transparent',
                    color: urgency === u ? '#fff' : 'var(--text-secondary)',
                    borderColor: urgency === u ? 'transparent' : 'var(--border-default)',
                  }}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Line items */}
          {order.lines.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Line Items</label>
              <div className="rounded-lg border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)]">
                {order.lines.map((l) => (
                  <div key={l.lineNo} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-[var(--text-secondary)]">
                      <span className="font-mono text-[var(--text-tertiary)]">{l.sku}</span> {l.description}
                    </span>
                    <span className="tabular-nums text-[var(--text-tertiary)] shrink-0 ml-2">{fmt(l.qtyOrdered)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add note */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Add Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 bg-[var(--bg-input,var(--bg-elevated))] border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
              placeholder="Internal note (appended, never overwrites ERP notes)…"
            />
          </div>

          {/* Existing notes */}
          {order.notes.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[var(--text-secondary)]">History</label>
              {order.notes.map((nt) => (
                <div key={nt.id} className="text-xs text-[var(--text-secondary)] border-l-2 border-[var(--border-default)] pl-2.5 py-0.5">
                  <p>{nt.noteText}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {nt.createdBy}
                    {nt.noteDate ? ` · ${nt.noteDate}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex gap-2 px-5 py-4 bg-[var(--bg-surface)]/90 backdrop-blur border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !moduleId}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving…' : 'Save & Sync'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OpenOrdersView
