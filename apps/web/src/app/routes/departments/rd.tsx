import { useState, useMemo, useRef, useEffect } from 'react'
import {
  ArrowRight,
  Beaker,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  Edit3,
  FileText,
  FlaskConical,
  Loader2,
  MoreHorizontal,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'
import { NewBriefModal, type BriefFormData, EMPTY_FORM } from '@/components/briefs/NewBriefModal'
import { BriefDetailView } from '@/components/briefs/BriefDetailView'
import { generateBriefPDF } from '@/utils/generateBriefPDF'
import { api } from '@/lib/api'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
]

// ─── Skeleton ──────────────────────────────────────────────
function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="skeleton h-5 flex-1"
              style={{ maxWidth: c === 0 ? '240px' : '120px' }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="data-cell space-y-3">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

// ─── Phase Progress Bar ────────────────────────────────────
function PhaseBar({ phase, total }: { phase: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 flex-1 rounded-full transition-colors"
          style={{
            background:
              i < phase ? 'var(--accent)' : 'var(--border-default)',
          }}
        />
      ))}
      <span className="text-xs text-[var(--text-tertiary)] ml-1.5 tabular-nums">
        {phase}/{total}
      </span>
    </div>
  )
}

// ─── Status Badge ──────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; color?: string }> = {
    'Formula Approved': { className: 'badge-healthy' },
    'In Formulation': { className: 'badge-critical' },
    'Stability Testing': { className: '', color: '#EF4444' },
    'Brief Submitted': { className: 'badge-info' },
    'Draft': { className: '', color: '#6B7280' },
    'Approved': { className: 'badge-healthy' },
    'In Review': { className: 'badge-info' },
    'Complete': { className: 'badge-healthy' },
    'In Progress': { className: 'badge-info' },
    'Planning': { className: 'badge-critical' },
    'Pass': { className: 'badge-healthy' },
    'Testing': { className: 'badge-critical' },
    'Pending': { className: 'badge-accent' },
  }

  const style = map[status]
  if (style?.color) {
    return (
      <span
        className="badge"
        style={{
          background: `${style.color}18`,
          color: style.color,
        }}
      >
        {status}
      </span>
    )
  }

  return (
    <span className={`badge ${style?.className || 'badge-accent'}`}>
      {status}
    </span>
  )
}

// ─── Actions Menu ──────────────────────────────────────────
function ActionsMenu({
  onView,
  onEdit,
  onDownload,
  onDelete,
}: {
  onView: () => void
  onEdit: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 py-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onView() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Eye size={14} /> View
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Edit3 size={14} /> Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDownload() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <Download size={14} /> Download PDF
          </button>
          <div className="my-1 border-t border-[var(--border-subtle)]" />
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete() }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[var(--danger)] hover:bg-[var(--danger-light)]"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Delete Confirmation Dialog ────────────────────────────
function DeleteConfirmDialog({ open, briefName, onConfirm, onCancel }: {
  open: boolean
  briefName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Delete Brief</h3>
        <p className="text-[14px] text-[var(--text-secondary)] mb-5">
          Are you sure you want to delete <strong>"{briefName}"</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost px-4 py-2 text-[14px]">Cancel</button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-[14px] font-medium text-white bg-[var(--danger)] hover:opacity-90 transition-opacity"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Active Briefs Tab ─────────────────────────────────────
function BriefsTab({
  items,
  moduleId,
  onRefresh,
}: {
  items: any[]
  moduleId: string | null
  onRefresh: () => void
}) {
  const [showNewBrief, setShowNewBrief] = useState(false)
  const [editingBrief, setEditingBrief] = useState<(BriefFormData & { id: string }) | null>(null)
  const [viewingBrief, setViewingBrief] = useState<(BriefFormData & { id: string }) | null>(null)
  const [deletingBrief, setDeletingBrief] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Convert module items to brief data
  const briefs = useMemo(() => {
    return items.map((item: any) => ({
      id: item.id,
      moduleId: item.moduleId,
      ...item.data,
    }))
  }, [items])

  const handleSubmit = async (data: BriefFormData, isDraft: boolean) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      const briefData = {
        ...data,
        briefStatus: isDraft ? 'Draft' : data.briefStatus || 'Brief Submitted',
        phase: data.phase || 1,
      }

      if (editingBrief) {
        // Update existing
        const item = items.find((i: any) => i.id === editingBrief.id)
        if (item) {
          await api.patch(`/departments/_/modules/${item.moduleId}/items/${editingBrief.id}`, {
            data: briefData,
            status: briefData.briefStatus,
          })
        }
      } else {
        // Create new
        await api.post(`/departments/_/modules/${moduleId}/items`, {
          data: briefData,
          status: briefData.briefStatus,
        })
      }

      setShowNewBrief(false)
      setEditingBrief(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to save brief:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingBrief) return
    try {
      const item = items.find((i: any) => i.id === deletingBrief.id)
      if (item) {
        await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingBrief.id}`)
      }
      setDeletingBrief(null)
      setViewingBrief(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete brief:', err)
    }
  }

  const openView = (brief: any) => {
    setViewingBrief(brief)
  }

  const openEdit = (brief: any) => {
    setEditingBrief(brief)
    setViewingBrief(null)
    setShowNewBrief(true)
  }

  const downloadPDF = (brief: any) => {
    generateBriefPDF(brief)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  return (
    <div>
      {/* Header with New Brief button */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => { setEditingBrief(null); setShowNewBrief(true) }}
          className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]"
        >
          <Plus size={15} /> New Brief
        </button>
      </div>

      {/* Table */}
      {briefs.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No active briefs yet</p>
          <button
            onClick={() => { setEditingBrief(null); setShowNewBrief(true) }}
            className="btn-primary px-5 py-2.5 rounded-lg text-[14px]"
          >
            Create Your First Brief
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Brief Name</th>
                <th>Brand</th>
                <th>CM</th>
                <th>Date</th>
                <th>Status</th>
                <th>Phase Progress</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {briefs.map((brief: any) => (
                <tr
                  key={brief.id}
                  className="clickable-row"
                  onClick={() => openView(brief)}
                >
                  <td className="font-medium text-[var(--text-primary)]">
                    {brief.projectName || brief.name || '—'}
                  </td>
                  <td className="text-[var(--text-secondary)]">{brief.brand || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{brief.contractManufacturer || brief.cm || '—'}</td>
                  <td className="text-[var(--text-secondary)] text-[13px]">
                    {formatDate(brief.dateOfRequest)}
                  </td>
                  <td>
                    <StatusBadge status={brief.briefStatus || brief.status || 'Draft'} />
                  </td>
                  <td className="min-w-[160px]">
                    <PhaseBar phase={brief.phase || 1} total={5} />
                  </td>
                  <td>
                    <ActionsMenu
                      onView={() => openView(brief)}
                      onEdit={() => openEdit(brief)}
                      onDownload={() => downloadPDF(brief)}
                      onDelete={() => setDeletingBrief({ id: brief.id, name: brief.projectName || brief.name })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Brief Modal */}
      <NewBriefModal
        open={showNewBrief}
        onClose={() => { setShowNewBrief(false); setEditingBrief(null) }}
        onSubmit={handleSubmit}
        initialData={editingBrief}
        isSubmitting={isSubmitting}
      />

      {/* Brief Detail View */}
      <BriefDetailView
        open={!!viewingBrief}
        brief={viewingBrief}
        onClose={() => setViewingBrief(null)}
        onEdit={() => {
          if (viewingBrief) openEdit(viewingBrief)
        }}
        onDelete={() => {
          if (viewingBrief) {
            setDeletingBrief({ id: viewingBrief.id, name: viewingBrief.projectName })
          }
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingBrief}
        briefName={deletingBrief?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeletingBrief(null)}
      />
    </div>
  )
}

// ─── CM Productivity Tab (Edit 4 — Grid/List toggle + click-through) ──
function CMTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  if (items.length === 0) {
    return (
      <p className="text-[14px] text-[var(--text-tertiary)] py-8 text-center">
        No CM data found.
      </p>
    )
  }

  function percentColor(val: number): string {
    if (val >= 90) return 'var(--success)'
    if (val >= 80) return 'var(--warning)'
    return 'var(--danger)'
  }

  return (
    <div>
      {/* View Toggle */}
      <div className="flex justify-end mb-4">
        <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
              viewMode === 'list'
                ? 'bg-[var(--accent)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((item: any) => {
            const d = item.data
            return (
              <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-[14px] text-[var(--text-primary)]">{d.name}</h3>
                  {d.status === 'attention' && <span className="badge badge-critical">Attention</span>}
                </div>
                <div className="text-[12px] text-[var(--text-secondary)]">{(d.brands || []).join(', ')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">On-Time</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(d.onTime) }}>{d.onTime}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Quality</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(d.quality) }}>{d.quality}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                  <span>{d.activePOs} active POs</span>
                  <span>{d.openIssues} issues</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* List View (Edit 4) */
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Contact Name</th>
                <th>Products Manufactured</th>
                <th>Active POs</th>
                <th>Quality Score</th>
                <th>Open Issues</th>
                <th>On-Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td>
                      <div>
                        <span className="font-medium text-[14px] text-[var(--text-primary)]">{d.name}</span>
                        {d.address && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{d.address}</p>}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(d.brands || []).map((b: string) => (
                          <span key={b} className="badge badge-info text-[10px]">{b}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="text-[14px] font-medium text-[var(--accent)] tabular-nums cursor-pointer hover:underline">
                        {d.activePOs}
                      </span>
                    </td>
                    <td>
                      <span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(d.quality) }}>
                        {d.quality}%
                      </span>
                    </td>
                    <td>
                      <span className={`text-[14px] font-medium tabular-nums ${d.openIssues > 0 ? 'text-[var(--warning)] cursor-pointer hover:underline' : 'text-[var(--text-primary)]'}`}>
                        {d.openIssues}
                      </span>
                    </td>
                    <td>
                      <span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(d.onTime) }}>
                        {d.onTime}%
                      </span>
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

// ─── New/Edit Transfer Modal ──────────────────────────────
function NewTransferModal({
  open,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
  briefs,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: any) => void
  initialData?: any
  isSubmitting: boolean
  briefs: any[]
}) {
  const [form, setForm] = useState({
    product: '',
    from: '',
    to: '',
    status: 'Planning',
    progress: 0,
    target: '',
    docs: 0,
    linkedBriefId: '',
    notes: '',
  })

  // Reset form when modal opens
  useState(() => {
    if (open && initialData) {
      setForm({ ...form, ...initialData })
    } else if (open) {
      setForm({ product: '', from: '', to: '', status: 'Planning', progress: 0, target: '', docs: 0, linkedBriefId: '', notes: '' })
    }
  })

  // Sync when initialData changes
  useMemo(() => {
    if (open && initialData) {
      setForm({ product: initialData.product || '', from: initialData.from || '', to: initialData.to || '', status: initialData.status || 'Planning', progress: initialData.progress || 0, target: initialData.target || '', docs: initialData.docs || 0, linkedBriefId: initialData.linkedBriefId || '', notes: initialData.notes || '' })
    } else if (open) {
      setForm({ product: '', from: '', to: '', status: 'Planning', progress: 0, target: '', docs: 0, linkedBriefId: '', notes: '' })
    }
  }, [open, initialData])

  if (!open) return null

  // When a brief is selected, auto-fill product name and CM
  const handleBriefSelect = (briefId: string) => {
    setForm(prev => ({ ...prev, linkedBriefId: briefId }))
    if (briefId) {
      const brief = briefs.find((b: any) => b.id === briefId)
      if (brief) {
        const d = brief.data || brief
        const updates: any = { linkedBriefId: briefId }
        if (!form.product && d.projectName) updates.product = d.projectName
        if (!form.to && d.contractManufacturer) updates.to = d.contractManufacturer
        setForm(prev => ({ ...prev, ...updates }))
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">
            {initialData ? 'Edit Tech Transfer' : 'New Tech Transfer'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Linked Brief — the key feature */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Linked Active Brief
            </label>
            <select
              value={form.linkedBriefId}
              onChange={(e) => handleBriefSelect(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            >
              <option value="">— Select an Active Brief (optional) —</option>
              {briefs.map((item: any) => {
                const d = item.data || item
                const name = d.projectName || d.name || 'Unnamed Brief'
                const brand = d.brand || ''
                return (
                  <option key={item.id} value={item.id}>
                    {name}{brand ? ` — ${brand}` : ''}{d.contractManufacturer ? ` (${d.contractManufacturer})` : ''}
                  </option>
                )
              })}
            </select>
            {form.linkedBriefId && (
              <p className="text-[11px] text-[var(--success)] mt-1 flex items-center gap-1">
                <FileText size={10} /> Brief linked — product and CM auto-filled
              </p>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
              Product Name <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })}
              placeholder="e.g. Goddess Strength Shampoo 11oz"
              required
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                From <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={form.from}
                onChange={(e) => setForm({ ...form, from: e.target.value })}
                placeholder="Source CM / facility"
                className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">
                To <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                placeholder="Destination CM / facility"
                className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          {/* Status / Target Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              >
                <option value="Planning">Planning</option>
                <option value="In Progress">In Progress</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">Target Date</label>
              <input
                type="date"
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="Additional details about this transfer..."
              className="w-full px-3 py-2.5 rounded-[10px] text-[14px] outline-none bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-primary)] focus:border-[var(--accent)] transition-colors resize-y"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-[14px]">Cancel</button>
          <button
            onClick={() => onSubmit(form)}
            disabled={isSubmitting || !form.product.trim() || !form.from.trim() || !form.to.trim()}
            className="btn-primary px-5 py-2 text-[14px] disabled:opacity-40"
          >
            {isSubmitting ? 'Saving...' : initialData ? 'Save Changes' : 'Create Transfer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tech Transfers Tab (with create, link briefs, list/grid) ──
function TransfersTab({
  items,
  moduleId,
  briefs,
  onRefresh,
  onSelect,
}: {
  items: any[]
  moduleId: string | null
  briefs: any[]
  onRefresh: () => void
  onSelect: (item: any) => void
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewTransfer, setShowNewTransfer] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Build a brief lookup map for display
  const briefMap = useMemo(() => {
    const map: Record<string, any> = {}
    briefs.forEach((item: any) => {
      map[item.id] = item.data || item
    })
    return map
  }, [briefs])

  const handleSubmit = async (data: any) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      if (editingTransfer) {
        const item = items.find((i: any) => i.id === editingTransfer.id)
        if (item) {
          await api.patch(`/departments/_/modules/${item.moduleId}/items/${editingTransfer.id}`, {
            data: { ...data },
            status: data.status,
          })
        }
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, {
          data: { ...data, docs: 0 },
          status: data.status,
        })
      }
      setShowNewTransfer(false)
      setEditingTransfer(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to save transfer:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEdit = (item: any) => {
    setEditingTransfer({ id: item.id, ...item.data })
    setShowNewTransfer(true)
  }

  const getLinkedBriefName = (d: any) => {
    if (!d.linkedBriefId) return null
    const brief = briefMap[d.linkedBriefId]
    return brief ? (brief.projectName || brief.name) : null
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-3">
          <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={`px-3 py-1.5 text-[12px] font-medium ${viewMode === 'grid' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>Grid</button>
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-[12px] font-medium ${viewMode === 'list' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'}`}>List</button>
          </div>
          <button
            onClick={() => { setEditingTransfer(null); setShowNewTransfer(true) }}
            className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]"
          >
            <Plus size={15} /> New Transfer
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12">
          <Repeat2 size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No tech transfers yet</p>
          <button
            onClick={() => { setEditingTransfer(null); setShowNewTransfer(true) }}
            className="btn-primary px-5 py-2.5 rounded-lg text-[14px]"
          >
            Create Your First Transfer
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>From → To</th>
                <th>Linked Brief</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Target</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const d = item.data
                const briefName = getLinkedBriefName(d)
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-medium text-[14px] text-[var(--text-primary)]">{d.product}</td>
                    <td className="text-[14px] text-[var(--text-secondary)]">{d.from} → {d.to}</td>
                    <td>
                      {briefName ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--accent)]">
                          <FileText size={11} /> {briefName}
                        </span>
                      ) : (
                        <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td><StatusBadge status={d.status} /></td>
                    <td>
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${d.progress}%`, background: d.progress === 100 ? 'var(--success)' : 'var(--accent)' }} />
                        </div>
                        <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">{d.progress}%</span>
                      </div>
                    </td>
                    <td className="text-[14px] text-[var(--text-secondary)]">{d.target}</td>
                    <td>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
                        className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      >
                        <Edit3 size={14} />
                      </button>
                    </td>
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
            const briefName = getLinkedBriefName(d)
            return (
              <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm text-[var(--text-primary)]">{d.product}</h3>
                  <StatusBadge status={d.status} />
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="truncate">{d.from}</span>
                  <ArrowRight size={12} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="truncate">{d.to}</span>
                </div>

                {/* Linked Brief chip */}
                {briefName && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)]">
                      <FileText size={10} /> {briefName}
                    </span>
                  </div>
                )}

                {/* Progress */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--text-tertiary)]">Progress</span>
                    <span className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${d.progress}%`, background: d.progress === 100 ? 'var(--success)' : 'var(--accent)' }} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                  <span className="flex items-center gap-1"><Clock size={11} /> Target: {d.target}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(item) }} className="text-[var(--accent)] hover:underline text-[11px]">Edit</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New/Edit Transfer Modal */}
      <NewTransferModal
        open={showNewTransfer}
        onClose={() => { setShowNewTransfer(false); setEditingTransfer(null) }}
        onSubmit={handleSubmit}
        initialData={editingTransfer}
        isSubmitting={isSubmitting}
        briefs={briefs}
      />
    </div>
  )
}

// ─── Formulations Tab ──────────────────────────────────────
function FormulationsTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">
        No formulations found.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="nexus-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Version</th>
            <th>Status</th>
            <th>Stability</th>
            <th>Changes</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any) => {
            const d = item.data
            return (
              <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                <td className="font-medium text-[var(--text-primary)]">
                  {d.product}
                </td>
                <td>
                  <span className="badge badge-accent font-mono text-xs">
                    {d.ver}
                  </span>
                </td>
                <td>
                  <StatusBadge status={d.status} />
                </td>
                <td>
                  <StatusBadge status={d.stability} />
                </td>
                <td className="text-[var(--text-secondary)] max-w-[300px] truncate">
                  {d.changes}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function RDPage() {
  const [activeTab, setActiveTab] = useState<RDTab>('briefs')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)

  // Find R&D department from departments list
  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const rdDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_RD') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading, refetch: refetchDept } = useDepartment(
    rdDept?.id || ''
  )

  const isLoading = deptsLoading || detailLoading

  // Organize module items by type
  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return { briefs: [], cm: [], transfers: [], formulations: [], briefsModuleId: null, transfersModuleId: null }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []
    const briefsModule = modules.find((m: any) => m.type === 'BRIEFS')
    const transfersModule = modules.find((m: any) => m.type === 'TECH_TRANSFERS')

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
      briefsModuleId: briefsModule?.id || null,
      transfersModuleId: transfersModule?.id || null,
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
          style={{ background: rdDept?.color ? `${rdDept.color}20` : 'var(--accent-subtle)' }}
        >
          {rdDept?.icon || <Beaker size={20} />}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            R&D Department
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Formulations, briefs, tech transfers, CM coordination
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-0.5 p-1 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all"
              style={{
                background: isActive ? 'var(--bg-elevated)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: isActive ? 'var(--shadow-xs)' : 'none',
                fontWeight: isActive ? 550 : 500,
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="stagger">
        <div>
          {isLoading ? (
            activeTab === 'briefs' || activeTab === 'formulations' ? (
              <TableSkeleton />
            ) : (
              <CardsSkeleton />
            )
          ) : activeTab === 'briefs' ? (
            <BriefsTab
              items={tabContent.briefs}
              moduleId={moduleData.briefsModuleId}
              onRefresh={() => refetchDept()}
            />
          ) : activeTab === 'cm' ? (
            <CMTab items={tabContent.cm} onSelect={(item) => setSelectedItem({ item, type: 'CM_PRODUCTIVITY' })} />
          ) : activeTab === 'transfers' ? (
            <TransfersTab
              items={tabContent.transfers}
              moduleId={moduleData.transfersModuleId}
              briefs={moduleData.briefs}
              onRefresh={() => refetchDept()}
              onSelect={(item) => setSelectedItem({ item, type: 'TECH_TRANSFERS' })}
            />
          ) : (
            <FormulationsTab items={tabContent.formulations} onSelect={(item) => setSelectedItem({ item, type: 'FORMULATIONS' })} />
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
