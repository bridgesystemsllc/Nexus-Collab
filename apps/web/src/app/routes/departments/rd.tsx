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
  MoreHorizontal,
  Package,
  Plus,
  Repeat2,
  Rocket,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { type BriefFormData, EMPTY_FORM } from '@/components/briefs/NewBriefModal'
import { BRIEF_STATUS_COLORS, DEFAULT_BRIEF_STATUS } from '@/lib/briefStatus'
import { useAppStore } from '@/stores/appStore'
import { BriefDetailView } from '@/components/briefs/BriefDetailView'
import { generateBriefPDF } from '@/utils/generateBriefPDF'
import { CMDetailModal } from '@/components/rd/CMDetailModal'
import { NewCMModal, type CMFormData } from '@/components/rd/NewCMModal'
import { TransferDetailModal } from '@/components/rd/TransferDetailModal'
import { TechTransferDetailDrawer } from '@/components/rd/TechTransferDetailDrawer'
import { NewTransferModal, type TransferFormData } from '@/components/rd/NewTransferModal'
import { FormulationDetailModal } from '@/components/rd/FormulationDetailModal'
import { FormulationDetailDrawer } from '@/components/rd/FormulationDetailDrawer'
import { FormulationsGate } from '@/components/rd/FormulationsGate'
import { NewFormulationModal, type FormulationFormData } from '@/components/rd/NewFormulationModal'
import { api } from '@/lib/api'
import { NewComponentModal } from '@/components/rd/components/NewComponentModal'
import { ComponentDetail } from '@/components/rd/components/ComponentDetail'
import { COMPONENT_TYPE_COLORS, FEASIBILITY_STATUS_COLORS, getWorstCompatibility, getBestUnitCost, generatePartNumber, type Component as RDComponent } from '@/components/rd/components/componentData'
import { NewNPDProjectModal, type NPDFormData } from '@/components/rd/npd/NewNPDProjectModal'
import { NPDProjectDetail } from '@/components/rd/npd/NPDProjectDetail'
import { STAGE_CONFIG, createDefaultTasks, getStageProgress, getOverallProgress, getCurrentStage, isStageUnlocked, type NPDTask } from '@/components/rd/npd/npdChecklist'
import { AddToCowork } from '@/components/shared/AddToCowork'
import { ViewToggle, type ViewMode } from '@/components/shared/ViewToggle'

// ─── Types ─────────────────────────────────────────────────
type RDTab = 'briefs' | 'cm' | 'transfers' | 'formulations' | 'npd' | 'components'

const TABS: { key: RDTab; label: string; icon: React.ElementType }[] = [
  { key: 'briefs', label: 'Active Briefs', icon: FileText },
  { key: 'cm', label: 'CM Productivity', icon: Users },
  { key: 'transfers', label: 'Tech Transfers', icon: Repeat2 },
  { key: 'formulations', label: 'Formulations', icon: FlaskConical },
  { key: 'npd', label: 'NPD Pipeline', icon: Rocket },
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

// On-time score from actual production deliveries vs requested PO dates.
// Matches production orders to a CM by name; returns null when no comparable data.
function computeCMOnTime(cmName: string, productionOrders: any[]): number | null {
  if (!cmName || !productionOrders?.length) return null
  const orders = productionOrders
    .map((o: any) => o?.data || o)
    .filter((o: any) => (o?.cm || '').trim().toLowerCase() === cmName.trim().toLowerCase())
    .filter((o: any) => o?.requestedDel && o?.shipDate)
  if (orders.length === 0) return null
  const onTimeCount = orders.filter(
    (o: any) => new Date(o.shipDate).getTime() <= new Date(o.requestedDel).getTime(),
  ).length
  return Math.round((onTimeCount / orders.length) * 100)
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
  // Brief statuses use the shared color source of truth
  const briefColors = BRIEF_STATUS_COLORS[status]
  if (briefColors) {
    return (
      <span className="badge" style={{ background: briefColors.bg, color: briefColors.text }}>
        {status}
      </span>
    )
  }
  const map: Record<string, string> = {
    'Approved': 'badge-healthy',
    'In Review': 'badge-info',
    'Draft': 'badge-accent',
    'Complete': 'badge-healthy',
    'In Progress': 'badge-info',
    'Planning': 'badge-critical',
    'Pass': 'badge-healthy',
    'Testing': 'badge-critical',
    'Pending': 'badge-accent',
    'Active': 'badge-healthy',
    'Component Sourcing': 'badge-info',
    'Formula Pending': 'badge-critical',
    'MOQ Pending': 'badge-critical',
    'Quoted': 'badge-info',
  }
  return <span className={`badge ${map[status] || 'badge-accent'}`}>{status}</span>
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
        briefStatus: DEFAULT_BRIEF_STATUS,
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
function BriefsTab({ items, moduleId, departmentId, onRefresh, transferItems, formulationItems, openBriefId, onOpenBriefHandled, onOpenCm }: {
  items: any[]; moduleId: string | null; departmentId: string | null; onRefresh: () => void; transferItems: any[]; formulationItems: any[]
  /** When set, open this brief's detail view (used for cross-tab navigation, e.g. from a tech transfer's linked brief). */
  openBriefId?: string | null
  /** Called once openBriefId has been consumed so the parent can clear it. */
  onOpenBriefHandled?: () => void
  /** Navigates to the CM Productivity tab and opens this CM's profile (cross-tab navigation). */
  onOpenCm?: (cmId: string) => void
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewingBrief, setViewingBrief] = useState<(BriefFormData & { id: string }) | null>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [view, setView] = useState<ViewMode>('table')

  const briefs = useMemo(() => items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data })), [items])

  // Cross-tab navigation: open a specific brief's detail when requested
  // (e.g. clicking a tech transfer's linked brief). No-ops safely if the
  // brief no longer exists.
  useEffect(() => {
    if (!openBriefId) return
    const target = briefs.find((b: any) => b.id === openBriefId)
    if (target) setViewingBrief(target)
    onOpenBriefHandled?.()
  }, [openBriefId, briefs, onOpenBriefHandled])

  // Cross-module linking indicators
  const briefHasTransfer = (briefId: string, briefName: string) =>
    transferItems.some((t: any) => t.data?.linkedBriefId === briefId || t.data?.linkedBriefName === briefName)
  const briefHasFormulation = (briefId: string, briefName: string) =>
    formulationItems.some((f: any) => f.data?.linkedBriefId === briefId || f.data?.linkedBriefName === briefName)

  // Open the shared full-page brief form (create / edit / import)
  const openBriefForm = (
    mode: 'create' | 'edit',
    opts?: { brief?: any; initialData?: BriefFormData | null },
  ) => {
    const brief = opts?.brief
    openForm({
      formType: 'brief',
      mode,
      recordId: brief?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? brief?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: opts?.initialData ?? brief ?? null,
      },
    })
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
        <ViewToggle value={view} onChange={setView} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 btn-ghost px-4 py-2.5 rounded-full text-[13px]"
          >
            <Upload size={15} /> Import Brief
          </button>
          <button
            onClick={() => openBriefForm('create')}
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
          <button onClick={() => openBriefForm('create')} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Create Your First Brief</button>
        </div>
      ) : view === 'table' ? (
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
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <AddToCowork item={{ name: brief.projectName || brief.name || 'Untitled Brief', type: 'Brief', id: brief.id, description: brief.brand ? `Brief — ${brief.brand}` : 'Brief' }} variant="icon" />
                      <ActionsMenu actions={[
                        { label: 'View', icon: Eye, onClick: () => setViewingBrief(brief) },
                        { label: 'Edit', icon: Edit3, onClick: () => openBriefForm('edit', { brief }) },
                        { label: 'Download PDF', icon: Download, onClick: () => generateBriefPDF(brief) },
                        { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: brief.id, name: brief.projectName || brief.name }), danger: true },
                      ]} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {briefs.map((brief: any) => (
            <div
              key={brief.id}
              className="clickable-row flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
              onClick={() => setViewingBrief(brief)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">{brief.projectName || brief.name || '—'}</span>
                  <StatusBadge status={brief.briefStatus || brief.status || 'Draft'} />
                  {briefHasTransfer(brief.id, brief.projectName) && <span className="badge badge-info text-[10px]">Transfer</span>}
                  {briefHasFormulation(brief.id, brief.projectName) && <span className="badge badge-accent text-[10px]">Formula</span>}
                </div>
                <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                  {brief.brand || '—'} · {brief.contractManufacturer || brief.cm || '—'} · {formatDate(brief.dateOfRequest)}
                </p>
              </div>
              <div className="w-[160px] hidden sm:block"><PhaseBar phase={brief.phase || 1} total={5} /></div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <AddToCowork item={{ name: brief.projectName || brief.name || 'Untitled Brief', type: 'Brief', id: brief.id, description: brief.brand ? `Brief — ${brief.brand}` : 'Brief' }} variant="icon" />
                <ActionsMenu actions={[
                  { label: 'View', icon: Eye, onClick: () => setViewingBrief(brief) },
                  { label: 'Edit', icon: Edit3, onClick: () => openBriefForm('edit', { brief }) },
                  { label: 'Download PDF', icon: Download, onClick: () => generateBriefPDF(brief) },
                  { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: brief.id, name: brief.projectName || brief.name }), danger: true },
                ]} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Brief Detail View */}
      <BriefDetailView
        open={!!viewingBrief}
        brief={viewingBrief}
        onClose={() => setViewingBrief(null)}
        onStatusChange={(briefStatus, statusUpdatedAt) => {
          setViewingBrief((prev) =>
            prev ? { ...prev, briefStatus, ...(statusUpdatedAt ? { statusUpdatedAt } : {}) } : prev,
          )
          onRefresh()
        }}
        onEdit={() => {
          if (viewingBrief) { const b = viewingBrief; setViewingBrief(null); openBriefForm('edit', { brief: b }) }
        }}
        onOpenCm={(cmId) => { setViewingBrief(null); onOpenCm?.(cmId) }}
        onDelete={() => {
          if (viewingBrief) {
            setDeletingItem({ id: viewingBrief.id, name: viewingBrief.projectName })
          }
        }}
      />

      {/* Import Brief Modal */}
      <ImportBriefModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImported={(data) => {
          setShowImportModal(false)
          // Pre-fill the new full-page brief form with imported data
          openBriefForm('create', { initialData: data })
        }}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deletingItem}
        itemName={deletingItem?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  )
}

// ─── CM Productivity Tab (Expanded) ────────────────────────
function CMTab({ items, moduleId, departmentId, onRefresh, briefItems, productionItems = [], openCmId, onOpenCmHandled }: {
  items: any[]; moduleId: string | null; departmentId: string | null; onRefresh: () => void; briefItems: any[]; productionItems?: any[]
  /** When set, open this CM's profile (used for cross-tab navigation, e.g. from a brief's linked CM). */
  openCmId?: string | null
  /** Called once openCmId has been consumed so the parent can clear it. */
  onOpenCmHandled?: () => void
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [viewingCM, setViewingCM] = useState<any>(null)
  const [deletingItem, setDeletingItem] = useState<{ id: string; name: string } | null>(null)

  const cmList = useMemo(() =>
    items.map((item: any) => {
      const base = { id: item.id, moduleId: item.moduleId, ...item.data }
      const computedOnTime = computeCMOnTime(base.name, productionItems)
      return computedOnTime != null ? { ...base, onTime: computedOnTime } : base
    })
      .sort((a: any, b: any) => productivityScore(b) - productivityScore(a)),
    [items, productionItems]
  )

  // Cross-tab navigation: open a specific CM's profile when requested
  // (e.g. clicking a brief's linked CM). No-ops safely if the CM no
  // longer exists.
  useEffect(() => {
    if (!openCmId) return
    const target = cmList.find((cm: any) => cm.id === openCmId)
    if (target) setViewingCM(target)
    onOpenCmHandled?.()
  }, [openCmId, cmList, onOpenCmHandled])

  const openCMForm = (mode: 'create' | 'edit', cm?: any) => {
    openForm({
      formType: 'cm',
      mode,
      recordId: cm?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? cm?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: cm ?? null,
      },
    })
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

  const handleCMUpdate = async (updatedData: any) => {
    if (!viewingCM) return
    try {
      await api.patch(`/departments/_/modules/${viewingCM.moduleId}/items/${viewingCM.id}`, { data: updatedData })
      setViewingCM({ ...viewingCM, ...updatedData })
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
        <button onClick={() => openCMForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> Add CM
        </button>
      </div>

      {cmList.length === 0 ? (
        <div className="text-center py-12">
          <Users size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No contract manufacturers yet</p>
          <button onClick={() => openCMForm('create')} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First CM</button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cmList.map((cm: any) => {
            const score = productivityScore(cm)
            return (
              <div key={cm.id} className="data-cell space-y-3 cursor-pointer hover:border-[var(--accent)] transition-colors" onClick={() => setViewingCM(cm)}>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-[14px] text-[var(--text-primary)]">{cm.name}</h3>
                  <div className="flex items-center gap-1">
                    <StatusBadge status={cm.contractStatus || 'Active'} />
                    <div onClick={(e) => e.stopPropagation()}>
                      <AddToCowork item={{ name: cm.name, type: 'CM', id: cm.id, description: `Contract Manufacturer — ${cm.contractStatus || 'Active'}` }} variant="icon" />
                    </div>
                  </div>
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
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: cm.name, type: 'CM', id: cm.id, description: `Contract Manufacturer — ${cm.contractStatus || 'Active'}` }} variant="icon" />
                        <ActionsMenu actions={[
                          { label: 'View', icon: Eye, onClick: () => setViewingCM(cm) },
                          { label: 'Edit', icon: Edit3, onClick: () => openCMForm('edit', cm) },
                          { label: 'Delete', icon: Trash2, onClick: () => setDeletingItem({ id: cm.id, name: cm.name }), danger: true },
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CMDetailModal open={!!viewingCM} cm={viewingCM} onClose={() => setViewingCM(null)} onEdit={() => { if (viewingCM) { const c = viewingCM; setViewingCM(null); openCMForm('edit', c) } }} onDelete={() => { if (viewingCM) setDeletingItem({ id: viewingCM.id, name: viewingCM.name }) }} onUpdate={handleCMUpdate} briefItems={briefItems} />
      <DeleteConfirmDialog open={!!deletingItem} itemName={deletingItem?.name || ''} onConfirm={handleDelete} onCancel={() => setDeletingItem(null)} />
    </div>
  )
}

// ─── Tech Transfers Tab (with create, link briefs, list/grid) ──
function TransfersTab({
  items,
  moduleId,
  departmentId,
  briefs,
  cmItems = [],
  onRefresh,
  onSelect,
}: {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  briefs: any[]
  cmItems?: any[]
  onRefresh: () => void
  onSelect: (item: any) => void
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Build a brief lookup map for display
  const briefMap = useMemo(() => {
    const map: Record<string, any> = {}
    briefs.forEach((item: any) => {
      map[item.id] = item.data || item
    })
    return map
  }, [briefs])

  const openTransferForm = (mode: 'create' | 'edit', item?: any) => {
    openForm({
      formType: 'transfer',
      mode,
      recordId: item?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? item?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: item ? item.data : null,
        briefItems: briefs,
        cmItems,
      },
    })
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
            onClick={() => openTransferForm('create')}
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
            onClick={() => openTransferForm('create')}
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
                <th>From / To</th>
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
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: d.product || 'Untitled Transfer', type: 'Transfer', id: item.id, description: `${d.from || '—'} → ${d.to || '—'}` }} variant="icon" />
                        <button
                          onClick={(e) => { e.stopPropagation(); openTransferForm('edit', item) }}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                        >
                          <Edit3 size={14} />
                        </button>
                      </div>
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
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <AddToCowork item={{ name: d.product || 'Untitled Transfer', type: 'Transfer', id: item.id, description: `${d.from || '—'} → ${d.to || '—'}` }} variant="icon" />
                    <button onClick={(e) => { e.stopPropagation(); openTransferForm('edit', item) }} className="text-[var(--accent)] hover:underline text-[11px]">Edit</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

// ─── NPD Tab ──────────────────────────────────────────────
function NPDTab({
  items,
  moduleId,
  departmentId,
  onRefresh,
  briefItems = [],
  formulationItems = [],
  skuItems = [],
}: {
  items: any[]
  moduleId: string | null
  departmentId: string | null
  onRefresh: () => void
  briefItems?: any[]
  formulationItems?: any[]
  skuItems?: any[]
}) {
  const openForm = useAppStore((s) => s.openForm)
  const [viewingProject, setViewingProject] = useState<any>(null)
  const [deletingProject, setDeletingProject] = useState<{ id: string; name: string } | null>(null)
  const [view, setView] = useState<ViewMode>('table')

  // Convert module items to NPD project data
  const projects = useMemo(() => {
    return items.map((item: any) => ({
      id: item.id,
      moduleId: item.moduleId,
      ...item.data,
    }))
  }, [items])

  const openNPDForm = () => {
    openForm({
      formType: 'npd',
      mode: 'create',
      recordId: null,
      context: {
        moduleId,
        departmentId,
        initialData: null,
        briefItems,
        formulationItems,
        skuItems,
      },
    })
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

      // SKU Pipeline linkage: when a Stage-3 task completes, create/progress
      // the matching SKU Pipeline entry in Operations.
      const changedTask = updatedTasks.find((t: any) => t.id === taskId)
      if (updates.status === 'complete' && changedTask?.stageKey === '3') {
        try {
          await api.post('/departments/sku-pipeline/sync-from-npd', {
            npdProjectId: viewingProject.id,
            skuItemId: viewingProject.linkedSkuId || undefined,
            name: viewingProject.projectName || viewingProject.name,
            brand: viewingProject.brand,
            taskName: changedTask.taskName,
          })
        } catch (linkErr) {
          console.error('Failed to sync SKU pipeline from NPD:', linkErr)
        }
      }

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
      action: `Approved ${gate === '1/2' ? 'Gate 1/2 (Pipe/Launch)' : 'Gate 2/3'}`,
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
        <ViewToggle value={view} onChange={setView} />
        <button
          onClick={openNPDForm}
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
            onClick={openNPDForm}
            className="btn-primary px-5 py-2.5 rounded-lg text-[14px]"
          >
            Create Your First NPD Project
          </button>
        </div>
      ) : view === 'table' ? (
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
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <AddToCowork item={{ name: proj.projectName || 'Untitled NPD Project', type: 'NPD', id: proj.id, description: `NPD Project — ${proj.brand || '—'}${proj.category ? ` · ${proj.category}` : ''}` }} variant="icon" />
                          <ActionsMenu actions={[
                            { label: 'View', icon: Eye, onClick: () => setViewingProject(proj) },
                            { label: 'Edit', icon: Edit3, onClick: () => setViewingProject(proj) },
                            { label: 'Delete', icon: Trash2, onClick: () => setDeletingProject({ id: proj.id, name: proj.projectName }), danger: true },
                          ]} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {[...projects]
            .sort((a, b) => new Date(a.targetLaunchDate || 0).getTime() - new Date(b.targetLaunchDate || 0).getTime())
            .map((proj: any) => {
              const tasks: NPDTask[] = proj.tasks || []
              const { completed, total } = getOverallProgress(tasks)
              const currentStage = getCurrentStage(tasks, proj.gateApprovals || [])
              const currentConfig = STAGE_CONFIG.find(s => s.key === currentStage)
              const hasBlockedTasks = tasks.some(t => t.status === 'blocked')
              return (
                <div
                  key={proj.id}
                  className="clickable-row flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                  onClick={() => setViewingProject(proj)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">{proj.projectName || '—'}</span>
                      <span className="badge badge-accent text-[11px]">{proj.brand || '—'}</span>
                      {currentConfig && (
                        <span className="badge text-[11px]" style={{ background: `${currentConfig.color}18`, color: currentConfig.color }}>
                          Stage {currentConfig.key} — {currentConfig.name}
                        </span>
                      )}
                      {hasBlockedTasks && (
                        <span className="badge" style={{ background: '#EF444418', color: '#EF4444', fontSize: '10px' }}>Blocked</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                      {proj.category || '—'} · {completed}/{total} tasks · Launch {formatDate(proj.targetLaunchDate)}
                    </p>
                  </div>
                  <div className="w-[160px] hidden sm:block"><NPDSegmentedProgress tasks={tasks} /></div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <AddToCowork item={{ name: proj.projectName || 'Untitled NPD Project', type: 'NPD', id: proj.id, description: `NPD Project — ${proj.brand || '—'}${proj.category ? ` · ${proj.category}` : ''}` }} variant="icon" />
                    <ActionsMenu actions={[
                      { label: 'View', icon: Eye, onClick: () => setViewingProject(proj) },
                      { label: 'Edit', icon: Edit3, onClick: () => setViewingProject(proj) },
                      { label: 'Delete', icon: Trash2, onClick: () => setDeletingProject({ id: proj.id, name: proj.projectName }), danger: true },
                    ]} />
                  </div>
                </div>
              )
            })}
        </div>
      )}

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
        itemName={deletingProject?.name || ''}
        onConfirm={handleDelete}
        onCancel={() => setDeletingProject(null)}
      />
    </div>
  )
}

// ─── Components Tab ───────────────────────────────────────
function ComponentsTab({
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
  const openForm = useAppStore((s) => s.openForm)
  const [viewingComponent, setViewingComponent] = useState<any>(null)
  const [view, setView] = useState<ViewMode>('table')

  const components = useMemo(() => {
    return items.map((item: any) => ({ id: item.id, moduleId: item.moduleId, ...item.data }))
  }, [items])

  const openComponentForm = (mode: 'create' | 'edit', comp?: any) => {
    openForm({
      formType: 'component',
      mode,
      recordId: comp?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? comp?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: comp ?? null,
      },
    })
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
        <ViewToggle value={view} onChange={setView} />
        <button onClick={() => openComponentForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Component
        </button>
      </div>

      {components.length === 0 ? (
        <div className="text-center py-12">
          <Boxes size={40} className="mx-auto text-[var(--text-tertiary)] mb-3 opacity-50" />
          <p className="text-[14px] text-[var(--text-tertiary)] mb-4">No components yet</p>
          <button onClick={() => openComponentForm('create')} className="btn-primary px-5 py-2.5 rounded-lg text-[14px]">Add Your First Component</button>
        </div>
      ) : view === 'table' ? (
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
                <th className="w-12">Actions</th>
              </tr>
            </thead>
            <tbody>
              {components.map((comp: RDComponent & { moduleId?: string }) => {
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
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: comp.name || 'Untitled Component', type: 'Component', id: comp.id, description: `Component — ${comp.type || '—'}${comp.partNumber ? ` · ${comp.partNumber}` : ''}` }} variant="icon" />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {components.map((comp: RDComponent & { moduleId?: string }) => {
            const typeColor = COMPONENT_TYPE_COLORS[comp.type] || '#6B7280'
            const statusColor = FEASIBILITY_STATUS_COLORS[comp.status] || '#6B7280'
            const primaryVendor = (comp.vendors || []).find((v: any) => v.vendorStatus === 'Primary') || (comp.vendors || [])[0]
            const bestCost = getBestUnitCost(comp.moqTiers || [])
            return (
              <div
                key={comp.id}
                className="clickable-row flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                onClick={() => setViewingComponent(comp)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">{comp.name || '—'}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: `${typeColor}18`, color: typeColor }}>{comp.type || '—'}</span>
                    <span className="badge text-[11px]" style={{ background: `${statusColor}18`, color: statusColor }}>{comp.status || 'Concept'}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                    {comp.partNumber || '—'} · {primaryVendor?.vendorName || 'No vendor'} · {bestCost ? `$${bestCost.toFixed(2)}` : '—'}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <AddToCowork item={{ name: comp.name || 'Untitled Component', type: 'Component', id: comp.id, description: `Component — ${comp.type || '—'}${comp.partNumber ? ` · ${comp.partNumber}` : ''}` }} variant="icon" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ComponentDetail open={!!viewingComponent} component={viewingComponent} onClose={() => setViewingComponent(null)} onComponentUpdate={handleComponentUpdate} />
    </div>
  )
}

// ─── NPD Segmented Progress Bar ──────────────────────────
function NPDSegmentedProgress({ tasks }: { tasks: NPDTask[] }) {
  const stages = STAGE_CONFIG.filter(s => s.key !== '1/2' && s.key !== '2/3')
  return (
    <div className="flex items-center gap-0.5 w-full">
      {stages.map((stage) => {
        const pct = getStageProgress(tasks, stage.key)
        const stageTasks = tasks.filter((t) => t.stageKey === stage.key && t.status !== 'skipped')
        const completed = stageTasks.filter((t) => t.status === 'complete').length
        const total = stageTasks.length
        return (
          <div key={stage.key} className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--bg-elevated)]" title={`${stage.name}: ${completed}/${total}`}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: stage.color }} />
          </div>
        )
      })}
    </div>
  )
}

// ─── Formulations Tab ────────────────────────────────────
function FormulationsTab({ items, moduleId, departmentId, briefItems = [], onSelect }: { items: any[]; moduleId: string | null; departmentId: string | null; briefItems?: any[]; onRefresh?: () => void; onSelect: (item: any) => void }) {
  const openForm = useAppStore((s) => s.openForm)
  const [view, setView] = useState<ViewMode>('table')

  const openFormulationForm = (mode: 'create' | 'edit', item?: any) => {
    openForm({
      formType: 'formulation',
      mode,
      recordId: item?.id ?? null,
      context: {
        moduleId: mode === 'edit' ? item?.moduleId ?? moduleId : moduleId,
        departmentId,
        initialData: item ? item.data : null,
        briefItems,
      },
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <ViewToggle value={view} onChange={setView} />
        <button onClick={() => openFormulationForm('create')} className="flex items-center gap-1.5 btn-primary px-4 py-2.5 rounded-full text-[13px]">
          <Plus size={15} /> New Formulation
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-8 text-center">No formulations found.</p>
      ) : view === 'table' ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
          <table className="nexus-table">
            <thead><tr><th>Product</th><th>Version</th><th>Status</th><th>Stability</th><th>Changes</th><th className="w-12">Actions</th></tr></thead>
            <tbody>
              {items.map((item: any) => {
                const d = item.data
                return (
                  <tr key={item.id} className="clickable-row" onClick={() => onSelect(item)}>
                    <td className="font-medium text-[var(--text-primary)]">{d.product}</td>
                    <td><span className="badge badge-accent font-mono text-xs">{d.ver}</span></td>
                    <td><StatusBadge status={d.status} /></td>
                    <td><StatusBadge status={d.stability} /></td>
                    <td className="text-[var(--text-secondary)] max-w-[300px] truncate">{d.changes}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <AddToCowork item={{ name: d.product || 'Untitled Formulation', type: 'Formulation', id: item.id, description: `Formulation${d.ver ? ` · ${d.ver}` : ''}` }} variant="icon" />
                        <ActionsMenu actions={[
                          { label: 'View', icon: Eye, onClick: () => onSelect(item) },
                          { label: 'Edit', icon: Edit3, onClick: () => openFormulationForm('edit', item) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item: any) => {
            const d = item.data
            return (
              <div
                key={item.id}
                className="clickable-row flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors cursor-pointer"
                onClick={() => onSelect(item)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-[14px] text-[var(--text-primary)] truncate">{d.product || '—'}</span>
                    <span className="badge badge-accent font-mono text-xs">{d.ver}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  {d.changes && <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">{d.changes}</p>}
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <AddToCowork item={{ name: d.product || 'Untitled Formulation', type: 'Formulation', id: item.id, description: `Formulation${d.ver ? ` · ${d.ver}` : ''}` }} variant="icon" />
                  <ActionsMenu actions={[
                    { label: 'View', icon: Eye, onClick: () => onSelect(item) },
                    { label: 'Edit', icon: Edit3, onClick: () => openFormulationForm('edit', item) },
                  ]} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────
export function RDPage() {
  const [activeTab, setActiveTab] = useState<RDTab>('briefs')
  const [selectedItem, setSelectedItem] = useState<{ item: any; type: string } | null>(null)
  const [viewingTransfer, setViewingTransfer] = useState<any>(null)
  const [viewingFormulation, setViewingFormulation] = useState<any>(null)
  // Brief id queued for cross-tab navigation (e.g. clicking a tech
  // transfer's linked brief). Consumed by BriefsTab once it opens the brief.
  const [pendingBriefId, setPendingBriefId] = useState<string | null>(null)
  // CM id queued for cross-tab navigation (e.g. clicking a brief's linked
  // CM). Consumed by CMTab once it opens the CM's profile.
  const [pendingCmId, setPendingCmId] = useState<string | null>(null)

  const handleOpenBrief = (briefId: string) => {
    if (!briefId) return
    setViewingTransfer(null)
    setActiveTab('briefs')
    setPendingBriefId(briefId)
  }

  const handleOpenCm = (cmId: string) => {
    if (!cmId) return
    setActiveTab('cm')
    setPendingCmId(cmId)
  }

  const { data: departments, isLoading: deptsLoading } = useDepartments()

  const rdDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_RD') || null
  }, [departments])

  const opsDept = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return departments.find((d: any) => d.type === 'BUILTIN_OPS') || null
  }, [departments])

  const { data: deptDetail, isLoading: detailLoading, refetch: refetchDept } = useDepartment(rdDept?.id || '')
  const { data: opsDetail } = useDepartment(opsDept?.id || '')

  const productionItems = useMemo(() => {
    const modules = (opsDetail?.modules as any[]) || []
    return modules.find((m: any) => m.type === 'PRODUCTION_TRACKING')?.items || []
  }, [opsDetail])

  const skuItems = useMemo(() => {
    const modules = (opsDetail?.modules as any[]) || []
    return modules.find((m: any) => m.type === 'SKU_PIPELINE')?.items || []
  }, [opsDetail])

  const isLoading = deptsLoading || detailLoading

  const moduleData = useMemo(() => {
    if (!deptDetail?.modules) {
      return {
        briefs: [], cm: [], transfers: [], formulations: [], npd: [], components: [],
        briefsModuleId: null, cmModuleId: null, transfersModuleId: null,
        formulationsModuleId: null,
        npdModuleId: null, componentsModuleId: null,
      }
    }
    const modules = deptDetail.modules as any[]
    const find = (type: string) =>
      modules.find((m: any) => m.type === type)?.items || []
    const findModuleId = (type: string) =>
      modules.find((m: any) => m.type === type)?.id || null

    return {
      briefs: find('BRIEFS'),
      cm: find('CM_PRODUCTIVITY'),
      transfers: find('TECH_TRANSFERS'),
      formulations: find('FORMULATIONS'),
      npd: find('NPD_PIPELINE'),
      components: find('COMPONENTS'),
      briefsModuleId: findModuleId('BRIEFS'),
      cmModuleId: findModuleId('CM_PRODUCTIVITY'),
      transfersModuleId: findModuleId('TECH_TRANSFERS'),
      npdModuleId: findModuleId('NPD_PIPELINE'),
      componentsModuleId: findModuleId('COMPONENTS'),
      formulationsModuleId: findModuleId('FORMULATIONS'),
    }
  }, [deptDetail])

  const tabContent: Record<RDTab, any[]> = {
    briefs: moduleData.briefs,
    cm: moduleData.cm,
    transfers: moduleData.transfers,
    formulations: moduleData.formulations,
    npd: moduleData.npd,
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
      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit max-w-full overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent)] text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
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
            activeTab === 'cm' ? <CardsSkeleton /> : <TableSkeleton />
          ) : activeTab === 'briefs' ? (
            <BriefsTab items={moduleData.briefs} moduleId={moduleData.briefsModuleId} departmentId={rdDept?.id || null} onRefresh={() => refetchDept()} transferItems={moduleData.transfers} formulationItems={moduleData.formulations} openBriefId={pendingBriefId} onOpenBriefHandled={() => setPendingBriefId(null)} onOpenCm={handleOpenCm} />
          ) : activeTab === 'cm' ? (
            <CMTab items={moduleData.cm} moduleId={moduleData.cmModuleId} departmentId={rdDept?.id || null} onRefresh={() => refetchDept()} briefItems={moduleData.briefs} productionItems={productionItems} openCmId={pendingCmId} onOpenCmHandled={() => setPendingCmId(null)} />
          ) : activeTab === 'transfers' ? (
            <TransfersTab items={moduleData.transfers} moduleId={moduleData.transfersModuleId} departmentId={rdDept?.id || null} briefs={moduleData.briefs} cmItems={moduleData.cm} onRefresh={() => refetchDept()} onSelect={(item) => setViewingTransfer(item)} />
          ) : activeTab === 'formulations' ? (
            <FormulationsGate>
              <FormulationsTab items={tabContent.formulations} moduleId={moduleData.formulationsModuleId} departmentId={rdDept?.id || null} briefItems={moduleData.briefs} onRefresh={() => refetchDept()} onSelect={(item) => setSelectedItem({ item, type: 'FORMULATIONS' })} />
            </FormulationsGate>
          ) : activeTab === 'npd' ? (
            <NPDTab items={moduleData.npd} moduleId={moduleData.npdModuleId} departmentId={rdDept?.id || null} onRefresh={() => refetchDept()} briefItems={moduleData.briefs} formulationItems={moduleData.formulations} skuItems={skuItems} />
          ) : (
            <ComponentsTab items={moduleData.components} moduleId={moduleData.componentsModuleId} departmentId={rdDept?.id || null} onRefresh={() => refetchDept()} />
          )}
        </div>
      </div>

      {/* Tech Transfer Detail Drawer */}
      <TechTransferDetailDrawer
        open={!!viewingTransfer}
        transfer={viewingTransfer?.data || viewingTransfer}
        onClose={() => setViewingTransfer(null)}
        onOpenBrief={handleOpenBrief}
        onUpdate={async (updates) => {
          if (viewingTransfer?.id && viewingTransfer?.moduleId) {
            await api.patch(`/departments/_/modules/${viewingTransfer.moduleId}/items/${viewingTransfer.id}`, {
              data: { ...(viewingTransfer.data || viewingTransfer), ...updates },
            })
            refetchDept()
          }
        }}
      />

      {/* Formulation Detail Drawer */}
      <FormulationDetailDrawer
        open={!!viewingFormulation}
        formulation={viewingFormulation?.data || viewingFormulation}
        onClose={() => setViewingFormulation(null)}
        onUpdate={async (updates) => {
          if (viewingFormulation?.id && viewingFormulation?.moduleId) {
            await api.patch(`/departments/_/modules/${viewingFormulation.moduleId}/items/${viewingFormulation.id}`, {
              data: { ...(viewingFormulation.data || viewingFormulation), ...updates },
            })
            refetchDept()
          }
        }}
      />
    </div>
  )
}
