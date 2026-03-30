import { useState, useMemo, useRef, useEffect } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Beaker,
  Boxes,
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
  Palette,
  Plus,
  Repeat2,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  X,
  AlertTriangle,
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
import { NewComponentModal } from '@/components/rd/components/NewComponentModal'
import { ComponentDetail } from '@/components/rd/components/ComponentDetail'
import { COMPONENT_TYPE_COLORS, FEASIBILITY_STATUS_COLORS, getWorstCompatibility, getBestUnitCost, generatePartNumber, type Component as ComponentType } from '@/components/rd/components/componentData'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations' | 'components'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
  { key: 'components', label: 'Components', icon: Boxes },
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

// ─── Import Brief Modal ───────────────────────────────────
function ImportBriefModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: (data: BriefFormData) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  if (!open) return null

  const handleFileSelect = (selectedFile: File) => {
    const validTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ]
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|doc|docx|txt)$/i)) {
      setError('Please upload a PDF, Word (.doc/.docx), or text file')
      return
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('File must be under 10MB')
      return
    }
    setFile(selectedFile)
    setError('')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0])
  }

  const handleParse = async () => {
    if (!file) return
    setParsing(true)
    setError('')

    try {
      // Read file as text (for PDFs, we send the raw content — Claude can handle it)
      const text = await file.text()

      const { data } = await api.post('/ai/parse-brief-document', {
        content: text,
        filename: file.name,
        mimeType: file.type,
      })

      if (data.error) {
        setError(data.error)
        setParsing(false)
        return
      }

      // Map parsed data to BriefFormData, filling in defaults for missing fields
      const briefData: BriefFormData = {
        ...EMPTY_FORM,
        ...data.briefData,
        briefStatus: 'Brief Submitted',
        phase: 1,
        // Ensure arrays are arrays
        markets: Array.isArray(data.briefData.markets) ? data.briefData.markets : [],
        projectContacts: Array.isArray(data.briefData.projectContacts) && data.briefData.projectContacts.length > 0
          ? data.briefData.projectContacts
          : [{ name: '', role: '', email: '' }],
        teamMembers: Array.isArray(data.briefData.teamMembers) && data.briefData.teamMembers.length > 0
          ? data.briefData.teamMembers
          : [{ name: '', role: '' }],
        supportingDocs: [],
      }

      onImported(briefData)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to parse document')
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">Import Brief from Document</h2>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
              Upload a PDF or Word document — AI will extract the brief fields
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              dragOver
                ? 'border-[var(--accent)] bg-[var(--accent-subtle)]'
                : file
                  ? 'border-[var(--success)] bg-[var(--success-light)]'
                  : 'border-[var(--border-default)] hover:border-[var(--accent)]'
            }`}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText size={24} className="text-[var(--success)]" />
                <div className="text-left">
                  <p className="text-[14px] font-medium text-[var(--text-primary)]">{file.name}</p>
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    {(file.size / 1024).toFixed(0)} KB — Ready to parse
                  </p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  className="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--danger)]"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <Upload size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
                <p className="text-[14px] text-[var(--text-primary)] font-medium">
                  Drop your brief document here
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                  PDF, Word (.doc/.docx), or text files up to 10MB
                </p>
                <label className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--accent)] bg-[var(--accent-subtle)] cursor-pointer hover:bg-[var(--accent-light)] transition-colors">
                  <Upload size={14} /> Browse Files
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                </label>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
              <AlertTriangle size={14} className="text-[var(--danger)] flex-shrink-0" />
              <p className="text-[13px] text-[var(--danger)]">{error}</p>
            </div>
          )}

          {/* Info */}
          <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
              The AI will extract product name, brand, CM, dates, ingredients, packaging details, claims, and other brief fields from your document.
              You can review and edit all fields before submitting.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-[var(--border-subtle)]">
          <button onClick={onClose} className="btn-ghost px-4 py-2 text-[14px]">Cancel</button>
          <button
            onClick={handleParse}
            disabled={!file || parsing}
            className="btn-primary flex items-center gap-2 px-5 py-2 text-[14px] disabled:opacity-40"
          >
            {parsing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Parsing with AI...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Parse & Import
              </>
            )}
          </button>
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
  const [showImportModal, setShowImportModal] = useState(false)
  const [importedData, setImportedData] = useState<BriefFormData | null>(null)

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 btn-ghost px-4 py-2.5 rounded-full text-[13px]"
          >
            <Upload size={15} /> Import Brief
          </button>
          <button
            onClick={() => { setEditingBrief(null); setShowNewBrief(true) }}
            className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]"
          >
            <Plus size={15} /> New Brief
          </button>
        </div>
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

      {/* New / Edit Brief Modal */}
      <NewBriefModal
        open={showNewBrief}
        onClose={() => { setShowNewBrief(false); setEditingBrief(null); setImportedData(null) }}
        onSubmit={handleSubmit}
        initialData={editingBrief || importedData}
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

      {/* Import Brief Modal */}
      <ImportBriefModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={(data) => {
          setShowImportModal(false)
          setEditingBrief(null)
          // Pre-fill the new brief form with imported data and open it
          setImportedData(data)
          setShowNewBrief(true)
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
                <th>Brand</th>
                <th>From → To</th>
                <th>Linked Brief</th>
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

// ─── Components Tab ───────────────────────────────────────
function ComponentsTab({
  items,
  moduleId,
  onRefresh,
}: {
  items: any[]
  moduleId: string | null
  onRefresh: () => void
}) {
  const [showNewComponent, setShowNewComponent] = useState(false)
  const [viewingComponent, setViewingComponent] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const components = useMemo(() => {
    return items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data }))
  }, [items])

  const handleCreate = async (data: any) => {
    if (!moduleId) return
    setIsSubmitting(true)
    try {
      const componentData = {
        ...data,
        partNumber: data.partNumber || generatePartNumber(),
        activityLog: [{ user: 'System', action: 'Component created', timestamp: new Date().toISOString() }],
        createdBy: 'You',
        createdAt: new Date().toISOString(),
      }
      await api.post(`/departments/_/modules/${moduleId}/items`, { data: componentData, status: data.status || 'Concept' })
      setShowNewComponent(false)
      onRefresh()
    } catch (err) {
      console.error('Failed to create component:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleComponentUpdate = async (updates: any) => {
    if (!viewingComponent) return
    const item = items.find((i: any) => i.id === viewingComponent.id)
    if (!item) return
    const updated = { ...viewingComponent, ...updates }
    try {
      await api.patch(`/departments/_/modules/${item.moduleId}/items/${viewingComponent.id}`, { data: updated })
      setViewingComponent(updated)
      onRefresh()
    } catch (err) {
      console.error('Failed to update component:', err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={() => setShowNewComponent(true)} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Component
        </button>
      </div>

      {components.length === 0 ? (
        <div className="text-center py-12">
          <Boxes size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No components yet</p>
          <button onClick={() => setShowNewComponent(true)} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First Component</button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Part #</th>
                <th>Type</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Unit Cost</th>
                <th>Target</th>
                <th>Compatibility</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {components.map((comp: any) => {
                const typeColor = COMPONENT_TYPE_COLORS[comp.type] || '#6B7280'
                const statusColor = FEASIBILITY_STATUS_COLORS[comp.status] || '#6B7280'
                const primaryVendor = (comp.vendors || []).find((v: any) => v.vendorStatus === 'Primary') || (comp.vendors || [])[0]
                const bestCost = getBestUnitCost(comp.moqTiers || [])
                const compatibility = getWorstCompatibility(comp.compatibilityTests || [])
                const assignmentCount = (comp.productAssignments || []).filter((a: any) => a.assignmentStatus === 'Active').length
                const costVsTarget = comp.targetCostPerUnit && bestCost ? (bestCost <= comp.targetCostPerUnit ? 'under' : 'over') : null

                return (
                  <tr key={comp.id} className="clickable-row" onClick={() => setViewingComponent(comp)}>
                    <td className="font-medium text-[var(--text-primary)]">{comp.name || '—'}</td>
                    <td><span className="text-[12px] font-mono text-[var(--accent-secondary)]">{comp.partNumber || '—'}</span></td>
                    <td><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${typeColor}18`, color: typeColor }}>{comp.type || '—'}</span></td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{primaryVendor?.vendorName || '—'}</td>
                    <td><span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{comp.status || 'Concept'}</span></td>
                    <td className={`text-[13px] tabular-nums font-medium ${costVsTarget === 'under' ? 'text-[var(--success)]' : costVsTarget === 'over' ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>
                      {bestCost ? `$${bestCost.toFixed(2)}` : '—'}
                    </td>
                    <td className="text-[13px] tabular-nums text-[var(--text-secondary)]">
                      {comp.targetCostPerUnit ? `$${Number(comp.targetCostPerUnit).toFixed(2)}` : '—'}
                    </td>
                    <td>
                      {compatibility !== 'not_tested' ? (
                        <span className="text-[11px] font-medium" style={{ color: compatibility === 'pass' ? '#10B981' : compatibility === 'fail' ? '#EF4444' : '#F59E0B' }}>
                          {compatibility === 'pass' ? '✓' : compatibility === 'fail' ? '✗' : '⚠'} {compatibility === 'pass' ? 'Compatible' : compatibility === 'fail' ? 'Incompatible' : 'Conditional'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-tertiary)]">○ Not Tested</span>
                      )}
                    </td>
                    <td className="text-[13px] text-[var(--text-secondary)]">{assignmentCount > 0 ? `${assignmentCount} products` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <NewComponentModal open={showNewComponent} onClose={() => setShowNewComponent(false)} onSubmit={handleCreate} isSubmitting={isSubmitting} />
      <ComponentDetail open={!!viewingComponent} component={viewingComponent} onClose={() => setViewingComponent(null)} onComponentUpdate={handleComponentUpdate} />
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
      return { briefs: [], cm: [], transfers: [], formulations: [], components: [], briefsModuleId: null, componentsModuleId: null }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []
    const briefsModule = modules.find((m: any) => m.type === 'BRIEFS')
    const componentsModule = modules.find((m: any) => m.type === 'COMPONENT_LIBRARY')

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
      components: find('COMPONENT_LIBRARY'),
      briefsModuleId: briefsModule?.id || null,
      componentsModuleId: componentsModule?.id || null,
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
    components: moduleData.components,
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
          ) : activeTab === 'components' ? (
            <ComponentsTab
              items={tabContent.components}
              moduleId={moduleData.componentsModuleId}
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
