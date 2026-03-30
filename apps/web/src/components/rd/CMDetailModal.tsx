import { useState, useMemo, useRef } from 'react'
import {
  X,
  Edit3,
  Trash2,
  Building2,
  Phone,
  Mail,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Package,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

interface CMDetailModalProps {
  open: boolean
  cm: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  briefItems?: any[]
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

// ─── Inline Issue Logger ───────────────────────────────────

function IssueLogger({ issues }: { issues: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!issues || issues.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-[13px] text-[var(--text-tertiary)]">
        No issues logged for this CM.
      </div>
    )
  }

  const severityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return { bg: 'var(--danger-light)', text: 'var(--danger)' }
      case 'high':
        return { bg: 'var(--warning-light)', text: 'var(--warning)' }
      case 'medium':
        return { bg: 'var(--info-light)', text: 'var(--info)' }
      case 'low':
        return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
      default:
        return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
    }
  }

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'open':
        return { bg: 'var(--danger-light)', text: 'var(--danger)' }
      case 'in progress':
        return { bg: 'var(--warning-light)', text: 'var(--warning)' }
      case 'resolved':
        return { bg: 'var(--success-light)', text: 'var(--success)' }
      case 'closed':
        return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
      default:
        return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
    }
  }

  return (
    <div className="space-y-2">
      {issues.map((issue: any, i: number) => {
        const id = issue.id || `issue-${i}`
        const isExpanded = expanded === id
        const sev = severityColor(issue.severity)
        const stat = statusColor(issue.status)
        return (
          <div
            key={id}
            className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-hover)] transition-colors"
            >
              <AlertTriangle size={14} style={{ color: sev.text }} />
              <span className="flex-1 text-[13px] font-medium text-[var(--text-primary)] truncate">
                {issue.title || issue.description?.slice(0, 60) || 'Untitled Issue'}
              </span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: sev.bg, color: sev.text }}
              >
                {issue.severity || 'Medium'}
              </span>
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: stat.bg, color: stat.text }}
              >
                {issue.status || 'Open'}
              </span>
              {isExpanded ? <ChevronUp size={14} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={14} className="text-[var(--text-tertiary)]" />}
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 pt-1 border-t border-[var(--border-subtle)]">
                {issue.description && (
                  <p className="text-[13px] text-[var(--text-secondary)] mb-2">{issue.description}</p>
                )}
                <div className="flex gap-4 text-[12px] text-[var(--text-tertiary)]">
                  {issue.reportedDate && <span>Reported: {issue.reportedDate}</span>}
                  {issue.assignedTo && <span>Assigned: {issue.assignedTo}</span>}
                  {issue.product && <span>Product: {issue.product}</span>}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Modal ────────────────────────────────────────────

export function CMDetailModal({ open, cm, onClose, onEdit, onDelete, briefItems }: CMDetailModalProps) {
  const issuesRef = useRef<HTMLDivElement>(null)
  const [sortField, setSortField] = useState<SortField>('unitsOrdered')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const data = cm?.data || cm || {}
  const products = data.products || []
  const issues = data.issues || []
  const contacts = data.contacts || []

  // Computed KPIs
  const onTime = data.onTime ?? 0
  const quality = data.quality ?? 0
  const activePOs = data.activePOs ?? 0
  const openIssues = data.openIssues ?? issues.filter((i: any) => i.status?.toLowerCase() === 'open' || i.status?.toLowerCase() === 'in progress').length
  const avgLeadTime = data.avgLeadTime ?? 0
  const capacityUtil = data.capacityUtilization ?? 85
  const productivityScore = Math.round(quality * 0.5 + onTime * 0.3 + capacityUtil * 0.2)

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

  const statusColors = contractStatusColor(data.contractStatus || '')

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
                {data.contractStatus || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-[12px] text-[var(--text-tertiary)]">
              {data.vendorId && <span>Vendor ID: <span className="font-medium text-[var(--text-secondary)]">{data.vendorId}</span></span>}
              {data.relationshipStartDate && <span>Since {data.relationshipStartDate}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
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
                value={avgLeadTime}
                suffix=" days"
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
            <IssueLogger issues={issues} />
          </div>

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
