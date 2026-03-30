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
  Palette,
  Plus,
  Repeat2,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { ItemDetailDialog } from '@/components/ItemDetailDialog'
import { NewBriefModal, type BriefFormData, EMPTY_FORM } from '@/components/briefs/NewBriefModal'
import { BriefDetailView } from '@/components/briefs/BriefDetailView'
import { generateBriefPDF } from '@/utils/generateBriefPDF'
import { api } from '@/lib/api'
import { NewArtworkModal } from '@/components/rd/artwork/NewArtworkModal'
import { ArtworkProjectDetail } from '@/components/rd/artwork/ArtworkProjectDetail'
import { ARTWORK_STATUS_COLORS, DEFAULT_COMPLIANCE_ITEMS, generateRetailerComplianceItems, getApprovalChainSummary, type ArtworkProject } from '@/components/rd/artwork/artworkData'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations' | 'artwork'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
  { key: 'artwork', label: 'Artwork', icon: Palette },
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

// ─── Tech Transfers Tab (Edit 4 — with list view toggle + files) ──
function TransfersTab({ items, onSelect }: { items: any[]; onSelect: (item: any) => void }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  if (items.length === 0) {
    return (
      <p className="text-[14px] text-[var(--text-tertiary)] py-8 text-center">
        No tech transfers found.
      </p>
    )
  }

  if (viewMode === 'list') {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
            <button onClick={() => setViewMode('grid')} className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">Grid</button>
            <button onClick={() => setViewMode('list')} className="px-3 py-1.5 text-[12px] font-medium bg-[var(--accent)] text-white">List</button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>From → To</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Target</th>
                <th>Files</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-medium text-[14px] text-[var(--text-primary)]">{d.product}</td>
                    <td className="text-[14px] text-[var(--text-secondary)]">{d.from} → {d.to}</td>
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
                    <td className="text-[14px] text-[var(--accent)] tabular-nums">{d.docs} files</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
          <button onClick={() => setViewMode('grid')} className="px-3 py-1.5 text-[12px] font-medium bg-[var(--accent)] text-white">Grid</button>
          <button onClick={() => setViewMode('list')} className="px-3 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">List</button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {items.map((item: any) => {
        const d = item.data
        return (
          <div key={item.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => onSelect(item)}>
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm text-[var(--text-primary)]">
                {d.product}
              </h3>
              <StatusBadge status={d.status} />
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="truncate">{d.from}</span>
              <ArrowRight size={12} className="text-[var(--accent)] flex-shrink-0" />
              <span className="truncate">{d.to}</span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[var(--text-tertiary)]">Progress</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                  {d.progress}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${d.progress}%`,
                    background:
                      d.progress === 100 ? 'var(--success)' : 'var(--accent)',
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
              <span className="flex items-center gap-1">
                <Clock size={11} />
                Target: {d.target}
              </span>
              <span>{d.docs} docs</span>
            </div>
          </div>
        )
      })}
      </div>
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

// ─── Artwork Tab ──────────────────────────────────────────
function ArtworkTab({
  items,
  moduleId,
  briefs,
  onRefresh,
}: {
  items: any[]
  moduleId: string | null
  briefs: any[]
  onRefresh: () => void
}) {
  const [showNewArtwork, setShowNewArtwork] = useState(false)
  const [viewingArtwork, setViewingArtwork] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const projects = useMemo(() => {
    return items.map((item: any) => ({
      id: item.id,
      moduleId: item.moduleId,
      ...item.data,
    }))
  }, [items])

  const handleCreate = async (data: any) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      // Generate compliance checklist
      const staticItems = DEFAULT_COMPLIANCE_ITEMS.map((item, i) => ({
        ...item,
        id: `comp-${Date.now()}-${i}`,
      }))
      const retailerItems = generateRetailerComplianceItems(data.targetRetailers || []).map((item, i) => ({
        ...item,
        id: `comp-ret-${Date.now()}-${i}`,
      }))

      const projectData: any = {
        ...data,
        currentVersion: 'v1.0',
        status: 'Draft',
        versions: [],
        submissions: [],
        complianceChecklist: [...staticItems, ...retailerItems],
        activityLog: [{
          user: 'System',
          action: 'Artwork project created',
          timestamp: new Date().toISOString(),
        }],
        createdBy: 'You',
        createdAt: new Date().toISOString(),
      }

      await api.post(`/departments/_/modules/${moduleId}/items`, {
        data: projectData,
        status: 'Draft',
      })

      setShowNewArtwork(false)
      onRefresh()
    } catch (err) {
      console.error('Failed to create artwork project:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProjectUpdate = async (updates: any) => {
    if (!viewingArtwork) return
    const item = items.find((i: any) => i.id === viewingArtwork.id)
    if (!item) return

    const updatedProject = { ...viewingArtwork, ...updates }
    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingArtwork.id}`, {
        data: updatedProject,
      })
      setViewingArtwork(updatedProject)
      onRefresh()
    } catch (err) {
      console.error('Failed to update artwork project:', err)
    }
  }

  const formatDate = (d: string) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return d }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowNewArtwork(true)}
          className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]"
        >
          <Plus size={15} /> New Artwork Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <Palette size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No artwork projects yet</p>
          <button onClick={() => setShowNewArtwork(true)} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">
            Create Your First Artwork Project
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Artwork Name</th>
                <th>Brand</th>
                <th>Channel</th>
                <th>Version</th>
                <th>Status</th>
                <th>Approval</th>
                <th>Due Date</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((proj: any) => {
                const statusColor = ARTWORK_STATUS_COLORS[proj.status] || '#6B7280'
                const latestVersion = (proj.versions || [])[(proj.versions || []).length - 1]
                const approvals = latestVersion?.approvals || proj.approvalChain?.map((a: any) => ({ ...a, status: 'pending' })) || []
                const { approved, total } = getApprovalChainSummary(approvals)

                return (
                  <tr key={proj.id} className="clickable-row" onClick={() => setViewingArtwork(proj)}>
                    <td className="font-medium text-[var(--text-primary)]">{proj.artworkName || '—'}</td>
                    <td><span className="badge badge-accent text-[11px]">{proj.brand || '—'}</span></td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {(proj.channels || []).map((ch: string) => (
                          <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">{ch}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className="text-[12px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>
                        {proj.currentVersion || 'v1.0'}
                      </span>
                    </td>
                    <td>
                      <span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{proj.status || 'Draft'}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        {approvals.slice(0, 5).map((a: any, i: number) => (
                          <div
                            key={i}
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: a.status === 'approved' ? '#10B981' : a.status === 'rejected' ? '#EF4444' : 'var(--border-strong)',
                            }}
                            title={`${a.role}: ${a.status}`}
                          />
                        ))}
                        <span className="text-[10px] text-[var(--text-tertiary)] ml-1">{approved}/{total}</span>
                      </div>
                    </td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{formatDate(proj.submissionDueDate)}</td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{formatDate(proj.createdAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewArtworkModal
        open={showNewArtwork}
        onClose={() => setShowNewArtwork(false)}
        onSubmit={handleCreate}
        isSubmitting={isSubmitting}
      />

      <ArtworkProjectDetail
        open={!!viewingArtwork}
        project={viewingArtwork}
        onClose={() => setViewingArtwork(null)}
        onProjectUpdate={handleProjectUpdate}
      />
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
      return { briefs: [], cm: [], transfers: [], formulations: [], artwork: [], briefsModuleId: null, artworkModuleId: null }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []
    const briefsModule = modules.find((m: any) => m.type === 'BRIEFS')
    const artworkModule = modules.find((m: any) => m.type === 'ARTWORK_TRACKER')

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
      artwork: find('ARTWORK_TRACKER'),
      briefsModuleId: briefsModule?.id || null,
      artworkModuleId: artworkModule?.id || null,
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
    artwork: moduleData.artwork,
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
            <TransfersTab items={tabContent.transfers} onSelect={(item) => setSelectedItem({ item, type: 'TECH_TRANSFERS' })} />
          ) : activeTab === 'artwork' ? (
            <ArtworkTab
              items={tabContent.artwork}
              moduleId={moduleData.artworkModuleId}
              briefs={moduleData.briefs}
              onRefresh={() => refetchDept()}
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
