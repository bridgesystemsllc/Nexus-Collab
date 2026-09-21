import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TaskAttachments } from '@/components/shared/TaskAttachments'
import { IssueLogger, type Issue } from '@/components/rd/IssueLogger'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { api } from '@/lib/api'
import {
  buildProductionUpdates,
  isActiveOpenOrder,
  linesForOrders,
  normalizeManufacturer,
  selectCmOpenOrders,
  statusesByPo,
  type ManufacturerCodeMapping,
} from './cmOpenOrderData'
import {
  X,
  Edit3,
  Trash2,
  Building2,
  Phone,
  Mail,
  MapPin,
  Factory,
  TrendingUp,
  AlertTriangle,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

interface CMDetailModalProps {
  open: boolean
  cm: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onUpdate?: (data: any) => void
  briefItems?: any[]
  openOrderItems?: any[]
  openOrdersLoading?: boolean
  openOrdersError?: boolean
  onRefreshOpenOrders?: () => void | Promise<unknown>
}

type SortField = 'productName' | 'brand' | 'unitsOrdered' | 'unitsDelivered' | 'status' | 'lastActivity'
type SortDir = 'asc' | 'desc'

// ─── Helpers ───────────────────────────────────────────────

function contractStatusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'Active':
      return { bg: 'var(--success-light)', text: 'var(--success)' }
    case 'On Hold':
      return { bg: 'var(--warning-light)', text: 'var(--warning)' }
    case 'Terminated':
      return { bg: 'var(--danger-light)', text: 'var(--danger)' }
    case 'Pending Onboarding':
      return { bg: 'var(--info-light)', text: 'var(--info)' }
    default:
      return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
  }
}

function kpiColor(value: number, thresholds: [number, number]): string {
  if (value >= thresholds[0]) return 'var(--success)'
  if (value >= thresholds[1]) return 'var(--warning)'
  return 'var(--danger)'
}

function relativeDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function productStatusBadge(status: string): { bg: string; text: string } {
  switch (status) {
    case 'In Production':
      return { bg: 'var(--info-light)', text: 'var(--info)' }
    case 'Shipped':
      return { bg: 'var(--success-light)', text: 'var(--success)' }
    case 'Complete':
      return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
    case 'On Hold':
      return { bg: 'var(--warning-light)', text: 'var(--warning)' }
    default:
      return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
  }
}

// ─── Section Header ────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--border-subtle)]">
      <Icon size={15} className="text-[var(--accent)]" />
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

// ─── KPI Cell ──────────────────────────────────────────────

function KPICell({
  label,
  value,
  suffix,
  color,
  onClick,
}: {
  label: string
  value: string | number
  suffix?: string
  color?: string
  onClick?: () => void
}) {
  return (
    <div
      className={`p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] ${onClick ? 'cursor-pointer hover:border-[var(--accent)] transition-colors' : ''}`}
      onClick={onClick}
    >
      <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-[22px] font-bold tabular-nums" style={{ color: color || 'var(--text-primary)' }}>
        {value}
        {suffix && <span className="text-[14px] font-medium ml-0.5">{suffix}</span>}
      </p>
    </div>
  )
}

// ─── Issue Normalization ───────────────────────────────────

function normalizePriority(p: any): Issue['priority'] {
  switch (String(p || '').toLowerCase()) {
    case 'critical': return 'Critical'
    case 'high': return 'High'
    case 'low': return 'Low'
    default: return 'Medium'
  }
}

function normalizeStatus(s: any): Issue['status'] {
  switch (String(s || '').toLowerCase()) {
    case 'resolved':
    case 'closed': return 'Resolved'
    case 'in review':
    case 'in progress': return 'In Review'
    default: return 'Open'
  }
}

function normalizeIssue(iss: any, i: number): Issue {
  return {
    id: iss.id || `issue-${i}`,
    description: iss.description || iss.title || 'Untitled Issue',
    priority: normalizePriority(iss.priority ?? iss.severity),
    category: iss.category,
    reportedDate: iss.reportedDate || (iss.createdAt ? new Date(iss.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'),
    status: normalizeStatus(iss.status),
    assignedTo: iss.assignedTo,
    resolutionNotes: iss.resolutionNotes,
  }
}

// ─── Main Modal ────────────────────────────────────────────

export function CMDetailModal({
  open,
  cm,
  onClose,
  onEdit,
  onDelete,
  onUpdate,
  briefItems,
  openOrderItems = [],
  openOrdersLoading = false,
  openOrdersError = false,
  onRefreshOpenOrders,
}: CMDetailModalProps) {
  const issuesRef = useRef<HTMLDivElement>(null)
  const [sortField, setSortField] = useState<SortField>('unitsOrdered')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const queryClient = useQueryClient()

  const data = cm?.data || cm || {}
  const products = data.products || []
  const issues = data.issues || []
  const contacts = data.contacts || []

  const manufacturerNames = useMemo(
    () => Array.from(new Set([
      data.name,
      ...openOrderItems.map((item: any) => item?.data?.manufacturer ?? item?.data?.cm),
    ].map((name) => String(name ?? '').trim()).filter(Boolean))).sort(),
    [data.name, openOrderItems],
  )

  // Mapping lookups are server/org scoped. Do not fall back to the old
  // PRODUCTION_TRACKING name field if these fail: that would silently show a
  // stale or cross-CM subset.
  const mappingsQuery = useQuery({
    queryKey: ['oor', 'cm-detail-manufacturer-mappings', manufacturerNames],
    enabled: open && manufacturerNames.length > 0,
    queryFn: async () => {
      const results = await Promise.all(manufacturerNames.map(async (manufacturerName) => {
        const { data: response } = await api.get('/operations/oor/manufacturer-mapping', { params: { manufacturerName } })
        return response.mapping as ManufacturerCodeMapping | null
      }))
      return results.filter(Boolean) as ManufacturerCodeMapping[]
    },
  })

  const purchaseOrders = useMemo(
    () => selectCmOpenOrders(openOrderItems, data, mappingsQuery.data ?? []),
    [openOrderItems, data, mappingsQuery.data],
  )

  const oorLinesQuery = useQuery({
    queryKey: ['oor', 'cm-detail-lines', purchaseOrders.map((order) => `${order.id}:${order.poNumber}`).sort()],
    enabled: open && mappingsQuery.isSuccess && purchaseOrders.length > 0,
    queryFn: async () => {
      const all: any[] = []
      const poNumbers = Array.from(new Set(purchaseOrders.map((order) => order.poNumber).filter(Boolean)))
      for (const customerPoNumber of poNumbers) {
        let page = 1
        let total = 0
        let received = 0
        do {
          const { data: response } = await api.get('/operations/oor/lines', {
            params: { customerPoNumber, openOnly: 'false', page, pageSize: 200 },
          })
          all.push(...response.rows)
          received += response.rows.length
          total = response.total
          page += 1
        } while (received < total)
      }
      return all
    },
  })

  const relevantOorLines = useMemo(
    () => linesForOrders(oorLinesQuery.data ?? [], purchaseOrders),
    [oorLinesQuery.data, purchaseOrders],
  )

  const activityQuery = useQuery({
    queryKey: ['oor', 'cm-detail-activity', relevantOorLines.map((line) => line.id).sort()],
    enabled: open && relevantOorLines.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(relevantOorLines.map(async (line) => {
        const rows: any[] = []
        let page = 1
        let total = 0
        do {
          const { data: response } = await api.get(`/operations/oor/lines/${line.id}/activity`, {
            params: { page, pageSize: 200 },
          })
          rows.push(...response.rows)
          total = response.total
          page += 1
        } while (rows.length < total)
        return [line.id, rows] as const
      }))
      return Object.fromEntries(entries)
    },
  })

  const productionUpdates = useMemo(
    () => buildProductionUpdates(purchaseOrders, relevantOorLines, activityQuery.data ?? {}),
    [purchaseOrders, relevantOorLines, activityQuery.data],
  )
  const operationalStatuses = useMemo(() => statusesByPo(relevantOorLines), [relevantOorLines])
  const canonicalLoading = openOrdersLoading || mappingsQuery.isLoading || oorLinesQuery.isLoading || activityQuery.isLoading
  const canonicalError = openOrdersError || mappingsQuery.isError || oorLinesQuery.isError || activityQuery.isError

  const refreshCanonicalOrders = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['oor'] }),
      Promise.resolve(onRefreshOpenOrders?.()),
    ])
  }

  // The department detail and OOR caches are independent and neither currently
  // has a socket event for these records. Keep an open drawer fresh without
  // polling elsewhere in the application.
  useEffect(() => {
    if (!open) return
    const timer = window.setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['oor'] })
      onRefreshOpenOrders?.()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [open, onRefreshOpenOrders, queryClient])

  // Computed KPIs
  const onTime = data.onTime ?? 0
  const quality = data.quality ?? 0
  const activePOs = canonicalError ? '—' : purchaseOrders.filter(isActiveOpenOrder).length
  const openIssues = data.openIssues ?? issues.filter((i: any) => i.status?.toLowerCase() === 'open' || i.status?.toLowerCase() === 'in progress').length
  // Seeded CMs store the contract status under data.status (legacy);
  // app-created CMs use data.contractStatus.
  const contractStatus = data.contractStatus ?? data.status
  // avgLeadTime may be numeric (app-created) or a units string like '6-8 wks' (seeded).
  const avgLeadTime = data.avgLeadTime
  const avgLeadTimeIsNumeric =
    typeof avgLeadTime === 'number' || /^\d+$/.test(String(avgLeadTime ?? ''))
  const avgLeadTimeDisplay =
    avgLeadTime === undefined || avgLeadTime === null || avgLeadTime === ''
      ? '—'
      : avgLeadTime
  const capacityUtil = data.capacityUtilization ?? 85
  const productivityScore = Math.round(quality * 0.5 + onTime * 0.3 + capacityUtil * 0.2)

  // Issues — normalized for the IssueLogger + persistence handlers
  const normalizedIssues = useMemo<Issue[]>(
    () => (issues as any[]).map((iss, i) => normalizeIssue(iss, i)),
    [issues],
  )

  const handleAddIssue = (input: Omit<Issue, 'id' | 'reportedDate' | 'status'>) => {
    if (!onUpdate) return
    const newIssue: Issue = {
      id: `issue-${Date.now()}`,
      reportedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      status: 'Open',
      ...input,
    }
    onUpdate({ ...data, issues: [...(data.issues || []), newIssue] })
  }

  const handleResolveIssue = (id: string, resolutionNotes?: string) => {
    if (!onUpdate) return
    const updated = (data.issues || []).map((iss: any, i: number) =>
      (iss.id || `issue-${i}`) === id
        ? { ...iss, status: 'Resolved', ...(resolutionNotes ? { resolutionNotes } : {}) }
        : iss,
    )
    onUpdate({ ...data, issues: updated })
  }

  // Contact helpers
  const primaryContact = contacts.find((c: any) => c.type === 'Primary / Project Manager') || contacts[0]
  const poContact = contacts.find((c: any) => c.type === 'PO Submission Contact')

  // Address
  const address = data.address || {}
  const fullAddress = [address.street, address.city, address.state, address.zip, address.country]
    .filter(Boolean)
    .join(', ')

  // Sorted products
  const sortedProducts = useMemo(() => {
    const items = [...products]
    items.sort((a: any, b: any) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      if (sortField === 'lastActivity') {
        aVal = aVal ? new Date(aVal).getTime() : 0
        bVal = bVal ? new Date(bVal).getTime() : 0
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return items
  }, [products, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const scrollToIssues = () => {
    issuesRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  if (!open || !cm) return null

  const statusColors = contractStatusColor(contractStatus || '')

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[880px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">{data.name || 'Untitled CM'}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">Contract Manufacturer</span>
              <span
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
                style={{ background: statusColors.bg, color: statusColors.text }}
              >
                {contractStatus || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[var(--text-tertiary)]">
              {data.vendorId && <span>Vendor ID: <span className="font-medium text-[var(--text-secondary)]">{data.vendorId}</span></span>}
              {data.relationshipStartDate && <span>Since {data.relationshipStartDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <AddToCowork
              item={{ name: data.name || 'Untitled CM', type: 'CM', id: cm?.id || data.id, description: `Contract Manufacturer — ${contractStatus || 'Unknown'}` }}
            />
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-primary"
            >
              <Edit3 size={14} /> Edit
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-colors"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Contact Info Card */}
          <div>
            <SectionHeader icon={Phone} label="Contact Information" />
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Primary Contact */}
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 font-medium">
                    {primaryContact?.type || 'Primary Contact'}
                  </p>
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">{primaryContact?.name || '—'}</p>
                  {primaryContact?.title && (
                    <p className="text-[12px] text-[var(--text-tertiary)]">{primaryContact.title}</p>
                  )}
                  {primaryContact?.email && (
                    <a
                      href={`mailto:${primaryContact.email}`}
                      className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] hover:underline mt-1"
                    >
                      <Mail size={12} /> {primaryContact.email}
                    </a>
                  )}
                  {primaryContact?.phone && (
                    <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mt-0.5">
                      <Phone size={12} /> {primaryContact.phone}
                    </p>
                  )}
                </div>

                {/* PO Submission Contact */}
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 font-medium">
                    PO Submission Contact
                  </p>
                  {poContact ? (
                    <>
                      <p className="text-[14px] font-medium text-[var(--text-primary)]">{poContact.name}</p>
                      {poContact.title && (
                        <p className="text-[12px] text-[var(--text-tertiary)]">{poContact.title}</p>
                      )}
                      {poContact.email && (
                        <a
                          href={`mailto:${poContact.email}`}
                          className="flex items-center gap-1.5 text-[13px] text-[var(--accent)] hover:underline mt-1"
                        >
                          <Mail size={12} /> {poContact.email}
                        </a>
                      )}
                      {poContact.phone && (
                        <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] mt-0.5">
                          <Phone size={12} /> {poContact.phone}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[13px] text-[var(--text-tertiary)]">Not specified</p>
                  )}
                </div>
              </div>

              {/* Address */}
              {fullAddress && (
                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)]">
                  <p className="flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)]">
                    <MapPin size={13} className="text-[var(--text-tertiary)]" /> {fullAddress}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* KPI Grid */}
          <div>
            <SectionHeader icon={TrendingUp} label="Performance KPIs" />
            <div className="grid grid-cols-3 gap-3">
              <KPICell
                label="On-Time Delivery"
                value={onTime}
                suffix="%"
                color={kpiColor(onTime, [90, 80])}
              />
              <KPICell
                label="Quality Score"
                value={quality}
                suffix="%"
                color={kpiColor(quality, [90, 80])}
              />
              <KPICell
                label="Active POs"
                value={activePOs}
              />
              <KPICell
                label="Open Issues"
                value={openIssues}
                onClick={scrollToIssues}
              />
              <KPICell
                label="Avg Lead Time"
                value={avgLeadTimeDisplay}
                suffix={avgLeadTimeIsNumeric ? ' days' : undefined}
              />
              <KPICell
                label="Productivity Score"
                value={productivityScore}
                color={kpiColor(productivityScore, [85, 70])}
              />
            </div>
          </div>

          {/* Products Currently Serviced */}
          {products.length > 0 && (
            <div>
              <SectionHeader icon={Package} label="Products Currently Serviced" />
              <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                <table className="nexus-table">
                  <thead>
                    <tr>
                      <th>
                        <button onClick={() => toggleSort('productName')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Product Name <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort('brand')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Brand <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>Active PO #</th>
                      <th>
                        <button onClick={() => toggleSort('unitsOrdered')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Units Ordered <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort('unitsDelivered')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Units Delivered <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort('status')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Status <ArrowUpDown size={11} />
                        </button>
                      </th>
                      <th>
                        <button onClick={() => toggleSort('lastActivity')} className="flex items-center gap-1 hover:text-[var(--accent)]">
                          Last Activity <ArrowUpDown size={11} />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProducts.map((p: any, i: number) => {
                      const pStatus = productStatusBadge(p.status || '')
                      return (
                        <tr key={p.id || i}>
                          <td className="font-medium">{p.productName || '—'}</td>
                          <td>
                            {p.brand ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--accent)]">
                                {p.brand}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="data-cell tabular-nums">{p.activePO || '—'}</td>
                          <td className="data-cell tabular-nums">{p.unitsOrdered?.toLocaleString() ?? '—'}</td>
                          <td className="data-cell tabular-nums">{p.unitsDelivered?.toLocaleString() ?? '—'}</td>
                          <td>
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                              style={{ background: pStatus.bg, color: pStatus.text }}
                            >
                              {p.status || '—'}
                            </span>
                          </td>
                          <td className="text-[var(--text-tertiary)]">
                            <span className="flex items-center gap-1">
                              <Clock size={11} /> {relativeDate(p.lastActivity)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Issues Section */}
          <div ref={issuesRef}>
            <SectionHeader icon={AlertTriangle} label="Issues" />
            <IssueLogger
              issues={normalizedIssues}
              onAdd={handleAddIssue}
              onResolve={handleResolveIssue}
              categories={['Quality', 'Delivery', 'Communication', 'Compliance', 'Capacity', 'Other']}
            />
          </div>

          {/* Purchase Orders — production orders assigned to this CM */}
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1"><SectionHeader icon={Package} label={`Purchase Orders${purchaseOrders.length ? ` (${purchaseOrders.length})` : ''}`} /></div>
              <button
                type="button"
                onClick={refreshCanonicalOrders}
                disabled={canonicalLoading}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                aria-label="Refresh purchase orders"
              >
                <RefreshCw size={14} className={canonicalLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            {canonicalError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--danger)] bg-[var(--danger-light)] p-3">
                <p className="text-[13px] text-[var(--danger)]">Purchase orders could not be loaded. No legacy data is being shown.</p>
                <button type="button" onClick={refreshCanonicalOrders} className="text-[12px] font-medium text-[var(--danger)] underline">Retry</button>
              </div>
            ) : canonicalLoading ? (
              <p className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]"><Loader2 size={14} className="animate-spin" /> Loading canonical purchase orders…</p>
            ) : purchaseOrders.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No purchase orders for this CM yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
                      <th className="px-3 py-2 font-medium">PO</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium">ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseOrders.map((po) => {
                      const lineStatuses = operationalStatuses.get(normalizeManufacturer(po.poNumber)) ?? []
                      return (
                      <tr key={po.id} className="border-b border-[var(--border-subtle)] last:border-0">
                        <td className="px-3 py-2 font-mono text-[var(--accent)]">{po.poNumber || '—'}</td>
                        <td className="px-3 py-2 text-[var(--text-primary)]">
                          {po.lines[0]?.description || po.lines[0]?.sku || '—'}
                          {po.lines.length > 1 ? ` +${po.lines.length - 1} more` : ''}
                        </td>
                        <td className="px-3 py-2 text-[var(--text-secondary)]">
                          <div>{po.poStatus || '—'}</div>
                          {lineStatuses.length > 0 && (
                            <div className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{lineStatuses.join(' · ')}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">{po.qtyOrdered.toLocaleString()}</td>
                        <td className="px-3 py-2 text-[var(--text-tertiary)]">{po.eta || '—'}</td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Production Updates — aggregated from this CM's production orders */}
          <div>
            <SectionHeader icon={Factory} label="Production Updates" />
            {canonicalError ? (
              <p className="text-[13px] text-[var(--danger)]">Production updates could not be loaded.</p>
            ) : canonicalLoading ? (
              <p className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]"><Loader2 size={14} className="animate-spin" /> Loading production updates…</p>
            ) : productionUpdates.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No production updates for this CM yet.</p>
            ) : (
              <div className="space-y-3">
                {productionUpdates.map((update) => (
                  <div key={update.id} className="relative pl-4 border-l-2 border-[var(--border-default)]">
                    <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[var(--accent)]" />
                    <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{update.text}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      {update.at ? String(update.at).slice(0, 10) : '—'} · {update.actor}
                      {update.poNumber && <> · {update.poNumber}</>}
                      {update.kind && <> · {update.kind}</>}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task Attachments */}
          <TaskAttachments taskId={cm?.id || data.id || 'unknown'} module="cm_productivity" />

          {/* Brands */}
          {data.brands && data.brands.length > 0 && (
            <div>
              <SectionHeader icon={Building2} label="Brands" />
              <div className="flex flex-wrap gap-2">
                {data.brands.map((brand: string, i: number) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-3 py-1.5 rounded-full text-[13px] font-medium bg-[var(--accent-light)] text-[var(--accent)] border border-[var(--accent)]/20"
                  >
                    {brand}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
