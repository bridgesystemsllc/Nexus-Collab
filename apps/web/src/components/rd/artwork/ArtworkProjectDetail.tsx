import { useState, useMemo, useCallback } from 'react'
import {
  X,
  Edit3,
  Download,
  Plus,
  Check,
  AlertTriangle,
  Clock,
  FileText,
  Upload,
  ChevronDown,
  ChevronRight,
  Link2,
  Printer,
  Shield,
  Eye,
  MessageSquare,
  Layers,
  Send,
  FolderOpen,
  CheckCircle2,
  Activity,
  RotateCcw,
} from 'lucide-react'
import type {
  ArtworkProject,
  ArtworkVersion,
  ArtworkApproval,
  ArtworkSubmission,
  ComplianceItem,
  ArtworkStatus,
} from './artworkData'
import {
  ARTWORK_STATUS_COLORS,
  CHANGE_TYPES,
  SUBMISSION_TYPES,
  SUBMISSION_METHODS,
  getApprovalChainSummary,
  getComplianceProgress,
} from './artworkData'

// ─── Types ───────────────────────────────────────────────────────
interface Props {
  open: boolean
  project: ArtworkProject | null
  onClose: () => void
  onProjectUpdate: (updates: Partial<ArtworkProject>) => void
}

type TabId = 'versions' | 'approvals' | 'submissions' | 'files' | 'compliance' | 'activity'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'versions', label: 'Versions', icon: Layers },
  { id: 'approvals', label: 'Approvals', icon: Shield },
  { id: 'submissions', label: 'Submissions', icon: Send },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'compliance', label: 'Compliance', icon: CheckCircle2 },
  { id: 'activity', label: 'Activity', icon: Activity },
]

const SECTION_LABELS: Record<string, string> = {
  A: 'A: Regulatory',
  B: 'B: Print & Technical',
  C: 'C: Retailer-Specific',
  D: 'D: Brand Standards',
}

const FILE_CATEGORIES = [
  'Artwork Files',
  'Dielines',
  'Color References',
  'Proofs',
  'Reference Docs',
  'Certifications',
] as const

// ─── Helpers ─────────────────────────────────────────────────────
function isOverdue(dateStr: string | undefined | null): boolean {
  if (!dateStr) return false
  return new Date(dateStr) < new Date()
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '--'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function incrementVersion(current: string): string {
  const parts = current.split('.')
  if (parts.length === 2) {
    return `${parts[0]}.${parseInt(parts[1], 10) + 1}`
  }
  return `${parseInt(current || '1', 10) + 1}.0`
}

// ─── Shared Sub-Components ───────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color = ARTWORK_STATUS_COLORS[status] || '#6B7280'
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: `${color}18`, color }}
    >
      {status}
    </span>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
      style={{
        background: color ? `${color}18` : 'var(--bg-hover)',
        color: color || 'var(--text-secondary)',
      }}
    >
      {children}
    </span>
  )
}

function ApprovalDot({ status, pulsing }: { status: 'approved' | 'pending' | 'rejected' | 'skipped'; pulsing?: boolean }) {
  const styles: Record<string, string> = {
    approved: 'bg-[#10B981]',
    rejected: 'bg-[#EF4444]',
    skipped: 'bg-[#6B7280]',
    pending: 'border-2 border-[var(--border-default)] bg-transparent',
  }
  return (
    <div
      className={`w-3 h-3 rounded-full ${styles[status] || styles.pending} ${pulsing ? 'animate-pulse ring-2 ring-[var(--accent)] ring-offset-1' : ''}`}
      title={status}
    />
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-xs font-medium text-[var(--text-tertiary)] mb-3 uppercase tracking-wider">{label}</p>
  )
}

// ─── Main Component ──────────────────────────────────────────────

export function ArtworkProjectDetail({ open, project, onClose, onProjectUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('versions')
  const [showNewVersion, setShowNewVersion] = useState(false)
  const [showNewSubmission, setShowNewSubmission] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({})

  // New version form state
  const [newVersionForm, setNewVersionForm] = useState({
    versionNumber: '',
    changeSummary: '',
    changeTypes: [] as string[],
    resetApprovals: true,
  })

  // New submission form state
  const [newSubmissionForm, setNewSubmissionForm] = useState({
    submittedTo: '',
    submissionType: '',
    versionNumber: '',
    method: '',
    submittedBy: '',
    responseDueDate: '',
    referenceNumber: '',
    notes: '',
  })

  // Approval action state
  const [approvalComment, setApprovalComment] = useState('')

  // Submission response forms
  const [responseFormId, setResponseFormId] = useState<string | null>(null)
  const [responseForm, setResponseForm] = useState({ status: '' as string, notes: '' })

  // ─── Derived Data ───────────────────────────────────────────
  const versions = useMemo(() => (project?.versions || []).slice().sort((a, b) => {
    const av = parseFloat(a.versionNumber || '0')
    const bv = parseFloat(b.versionNumber || '0')
    return bv - av
  }), [project?.versions])

  const latestVersion = versions[0] || null

  const currentApprovals = useMemo(() => latestVersion?.approvals || [], [latestVersion])

  const allApprovalHistory = useMemo(() => {
    return (project?.versions || []).flatMap(v =>
      (v.approvals || [])
        .filter(a => a.status !== 'pending')
        .map(a => ({ ...a, versionNumber: v.versionNumber }))
    ).sort((a, b) => new Date(b.decidedAt || 0).getTime() - new Date(a.decidedAt || 0).getTime())
  }, [project?.versions])

  const submissions = useMemo(() => project?.submissions || [], [project?.submissions])
  const complianceItems = useMemo(() => project?.complianceChecklist || [], [project?.complianceChecklist])
  const activityLog = useMemo(() => project?.activityLog || [], [project?.activityLog])
  const approvalChain = useMemo(() => project?.approvalChain || [], [project?.approvalChain])
  const channels = useMemo(() => project?.channels || [], [project?.channels])
  const certifications = useMemo(() => project?.certifications || [], [project?.certifications])
  const targetRetailers = useMemo(() => project?.targetRetailers || [], [project?.targetRetailers])

  const complianceProgress = useMemo(() => getComplianceProgress(complianceItems), [complianceItems])

  // Auto-increment version number when opening form
  const handleOpenNewVersion = useCallback(() => {
    const nextVer = latestVersion ? incrementVersion(latestVersion.versionNumber) : '1.0'
    setNewVersionForm({ versionNumber: nextVer, changeSummary: '', changeTypes: [], resetApprovals: true })
    setShowNewVersion(true)
  }, [latestVersion])

  // ─── Handlers ───────────────────────────────────────────────

  const handleSubmitNewVersion = useCallback(() => {
    if (!newVersionForm.changeSummary.trim() || !project) return

    const freshApprovals: ArtworkApproval[] = newVersionForm.resetApprovals
      ? approvalChain.map((ac, i) => ({
          id: generateId(),
          sequence: ac.sequence,
          role: ac.role,
          assignedName: ac.assignedName,
          status: 'pending' as const,
        }))
      : latestVersion
        ? latestVersion.approvals.map(a => ({ ...a, id: generateId() }))
        : []

    const newVersion: ArtworkVersion = {
      id: generateId(),
      versionNumber: newVersionForm.versionNumber,
      versionType: 'minor',
      artworkFileName: `${project.artworkName}_v${newVersionForm.versionNumber}.pdf`,
      artworkFileUrl: '',
      changeSummary: newVersionForm.changeSummary,
      changeTypes: newVersionForm.changeTypes,
      uploadedBy: project.createdBy || 'Current User',
      uploadedAt: new Date().toISOString(),
      resetApprovals: newVersionForm.resetApprovals,
      approvals: freshApprovals,
      status: 'In Review',
    }

    const updatedVersions = [newVersion, ...(project.versions || [])]
    const newLog = {
      user: project.createdBy || 'Current User',
      action: `Uploaded version ${newVersionForm.versionNumber}: ${newVersionForm.changeSummary}`,
      timestamp: new Date().toISOString(),
      version: newVersionForm.versionNumber,
    }

    onProjectUpdate({
      versions: updatedVersions,
      currentVersion: newVersionForm.versionNumber,
      status: 'In Review' as ArtworkStatus,
      activityLog: [newLog, ...(project.activityLog || [])],
    })
    setShowNewVersion(false)
  }, [newVersionForm, project, approvalChain, latestVersion, onProjectUpdate])

  const handleApprovalAction = useCallback((action: 'approved' | 'rejected') => {
    if (!project || !latestVersion) return

    const updatedApprovals = latestVersion.approvals.map((a, i) => {
      if (a.status === 'pending') {
        const isFirst = latestVersion.approvals.slice(0, i).every(prev => prev.status !== 'pending')
        if (isFirst) {
          return { ...a, status: action, decidedAt: new Date().toISOString(), comments: approvalComment }
        }
      }
      return a
    })

    const updatedVersion = { ...latestVersion, approvals: updatedApprovals }
    const allApproved = updatedApprovals.every(a => a.status === 'approved' || a.status === 'skipped')
    if (allApproved) {
      updatedVersion.status = 'Final Approved'
    }

    const updatedVersions = (project.versions || []).map(v =>
      v.id === latestVersion.id ? updatedVersion : v
    )

    const newLog = {
      user: 'Current User',
      action: `${action === 'approved' ? 'Approved' : 'Requested revisions on'} version ${latestVersion.versionNumber}${approvalComment ? `: ${approvalComment}` : ''}`,
      timestamp: new Date().toISOString(),
      version: latestVersion.versionNumber,
    }

    onProjectUpdate({
      versions: updatedVersions,
      status: allApproved ? 'Final Approved' as ArtworkStatus : action === 'rejected' ? 'Revisions Requested' as ArtworkStatus : project.status,
      activityLog: [newLog, ...(project.activityLog || [])],
    })
    setApprovalComment('')
  }, [project, latestVersion, approvalComment, onProjectUpdate])

  const handleSubmitSubmission = useCallback(() => {
    if (!project || !newSubmissionForm.submittedTo.trim()) return

    const newSub: ArtworkSubmission = {
      id: generateId(),
      submittedTo: newSubmissionForm.submittedTo,
      submissionType: newSubmissionForm.submissionType,
      versionNumber: newSubmissionForm.versionNumber || project.currentVersion,
      method: newSubmissionForm.method,
      submittedBy: newSubmissionForm.submittedBy || project.createdBy || 'Current User',
      submittedAt: new Date().toISOString(),
      referenceNumber: newSubmissionForm.referenceNumber,
      responseDueDate: newSubmissionForm.responseDueDate,
      responseDate: '',
      status: 'Submitted',
      submissionNotes: newSubmissionForm.notes,
      responseNotes: '',
    }

    const newLog = {
      user: newSub.submittedBy,
      action: `Submitted v${newSub.versionNumber} to ${newSub.submittedTo} (${newSub.submissionType})`,
      timestamp: new Date().toISOString(),
      version: newSub.versionNumber,
    }

    onProjectUpdate({
      submissions: [newSub, ...(project.submissions || [])],
      activityLog: [newLog, ...(project.activityLog || [])],
    })
    setShowNewSubmission(false)
    setNewSubmissionForm({ submittedTo: '', submissionType: '', versionNumber: '', method: '', submittedBy: '', responseDueDate: '', referenceNumber: '', notes: '' })
  }, [project, newSubmissionForm, onProjectUpdate])

  const handleUpdateSubmissionResponse = useCallback((subId: string) => {
    if (!project) return

    const updatedSubs = (project.submissions || []).map(s =>
      s.id === subId
        ? { ...s, status: responseForm.status as ArtworkSubmission['status'], responseNotes: responseForm.notes, responseDate: new Date().toISOString() }
        : s
    )

    const sub = (project.submissions || []).find(s => s.id === subId)
    const newLog = {
      user: 'Current User',
      action: `Updated response for submission to ${sub?.submittedTo}: ${responseForm.status}`,
      timestamp: new Date().toISOString(),
    }

    onProjectUpdate({
      submissions: updatedSubs,
      activityLog: [newLog, ...(project.activityLog || [])],
    })
    setResponseFormId(null)
    setResponseForm({ status: '', notes: '' })
  }, [project, responseForm, onProjectUpdate])

  const handleComplianceUpdate = useCallback((itemId: string, status: ComplianceItem['status'], notes?: string) => {
    if (!project) return

    const updatedItems = (project.complianceChecklist || []).map(item =>
      item.id === itemId
        ? { ...item, status, notes: notes !== undefined ? notes : item.notes, updatedBy: 'Current User', updatedAt: new Date().toISOString() }
        : item
    )

    onProjectUpdate({ complianceChecklist: updatedItems })
  }, [project, onProjectUpdate])

  // ─── Guards ─────────────────────────────────────────────────
  if (!open || !project) return null

  const overdue = isOverdue(project.submissionDueDate) && project.status !== 'Final Approved' && project.status !== 'Archived'

  // Find current pending approver (first pending in chain)
  const currentPendingIndex = currentApprovals.findIndex(a => a.status === 'pending')

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
      >
        {/* ─── HEADER ─────────────────────────────────────── */}
        <div className="flex-shrink-0 border-b border-[var(--border-subtle)]">
          <div className="px-6 py-4">
            {/* Row 1: Brand / Channel chips + Name + Actions */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <Chip color="var(--accent)">{project.brand}</Chip>
                  {channels.map(ch => (
                    <Chip key={ch}>{ch}</Chip>
                  ))}
                </div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                  {project.artworkName}
                </h2>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-all"
                  onClick={() => { /* placeholder edit */ }}
                >
                  <Edit3 size={14} /> Edit
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Row 2: SKU / Format / Printer */}
            <div className="flex items-center gap-3 mt-2 text-[13px] text-[var(--text-tertiary)]">
              {(project.skus || [])[0] && (
                <span className="font-mono">{project.skus[0].sku}</span>
              )}
              {project.productFormat && (
                <>
                  <span className="text-[var(--border-default)]">|</span>
                  <span>{project.productFormat}</span>
                </>
              )}
              {project.printerName && (
                <>
                  <span className="text-[var(--border-default)]">|</span>
                  <span className="flex items-center gap-1"><Printer size={12} /> {project.printerName}</span>
                </>
              )}
            </div>

            {/* Row 3: Status + Due date + Approval dots */}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              <StatusBadge status={project.status} />
              <div className={`flex items-center gap-1.5 text-[13px] ${overdue ? 'text-[#EF4444] font-semibold' : 'text-[var(--text-tertiary)]'}`}>
                <Clock size={13} />
                <span>Due {formatDate(project.submissionDueDate)}</span>
                {overdue && <AlertTriangle size={13} />}
              </div>

              {/* Approval chain dots */}
              {currentApprovals.length > 0 && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-[11px] text-[var(--text-tertiary)] mr-1">Approvals</span>
                  {currentApprovals.map((a, i) => (
                    <ApprovalDot
                      key={a.id || i}
                      status={a.status}
                      pulsing={i === currentPendingIndex}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Row 4: Linked items */}
            {(project.linkedBriefId || project.linkedNPDId || project.linkedFormulationId) && (
              <div className="flex items-center gap-2 mt-3">
                {project.linkedBriefId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-surface)]">
                    <Link2 size={10} /> Brief
                  </span>
                )}
                {project.linkedNPDId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-surface)]">
                    <Link2 size={10} /> NPD
                  </span>
                )}
                {project.linkedFormulationId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--bg-hover)] text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-surface)]">
                    <Link2 size={10} /> Formulation
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ─── TABS ─────────────────────────────────────── */}
          <div className="flex items-center gap-0 px-6 border-t border-[var(--border-subtle)]">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'text-[var(--accent)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--accent)] rounded-full" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── TAB CONTENT ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* ═══ TAB 1: VERSIONS ═══ */}
          {activeTab === 'versions' && (
            <div className="space-y-4">
              {/* New Version button */}
              {!showNewVersion && (
                <button
                  onClick={handleOpenNewVersion}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium btn-primary"
                >
                  <Plus size={14} /> New Version
                </button>
              )}

              {/* New Version inline form */}
              {showNewVersion && (
                <div className="p-4 rounded-xl border border-[var(--accent)] bg-[var(--bg-surface)] space-y-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">New Version</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Version Number</label>
                      <input
                        type="text"
                        value={newVersionForm.versionNumber}
                        onChange={e => setNewVersionForm(f => ({ ...f, versionNumber: e.target.value }))}
                        className="nexus-input w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Change Summary *</label>
                    <textarea
                      value={newVersionForm.changeSummary}
                      onChange={e => setNewVersionForm(f => ({ ...f, changeSummary: e.target.value }))}
                      className="nexus-input w-full h-20 resize-none"
                      placeholder="Describe what changed in this version..."
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 block">Change Types</label>
                    <div className="flex flex-wrap gap-2">
                      {CHANGE_TYPES.map(ct => {
                        const selected = newVersionForm.changeTypes.includes(ct)
                        return (
                          <label
                            key={ct}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] cursor-pointer border transition-colors ${
                              selected
                                ? 'bg-[var(--accent-light)] border-[var(--accent)] text-[var(--accent)]'
                                : 'bg-[var(--bg-hover)] border-[var(--border-default)] text-[var(--text-secondary)]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setNewVersionForm(f => ({
                                  ...f,
                                  changeTypes: selected
                                    ? f.changeTypes.filter(c => c !== ct)
                                    : [...f.changeTypes, ct],
                                }))
                              }}
                              className="sr-only"
                            />
                            {ct}
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newVersionForm.resetApprovals}
                      onChange={e => setNewVersionForm(f => ({ ...f, resetApprovals: e.target.checked }))}
                      className="accent-[var(--accent)]"
                    />
                    <RotateCcw size={13} />
                    Reset all approvals
                  </label>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleSubmitNewVersion}
                      disabled={!newVersionForm.changeSummary.trim()}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium btn-primary disabled:opacity-40"
                    >
                      Create Version
                    </button>
                    <button
                      onClick={() => setShowNewVersion(false)}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Version Timeline */}
              {versions.length === 0 && (
                <p className="text-[13px] text-[var(--text-tertiary)] py-8 text-center">No versions yet. Upload the first version to get started.</p>
              )}

              <div className="relative">
                {versions.length > 1 && (
                  <div className="absolute left-[18px] top-4 bottom-4 w-px bg-[var(--border-subtle)]" />
                )}

                {versions.map((v, idx) => {
                  const vApprovals = v.approvals || []
                  const summary = getApprovalChainSummary(vApprovals)
                  return (
                    <div key={v.id} className="relative pl-10 pb-4">
                      {/* Timeline dot */}
                      <div
                        className="absolute left-2.5 top-4 w-3 h-3 rounded-full border-2"
                        style={{
                          borderColor: ARTWORK_STATUS_COLORS[v.status] || '#6B7280',
                          background: idx === 0 ? (ARTWORK_STATUS_COLORS[v.status] || '#6B7280') : 'var(--bg-elevated)',
                        }}
                      />

                      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                        {/* Version header */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[12px] font-bold font-mono bg-[var(--bg-hover)] text-[var(--text-primary)]">
                              v{v.versionNumber}
                            </span>
                            <StatusBadge status={v.status} />
                          </div>
                          <span className="text-[12px] text-[var(--text-tertiary)]">{formatDate(v.uploadedAt)}</span>
                        </div>

                        {/* Uploaded by */}
                        <p className="text-[12px] text-[var(--text-tertiary)]">
                          Uploaded by <span className="text-[var(--text-secondary)] font-medium">{v.uploadedBy}</span>
                        </p>

                        {/* Change summary */}
                        <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{v.changeSummary}</p>

                        {/* Change type chips */}
                        {(v.changeTypes || []).length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {v.changeTypes.map(ct => (
                              <Chip key={ct}>{ct}</Chip>
                            ))}
                          </div>
                        )}

                        {/* Approval dots for this version */}
                        {vApprovals.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[var(--text-tertiary)] mr-1">
                              {summary.approved}/{summary.total}
                            </span>
                            {vApprovals.map((a, i) => (
                              <ApprovalDot key={a.id || i} status={a.status} />
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          {idx > 0 && (
                            <button
                              onClick={() => console.log(`Compare v${v.versionNumber} to v${versions[idx - 1]?.versionNumber}`)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-colors"
                            >
                              <Eye size={12} /> Compare to v{versions[idx - 1]?.versionNumber}
                            </button>
                          )}
                          <button
                            onClick={() => console.log(`Download v${v.versionNumber}`, v.artworkFileUrl)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] transition-colors"
                          >
                            <Download size={12} /> Download
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ═══ TAB 2: APPROVAL WORKFLOW ═══ */}
          {activeTab === 'approvals' && (
            <div className="space-y-6">
              {/* Current Approval Chain */}
              <div>
                <SectionHeader label="Current Approval Chain" />
                {currentApprovals.length === 0 && (
                  <p className="text-[13px] text-[var(--text-tertiary)] py-4">No approvals configured for the current version.</p>
                )}
                <div className="space-y-3">
                  {currentApprovals.map((a, i) => {
                    const isCurrent = i === currentPendingIndex
                    const statusColors: Record<string, { bg: string; text: string }> = {
                      approved: { bg: '#10B98118', text: '#10B981' },
                      rejected: { bg: '#EF444418', text: '#EF4444' },
                      pending: { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' },
                      skipped: { bg: 'var(--bg-hover)', text: '#6B7280' },
                    }
                    const sc = statusColors[a.status] || statusColors.pending
                    return (
                      <div
                        key={a.id || i}
                        className={`p-4 rounded-xl border transition-colors ${
                          isCurrent
                            ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                            : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-[var(--bg-hover)] flex items-center justify-center text-[12px] font-bold text-[var(--text-tertiary)]">
                              {a.sequence}
                            </div>
                            <div>
                              <p className="text-[13px] font-medium text-[var(--text-primary)]">{a.assignedName || 'Unassigned'}</p>
                              <p className="text-[11px] text-[var(--text-tertiary)]">{a.role}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize"
                              style={{ background: sc.bg, color: sc.text }}
                            >
                              {a.status}
                            </span>
                            {a.decidedAt && (
                              <span className="text-[11px] text-[var(--text-tertiary)]">{formatDate(a.decidedAt)}</span>
                            )}
                          </div>
                        </div>
                        {a.comments && (
                          <div className="mt-2 ml-10 p-2.5 rounded-lg bg-[var(--bg-base)] text-[12px] text-[var(--text-secondary)]">
                            <MessageSquare size={11} className="inline mr-1.5 text-[var(--text-tertiary)]" />
                            {a.comments}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Current User Approval Action */}
              {currentPendingIndex >= 0 && (
                <div className="p-4 rounded-xl border border-[var(--accent)] bg-[var(--bg-surface)] space-y-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Your Review</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">
                    Reviewing as <span className="font-medium">{currentApprovals[currentPendingIndex]?.role}</span> for v{latestVersion?.versionNumber}
                  </p>
                  <textarea
                    value={approvalComment}
                    onChange={e => setApprovalComment(e.target.value)}
                    className="nexus-input w-full h-20 resize-none"
                    placeholder="Add comments (optional)..."
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprovalAction('approved')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#10B981] text-white hover:bg-[#0d9f74] transition-colors"
                    >
                      <Check size={14} /> Approve
                    </button>
                    <button
                      onClick={() => handleApprovalAction('rejected')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#EF4444] text-white hover:bg-[#dc3939] transition-colors"
                    >
                      <AlertTriangle size={14} /> Request Revisions
                    </button>
                  </div>
                </div>
              )}

              {/* Approval History */}
              {allApprovalHistory.length > 0 && (
                <div>
                  <SectionHeader label="Approval History" />
                  <div className="space-y-2">
                    {allApprovalHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                        <div
                          className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${
                            h.status === 'approved' ? 'bg-[#10B981]' : h.status === 'rejected' ? 'bg-[#EF4444]' : 'bg-[#6B7280]'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-[var(--text-primary)]">
                            <span className="font-medium">{h.assignedName || h.role}</span>
                            <span className="text-[var(--text-tertiary)]"> {h.status} </span>
                            <span className="font-mono text-[12px] text-[var(--text-tertiary)]">v{(h as any).versionNumber}</span>
                          </p>
                          {h.comments && (
                            <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">{h.comments}</p>
                          )}
                          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{formatDate(h.decidedAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB 3: SUBMISSIONS ═══ */}
          {activeTab === 'submissions' && (
            <div className="space-y-4">
              {/* New Submission button */}
              {!showNewSubmission && (
                <button
                  onClick={() => setShowNewSubmission(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium btn-primary"
                >
                  <Plus size={14} /> Log Submission
                </button>
              )}

              {/* New Submission inline form */}
              {showNewSubmission && (
                <div className="p-4 rounded-xl border border-[var(--accent)] bg-[var(--bg-surface)] space-y-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Log Submission</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Submitted To *</label>
                      <input
                        type="text"
                        value={newSubmissionForm.submittedTo}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, submittedTo: e.target.value }))}
                        className="nexus-input w-full"
                        placeholder="e.g. Walmart, FDA"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Submission Type</label>
                      <select
                        value={newSubmissionForm.submissionType}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, submissionType: e.target.value }))}
                        className="nexus-input w-full"
                      >
                        <option value="">Select...</option>
                        {SUBMISSION_TYPES.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Version Number</label>
                      <input
                        type="text"
                        value={newSubmissionForm.versionNumber}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, versionNumber: e.target.value }))}
                        className="nexus-input w-full"
                        placeholder={project.currentVersion || 'e.g. 1.0'}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Method</label>
                      <select
                        value={newSubmissionForm.method}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, method: e.target.value }))}
                        className="nexus-input w-full"
                      >
                        <option value="">Select...</option>
                        {SUBMISSION_METHODS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Submitted By</label>
                      <input
                        type="text"
                        value={newSubmissionForm.submittedBy}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, submittedBy: e.target.value }))}
                        className="nexus-input w-full"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Response Due Date</label>
                      <input
                        type="date"
                        value={newSubmissionForm.responseDueDate}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, responseDueDate: e.target.value }))}
                        className="nexus-input w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Reference Number</label>
                      <input
                        type="text"
                        value={newSubmissionForm.referenceNumber}
                        onChange={e => setNewSubmissionForm(f => ({ ...f, referenceNumber: e.target.value }))}
                        className="nexus-input w-full"
                        placeholder="Ticket / tracking #"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Notes</label>
                    <textarea
                      value={newSubmissionForm.notes}
                      onChange={e => setNewSubmissionForm(f => ({ ...f, notes: e.target.value }))}
                      className="nexus-input w-full h-16 resize-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleSubmitSubmission}
                      disabled={!newSubmissionForm.submittedTo.trim()}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium btn-primary disabled:opacity-40"
                    >
                      Log Submission
                    </button>
                    <button
                      onClick={() => setShowNewSubmission(false)}
                      className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Submissions Table */}
              {submissions.length === 0 ? (
                <p className="text-[13px] text-[var(--text-tertiary)] py-8 text-center">No submissions logged yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[var(--bg-base)]">
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">To</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Type</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Ver</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Method</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Submitted</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Due</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {submissions.map(sub => {
                        const subStatusColors: Record<string, string> = {
                          Submitted: '#3B82F6',
                          Acknowledged: '#6B7280',
                          'In Review': '#F59E0B',
                          Approved: '#10B981',
                          Rejected: '#EF4444',
                          'Changes Requested': '#F97316',
                        }
                        return (
                          <tr key={sub.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                            <td className="px-4 py-3 text-[13px] text-[var(--text-primary)] font-medium">{sub.submittedTo}</td>
                            <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">{sub.submissionType}</td>
                            <td className="px-4 py-3 text-[12px] font-mono text-[var(--text-tertiary)]">v{sub.versionNumber}</td>
                            <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)]">{sub.method}</td>
                            <td className="px-4 py-3">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                style={{ background: `${subStatusColors[sub.status] || '#6B7280'}18`, color: subStatusColors[sub.status] || '#6B7280' }}
                              >
                                {sub.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-[var(--text-tertiary)]">{formatDate(sub.submittedAt)}</td>
                            <td className="px-4 py-3 text-[12px] text-[var(--text-tertiary)]">
                              <span className={isOverdue(sub.responseDueDate) && sub.status === 'Submitted' ? 'text-[#EF4444] font-medium' : ''}>
                                {formatDate(sub.responseDueDate)}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {responseFormId === sub.id ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={responseForm.status}
                                    onChange={e => setResponseForm(f => ({ ...f, status: e.target.value }))}
                                    className="nexus-input text-[12px] py-1 px-2"
                                  >
                                    <option value="">Status...</option>
                                    <option value="Acknowledged">Acknowledged</option>
                                    <option value="In Review">In Review</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Rejected">Rejected</option>
                                    <option value="Changes Requested">Changes Requested</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={responseForm.notes}
                                    onChange={e => setResponseForm(f => ({ ...f, notes: e.target.value }))}
                                    className="nexus-input text-[12px] py-1 px-2 w-28"
                                    placeholder="Notes"
                                  />
                                  <button
                                    onClick={() => handleUpdateSubmissionResponse(sub.id)}
                                    disabled={!responseForm.status}
                                    className="p-1 rounded text-[var(--accent)] hover:bg-[var(--accent-light)] disabled:opacity-40"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => setResponseFormId(null)}
                                    className="p-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setResponseFormId(sub.id)
                                    setResponseForm({ status: sub.status, notes: sub.responseNotes || '' })
                                  }}
                                  className="text-[12px] text-[var(--accent)] hover:underline"
                                >
                                  Update
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══ TAB 4: FILES ═══ */}
          {activeTab === 'files' && (
            <div className="space-y-6">
              {FILE_CATEGORIES.map(category => (
                <div key={category}>
                  <SectionHeader label={category} />
                  <div className="space-y-2 mb-3">
                    {/* Placeholder: in production these would come from project data */}
                    <p className="text-[12px] text-[var(--text-tertiary)] italic">No files uploaded yet.</p>
                  </div>
                  <div className="flex items-center justify-center p-6 rounded-xl border-2 border-dashed border-[var(--border-default)] hover:border-[var(--accent)] transition-colors cursor-pointer group">
                    <div className="text-center">
                      <Upload size={20} className="mx-auto mb-1.5 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                      <p className="text-[12px] text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]">
                        Drop files here or click to upload
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ═══ TAB 5: COMPLIANCE CHECKLIST ═══ */}
          {activeTab === 'compliance' && (
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">
                    {complianceProgress.completed} / {complianceProgress.total} items complete
                  </span>
                  <span className="text-[13px] tabular-nums text-[var(--text-secondary)]">{complianceProgress.percent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--bg-base)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${complianceProgress.percent}%`,
                      background: complianceProgress.failing > 0 ? '#F59E0B' : complianceProgress.percent === 100 ? '#10B981' : 'var(--accent)',
                    }}
                  />
                </div>
                {complianceProgress.failing > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 text-[12px] text-[#EF4444]">
                    <AlertTriangle size={12} />
                    {complianceProgress.failing} item{complianceProgress.failing > 1 ? 's' : ''} failing
                  </div>
                )}
              </div>

              {/* Grouped sections */}
              {['A', 'B', 'C', 'D'].map(section => {
                const sectionItems = complianceItems.filter(i => i.section === section)
                if (sectionItems.length === 0) return null
                return (
                  <div key={section}>
                    <SectionHeader label={SECTION_LABELS[section] || section} />
                    <div className="space-y-2">
                      {sectionItems.map(item => {
                        const isFailing = item.status === 'fail'
                        const isExpanded = expandedNotes[item.id] || false
                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border transition-colors ${
                              isFailing
                                ? 'border-[#EF4444] bg-[#EF444408]'
                                : 'border-[var(--border-subtle)] bg-[var(--bg-surface)]'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-[12px] font-mono font-bold text-[var(--text-tertiary)] mt-0.5 w-8 flex-shrink-0">
                                {item.itemNumber}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">{item.description}</p>
                                {item.retailer && (
                                  <span className="text-[11px] text-[var(--text-tertiary)]">{item.retailer}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {(['pass', 'fail', 'na'] as const).map(st => {
                                  const labels = { pass: 'Pass', fail: 'Fail', na: 'N/A' }
                                  const colors = {
                                    pass: item.status === 'pass' ? 'bg-[#10B981] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]',
                                    fail: item.status === 'fail' ? 'bg-[#EF4444] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]',
                                    na: item.status === 'na' ? 'bg-[#6B7280] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-tertiary)]',
                                  }
                                  return (
                                    <button
                                      key={st}
                                      onClick={() => handleComplianceUpdate(item.id, st)}
                                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${colors[st]}`}
                                    >
                                      {labels[st]}
                                    </button>
                                  )
                                })}
                                <button
                                  onClick={() => setExpandedNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                  className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors ml-1"
                                >
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </button>
                              </div>
                            </div>
                            {isExpanded && (
                              <div className="mt-2 ml-11">
                                <textarea
                                  value={item.notes}
                                  onChange={e => handleComplianceUpdate(item.id, item.status, e.target.value)}
                                  className="nexus-input w-full h-16 resize-none text-[12px]"
                                  placeholder="Add notes..."
                                />
                                {item.updatedBy && (
                                  <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                                    Last updated by {item.updatedBy} on {formatDate(item.updatedAt)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ═══ TAB 6: ACTIVITY LOG ═══ */}
          {activeTab === 'activity' && (
            <div className="space-y-1">
              {activityLog.length === 0 && (
                <p className="text-[13px] text-[var(--text-tertiary)] py-8 text-center">No activity recorded yet.</p>
              )}

              <div className="relative">
                {activityLog.length > 1 && (
                  <div className="absolute left-[7px] top-3 bottom-3 w-px bg-[var(--border-subtle)]" />
                )}

                {activityLog.map((event, i) => {
                  // Determine dot color based on action keywords
                  let dotColor = 'var(--accent)'
                  const action = event.action.toLowerCase()
                  if (action.includes('approved') || action.includes('final')) dotColor = '#10B981'
                  else if (action.includes('rejected') || action.includes('revision')) dotColor = '#EF4444'
                  else if (action.includes('submitted') || action.includes('upload')) dotColor = '#3B82F6'
                  else if (action.includes('update')) dotColor = '#F59E0B'

                  return (
                    <div key={i} className="relative pl-7 py-2.5">
                      <div
                        className="absolute left-1 top-4 w-3 h-3 rounded-full"
                        style={{ background: dotColor }}
                      />
                      <div>
                        <p className="text-[13px] text-[var(--text-primary)]">
                          {event.action}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-[var(--text-tertiary)]">{event.user}</span>
                          <span className="text-[11px] text-[var(--border-default)]">|</span>
                          <span className="text-[11px] text-[var(--text-tertiary)]">{formatDate(event.timestamp)}</span>
                          {event.version && (
                            <>
                              <span className="text-[11px] text-[var(--border-default)]">|</span>
                              <span className="text-[11px] font-mono text-[var(--text-tertiary)]">v{event.version}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ArtworkProjectDetail
