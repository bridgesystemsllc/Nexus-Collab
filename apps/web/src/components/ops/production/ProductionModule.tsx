import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  X,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table2,
  FileText,
  AlertTriangle,
  Users,
  Package,
  DollarSign,
  Calendar,
  Factory,
  MessageSquare,
  Edit3,
  Check,
  Flame,
  ArrowUpDown,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  STATUS_COLORS,
  ALL_STATUSES,
  BRANDS,
  COWORK_TYPES,
  EMPTY_ORDER,
  groupByCM,
  formatCurrency,
  formatDate,
  notePrefix,
} from './productionData'
import type {
  ProductionStatus,
  CoworkType,
  ProductionNote,
  ProductionOrder,
} from './productionData'

// ─── Props ────────────────────────────────────────────────────────

interface ProductionModuleProps {
  items: any[]
  moduleId: string | null
  onRefresh: () => void
}

// ─── Shared Form Primitives ───────────────────────────────────────

function FormField({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
        {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_rgba(47,128,237,0.12)]'

const selectClass = inputClass

// ─── KPI Bar ──────────────────────────────────────────────────────

function KPIBar({ items }: { items: any[] }) {
  const stats = useMemo(() => {
    const nonShipped = items.filter((i) => i.data?.status !== 'Shipped' && i.data?.status !== 'Cancelled')
    const totalActive = nonShipped.length
    const totalValue = nonShipped.reduce((s, i) => s + (Number(i.data?.orderValue) || 0), 0)
    const emergencyCount = items.filter((i) => i.data?.isEmergency).length
    const coworkPending = items.filter((i) => i.data?.isCowork && !i.data?.coworkResolved).length
    return { totalActive, totalValue, emergencyCount, coworkPending }
  }, [items])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Active */}
      <div className="data-cell flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--accent-subtle)' }}
        >
          <Package size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider">Active Orders</p>
          <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{stats.totalActive}</p>
        </div>
      </div>

      {/* Total Value */}
      <div className="data-cell flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.12)' }}
        >
          <DollarSign size={18} style={{ color: '#10B981' }} />
        </div>
        <div>
          <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider">Order Value</p>
          <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">
            {formatCurrency(stats.totalValue)}
          </p>
        </div>
      </div>

      {/* Emergency */}
      <div className="data-cell flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,0.12)' }}
        >
          <AlertTriangle size={18} style={{ color: '#EF4444' }} />
        </div>
        <div>
          <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider">Emergency</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{stats.emergencyCount}</p>
            {stats.emergencyCount > 0 && (
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: '#FF453A',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* CoWork Pending */}
      <div className="data-cell flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(255,159,10,0.12)' }}
        >
          <Users size={18} style={{ color: '#FF9F0A' }} />
        </div>
        <div>
          <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider">CoWork Pending</p>
          <div className="flex items-center gap-2">
            <p className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{stats.coworkPending}</p>
            {stats.coworkPending > 0 && (
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{
                  background: '#FF9F0A',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────

interface Filters {
  brand: string
  statuses: ProductionStatus[]
  search: string
  emergencyOnly: boolean
  coworkOnly: boolean
}

const DEFAULT_FILTERS: Filters = {
  brand: 'All',
  statuses: [],
  search: '',
  emergencyOnly: false,
  coworkOnly: false,
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (f: Filters) => void
}) {
  const [statusOpen, setStatusOpen] = useState(false)

  const brandChips = ['All', ...BRANDS]

  const toggleStatus = (s: ProductionStatus) => {
    const next = filters.statuses.includes(s)
      ? filters.statuses.filter((x) => x !== s)
      : [...filters.statuses, s]
    onChange({ ...filters, statuses: next })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Brand chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {brandChips.map((b) => {
          const isActive = filters.brand === b
          return (
            <button
              key={b}
              onClick={() => onChange({ ...filters, brand: b })}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: isActive ? 'var(--accent)' : 'var(--bg-surface)',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-default)'}`,
              }}
            >
              {b}
            </button>
          )
        })}
      </div>

      {/* Status dropdown */}
      <div className="relative">
        <button
          onClick={() => setStatusOpen(!statusOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--accent)] transition-all"
        >
          Status {filters.statuses.length > 0 && `(${filters.statuses.length})`}
          <ChevronDown size={12} />
        </button>
        {statusOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
            <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg p-2 min-w-[200px]">
              {ALL_STATUSES.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] text-[13px] text-[var(--text-secondary)]"
                >
                  <input
                    type="checkbox"
                    checked={filters.statuses.includes(s)}
                    onChange={() => toggleStatus(s)}
                    className="accent-[var(--accent)]"
                  />
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: STATUS_COLORS[s] }}
                  />
                  {s}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search SO#, item#, description..."
          className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg pl-8 pr-3 py-1.5 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-all"
        />
      </div>

      {/* Toggle: Emergency Only */}
      <button
        onClick={() => onChange({ ...filters, emergencyOnly: !filters.emergencyOnly })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
        style={{
          background: filters.emergencyOnly ? 'rgba(239,68,68,0.15)' : 'var(--bg-surface)',
          color: filters.emergencyOnly ? '#FF453A' : 'var(--text-secondary)',
          border: `1px solid ${filters.emergencyOnly ? '#FF453A' : 'var(--border-default)'}`,
        }}
      >
        <Flame size={12} />
        Emergency
      </button>

      {/* Toggle: CoWork Only */}
      <button
        onClick={() => onChange({ ...filters, coworkOnly: !filters.coworkOnly })}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all"
        style={{
          background: filters.coworkOnly ? 'rgba(255,159,10,0.15)' : 'var(--bg-surface)',
          color: filters.coworkOnly ? '#FF9F0A' : 'var(--text-secondary)',
          border: `1px solid ${filters.coworkOnly ? '#FF9F0A' : 'var(--border-default)'}`,
        }}
      >
        <Users size={12} />
        CoWork
      </button>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductionStatus }) {
  const color = STATUS_COLORS[status] || 'var(--text-tertiary)'
  return (
    <span
      className="badge"
      style={{
        background: `${color}20`,
        color,
      }}
    >
      {status}
    </span>
  )
}

// ─── Production Card ──────────────────────────────────────────────

function ProductionCard({
  item,
  onNotes,
  onCowork,
  onEdit,
}: {
  item: any
  onNotes: () => void
  onCowork: () => void
  onEdit: () => void
}) {
  const d: ProductionOrder = item.data || {}
  const color = STATUS_COLORS[d.status] || 'var(--text-tertiary)'
  const latestNote = d.notes?.length ? d.notes[d.notes.length - 1] : null

  const borderStyle: React.CSSProperties = {}
  if (d.isEmergency) {
    borderStyle.borderLeft = '3px solid #FF453A'
    borderStyle.boxShadow = '0 0 12px rgba(255,69,58,0.08)'
  } else if (d.isCowork && !d.coworkResolved) {
    borderStyle.borderLeft = '3px solid #FF9F0A'
    borderStyle.boxShadow = '0 0 12px rgba(255,159,10,0.08)'
  }

  return (
    <div
      className="data-cell space-y-3 transition-colors hover:border-[var(--accent)]"
      style={borderStyle}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <StatusBadge status={d.status} />
        <div className="flex items-center gap-1.5">
          {d.isEmergency && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#FF453A]">
              <Flame size={11} />
              RUSH
            </span>
          )}
          {d.isCowork && !d.coworkResolved && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-[#FF9F0A]">
              <Users size={11} />
              CoWork
            </span>
          )}
        </div>
      </div>

      {/* SO & Item */}
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[var(--accent)]">{d.salesOrder}</span>
          <span className="text-[var(--text-tertiary)] text-xs">#{d.itemNumber}</span>
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5 line-clamp-2">{d.description}</p>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--text-secondary)]">
        <div>
          <span className="text-[var(--text-tertiary)]">PO: </span>
          <span className="tabular-nums">{d.customerPo || '—'}</span>
        </div>
        <div>
          <span className="text-[var(--text-tertiary)]">Qty: </span>
          <span className="tabular-nums">
            {(d.qtyOrdered || 0).toLocaleString()}/{(d.qtyRemaining || 0).toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-[var(--text-tertiary)]">Value: </span>
          <span className="tabular-nums">{formatCurrency(d.orderValue || 0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar size={10} className="text-[var(--text-tertiary)]" />
          <span className="tabular-nums">{formatDate(d.shipDate)}</span>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-[var(--text-tertiary)]">Progress</span>
          <span className="tabular-nums text-[var(--text-secondary)]">{d.progressPct || 0}%</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${d.progressPct || 0}%`, background: color }}
          />
        </div>
      </div>

      {/* Latest note snippet */}
      {latestNote && (
        <p className="text-[11px] text-[var(--text-tertiary)] italic line-clamp-1 border-t border-[var(--border-subtle)] pt-2">
          {latestNote.text}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
        <button
          onClick={(e) => { e.stopPropagation(); onCowork() }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <Users size={11} />
          CoWork
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onNotes() }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <MessageSquare size={11} />
          Notes{d.notes?.length ? ` (${d.notes.length})` : ''}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors ml-auto"
        >
          <Edit3 size={11} />
          Edit
        </button>
      </div>
    </div>
  )
}

// ─── Board View ───────────────────────────────────────────────────

function BoardView({
  items,
  onNotes,
  onCowork,
  onEdit,
}: {
  items: any[]
  onNotes: (item: any) => void
  onCowork: (item: any) => void
  onEdit: (item: any) => void
}) {
  const groups = useMemo(() => groupByCM(items as any) as Record<string, any[]>, [items])
  const sortedCMs = Object.keys(groups).sort()

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No production orders match current filters.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {sortedCMs.map((cm) => {
        const cmItems = groups[cm]
        const activeCount = cmItems.filter(
          (i) => i.data?.status !== 'Shipped' && i.data?.status !== 'Cancelled'
        ).length
        const totalUnits = cmItems.reduce((s, i) => s + (Number(i.data?.qtyOrdered) || 0), 0)

        return (
          <div key={cm}>
            {/* CM Header */}
            <div className="flex items-center gap-3 mb-4 pb-2 border-b border-[var(--border-subtle)]">
              <Factory size={16} className="text-[var(--accent)]" />
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{cm}</h3>
              <span className="text-[12px] text-[var(--text-tertiary)]">
                {activeCount} active &middot; {totalUnits.toLocaleString()} units
              </span>
            </div>
            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cmItems.map((item) => (
                <ProductionCard
                  key={item.id}
                  item={item}
                  onNotes={() => onNotes(item)}
                  onCowork={() => onCowork(item)}
                  onEdit={() => onEdit(item)}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Table View ───────────────────────────────────────────────────

type SortKey =
  | 'brand'
  | 'cm'
  | 'customerPo'
  | 'salesOrder'
  | 'itemNumber'
  | 'description'
  | 'qtyOrdered'
  | 'qtyRemaining'
  | 'unitPrice'
  | 'orderValue'
  | 'shipDate'
  | 'status'
  | 'progressPct'

function TableView({
  items,
  onNotes,
  onCowork,
  onEdit,
}: {
  items: any[]
  onNotes: (item: any) => void
  onCowork: (item: any) => void
  onEdit: (item: any) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('salesOrder')
  const [sortAsc, setSortAsc] = useState(true)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const av = a.data?.[sortKey] ?? ''
      const bv = b.data?.[sortKey] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }, [items, sortKey, sortAsc])

  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No production orders match current filters.
      </p>
    )
  }

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="cursor-pointer select-none hover:text-[var(--accent)] transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        {sortKey === field ? (
          sortAsc ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </div>
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <SortHeader label="Brand" field="brand" />
            <SortHeader label="CM" field="cm" />
            <SortHeader label="Cust PO" field="customerPo" />
            <SortHeader label="Sales Order" field="salesOrder" />
            <SortHeader label="Item#" field="itemNumber" />
            <SortHeader label="Description" field="description" />
            <SortHeader label="Qty Ord" field="qtyOrdered" />
            <SortHeader label="Rem Qty" field="qtyRemaining" />
            <SortHeader label="Price" field="unitPrice" />
            <SortHeader label="Value" field="orderValue" />
            <SortHeader label="Ship Date" field="shipDate" />
            <th>Status</th>
            <SortHeader label="Progress" field="progressPct" />
            <th>CoWork</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => {
            const d: ProductionOrder = item.data || {}
            return (
              <tr
                key={item.id}
                className={`clickable-row ${d.isEmergency ? 'emergency' : ''}`}
                onClick={() => onEdit(item)}
              >
                <td className="text-xs text-[var(--text-secondary)]">{d.brand}</td>
                <td className="text-xs text-[var(--text-secondary)]">{d.cm}</td>
                <td className="font-mono text-xs text-[var(--text-secondary)]">{d.customerPo}</td>
                <td className="font-mono text-xs font-semibold text-[var(--accent)]">{d.salesOrder}</td>
                <td className="font-mono text-xs text-[var(--text-secondary)]">{d.itemNumber}</td>
                <td className="text-xs text-[var(--text-primary)] max-w-[200px] truncate">{d.description}</td>
                <td className="tabular-nums text-xs text-[var(--text-secondary)]">{(d.qtyOrdered || 0).toLocaleString()}</td>
                <td className="tabular-nums text-xs text-[var(--text-secondary)]">{(d.qtyRemaining || 0).toLocaleString()}</td>
                <td className="tabular-nums text-xs text-[var(--text-secondary)]">${(d.unitPrice || 0).toFixed(2)}</td>
                <td className="tabular-nums text-xs text-[var(--text-secondary)]">{formatCurrency(d.orderValue || 0)}</td>
                <td className="text-xs text-[var(--text-secondary)] whitespace-nowrap">{formatDate(d.shipDate)}</td>
                <td><StatusBadge status={d.status} /></td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-16 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${d.progressPct || 0}%`,
                          background: STATUS_COLORS[d.status] || 'var(--accent)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-[var(--text-tertiary)]">{d.progressPct || 0}%</span>
                  </div>
                </td>
                <td>
                  {d.isCowork && !d.coworkResolved && (
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ background: '#FF9F0A', animation: 'pulse 1.5s ease-in-out infinite' }}
                      title={d.coworkType || 'CoWork pending'}
                    />
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => onNotes(item)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      title="Notes"
                    >
                      <MessageSquare size={13} />
                    </button>
                    <button
                      onClick={() => onCowork(item)}
                      className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                      title="CoWork"
                    >
                      <Users size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Notes Drawer ─────────────────────────────────────────────────

function NotesDrawer({
  open,
  item,
  moduleId,
  onClose,
  onRefresh,
}: {
  open: boolean
  item: any | null
  moduleId: string | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)

  const d: ProductionOrder = item?.data || {}
  const notes: ProductionNote[] = [...(d.notes || [])].reverse()

  const handleSubmit = async () => {
    if (!newNote.trim() || !item?.id || !moduleId) return
    setSaving(true)
    try {
      const prefix = notePrefix()
      const note: ProductionNote = {
        id: crypto.randomUUID(),
        noteDate: new Date().toISOString().slice(0, 10),
        noteText: `${prefix} — ${newNote.trim()}`,
        createdBy: 'User',
        createdAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        text: `${prefix} — ${newNote.trim()}`,
        author: 'User',
      }
      const updatedNotes = [...(d.notes || []), note]
      await api.patch(`/departments/_/modules/${moduleId}/items/${item.id}`, {
        data: { ...d, notes: updatedNotes },
      })
      setNewNote('')
      onRefresh()
    } catch (err) {
      console.error('Failed to add note:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl animate-slide-in-right"
        style={{ width: '480px', maxWidth: '100vw', height: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notes</h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5 truncate">
              {d.salesOrder} &mdash; {d.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notes Timeline */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {notes.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No notes yet.</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-semibold text-[var(--accent)] bg-[var(--accent-subtle)] px-2 py-0.5 rounded-full">
                  {formatDate(note.noteDate ?? note.date ?? '')}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">{note.createdBy || note.author || 'User'}</span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] pl-1 leading-relaxed">{note.noteText || note.text}</p>
            </div>
          ))}
        </div>

        {/* Add Note */}
        <div className="border-t border-[var(--border-subtle)] p-4 space-y-3">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            className={`${inputClass} resize-y`}
          />
          <button
            onClick={handleSubmit}
            disabled={!newNote.trim() || saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-medium text-white transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CoWork Modal ─────────────────────────────────────────────────

function CoworkModal({
  open,
  item,
  moduleId,
  onClose,
  onRefresh,
}: {
  open: boolean
  item: any | null
  moduleId: string | null
  onClose: () => void
  onRefresh: () => void
}) {
  const [coworkType, setCoworkType] = useState<CoworkType>('PO Revision')
  const [assignTo, setAssignTo] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<'Normal' | 'Urgent'>('Normal')
  const [saving, setSaving] = useState(false)

  const d: ProductionOrder = item?.data || {}
  const isResolving = d.isCowork && !d.coworkResolved

  const handleSubmit = async () => {
    if (!item?.id || !moduleId) return
    setSaving(true)
    try {
      const systemNote: ProductionNote = {
        id: crypto.randomUUID(),
        noteDate: new Date().toISOString().slice(0, 10),
        noteText: `${notePrefix()} — CoWork created: ${coworkType}. Assigned to ${assignTo || 'Unassigned'}. ${description}`,
        createdBy: 'System',
        createdAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        text: `${notePrefix()} — CoWork created: ${coworkType}. Assigned to ${assignTo || 'Unassigned'}. ${description}`,
        author: 'System',
      }
      await api.patch(`/departments/_/modules/${moduleId}/items/${item.id}`, {
        data: {
          ...d,
          isCowork: true,
          coworkType,
          coworkNote: description,
          coworkAssignedTo: assignTo,
          coworkPriority: priority,
          coworkResolved: false,
          notes: [...(d.notes || []), systemNote],
        },
      })
      onClose()
      onRefresh()
    } catch (err) {
      console.error('Failed to create cowork:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleResolve = async () => {
    if (!item?.id || !moduleId) return
    setSaving(true)
    try {
      const resNote: ProductionNote = {
        id: crypto.randomUUID(),
        noteDate: new Date().toISOString().slice(0, 10),
        noteText: `${notePrefix()} — CoWork resolved. ${description || ''}`.trim(),
        createdBy: 'System',
        createdAt: new Date().toISOString(),
        date: new Date().toISOString().slice(0, 10),
        text: `${notePrefix()} — CoWork resolved. ${description || ''}`.trim(),
        author: 'System',
      }
      await api.patch(`/departments/_/modules/${moduleId}/items/${item.id}`, {
        data: {
          ...d,
          coworkResolved: true,
          coworkResolutionNote: description,
          notes: [...(d.notes || []), resNote],
        },
      })
      onClose()
      onRefresh()
    } catch (err) {
      console.error('Failed to resolve cowork:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-2xl shadow-2xl w-full max-w-[520px] mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isResolving ? 'Resolve CoWork' : 'Create CoWork'}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              {d.salesOrder} &mdash; {d.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isResolving ? (
            <>
              <div className="p-3 rounded-lg bg-[rgba(255,159,10,0.08)] border border-[rgba(255,159,10,0.2)]">
                <p className="text-[13px] text-[#FF9F0A] font-medium">
                  Active CoWork: {d.coworkType}
                </p>
                <p className="text-[12px] text-[var(--text-secondary)] mt-1">
                  Assigned to: {d.coworkAssignedTo || 'Unassigned'} &middot; Priority: {d.coworkPriority || 'Normal'}
                </p>
                {d.coworkNote && (
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-1">{d.coworkNote}</p>
                )}
              </div>
              <FormField label="Resolution Notes">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the resolution..."
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </FormField>
            </>
          ) : (
            <>
              {/* CoWork Type */}
              <FormField label="CoWork Type">
                <div className="grid grid-cols-2 gap-2">
                  {COWORK_TYPES.map((t) => (
                    <label
                      key={t}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-[13px]"
                      style={{
                        borderColor: coworkType === t ? 'var(--accent)' : 'var(--border-default)',
                        background: coworkType === t ? 'var(--accent-subtle)' : 'transparent',
                        color: coworkType === t ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <input
                        type="radio"
                        name="coworkType"
                        value={t}
                        checked={coworkType === t}
                        onChange={() => setCoworkType(t)}
                        className="hidden"
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </FormField>

              {/* Assign To */}
              <FormField label="Assign To">
                <input
                  type="text"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  placeholder="Name or team..."
                  className={inputClass}
                />
              </FormField>

              {/* Description */}
              <FormField label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue..."
                  rows={3}
                  className={`${inputClass} resize-y`}
                />
              </FormField>

              {/* Priority Toggle */}
              <FormField label="Priority">
                <div className="flex items-center gap-2">
                  {(['Normal', 'Urgent'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPriority(p)}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{
                        background:
                          priority === p
                            ? p === 'Urgent'
                              ? 'rgba(239,68,68,0.15)'
                              : 'var(--accent-subtle)'
                            : 'var(--bg-surface)',
                        color:
                          priority === p
                            ? p === 'Urgent'
                              ? '#FF453A'
                              : 'var(--accent)'
                            : 'var(--text-secondary)',
                        border: `1px solid ${priority === p ? (p === 'Urgent' ? '#FF453A' : 'var(--accent)') : 'var(--border-default)'}`,
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </FormField>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={isResolving ? handleResolve : handleSubmit}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg text-[14px] font-medium text-white transition-all disabled:opacity-40"
            style={{
              background: isResolving ? '#10B981' : 'var(--accent)',
            }}
          >
            {saving ? 'Saving...' : isResolving ? 'Resolve CoWork' : 'Create CoWork'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Order Modal ──────────────────────────────────────────────

function NewOrderModal({
  open,
  moduleId,
  onClose,
  onRefresh,
  editItem,
}: {
  open: boolean
  moduleId: string | null
  onClose: () => void
  onRefresh: () => void
  editItem?: any | null
}) {
  const isEdit = !!editItem
  const initial = isEdit ? { ...EMPTY_ORDER, ...editItem?.data } : { ...EMPTY_ORDER }

  const [form, setForm] = useState<Omit<ProductionOrder, 'id'>>(initial)
  const [saving, setSaving] = useState(false)

  // Reset form when modal opens with different item
  const itemId = editItem?.id || null
  useEffect(() => {
    if (isEdit && editItem?.data) {
      setForm({ ...EMPTY_ORDER, ...editItem.data })
    } else {
      setForm({ ...EMPTY_ORDER })
    }
  }, [isEdit, itemId, editItem])

  const updateField = useCallback(
    <K extends keyof Omit<ProductionOrder, 'id'>>(key: K, value: Omit<ProductionOrder, 'id'>[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value }
        // Auto-calc order value
        if (key === 'qtyOrdered' || key === 'unitPrice') {
          next.orderValue = (Number(next.qtyOrdered) || 0) * (Number(next.unitPrice) || 0)
        }
        return next
      })
    },
    []
  )

  const handleSubmit = async () => {
    if (!moduleId) return
    if (!form.salesOrder.trim() || !form.itemNumber.trim() || !form.description.trim()) return
    setSaving(true)
    try {
      if (isEdit && editItem?.id) {
        await api.patch(`/departments/_/modules/${moduleId}/items/${editItem.id}`, {
          data: form,
        })
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, {
          data: form,
        })
      }
      onClose()
      onRefresh()
    } catch (err) {
      console.error('Failed to save order:', err)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[720px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              {isEdit ? 'Edit Order' : 'New Production Order'}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              {isEdit ? `Editing ${form.salesOrder}` : 'Fill out order details'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Identification */}
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              Order Identification
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Brand">
                <select
                  value={form.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Select brand...</option>
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="CM (Contract Manufacturer)">
                <input
                  type="text"
                  value={form.cm}
                  onChange={(e) => updateField('cm', e.target.value)}
                  placeholder="e.g. Kolmar, Mana"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Customer PO">
                <input
                  type="text"
                  value={form.customerPo}
                  onChange={(e) => updateField('customerPo', e.target.value)}
                  placeholder="Customer PO#"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Sales Order" required>
                <input
                  type="text"
                  value={form.salesOrder}
                  onChange={(e) => updateField('salesOrder', e.target.value)}
                  placeholder="SO-XXXXX"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Item Number" required>
                <input
                  type="text"
                  value={form.itemNumber}
                  onChange={(e) => updateField('itemNumber', e.target.value)}
                  placeholder="Item #"
                  className={inputClass}
                />
              </FormField>
              <div className="col-span-2">
                <FormField label="Description" required>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Product description"
                    className={inputClass}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* Section 2: Quantities & Pricing */}
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              Quantities & Pricing
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Qty Ordered">
                <input
                  type="number"
                  value={form.qtyOrdered || ''}
                  onChange={(e) => updateField('qtyOrdered', Number(e.target.value) || 0)}
                  placeholder="0"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Qty Remaining">
                <input
                  type="number"
                  value={form.qtyRemaining || ''}
                  onChange={(e) => updateField('qtyRemaining', Number(e.target.value) || 0)}
                  placeholder="0"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Unit Price ($)">
                <input
                  type="number"
                  step="0.01"
                  value={form.unitPrice || ''}
                  onChange={(e) => updateField('unitPrice', Number(e.target.value) || 0)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Order Value">
                <div
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-lg px-3.5 py-2.5 text-[14px] text-[var(--text-secondary)] tabular-nums"
                >
                  {formatCurrency(form.orderValue || 0)}
                  <span className="text-[11px] text-[var(--text-tertiary)] ml-2">(auto-calculated)</span>
                </div>
              </FormField>
            </div>
          </div>

          {/* Section 3: Dates & Logistics */}
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              Dates & Logistics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Order Date">
                <input
                  type="date"
                  value={form.orderDate}
                  onChange={(e) => updateField('orderDate', e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Ship Date">
                <input
                  type="date"
                  value={form.shipDate}
                  onChange={(e) => updateField('shipDate', e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Requested Delivery">
                <input
                  type="date"
                  value={form.requestedDel}
                  onChange={(e) => updateField('requestedDel', e.target.value)}
                  className={inputClass}
                />
              </FormField>
              <FormField label="Work Order">
                <input
                  type="text"
                  value={form.workOrder}
                  onChange={(e) => updateField('workOrder', e.target.value)}
                  placeholder="WO-XXXXX"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Lead Time">
                <input
                  type="number"
                  value={form.leadTime || ''}
                  onChange={(e) => updateField('leadTime', Number(e.target.value) || 0)}
                  placeholder="e.g. 42"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          {/* Section 4: Status & Flags */}
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
              Status & Flags
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Status">
                <select
                  value={form.status}
                  onChange={(e) => updateField('status', e.target.value as ProductionStatus)}
                  className={selectClass}
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label={`Progress: ${form.progressPct}%`}>
                <div className="flex items-center gap-3 pt-1">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={form.progressPct}
                    onChange={(e) => updateField('progressPct', Number(e.target.value))}
                    className="flex-1 accent-[var(--accent)]"
                  />
                  <span className="text-[13px] tabular-nums text-[var(--text-secondary)] w-10 text-right">
                    {form.progressPct}%
                  </span>
                </div>
              </FormField>
              <div className="col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => updateField('isEmergency', !form.isEmergency)}
                    className="relative w-11 h-6 rounded-full transition-colors"
                    style={{
                      background: form.isEmergency ? '#FF453A' : 'var(--bg-elevated)',
                      border: `1px solid ${form.isEmergency ? '#FF453A' : 'var(--border-default)'}`,
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
                      style={{
                        left: form.isEmergency ? 'calc(100% - 22px)' : '2px',
                      }}
                    />
                  </button>
                  <div>
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">Emergency Order</span>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Flag as rush/priority order</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.salesOrder.trim() || !form.itemNumber.trim() || !form.description.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-medium text-white transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── View Switcher ────────────────────────────────────────────────

type ViewMode = 'board' | 'table'

function ViewSwitcher({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (v: ViewMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5 p-1 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] w-fit">
      {([
        { key: 'board' as ViewMode, label: 'Board', icon: LayoutGrid },
        { key: 'table' as ViewMode, label: 'Table', icon: Table2 },
      ]).map(({ key, label, icon: Icon }) => {
        const isActive = view === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
            style={{
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
              fontWeight: isActive ? 550 : 500,
            }}
          >
            <Icon size={15} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

// ─── Main Module ──────────────────────────────────────────────────

export function ProductionModule({ items, moduleId, onRefresh }: ProductionModuleProps) {
  const [view, setView] = useState<ViewMode>('board')
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [notesItem, setNotesItem] = useState<any | null>(null)
  const [coworkItem, setCoworkItem] = useState<any | null>(null)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [showNewOrder, setShowNewOrder] = useState(false)

  // Apply filters
  const filtered = useMemo(() => {
    let result = [...items]

    // Brand
    if (filters.brand !== 'All') {
      result = result.filter((i) => i.data?.brand === filters.brand)
    }

    // Statuses
    if (filters.statuses.length > 0) {
      result = result.filter((i) => filters.statuses.includes(i.data?.status))
    }

    // Search
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase()
      result = result.filter((i) => {
        const d = i.data || {}
        return (
          (d.salesOrder || '').toLowerCase().includes(q) ||
          (d.itemNumber || '').toLowerCase().includes(q) ||
          (d.description || '').toLowerCase().includes(q)
        )
      })
    }

    // Emergency only
    if (filters.emergencyOnly) {
      result = result.filter((i) => i.data?.isEmergency)
    }

    // CoWork only
    if (filters.coworkOnly) {
      result = result.filter((i) => i.data?.isCowork && !i.data?.coworkResolved)
    }

    return result
  }, [items, filters])

  const handleOpenNotes = useCallback((item: any) => setNotesItem(item), [])
  const handleOpenCowork = useCallback((item: any) => setCoworkItem(item), [])
  const handleOpenEdit = useCallback((item: any) => {
    setEditItem(item)
    setShowNewOrder(true)
  }, [])

  return (
    <div className="space-y-6">
      {/* KPI Bar */}
      <KPIBar items={items} />

      {/* View Switcher + New Order */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <ViewSwitcher view={view} onChange={setView} />
        <button
          onClick={() => {
            setEditItem(null)
            setShowNewOrder(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[14px] font-medium text-white transition-all hover:opacity-90"
          style={{ background: 'var(--accent)' }}
        >
          <Plus size={16} />
          New Order
        </button>
      </div>

      {/* Filter Bar */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* Content */}
      <div>
        {view === 'board' ? (
          <BoardView
            items={filtered}
            onNotes={handleOpenNotes}
            onCowork={handleOpenCowork}
            onEdit={handleOpenEdit}
          />
        ) : (
          <TableView
            items={filtered}
            onNotes={handleOpenNotes}
            onCowork={handleOpenCowork}
            onEdit={handleOpenEdit}
          />
        )}
      </div>

      {/* Notes Drawer */}
      <NotesDrawer
        open={!!notesItem}
        item={notesItem}
        moduleId={moduleId}
        onClose={() => setNotesItem(null)}
        onRefresh={onRefresh}
      />

      {/* CoWork Modal */}
      <CoworkModal
        open={!!coworkItem}
        item={coworkItem}
        moduleId={moduleId}
        onClose={() => setCoworkItem(null)}
        onRefresh={onRefresh}
      />

      {/* New/Edit Order Modal */}
      <NewOrderModal
        open={showNewOrder}
        moduleId={moduleId}
        editItem={editItem}
        onClose={() => {
          setShowNewOrder(false)
          setEditItem(null)
        }}
        onRefresh={onRefresh}
      />
    </div>
  )
}

export default ProductionModule
