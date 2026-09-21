import { useState, useMemo } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Link2,
  MessageSquare,
  Plus,
  X,
  CheckCircle2,
  Clock,
  User,
} from 'lucide-react'
import {
  useAtRiskProducts,
  useCreateAtRiskProduct,
  useResolveAtRiskProduct,
  useAddAtRiskProductLink,
  useDeleteAtRiskProductLink,
  useCreateAtRiskProductIssue,
  useUpdateAtRiskProductIssue,
  useResolveAtRiskProductIssue,
  type AtRiskProduct,
  type AtRiskProductLink,
  type AtRiskProductIssue,
} from '@/hooks/useData'
import { brandLabel } from '@/components/ops/brandLabel'

interface AtRiskProductsTabProps {
  inventoryItems: any[]
  departmentId: string | null
}

const LINK_TYPES = [
  { value: 'oor_line', label: 'Open Order Line' },
  { value: 'tech_transfer', label: 'Tech Transfer' },
  { value: 'project', label: 'Project' },
  { value: 'production_order', label: 'Production Order' },
  { value: 'formulation', label: 'Formulation' },
] as const

const ISSUE_TYPES = [
  { value: 'formulation', label: 'Formulation' },
  { value: 'artwork', label: 'Artwork' },
  { value: 'missing_component', label: 'Missing Component' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'supply_chain', label: 'Supply Chain' },
  { value: 'other', label: 'Other' },
] as const

const RISK_CATEGORIES = [
  { value: 'supply_chain', label: 'Supply Chain' },
  { value: 'formulation', label: 'Formulation' },
  { value: 'artwork', label: 'Artwork' },
  { value: 'component', label: 'Component' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'other', label: 'Other' },
] as const

const PRIORITIES = [
  { value: 'CRITICAL', label: 'Critical', color: 'var(--danger)' },
  { value: 'HIGH', label: 'High', color: 'var(--warning)' },
  { value: 'MEDIUM', label: 'Medium', color: 'var(--info)' },
] as const

const SEVERITIES = [
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
] as const

type StatusFilter = 'ACTIVE' | 'MONITORING' | 'RESOLVED'

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string }> = {
    emergency: { bg: 'rgba(255, 69, 58, 0.12)', color: 'var(--danger)' },
    critical: { bg: 'rgba(255, 159, 10, 0.12)', color: 'var(--warning)' },
    healthy: { bg: 'rgba(48, 209, 88, 0.12)', color: 'var(--success)' },
    overstock: { bg: 'rgba(10, 132, 255, 0.12)', color: 'var(--info)' },
  }
  const cfg = config[status] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {status}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find((pr) => pr.value === priority)
  const color = p?.color || 'var(--text-secondary)'
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: `${color}20`, color }}
    >
      {p?.label || priority}
    </span>
  )
}

function IssueStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    OPEN: { bg: 'rgba(255, 69, 58, 0.12)', color: 'var(--danger)', label: 'Open' },
    IN_PROGRESS: { bg: 'rgba(10, 132, 255, 0.12)', color: 'var(--info)', label: 'In Progress' },
    BLOCKED: { bg: 'rgba(255, 159, 10, 0.12)', color: 'var(--warning)', label: 'Blocked' },
    RESOLVED: { bg: 'rgba(48, 209, 88, 0.12)', color: 'var(--success)', label: 'Resolved' },
  }
  const cfg = config[status] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', label: status }
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

export function AtRiskProductsTab({ inventoryItems, departmentId }: AtRiskProductsTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIVE')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState<string | null>(null)
  const [showIssueModal, setShowIssueModal] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)

  const { data, isLoading, isError, refetch } = useAtRiskProducts({
    departmentId: departmentId || undefined,
    status: statusFilter,
  })
  const createProduct = useCreateAtRiskProduct()
  const resolveProduct = useResolveAtRiskProduct()
  const addLink = useAddAtRiskProductLink()
  const deleteLink = useDeleteAtRiskProductLink()
  const createIssue = useCreateAtRiskProductIssue()
  const resolveIssue = useResolveAtRiskProductIssue()

  const items = data?.items || []
  const total = data?.total || 0

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleResolveProduct = async (id: string) => {
    setResolving(id)
    try {
      await resolveProduct.mutateAsync({ id })
    } finally {
      setResolving(null)
    }
  }

  const handleDeleteLink = async (productId: string, linkId: string) => {
    await deleteLink.mutateAsync({ productId, linkId })
  }

  const handleResolveIssue = async (productId: string, issueId: string) => {
    await resolveIssue.mutateAsync({ productId, issueId })
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
      active
        ? 'bg-[var(--accent)] text-white border-transparent'
        : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
    }`

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-9 w-28" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton h-5 w-24" />
              <div className="skeleton h-5 flex-1" />
              <div className="skeleton h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle size={32} className="text-[var(--danger)] mb-4" />
        <p className="text-sm text-[var(--text-secondary)] mb-4">Failed to load at-risk products.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">At-Risk Products</h2>
          <span className="text-xs text-[var(--text-tertiary)]">{total}</span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 px-4 py-2 text-sm rounded-lg w-fit"
        >
          <Plus size={15} />
          Add product
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mr-1">
          Filter
        </span>
        {(['ACTIVE', 'MONITORING', 'RESOLVED'] as StatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={chip(statusFilter === status)}
          >
            {status.charAt(0) + status.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center mb-4">
            <AlertTriangle size={24} className="text-[var(--text-tertiary)]" />
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">No at-risk products yet.</p>
          <p className="text-xs text-[var(--text-tertiary)] mb-6 max-w-sm">
            Mark SKUs that need manual watch — links, issues, due dates.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            Add product
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th className="w-8"></th>
                <th>Product</th>
                <th>Inv Status</th>
                <th>Priority</th>
                <th>Open Issues</th>
                <th>Links</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isExpanded = expandedRows.has(item.id)
                const inv = item.inventory
                return (
                  <>
                    <tr
                      key={item.id}
                      className="clickable-row"
                      onClick={() => toggleRow(item.id)}
                    >
                      <td className="text-[var(--text-tertiary)]">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>
                        <div>
                          <span className="font-mono text-xs text-[var(--text-tertiary)]">
                            {inv?.sku || '—'}
                          </span>
                          <span className="ml-2 font-medium text-[var(--text-primary)]">
                            {inv?.name || 'Unknown'}
                          </span>
                          {inv?.brand && (
                            <span className="ml-2 text-xs text-[var(--text-secondary)]">
                              {brandLabel(inv.brand)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={inv?.status || 'unknown'} />
                      </td>
                      <td>
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td className="tabular-nums text-[var(--text-secondary)]">
                        {item.openIssueCount}
                      </td>
                      <td className="tabular-nums text-[var(--text-secondary)]">
                        {item.linkCount}
                      </td>
                      <td>
                        <div
                          className="flex justify-end items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {item.status !== 'RESOLVED' && (
                            <button
                              onClick={() => handleResolveProduct(item.id)}
                              disabled={resolving === item.id}
                              title="Resolve"
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--success)] hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-[var(--bg-base)]">
                        <td></td>
                        <td colSpan={6} className="py-4">
                          <ExpandedRow
                            item={item}
                            onAddLink={() => setShowLinkModal(item.id)}
                            onDeleteLink={(linkId) => handleDeleteLink(item.id, linkId)}
                            onAddIssue={() => setShowIssueModal(item.id)}
                            onResolveIssue={(issueId) => handleResolveIssue(item.id, issueId)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <AddProductModal
          inventoryItems={inventoryItems}
          departmentId={departmentId}
          onClose={() => setShowAddModal(false)}
          onCreate={async (data) => {
            await createProduct.mutateAsync(data)
            setShowAddModal(false)
          }}
          isCreating={createProduct.isPending}
        />
      )}

      {showLinkModal && (
        <AddLinkModal
          productId={showLinkModal}
          onClose={() => setShowLinkModal(null)}
          onAdd={async (data) => {
            await addLink.mutateAsync(data)
            setShowLinkModal(null)
          }}
          isAdding={addLink.isPending}
        />
      )}

      {showIssueModal && (
        <CreateIssueModal
          productId={showIssueModal}
          onClose={() => setShowIssueModal(null)}
          onCreate={async (data) => {
            await createIssue.mutateAsync(data)
            setShowIssueModal(null)
          }}
          isCreating={createIssue.isPending}
        />
      )}
    </div>
  )
}

function ExpandedRow({
  item,
  onAddLink,
  onDeleteLink,
  onAddIssue,
  onResolveIssue,
}: {
  item: AtRiskProduct
  onAddLink: () => void
  onDeleteLink: (linkId: string) => void
  onAddIssue: () => void
  onResolveIssue: (issueId: string) => void
}) {
  return (
    <div className="space-y-4">
      {item.addedReason && (
        <div className="text-xs text-[var(--text-secondary)]">
          <span className="text-[var(--text-tertiary)]">Reason:</span> {item.addedReason}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Links
          </span>
          <button
            onClick={onAddLink}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
          >
            <Plus size={12} />
            Add link
          </button>
        </div>
        {item.links.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No links added</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {item.links.map((link) => (
              <span
                key={link.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs"
              >
                <Link2 size={12} className="text-[var(--text-tertiary)]" />
                <span className="text-[var(--text-secondary)]">
                  {LINK_TYPES.find((t) => t.value === link.linkType)?.label || link.linkType}
                </span>
                {link.linkLabel && (
                  <span className="text-[var(--text-primary)]">{link.linkLabel}</span>
                )}
                <button
                  onClick={() => onDeleteLink(link.id)}
                  className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
            Issues
          </span>
          <button
            onClick={onAddIssue}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
          >
            <Plus size={12} />
            Create issue
          </button>
        </div>
        {item.issues.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No issues</p>
        ) : (
          <div className="space-y-2">
            {item.issues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center justify-between gap-3 p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                    {ISSUE_TYPES.find((t) => t.value === issue.issueType)?.label || issue.issueType}
                  </span>
                  <span className="text-sm text-[var(--text-primary)] truncate">{issue.title}</span>
                  {issue.dueDate && (
                    <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                      <Clock size={11} />
                      {new Date(issue.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <IssueStatusBadge status={issue.status} />
                </div>
                {issue.status !== 'RESOLVED' && (
                  <button
                    onClick={() => onResolveIssue(issue.id)}
                    title="Resolve issue"
                    className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--success)] hover:bg-[var(--bg-hover)]"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AddProductModal({
  inventoryItems,
  departmentId,
  onClose,
  onCreate,
  isCreating,
}: {
  inventoryItems: any[]
  departmentId: string | null
  onClose: () => void
  onCreate: (data: any) => Promise<void>
  isCreating: boolean
}) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('HIGH')

  const filtered = useMemo(() => {
    if (!search.trim()) return inventoryItems.slice(0, 20)
    const q = search.toLowerCase()
    return inventoryItems.filter((item) => {
      const d = item.data || {}
      return (
        d.sku?.toLowerCase().includes(q) ||
        d.name?.toLowerCase().includes(q) ||
        d.brand?.toLowerCase().includes(q)
      )
    }).slice(0, 20)
  }, [inventoryItems, search])

  const handleSubmit = async () => {
    if (!selectedId) return
    await onCreate({
      inventoryItemId: selectedId,
      departmentId: departmentId || undefined,
      riskCategory: category || undefined,
      priority,
      addedReason: reason || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Add At-Risk Product</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Search inventory
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search by SKU, name, or brand..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-[var(--border-subtle)] p-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] text-center py-4">
                {search ? 'No items match your search' : 'Type to search inventory'}
              </p>
            ) : (
              filtered.map((item) => {
                const d = item.data || {}
                const isSelected = selectedId === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                      isSelected
                        ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]'
                        : 'hover:bg-[var(--bg-hover)] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-mono text-xs text-[var(--text-tertiary)]">{d.sku}</span>
                        <span className="ml-2 text-[var(--text-primary)]">{d.name}</span>
                      </div>
                      <StatusBadge status={d.status || 'unknown'} />
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this product at risk?"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select category...</option>
              {RISK_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Priority
            </label>
            <div className="flex items-center gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    priority === p.value
                      ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                  }`}
                  style={{ color: priority === p.value ? p.color : undefined }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedId || isCreating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Adding...' : 'Add to At-Risk'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddLinkModal({
  productId,
  onClose,
  onAdd,
  isAdding,
}: {
  productId: string
  onClose: () => void
  onAdd: (data: any) => Promise<void>
  isAdding: boolean
}) {
  const [linkType, setLinkType] = useState('')
  const [linkId, setLinkId] = useState('')
  const [linkLabel, setLinkLabel] = useState('')

  const handleSubmit = async () => {
    if (!linkType || !linkId) return
    await onAdd({
      productId,
      linkType,
      linkId,
      linkLabel: linkLabel || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Add Link</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Link Type
            </label>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select type...</option>
              {LINK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Link ID
            </label>
            <input
              type="text"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              placeholder="Enter the ID of the linked item"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Label (optional)
            </label>
            <input
              type="text"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Display label for this link"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!linkType || !linkId || isAdding}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAdding ? 'Adding...' : 'Add link'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateIssueModal({
  productId,
  onClose,
  onCreate,
  isCreating,
}: {
  productId: string
  onClose: () => void
  onCreate: (data: any) => Promise<void>
  isCreating: boolean
}) {
  const [issueType, setIssueType] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState('HIGH')
  const [dueDate, setDueDate] = useState('')

  const handleSubmit = async () => {
    if (!issueType || !title) return
    await onCreate({
      productId,
      issueType,
      title,
      description: description || undefined,
      severity,
      dueDate: dueDate || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Create Issue</h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Issue Type
            </label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">Select type...</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
              Detail (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-subtle)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!issueType || !title || isCreating}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create issue'}
          </button>
        </div>
      </div>
    </div>
  )
}
