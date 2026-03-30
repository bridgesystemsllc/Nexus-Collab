import { useState, useMemo, useRef, useEffect } from 'react'
import {
  AlertTriangle,
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
  Lock,
  MoreHorizontal,
  Plus,
  Repeat2,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  Users,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { NewBriefModal, type BriefFormData, EMPTY_FORM } from '@/components/briefs/NewBriefModal'
import { BriefDetailView } from '@/components/briefs/BriefDetailView'
import { generateBriefPDF } from '@/utils/generateBriefPDF'
import { CMDetailModal } from '@/components/rd/CMDetailModal'
import { NewCMModal, type CMFormData } from '@/components/rd/NewCMModal'
import { TransferDetailModal } from '@/components/rd/TransferDetailModal'
import { NewTransferModal, type TransferFormData } from '@/components/rd/NewTransferModal'
import { FormulationDetailModal } from '@/components/rd/FormulationDetailModal'
import { NewFormulationModal, type FormulationFormData } from '@/components/rd/NewFormulationModal'
import { api } from '@/lib/api'
import { NewNPDProjectModal, type NPDFormData } from '@/components/rd/npd/NewNPDProjectModal'
import { NPDProjectDetail } from '@/components/rd/npd/NPDProjectDetail'
import { STAGE_CONFIG, createDefaultTasks, getStageProgress, getOverallProgress, getCurrentStage, isStageUnlocked, type NPDTask } from '@/components/rd/npd/npdChecklist'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations' | 'npd'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
  { key: 'npd', label: 'NPD', icon: Rocket },
]

// ─── Shared Utilities ──────────────────────────────────────
function percentColor(val: number): string {
  if (val >= 90) return 'var(--success)'
  if (val >= 80) return 'var(--warning)'
  return 'var(--danger)'
}

function productivityScore(d: any): number {
  const q = d.quality || 0
  const ot = d.onTime || 0
  const cu = d.capacityUtilization || 85
  return Math.round(q * 0.5 + ot * 0.3 + cu * 0.2)
}

function productivityColor(score: number): string {
  if (score >= 85) return 'var(--success)'
  if (score >= 70) return 'var(--warning)'
  return 'var(--danger)'
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    return `${Math.floor(days / 30)}mo ago`
  } catch { return dateStr }
}

// ─── Skeleton ──────────────────────────────────────────────
function TableSkeleton({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-5 flex-1" style={{ maxWidth: c === 0 ? '240px' : '120px' }} />
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
        <div key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i < phase ? 'var(--accent)' : 'var(--border-default)' }} />
      ))}
      <span className="text-xs text-[var(--text-tertiary)] ml-1.5 tabular-nums">{phase}/{total}</span>
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
    'Fail': { className: '', color: '#EF4444' },
    'Testing': { className: 'badge-critical' },
    'Pending': { className: 'badge-accent' },
    'Ongoing': { className: 'badge-info' },
    'Active': { className: 'badge-healthy' },
    'On Hold': { className: '', color: '#EF4444' },
    'Terminated': { className: '', color: '#EF4444' },
    'Pending Onboarding': { className: 'badge-info' },
    'Cleared': { className: 'badge-healthy' },
    'Not Required': { className: '', color: '#6B7280' },
    'Compliant': { className: 'badge-healthy' },
    'Under Review': { className: 'badge-critical' },
    'Non-Compliant': { className: '', color: '#EF4444' },
    'Rejected': { className: '', color: '#EF4444' },
    'Archived': { className: '', color: '#6B7280' },
    'Critical': { className: '', color: '#EF4444' },
    'High': { className: '', color: '#F59E0B' },
    'Standard': { className: '', color: '#6B7280' },
    'Formula Shared': { className: 'badge-accent' },
    'Scale Up': { className: 'badge-critical' },
  }
  const style = map[status]
  if (style?.color) {
    return <span className="badge" style={{ background: `${style.color}18`, color: style.color }}>{status}</span>
  }
  return <span className={`badge ${style?.className || 'badge-accent'}`}>{status}</span>
}

// ─── Actions Menu (generic) ────────────────────────────────
function ActionsMenu({ actions }: { actions: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setOpen(!open) }} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 py-1 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg">
          {actions.map((a, i) => (
            <div key={i}>
              {a.danger && i > 0 && <div className="my-1 border-t border-[var(--border-subtle)]" />}
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick() }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[13px] ${a.danger ? 'text-[var(--danger)] hover:bg-[var(--danger-light)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
              >
                <a.icon size={14} /> {a.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Delete Confirmation Dialog ────────────────────────────
function DeleteConfirmDialog({ open, itemName, onConfirm, onCancel }: {
  open: boolean; itemName: string; onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Confirm Delete</h3>
        <p className="text-[14px] text-[var(--text-secondary)] mb-5">
          Are you sure you want to delete <strong>"{itemName}"</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="btn-ghost px-4 py-2 text-[14px]">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-[14px] font-medium text-white bg-[var(--danger)] hover:opacity-90 transition-opacity">Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Active Briefs Tab ─────────────────────────────────────
function BriefsTab({ items, moduleId, onRefresh, transferItems, formulationItems }: {
  items: any[]; moduleId: string | null; onRefresh: () => void; transferItems: any[]; formulationItems: any[]
}) {
  const [showNewBrief, setShowNewBrief] = useState(false)
  const [editingBrief, setEditingBrief] = useState<(BriefFormData & { id: string }) | null>(null)
  const [viewingBrief, setViewingBrief] = useState<(BriefFormData & { id: string }) | null>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const briefs = useMemo(() => items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data })), [items])

  // Cross-module linking indicators
  const briefHasTransfer = (briefId: string, briefName: string) =>
    transferItems.some((t: any) => t.data?.linkedBriefId === briefId || t.data?.linkedBriefName === briefName)
  const briefHasFormulation = (briefId: string, briefName: string) =>
    formulationItems.some((f: any) => f.data?.linkedBriefId === briefId || f.data?.linkedBriefName === briefName)

  const handleSubmit = async (data: BriefFormData, isDraft: boolean) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      const briefData = { ...data, briefStatus: isDraft ? 'Draft' : data.briefStatus || 'Brief Submitted', phase: data.phase || 1 }
      if (editingBrief) {
        const item = items.find((i: any) => i.id === editingBrief.id)
        if (item) await api.patch(`/departments/_/modules/${item.moduleId}/items/${editingBrief.id}`, { data: briefData, status: briefData.briefStatus })
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, { data: briefData, status: briefData.briefStatus })
      }
      setShowNewBrief(false); setEditingBrief(null); onRefresh()
    } catch (err) { console.error('Failed to save brief:', err) } finally { setIsSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      const item = items.find((i: any) => i.id === deletingItem.id)
      if (item) await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingItem.id}`)
      setDeletingItem(null); setViewingBrief(null); onRefresh()
    } catch (err) { console.error('Failed to delete brief:', err) }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    try { return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return dateStr }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={() => { setEditingBrief(null); setShowNewBrief(true) }} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Brief
        </button>
      </div>
      {briefs.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No active briefs yet</p>
          <button onClick={() => { setEditingBrief(null); setShowNewBrief(true) }} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Create Your First Brief</button>
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
                <th>Links</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {briefs.map((brief: any) => (
                <tr key={brief.id} className="clickable-row" onClick={() => setViewingBrief(brief)}>
                  <td className="font-medium text-[var(--text-primary)]">{brief.projectName || brief.name || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{brief.brand || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{brief.contractManufacturer || brief.cm || '—'}</td>
                  <td className="text-[var(--text-secondary)] text-[13px]">{formatDate(brief.dateOfRequest)}</td>
                  <td><StatusBadge status={brief.briefStatus || brief.status || 'Draft'} /></td>
                  <td className="min-w-[160px]"><PhaseBar phase={brief.phase || 1} total={5} /></td>
                  <td>
                    <div className="flex gap-1">
                      {briefHasTransfer(brief.id, brief.projectName) && <span className="badge badge-info text-[10px]">Transfer</span>}
                      {briefHasFormulation(brief.id, brief.projectName) && <span className="badge badge-accent text-[10px]">Formula</span>}
                    </div>
                  </td>
                  <td>
                    <ActionsMenu actions={[
                      { label: 'View', icon: Eye, onClick: () => setViewingBrief(brief) },
                      { label: 'Edit', icon: Edit3, onClick: () => { setEditingBrief(brief); setShowNewBrief(true) } },
                      { label: 'Download PDF', icon: Download, onClick: () => generateBriefPDF(brief) },
                      { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: brief.id, name: brief.projectName || brief.name }), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NewBriefModal open={showNewBrief} onClose={() => { setShowNewBrief(false); setEditingBrief(null) }} onSubmit={handleSubmit} initialData={editingBrief} isSubmitting={isSubmitting} />
      <BriefDetailView open={!!viewingBrief} brief={viewingBrief} onClose={() => setViewingBrief(null)} onEdit={() => { if (viewingBrief) { setEditingBrief(viewingBrief); setViewingBrief(null); setShowNewBrief(true) } }} onDelete={() => { if (viewingBrief) setDeletingItem({ id: viewingBrief.id, name: viewingBrief.projectName }) }} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}

// ─── CM Productivity Tab (Expanded) ────────────────────────
function CMTab({ items, moduleId, onRefresh, briefItems }: { items: any[]; moduleId: string | null; onRefresh: () => void; briefItems: any[] }) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewCM, setShowNewCM] = useState(false)
  const [editingCM, setEditingCM] = useState<any>(null)
  const [viewingCM, setViewingCM] = useState<any>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const cmList = useMemo(() =>
    items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data }))
      .sort((a: any, b: any) => productivityScore(b) - productivityScore(a)),
    [items]
  )

  const handleSubmit = async (data: CMFormData) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      const cmData = { ...data, contractStatus: data.contractStatus || 'Active' }
      if (editingCM) {
        await api.patch(`/departments/_/modules/${editingCM.moduleId}/items/${editingCM.id}`, { data: cmData, status: cmData.contractStatus })
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, { data: cmData, status: cmData.contractStatus })
      }
      setShowNewCM(false); setEditingCM(null); onRefresh()
    } catch (err) { console.error('Failed to save CM:', err) } finally { setIsSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      const item = items.find((i: any) => i.id === deletingItem.id)
      if (item) await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingItem.id}`)
      setDeletingItem(null); setViewingCM(null); onRefresh()
    } catch (err) { console.error('Failed to delete CM:', err) }
  }

  const handleItemUpdate = async (cm: any) => {
    try {
      await api.patch(`/departments/_/modules/${cm.moduleId}/items/${cm.id}`, { data: cm })
      onRefresh()
    } catch (err) { console.error('Failed to update CM:', err) }
  }

  const topProduct = (d: any) => {
    if (!d.products?.length) return '—'
    const sorted = [...d.products].sort((a: any, b: any) => (b.unitsOrdered || 0) - (a.unitsOrdered || 0))
    return sorted[0]?.name || '—'
  }

  const primaryContact = (d: any) => {
    if (!d.contacts?.length) return null
    return d.contacts.find((c: any) => c.type === 'Primary / Project Manager') || d.contacts[0]
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
          {(['grid', 'list'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === mode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditingCM(null); setShowNewCM(true) }} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> Add CM
        </button>
      </div>

      {cmList.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No contract manufacturers yet</p>
          <button onClick={() => { setEditingCM(null); setShowNewCM(true) }} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First CM</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cmList.map((cm: any) => {
            const score = productivityScore(cm)
            return (
              <div key={cm.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setViewingCM(cm)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-[14px] text-[var(--text-primary)]">{cm.name}</h3>
                  <StatusBadge status={cm.contractStatus || 'Active'} />
                </div>
                <div className="text-[12px] text-[var(--text-secondary)]">{(cm.brands || []).join(', ')}</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">On-Time</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(cm.onTime || 0) }}>{cm.onTime || 0}%</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">Quality</p>
                    <p className="text-lg font-semibold tabular-nums" style={{ color: percentColor(cm.quality || 0) }}>{cm.quality || 0}%</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[12px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                  <span>{cm.activePOs || 0} active POs</span>
                  <span className="font-semibold tabular-nums" style={{ color: productivityColor(score) }}>{score}</span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>CM Name</th>
                <th>Contact</th>
                <th>Brands</th>
                <th>Active POs</th>
                <th>Quality</th>
                <th>On-Time</th>
                <th>Productivity</th>
                <th>Top Product</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cmList.map((cm: any) => {
                const score = productivityScore(cm)
                const contact = primaryContact(cm)
                return (
                  <tr key={cm.id} className="clickable-row" onClick={() => setViewingCM(cm)}>
                    <td>
                      <div>
                        <span className="font-medium text-[14px] text-[var(--text-primary)]">{cm.name}</span>
                        {cm.address?.city && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{cm.address.city}, {cm.address.state}</p>}
                      </div>
                    </td>
                    <td>
                      {contact ? (
                        <div>
                          <span className="text-[13px] text-[var(--text-primary)]">{contact.name}</span>
                          {contact.email && <p className="text-[11px] text-[var(--accent)]">{contact.email}</p>}
                        </div>
                      ) : <span className="text-[var(--text-tertiary)]">—</span>}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(cm.brands || []).map((b: string) => <span key={b} className="badge badge-info text-[10px]">{b}</span>)}
                      </div>
                    </td>
                    <td><span className="text-[14px] font-medium text-[var(--accent)] tabular-nums">{cm.activePOs || 0}</span></td>
                    <td><span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(cm.quality || 0) }}>{cm.quality || 0}%</span></td>
                    <td><span className="text-[14px] font-semibold tabular-nums" style={{ color: percentColor(cm.onTime || 0) }}>{cm.onTime || 0}%</span></td>
                    <td><span className="text-[14px] font-bold tabular-nums" style={{ color: productivityColor(score) }}>{score}</span></td>
                    <td className="text-[13px] text-[var(--text-secondary)] max-w-[120px] truncate">{topProduct(cm)}</td>
                    <td>
                      <ActionsMenu actions={[
                        { label: 'View', icon: Eye, onClick: () => setViewingCM(cm) },
                        { label: 'Edit', icon: Edit3, onClick: () => { setEditingCM(cm); setShowNewCM(true) } },
                        { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: cm.id, name: cm.name }), danger: true },
                      ]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CMDetailModal open={!!viewingCM} cm={viewingCM} onClose={() => setViewingCM(null)} onEdit={() => { if (viewingCM) { setEditingCM(viewingCM); setViewingCM(null); setShowNewCM(true) } }} onDelete={() => { if (viewingCM) setDeletingItem({ id: viewingCM.id, name: viewingCM.name }) }} briefItems={briefItems} />
      <NewCMModal open={showNewCM} onClose={() => { setShowNewCM(false); setEditingCM(null) }} onSubmit={handleSubmit} initialData={editingCM} isSubmitting={isSubmitting} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}

// ─── Tech Transfers Tab (Expanded) ─────────────────────────
function TransfersTab({ items, moduleId, onRefresh, briefItems, cmItems }: {
  items: any[]; moduleId: string | null; onRefresh: () => void; briefItems: any[]; cmItems: any[]
}) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewTransfer, setShowNewTransfer] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<any>(null)
  const [viewingTransfer, setViewingTransfer] = useState<any>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const transfers = useMemo(() => items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data })), [items])

  const handleSubmit = async (data: TransferFormData) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      if (editingTransfer) {
        await api.patch(`/departments/_/modules/${editingTransfer.moduleId}/items/${editingTransfer.id}`, { data, status: data.status || 'Draft' })
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, { data: { ...data, status: 'Draft', progress: 0 }, status: 'Draft' })
      }
      setShowNewTransfer(false); setEditingTransfer(null); onRefresh()
    } catch (err) { console.error('Failed to save transfer:', err) } finally { setIsSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      const item = items.find((i: any) => i.id === deletingItem.id)
      if (item) await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingItem.id}`)
      setDeletingItem(null); setViewingTransfer(null); onRefresh()
    } catch (err) { console.error('Failed to delete transfer:', err) }
  }

  const handleStatusChange = async (transfer: any, newStatus: string) => {
    try {
      const updatedLog = [...(transfer.activityLog || []), { author: 'System', authorInitial: 'S', action: `Status changed: ${transfer.status} → ${newStatus}`, timestamp: new Date().toISOString(), type: 'status_change' }]
      await api.patch(`/departments/_/modules/${transfer.moduleId}/items/${transfer.id}`, { data: { ...transfer, status: newStatus, activityLog: updatedLog }, status: newStatus })
      onRefresh()
    } catch (err) { console.error('Failed to update status:', err) }
  }

  const handleMilestoneComplete = async (transfer: any, index: number) => {
    try {
      const milestones = [...(transfer.milestones || [])]
      milestones[index] = { ...milestones[index], completed: true, completedDate: new Date().toISOString() }
      const completedCount = milestones.filter((m: any) => m.completed).length
      const progress = Math.round((completedCount / milestones.length) * 100)
      const updatedLog = [...(transfer.activityLog || []), { author: 'System', authorInitial: 'S', action: `Milestone completed: ${milestones[index].label}`, timestamp: new Date().toISOString(), type: 'milestone_completed' }]
      await api.patch(`/departments/_/modules/${transfer.moduleId}/items/${transfer.id}`, { data: { ...transfer, milestones, progress, activityLog: updatedLog } })
      onRefresh()
    } catch (err) { console.error('Failed to complete milestone:', err) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-[8px] border border-[var(--border-subtle)] overflow-hidden">
          {(['grid', 'list'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)} className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${viewMode === mode ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button onClick={() => { setEditingTransfer(null); setShowNewTransfer(true) }} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Tech Transfer
        </button>
      </div>

      {transfers.length === 0 ? (
        <div className="text-center py-12">
          <Repeat2 size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No tech transfers yet</p>
          <button onClick={() => { setEditingTransfer(null); setShowNewTransfer(true) }} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Create First Transfer</button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>From → To</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Progress</th>
                <th>Linked Brief</th>
                <th>Docs</th>
                <th>Team</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t: any) => (
                <tr key={t.id} className="clickable-row" onClick={() => setViewingTransfer(t)}>
                  <td className="font-medium text-[14px] text-[var(--text-primary)]">{t.product}</td>
                  <td>{t.brand ? <span className="badge badge-info text-[10px]">{t.brand}</span> : '—'}</td>
                  <td className="text-[14px] text-[var(--text-secondary)]">{t.from || t.fromCM} → {t.to || t.toCM}</td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{t.priority ? <StatusBadge status={t.priority} /> : '—'}</td>
                  <td>
                    <div className="flex items-center gap-2 min-w-[100px]">
                      <div className="h-1.5 flex-1 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${t.progress || 0}%`, background: t.progress === 100 ? 'var(--success)' : 'var(--accent)' }} />
                      </div>
                      <span className="text-[12px] tabular-nums text-[var(--text-secondary)]">{t.progress || 0}%</span>
                    </div>
                  </td>
                  <td>{t.linkedBriefName ? <span className="badge badge-accent text-[10px]">{t.linkedBriefName}</span> : <span className="text-[var(--text-tertiary)] text-[12px]">None</span>}</td>
                  <td className="text-[14px] text-[var(--accent)] tabular-nums">{(t.files?.length || t.docs || 0) + (t.sharepointLinks?.length || 0)}</td>
                  <td>
                    <div className="flex -space-x-1.5">
                      {(t.teamMembers || []).slice(0, 3).map((m: any, i: number) => (
                        <div key={i} className="w-6 h-6 rounded-full bg-[var(--accent-light)] border-2 border-[var(--bg-elevated)] flex items-center justify-center text-[9px] font-semibold text-[var(--accent)]">
                          {m.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      ))}
                      {(t.teamMembers?.length || 0) > 3 && <span className="text-[10px] text-[var(--text-tertiary)] ml-1">+{t.teamMembers.length - 3}</span>}
                    </div>
                  </td>
                  <td>
                    <ActionsMenu actions={[
                      { label: 'View', icon: Eye, onClick: () => setViewingTransfer(t) },
                      { label: 'Edit', icon: Edit3, onClick: () => { setEditingTransfer(t); setShowNewTransfer(true) } },
                      { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: t.id, name: t.product }), danger: true },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {transfers.map((t: any) => (
            <div key={t.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setViewingTransfer(t)}>
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm text-[var(--text-primary)]">{t.product}</h3>
                <StatusBadge status={t.status} />
              </div>
              {t.brand && <span className="badge badge-info text-[10px]">{t.brand}</span>}
              {t.priority && t.priority !== 'Standard' && <span className="ml-1 badge text-[10px]" style={{ background: t.priority === 'Critical' ? 'var(--danger-light)' : 'var(--warning-light)', color: t.priority === 'Critical' ? 'var(--danger)' : 'var(--warning)' }}>{t.priority}</span>}
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <span className="truncate">{t.from || t.fromCM}</span>
                <ArrowRight size={12} className="text-[var(--accent)] flex-shrink-0" />
                <span className="truncate">{t.to || t.toCM}</span>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--text-tertiary)]">Progress</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">{t.progress || 0}%</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${t.progress || 0}%`, background: t.progress === 100 ? 'var(--success)' : 'var(--accent)' }} />
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] pt-1 border-t border-[var(--border-subtle)]">
                <span className="flex items-center gap-1"><Clock size={11} /> {t.target || t.targetCompletionDate || '—'}</span>
                <span>{(t.files?.length || t.docs || 0)} docs</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <TransferDetailModal open={!!viewingTransfer} transfer={viewingTransfer} onClose={() => setViewingTransfer(null)} onEdit={() => { if (viewingTransfer) { setEditingTransfer(viewingTransfer); setViewingTransfer(null); setShowNewTransfer(true) } }} onDelete={() => { if (viewingTransfer) setDeletingItem({ id: viewingTransfer.id, name: viewingTransfer.product }) }} onStatusChange={(s) => { if (viewingTransfer) handleStatusChange(viewingTransfer, s) }} onMilestoneComplete={(i) => { if (viewingTransfer) handleMilestoneComplete(viewingTransfer, i) }} briefItems={briefItems} />
      <NewTransferModal open={showNewTransfer} onClose={() => { setShowNewTransfer(false); setEditingTransfer(null) }} onSubmit={handleSubmit} initialData={editingTransfer} isSubmitting={isSubmitting} briefItems={briefItems} cmItems={cmItems} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}

// ─── Formulations Tab (Expanded) ───────────────────────────
function FormulationsTab({ items, moduleId, onRefresh, briefItems }: {
  items: any[]; moduleId: string | null; onRefresh: () => void; briefItems: any[]
}) {
  const [showNewFormulation, setShowNewFormulation] = useState(false)
  const [editingFormulation, setEditingFormulation] = useState<any>(null)
  const [viewingFormulation, setViewingFormulation] = useState<any>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formulations = useMemo(() => items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data })), [items])

  const handleSubmit = async (data: FormulationFormData) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      if (editingFormulation) {
        await api.patch(`/departments/_/modules/${editingFormulation.moduleId}/items/${editingFormulation.id}`, { data, status: data.status || 'Draft' })
      } else {
        await api.post(`/departments/_/modules/${moduleId}/items`, { data: { ...data, version: 'v1.0', status: 'Draft', stability: 'Pending' }, status: 'Draft' })
      }
      setShowNewFormulation(false); setEditingFormulation(null); onRefresh()
    } catch (err) { console.error('Failed to save formulation:', err) } finally { setIsSubmitting(false) }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    try {
      const item = items.find((i: any) => i.id === deletingItem.id)
      if (item) await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingItem.id}`)
      setDeletingItem(null); setViewingFormulation(null); onRefresh()
    } catch (err) { console.error('Failed to delete formulation:', err) }
  }

  const sdsStatus = (f: any) => {
    if (!f.sdsSheets?.length) return null
    const now = Date.now()
    const ninety = 90 * 86400000
    const hasExpired = f.sdsSheets.some((s: any) => s.expiryDate && new Date(s.expiryDate).getTime() < now)
    const hasExpiring = f.sdsSheets.some((s: any) => {
      if (!s.expiryDate) return false
      const exp = new Date(s.expiryDate).getTime()
      return exp >= now && exp - now < ninety
    })
    if (hasExpired) return 'expired'
    if (hasExpiring) return 'expiring'
    return 'current'
  }

  const openIssueCount = (f: any) => (f.issues || []).filter((i: any) => i.status !== 'Resolved' && i.status !== 'Accepted Risk').length
  const hasCriticalIssue = (f: any) => (f.issues || []).some((i: any) => i.priority === 'Critical' && i.status !== 'Resolved')

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => { setEditingFormulation(null); setShowNewFormulation(true) }} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Formulation
        </button>
      </div>

      {formulations.length === 0 ? (
        <div className="text-center py-12">
          <FlaskConical size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No formulations yet</p>
          <button onClick={() => { setEditingFormulation(null); setShowNewFormulation(true) }} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Create First Formulation</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Version</th>
                <th>Status</th>
                <th>Stability</th>
                <th>FDA Status</th>
                <th>Issues</th>
                <th>SDS</th>
                <th>Last Updated</th>
                <th>Docs</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {formulations.map((f: any) => {
                const issues = openIssueCount(f)
                const critical = hasCriticalIssue(f)
                const sds = sdsStatus(f)
                return (
                  <tr key={f.id} className="clickable-row" onClick={() => setViewingFormulation(f)}>
                    <td className="font-medium text-[var(--text-primary)]">{f.product || f.productName || '—'}</td>
                    <td>{f.brand ? <span className="badge badge-info text-[10px]">{f.brand}</span> : '—'}</td>
                    <td><span className="badge badge-accent font-mono text-xs">{f.ver || f.version || 'v1.0'}</span></td>
                    <td><StatusBadge status={f.status || 'Draft'} /></td>
                    <td><StatusBadge status={f.stability || 'Pending'} /></td>
                    <td><StatusBadge status={f.fdaStatus || 'Not Required'} /></td>
                    <td>
                      {issues > 0 ? (
                        <span className={`badge text-[11px] ${critical ? 'badge-emergency' : 'badge-critical'}`}>
                          {critical && <AlertTriangle size={10} />} {issues}
                        </span>
                      ) : <span className="text-[var(--text-tertiary)] text-[12px]">0</span>}
                    </td>
                    <td>
                      {f.sdsSheets?.length ? (
                        <span className={`text-[12px] font-medium ${sds === 'expired' ? 'text-[var(--danger)]' : sds === 'expiring' ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'}`}>
                          {f.sdsSheets.length} {sds === 'expired' ? '⚠' : sds === 'expiring' ? '⏳' : ''}
                        </span>
                      ) : <span className="text-[var(--text-tertiary)] text-[12px]">0</span>}
                    </td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{relativeTime(f.updatedAt || f.createdAt)}</td>
                    <td className="text-[14px] text-[var(--accent)] tabular-nums">{(f.files?.length || 0) + (f.sharepointLinks?.length || 0)}</td>
                    <td>
                      <ActionsMenu actions={[
                        { label: 'View', icon: Eye, onClick: () => setViewingFormulation(f) },
                        { label: 'Edit', icon: Edit3, onClick: () => { setEditingFormulation(f); setShowNewFormulation(true) } },
                        { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: f.id, name: f.product || f.productName }), danger: true },
                      ]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <FormulationDetailModal open={!!viewingFormulation} formulation={viewingFormulation} onClose={() => setViewingFormulation(null)} onEdit={() => { if (viewingFormulation) { setEditingFormulation(viewingFormulation); setViewingFormulation(null); setShowNewFormulation(true) } }} onDelete={() => { if (viewingFormulation) setDeletingItem({ id: viewingFormulation.id, name: viewingFormulation.product || viewingFormulation.productName }) }} briefItems={briefItems} />
      <NewFormulationModal open={showNewFormulation} onClose={() => { setShowNewFormulation(false); setEditingFormulation(null) }} onSubmit={handleSubmit} initialData={editingFormulation} isSubmitting={isSubmitting} briefItems={briefItems} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}

// ─── Segmented NPD Progress Bar ───────────────────────────
function NPDSegmentedProgress({ tasks }: { tasks: NPDTask[] }) {
  const stages = ['0', '1', '2', '3', '4']
  const gateKeys = ['1/2', '2/3']

  return (
    <div className="flex items-center gap-0.5 min-w-[140px]">
      {stages.map((key, i) => {
        const config = STAGE_CONFIG.find(s => s.key === key)
        const progress = getStageProgress(tasks, key)
        return (
          <div key={key} className="flex items-center gap-0.5 flex-1">
            <div
              className="h-2 flex-1 rounded-sm overflow-hidden"
              style={{ background: 'var(--border-default)' }}
              title={`${config?.name}: ${progress}%`}
            >
              <div
                className="h-full rounded-sm transition-all"
                style={{
                  width: `${progress}%`,
                  background: config?.color || 'var(--accent)',
                }}
              />
            </div>
            {i < stages.length - 1 && gateKeys[i - (i > 1 ? 1 : 0)] && i > 0 && i < 4 && (
              <span className="text-[8px] text-[var(--text-tertiary)]">•</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── NPD Tab ──────────────────────────────────────────────
function NPDTab({
  items,
  moduleId,
  departmentId,
  onRefresh,
}: {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  onRefresh: () => void
}) {
  const [showNewProject, setShowNewProject] = useState(false)
  const [viewingProject, setViewingProject] = useState<any>(null)
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Convert module items to NPD project data
  const projects = useMemo(() => {
    return items.map((item: any) => ({
      id: item.id,
      moduleId: item.moduleId,
      ...item.data,
    }))
  }, [items])

  const handleCreateProject = async (data: NPDFormData) => {
    setIsSubmitting(true)
    try {
      // Auto-create NPD_PIPELINE module if it doesn't exist yet
      let targetModuleId = moduleId
      if (!targetModuleId && departmentId) {
        const res = await api.post(`/departments/${departmentId}/modules`, {
          name: 'NPD Pipeline',
          type: 'NPD_PIPELINE',
          sortOrder: 4,
        })
        targetModuleId = res.data.id
      }
      if (!targetModuleId) return
      // Generate the 34 tasks from the master checklist
      const tasks = createDefaultTasks(
        data.teamAssignments.map(t => ({ role: t.role, assignedName: t.assignedName })),
        {
          stage0Target: data.stageDates.stage0Target,
          stage1Target: data.stageDates.stage1Target,
          gate12Target: data.stageDates.gate12Target,
          stage2Target: data.stageDates.stage2Target,
          gate23Target: data.stageDates.gate23Target,
          stage3Target: data.stageDates.stage3Target,
          stage4Target: data.stageDates.stage4Target,
        }
      )

      // Add IDs to tasks
      const tasksWithIds = tasks.map((t, i) => ({
        ...t,
        id: `task-${Date.now()}-${i}`,
      }))

      const projectData = {
        ...data,
        tasks: tasksWithIds,
        gateApprovals: [],
        status: 'Active',
        activityLog: [{
          user: 'System',
          action: 'Project created with 34 tasks generated',
          timestamp: new Date().toISOString(),
        }],
      }

      await api.post(`/departments/_/modules/${targetModuleId}/items`, {
        data: projectData,
        status: 'Active',
      })

      setShowNewProject(false)
      onRefresh()
    } catch (err) {
      console.error('Failed to create NPD project:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTaskUpdate = async (taskId: string, updates: Partial<NPDTask>) => {
    if (!viewingProject) return
    const item = items.find((i: any) => i.id === viewingProject.id)
    if (!item) return

    const updatedTasks = (viewingProject.tasks || []).map((t: any) =>
      t.id === taskId ? { ...t, ...updates } : t
    )

    const newLog = {
      user: 'You',
      action: updates.status === 'complete'
        ? `Completed task: ${updatedTasks.find((t: any) => t.id === taskId)?.taskName}`
        : `Updated task: ${updatedTasks.find((t: any) => t.id === taskId)?.taskName}`,
      timestamp: new Date().toISOString(),
      stage: updatedTasks.find((t: any) => t.id === taskId)?.stageKey,
    }

    const updatedProject = {
      ...viewingProject,
      tasks: updatedTasks,
      activityLog: [...(viewingProject.activityLog || []), newLog],
    }

    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingProject.id}`, {
        data: updatedProject,
      })
      setViewingProject(updatedProject)
      onRefresh()
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  const handleGateApprove = async (gate: string, notes: string) => {
    if (!viewingProject) return
    const item = items.find((i: any) => i.id === viewingProject.id)
    if (!item) return

    const approval = {
      gate,
      approvedBy: 'You',
      approvedAt: new Date().toISOString(),
      notes,
    }

    const newLog = {
      user: 'You',
      action: `Approved ${gate === '1/2' ? 'Gate 1/2 (Pipe/Launch)' : 'Gate 2/3 (Artwork)'}`,
      timestamp: new Date().toISOString(),
      stage: gate,
    }

    const updatedProject = {
      ...viewingProject,
      gateApprovals: [...(viewingProject.gateApprovals || []), approval],
      activityLog: [...(viewingProject.activityLog || []), newLog],
    }

    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingProject.id}`, {
        data: updatedProject,
      })
      setViewingProject(updatedProject)
      onRefresh()
    } catch (err) {
      console.error('Failed to approve gate:', err)
    }
  }

  const handleProjectUpdate = async (updates: any) => {
    if (!viewingProject) return
    const item = items.find((i: any) => i.id === viewingProject.id)
    if (!item) return

    const updatedProject = { ...viewingProject, ...updates }
    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingProject.id}`, {
        data: updatedProject,
      })
      setViewingProject(updatedProject)
      onRefresh()
    } catch (err) {
      console.error('Failed to update project:', err)
    }
  }

  const handleDelete = async () => {
    if (!deletingProject) return
    try {
      const item = items.find((i: any) => i.id === deletingProject.id)
      if (item) {
        await api.delete(`/departments/_/modules/${item.moduleId}/items/${deletingProject.id}`)
      }
      setDeletingProject(null)
      setViewingProject(null)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete NPD project:', err)
    }
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const getStageBadgeColor = (stageKey: string) => {
    const config = STAGE_CONFIG.find(s => s.key === stageKey)
    return config?.color || 'var(--accent)'
  }

  return (
    <div>
      {/* Header with New Project button */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowNewProject(true)}
          className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]"
        >
          <Plus size={15} /> New NPD Project
        </button>
      </div>

      {/* Table */}
      {projects.length === 0 ? (
        <div className="text-center py-12">
          <Rocket size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No NPD projects yet</p>
          <button
            onClick={() => setShowNewProject(true)}
            className="btn-primary px-5 py-2.5 rounded-lg text-[14px]"
          >
            Create Your First NPD Project
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Current Stage</th>
                <th>Gate Status</th>
                <th>Tasks</th>
                <th>Progress</th>
                <th>Launch Manager</th>
                <th>Target Launch</th>
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...projects]
                .sort((a, b) => new Date(a.targetLaunchDate || 0).getTime() - new Date(b.targetLaunchDate || 0).getTime())
                .map((proj: any) => {
                  const tasks: NPDTask[] = proj.tasks || []
                  const { completed, total, percent } = getOverallProgress(tasks)
                  const currentStage = getCurrentStage(tasks, proj.gateApprovals || [])
                  const currentConfig = STAGE_CONFIG.find(s => s.key === currentStage)
                  const launchManager = (proj.teamAssignments || []).find((t: any) => t.role === 'Launch Manager')
                  const gateApprovals = proj.gateApprovals || []
                  const hasBlockedTasks = tasks.some(t => t.status === 'blocked')

                  // Determine gate status
                  let gateStatus = ''
                  if (currentStage === '1/2' || currentStage === '2/3') {
                    const gateTask = tasks.find(t => t.stageKey === currentStage)
                    if (gateTask?.status === 'complete') {
                      gateStatus = 'Gate Pending'
                    } else {
                      gateStatus = 'In Progress'
                    }
                  } else if (gateApprovals.length > 0) {
                    gateStatus = 'Gate Approved'
                  }

                  return (
                    <tr
                      key={proj.id}
                      className="clickable-row"
                      onClick={() => setViewingProject(proj)}
                    >
                      <td className="font-medium text-[var(--text-primary)]">
                        <div className="flex items-center gap-2">
                          {proj.projectName || '—'}
                          {hasBlockedTasks && (
                            <span className="badge" style={{ background: '#EF444418', color: '#EF4444', fontSize: '10px' }}>
                              Blocked
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-accent text-[11px]">{proj.brand || '—'}</span>
                      </td>
                      <td className="text-[var(--text-secondary)] text-[13px]">{proj.category || '—'}</td>
                      <td>
                        {currentConfig && (
                          <span
                            className="badge text-[11px]"
                            style={{
                              background: `${currentConfig.color}18`,
                              color: currentConfig.color,
                            }}
                          >
                            Stage {currentConfig.key} — {currentConfig.name}
                          </span>
                        )}
                      </td>
                      <td>
                        {gateStatus && (
                          <span
                            className="badge text-[11px]"
                            style={{
                              background: gateStatus === 'Gate Approved' ? '#10B98118' : gateStatus === 'Gate Pending' ? '#F9731618' : '#F59E0B18',
                              color: gateStatus === 'Gate Approved' ? '#10B981' : gateStatus === 'Gate Pending' ? '#F97316' : '#F59E0B',
                            }}
                          >
                            {gateStatus}
                          </span>
                        )}
                      </td>
                      <td className="text-[13px] tabular-nums text-[var(--text-secondary)]">
                        {completed} / {total}
                      </td>
                      <td className="min-w-[160px]">
                        <NPDSegmentedProgress tasks={tasks} />
                      </td>
                      <td className="text-[13px] text-[var(--text-secondary)]">
                        {launchManager?.assignedName || '—'}
                      </td>
                      <td className="text-[13px] text-[var(--text-secondary)]">
                        {formatDate(proj.targetLaunchDate)}
                      </td>
                      <td>
                        <ActionsMenu
                          onView={() => setViewingProject(proj)}
                          onEdit={() => setViewingProject(proj)}
                          onDownload={() => {}}
                          onDelete={() => setDeletingProject({ id: proj.id, name: proj.projectName })}
                        />
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* New NPD Project Modal */}
      <NewNPDProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onSubmit={handleCreateProject}
        isSubmitting={isSubmitting}
      />

      {/* NPD Project Detail */}
      <NPDProjectDetail
        open={!!viewingProject}
        project={viewingProject}
        onClose={() => setViewingProject(null)}
        onTaskUpdate={handleTaskUpdate}
        onGateApprove={handleGateApprove}
        onProjectUpdate={handleProjectUpdate}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingProject}
        briefName={deletingProject?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function RDPage() {
  const [activeTab, setActiveTab] = useState<RDTab>('briefs')

  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const rdDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_RD') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading, refetch: refetchDept } = useDepartment(rdDept?.id || '')

  const isLoading = deptsLoading || detailLoading

  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return { briefs: [], cm: [], transfers: [], formulations: [], npd: [], briefsModuleId: null, npdModuleId: null }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []
    const briefsModule = modules.find((m: any) => m.type === 'BRIEFS')
    const npdModule = modules.find((m: any) => m.type === 'NPD_PIPELINE')

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
      npd: find('NPD_PIPELINE'),
      briefsModuleId: briefsModule?.id || null,
      npdModuleId: npdModule?.id || null,
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
    npd: moduleData.npd,
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: rdDept?.color ? `${rdDept.color}20` : 'var(--accent-subtle)' }}>
          {rdDept?.icon || <Beaker size={20} />}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            R&D Department
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Formulations, briefs, tech transfers, CM coordination, NPD pipeline
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-0.5 p-1 bg-[var(--bg-surface)] rounded-lg border border-[var(--border-default)] w-fit">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all" style={{ background: isActive ? 'var(--bg-elevated)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: isActive ? 'var(--shadow-xs)' : 'none', fontWeight: isActive ? 550 : 500 }}>
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
            activeTab === 'cm' ? <CardsSkeleton /> : <TableSkeleton />
          ) : activeTab === 'briefs' ? (
            <BriefsTab items={moduleData.briefs} moduleId={moduleData.briefsModuleId} onRefresh={() => refetchDept()} transferItems={moduleData.transfers} formulationItems={moduleData.formulations} />
          ) : activeTab === 'cm' ? (
            <CMTab items={moduleData.cm} moduleId={moduleData.cmModuleId} onRefresh={() => refetchDept()} briefItems={moduleData.briefs} />
          ) : activeTab === 'transfers' ? (
            <TransfersTab items={tabContent.transfers} onSelect={(item) => setSelectedItem({ item, type: 'TECH_TRANSFERS' })} />
          ) : activeTab === 'npd' ? (
            <NPDTab
              items={tabContent.npd}
              moduleId={moduleData.npdModuleId}
              departmentId={rdDept?.id || null}
              onRefresh={() => refetchDept()}
            />
          ) : (
            <FormulationsTab items={moduleData.formulations} moduleId={moduleData.formulationsModuleId} onRefresh={() => refetchDept()} briefItems={moduleData.briefs} />
          )}
        </div>
      </div>
    </div>
  )
}
