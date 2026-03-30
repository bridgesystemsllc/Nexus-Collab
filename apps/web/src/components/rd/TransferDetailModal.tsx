import { useState } from 'react'
import {
  X,
  Edit3,
  Trash2,
  FileText,
  Users,
  ArrowRight,
  MapPin,
  ChevronDown,
  CheckCircle2,
  Circle,
  Clock,
  Activity,
  Target,
  ExternalLink,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

interface TransferDetailModalProps {
  open: boolean
  transfer: any
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onStatusChange: (newStatus: string) => void
  onMilestoneComplete: (index: number) => void
  briefItems?: any[]
}

// ─── Constants ─────────────────────────────────────────────

const STATUS_PIPELINE = [
  'Draft',
  'Brief Submitted',
  'In Review',
  'Formula Shared',
  'Stability Testing',
  'Scale Up',
  'Approved',
  'Complete',
  'On Hold',
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Draft:              { bg: 'var(--bg-hover)',       text: '#6B7280' },
  'Brief Submitted':  { bg: 'var(--info-light)',     text: 'var(--info)' },
  'In Review':        { bg: 'var(--info-light)',     text: 'var(--info)' },
  'Formula Shared':   { bg: 'var(--accent-subtle)',  text: 'var(--accent)' },
  'Stability Testing':{ bg: 'var(--warning-light)',  text: 'var(--warning)' },
  'Scale Up':         { bg: 'var(--warning-light)',  text: 'var(--warning)' },
  Approved:           { bg: 'var(--success-light)',  text: 'var(--success)' },
  Complete:           { bg: 'var(--success-light)',  text: 'var(--success)' },
  'On Hold':          { bg: 'var(--danger-light)',   text: 'var(--danger)' },
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'var(--danger-light)',  text: 'var(--danger)' },
  High:     { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Standard: { bg: 'var(--bg-hover)',      text: '#6B7280' },
}

const DEFAULT_MILESTONES = [
  'Brief Submitted',
  'Formula Shared',
  'Trial Batch Produced',
  'Stability Testing Started',
  'Stability Testing Complete',
  'Regulatory Review',
  'Scale-Up Approved',
  'Transfer Complete',
]

// ─── Sub-components ────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--border-subtle)]">
      <Icon size={15} className="text-[var(--accent)]" />
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value?: string | number | boolean | null }) {
  const display =
    value === undefined || value === null || value === ''
      ? '\u2014'
      : typeof value === 'boolean'
        ? value ? 'Yes' : 'No'
        : String(value)

  return (
    <div>
      <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-[14px] text-[var(--text-primary)]">{display}</p>
    </div>
  )
}

function StatusBadge({
  status,
  onClick,
}: {
  status: string
  onClick?: () => void
}) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS['Draft']
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[12px] font-semibold transition-all hover:opacity-80"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
      {onClick && <ChevronDown size={12} />}
    </button>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors = PRIORITY_COLORS[priority] || PRIORITY_COLORS['Standard']
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      {priority}
    </span>
  )
}

function TransferTypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[var(--accent-subtle)] text-[var(--accent)]">
      {type}
    </span>
  )
}

// ─── Milestone Tracker ─────────────────────────────────────

function MilestoneTracker({
  milestones,
  onComplete,
}: {
  milestones: { label: string; targetDate: string; completed: boolean; completedDate: string; note: string }[]
  onComplete: (index: number) => void
}) {
  const items = milestones?.length > 0 ? milestones : DEFAULT_MILESTONES.map((label) => ({
    label,
    targetDate: '',
    completed: false,
    completedDate: '',
    note: '',
  }))

  return (
    <div className="space-y-1">
      {items.map((m, i) => {
        const isComplete = m.completed
        const isNext = !isComplete && (i === 0 || items[i - 1]?.completed)

        return (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              isComplete
                ? 'bg-[var(--success-light)] border border-[var(--success)]/20'
                : isNext
                  ? 'bg-[var(--accent-subtle)] border border-[var(--accent)]/20'
                  : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
            }`}
          >
            <button
              onClick={() => !isComplete && onComplete(i)}
              className="flex-shrink-0"
              disabled={isComplete}
            >
              {isComplete ? (
                <CheckCircle2 size={18} className="text-[var(--success)]" />
              ) : (
                <Circle size={18} className={isNext ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'} />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-medium ${isComplete ? 'text-[var(--success)] line-through' : 'text-[var(--text-primary)]'}`}>
                {m.label}
              </p>
              {m.note && (
                <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{m.note}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0">
              {isComplete && m.completedDate ? (
                <p className="text-[11px] text-[var(--success)] font-medium">{m.completedDate}</p>
              ) : m.targetDate ? (
                <p className="text-[11px] text-[var(--text-tertiary)]">Target: {m.targetDate}</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Document Panel ────────────────────────────────────────

function DocumentPanel({
  files,
  sharepointLinks,
}: {
  files: { name: string; url: string; source: string }[]
  sharepointLinks: { displayName: string; url: string }[]
}) {
  const allFiles = files || []
  const allLinks = sharepointLinks || []

  if (allFiles.length === 0 && allLinks.length === 0) {
    return (
      <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
        No documents attached yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {allFiles.map((doc, i) => (
        <div key={`file-${i}`} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <FileText size={16} className="text-[var(--accent)] flex-shrink-0" />
          <span className="text-[13px] text-[var(--text-primary)] flex-1 truncate">{doc.name}</span>
          {doc.source === 'onedrive' && (
            <span className="text-[11px] text-[var(--success)] font-medium">OneDrive</span>
          )}
        </div>
      ))}

      {allLinks.map((link, i) => (
        <div
          key={`sp-${i}`}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] transition-colors"
        >
          <ExternalLink size={16} style={{ color: '#0078D4', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">{link.displayName}</p>
            <p className="text-[11px] text-[var(--text-tertiary)] truncate">{link.url}</p>
          </div>
          <button
            onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
            className="px-2.5 py-1 rounded-[6px] text-[11px] font-medium text-[#0078D4] bg-[#0078D4]/8 hover:bg-[#0078D4]/15 transition-colors whitespace-nowrap"
          >
            Open
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Activity Log ──────────────────────────────────────────

function ActivityLog({
  log,
}: {
  log: { author: string; authorInitial: string; action: string; timestamp: string; type: string }[]
}) {
  const entries = log || []

  if (entries.length === 0) {
    return (
      <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
        No activity logged yet.
      </p>
    )
  }

  const typeIcon: Record<string, string> = {
    status: 'var(--accent)',
    milestone: 'var(--success)',
    edit: 'var(--warning)',
    create: 'var(--info)',
    comment: 'var(--text-tertiary)',
  }

  return (
    <div className="space-y-0">
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-3 py-2.5">
          <div className="flex flex-col items-center">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ background: typeIcon[entry.type] || 'var(--text-tertiary)' }}
            >
              {entry.authorInitial || entry.author?.charAt(0)?.toUpperCase() || '?'}
            </div>
            {i < entries.length - 1 && (
              <div className="w-px flex-1 bg-[var(--border-subtle)] mt-1" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <p className="text-[13px] text-[var(--text-primary)]">
              <span className="font-medium">{entry.author}</span>{' '}
              <span className="text-[var(--text-secondary)]">{entry.action}</span>
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{entry.timestamp}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────

export function TransferDetailModal({
  open,
  transfer,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onMilestoneComplete,
  briefItems,
}: TransferDetailModalProps) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)

  if (!open || !transfer) return null

  const linkedBrief = briefItems?.find((b: any) => b.id === transfer.linkedBriefId)

  const handleStatusSelect = (newStatus: string) => {
    onStatusChange(newStatus)
    setStatusDropdownOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[880px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                {transfer.product}
              </h2>
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                Tech Transfer
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {transfer.brand && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                  {transfer.brand}
                </span>
              )}
              <PriorityBadge priority={transfer.priority || 'Standard'} />

              {/* Status dropdown */}
              <div className="relative">
                <StatusBadge
                  status={transfer.status || 'Draft'}
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                />
                {statusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusDropdownOpen(false)} />
                    <div className="absolute top-full left-0 mt-1 z-20 w-48 py-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl">
                      {STATUS_PIPELINE.map((s) => {
                        const colors = STATUS_COLORS[s] || STATUS_COLORS['Draft']
                        const isActive = s === transfer.status
                        return (
                          <button
                            key={s}
                            onClick={() => handleStatusSelect(s)}
                            className={`w-full text-left px-3 py-2 text-[13px] font-medium flex items-center gap-2 transition-colors ${
                              isActive
                                ? 'bg-[var(--bg-hover)]'
                                : 'hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors.text }} />
                            <span className="text-[var(--text-primary)]">{s}</span>
                            {isActive && <CheckCircle2 size={14} className="ml-auto text-[var(--accent)]" />}
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
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

        {/* ── Scrollable Body ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Linked Brief Chip */}
          <div>
            {transfer.linkedBriefId ? (
              <div
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-subtle)] cursor-pointer hover:bg-[var(--accent)]/10 transition-colors"
              >
                <FileText size={14} className="text-[var(--accent)]" />
                <span className="text-[13px] font-medium text-[var(--accent)]">
                  Linked Brief: {transfer.linkedBriefName || linkedBrief?.projectName || 'Unknown Brief'}
                </span>
              </div>
            ) : (
              <span className="text-[13px] text-[var(--text-tertiary)]">No linked brief</span>
            )}
          </div>

          {/* From -> To Transfer Block */}
          <div>
            <SectionHeader icon={ArrowRight} label="Transfer Route" />
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {/* From (Sending CM) */}
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--danger-light)] flex items-center justify-center">
                    <MapPin size={12} className="text-[var(--danger)]" />
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">From / Sending CM</span>
                </div>
                <DetailField label="Name" value={transfer.fromCM} />
                <DetailField label="Location" value={transfer.fromLocation} />
                <DetailField label="Primary Contact" value={transfer.fromCMContact} />
                {transfer.fromCMEmail && (
                  <DetailField label="Email" value={transfer.fromCMEmail} />
                )}
                <DetailField label="Formula Reference #" value={transfer.fromFormulaRef} />
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center pt-12">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center">
                  <ArrowRight size={18} className="text-[var(--accent)]" />
                </div>
              </div>

              {/* To (Receiving CM) */}
              <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[var(--success-light)] flex items-center justify-center">
                    <MapPin size={12} className="text-[var(--success)]" />
                  </div>
                  <span className="text-[12px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">To / Receiving CM</span>
                </div>
                <DetailField label="Name" value={transfer.toCM} />
                <DetailField label="Location" value={transfer.toLocation} />
                <DetailField label="Primary Contact" value={transfer.toCMContact} />
                {transfer.toCMEmail && (
                  <DetailField label="Email" value={transfer.toCMEmail} />
                )}
                <DetailField label="Target Formula Reference #" value={transfer.toFormulaRef} />
              </div>
            </div>
          </div>

          {/* Transfer Goal Card */}
          <div>
            <SectionHeader icon={Target} label="Transfer Goal" />
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
              <p className="text-[14px] text-[var(--text-primary)] leading-relaxed">
                {transfer.transferGoal || '\u2014'}
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[var(--border-subtle)]">
                <TransferTypeBadge type={transfer.transferType || 'Formula Transfer'} />
                <PriorityBadge priority={transfer.priority || 'Standard'} />
                {(transfer.requesterName || transfer.requesterRole) && (
                  <span className="text-[12px] text-[var(--text-tertiary)]">
                    Requested by{' '}
                    <span className="font-medium text-[var(--text-secondary)]">{transfer.requesterName}</span>
                    {transfer.requesterRole && ` (${transfer.requesterRole})`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          {(transfer.targetStartDate || transfer.targetCompletionDate) && (
            <div>
              <SectionHeader icon={Clock} label="Timeline" />
              <div className="grid grid-cols-2 gap-4">
                <DetailField label="Target Start Date" value={transfer.targetStartDate} />
                <DetailField label="Target Completion Date" value={transfer.targetCompletionDate} />
              </div>
            </div>
          )}

          {/* Milestone Tracker */}
          <div>
            <SectionHeader icon={CheckCircle2} label="Milestone Tracker" />
            <MilestoneTracker
              milestones={transfer.milestones || []}
              onComplete={onMilestoneComplete}
            />
          </div>

          {/* Documents Panel */}
          <div>
            <SectionHeader icon={FileText} label="Documents" />
            <DocumentPanel
              files={transfer.files || []}
              sharepointLinks={transfer.sharepointLinks || []}
            />
          </div>

          {/* Team Members */}
          {transfer.teamMembers?.length > 0 && (
            <div>
              <SectionHeader icon={Users} label="Team Members" />
              <div className="grid grid-cols-2 gap-2">
                {transfer.teamMembers.map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-[12px] font-semibold">
                      {m.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">{m.name || '\u2014'}</p>
                      <p className="text-[11px] text-[var(--text-tertiary)]">{m.role || '\u2014'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity / History Log */}
          <div>
            <SectionHeader icon={Activity} label="Activity Log" />
            <ActivityLog log={transfer.activityLog || []} />
          </div>

        </div>
      </div>
    </div>
  )
}
