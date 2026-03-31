import { useState, useRef, useMemo, useCallback } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit3,
  FileText,
  Link2,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Shield,
  X,
} from 'lucide-react'

/* ───────────────────────────── Data Types ───────────────────────────── */

export interface NPDTask {
  id: string
  stageKey: string // '0' | '1' | '1/2' | '2' | '2/3' | '3' | '4'
  taskNumber: string
  taskName: string
  collaborators: string
  leadRole: string
  assignedName: string
  helperComment: string
  isGateTask: boolean
  status: 'not_started' | 'in_progress' | 'complete' | 'blocked' | 'skipped'
  blockedReason?: string
  dueDate: string
  completedAt?: string
  completedBy?: string
  notes: { user: string; text: string; createdAt: string }[]
  attachments: { name: string; url: string }[]
}

export interface NPDProject {
  id: string
  projectName: string
  brand: string
  subBrand?: string
  category: string
  isOTC: boolean
  description: string
  targetLaunchDate: string
  priority: string
  targetRetailPrice: string
  projectedAnnualVolume: string
  amazonVolume?: string
  moq: string
  targetCOGS: string
  markets: string[]
  targetRetailers: string
  contractManufacturerId: string
  pipeQuantity: string
  teamAssignments: { role: string; defaultName: string; assignedName: string }[]
  stageDates: Record<string, string>
  tasks: NPDTask[]
  gateApprovals: { gate: string; approvedBy: string; approvedAt: string; notes?: string }[]
  status: string
  activityLog: { user: string; action: string; timestamp: string; stage?: string }[]
}

interface Props {
  open: boolean
  project: NPDProject | null
  onClose: () => void
  onTaskUpdate: (taskId: string, updates: Partial<NPDTask>) => void
  onGateApprove: (gate: string, notes: string) => void
  onProjectUpdate: (updates: Partial<NPDProject>) => void
}

/* ───────────────────────────── Constants ────────────────────────────── */

type StageKey = '0' | '1' | '1/2' | '2' | '2/3' | '3' | '4'

interface StageConfig {
  key: StageKey
  label: string
  color: string
  isGate: boolean
}

const STAGES: StageConfig[] = [
  { key: '0', label: 'S0 - Feasibility', color: '#6366F1', isGate: false },
  { key: '1', label: 'S1 - Scoping & Brief', color: '#F59E0B', isGate: false },
  { key: '1/2', label: 'G1/2 - Pipe/Launch Gate', color: '#F97316', isGate: true },
  { key: '2', label: 'S2 - Business Case', color: '#8B5CF6', isGate: false },
  { key: '2/3', label: 'G2/3 - Artwork Gate', color: '#F43F5E', isGate: true },
  { key: '3', label: 'S3 - Development', color: '#06B6D4', isGate: false },
  { key: '4', label: 'S4 - Testing & Validation', color: '#10B981', isGate: false },
]

const STAGE_COLOR_MAP: Record<string, string> = {
  '0': '#6366F1',
  '1': '#F59E0B',
  '1/2': '#F97316',
  '2': '#8B5CF6',
  '2/3': '#F43F5E',
  '3': '#06B6D4',
  '4': '#10B981',
}

const PIPELINE_SHORT: Record<string, string> = {
  '0': 'S0',
  '1': 'S1',
  '1/2': 'G1/2',
  '2': 'S2',
  '2/3': 'G2/3',
  '3': 'S3',
  '4': 'S4',
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; strikethrough?: boolean }
> = {
  not_started: { label: 'Not Started', bg: 'var(--bg-hover)', text: '#6B7280' },
  in_progress: { label: 'In Progress', bg: '#FEF7E6', text: '#F59E0B' },
  complete: { label: 'Complete', bg: '#E6F5F2', text: '#10B981' },
  blocked: { label: 'Blocked', bg: '#FDE8E8', text: '#EF4444' },
  skipped: { label: 'Skipped', bg: 'var(--bg-hover)', text: '#9CA3AF', strikethrough: true },
}

const PRIORITY_CONFIG: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'var(--danger-light)', text: 'var(--danger)' },
  High: { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Medium: { bg: 'var(--info-light)', text: 'var(--info)' },
  Low: { bg: 'var(--bg-hover)', text: 'var(--text-secondary)' },
}

type TabId = 'checklist' | 'overview' | 'documents' | 'activity'

/* ───────────────────────────── Helpers ──────────────────────────────── */

function stageProgress(tasks: NPDTask[], stageKey: string) {
  const stageTasks = tasks.filter((t) => t.stageKey === stageKey && t.status !== 'skipped')
  const completed = stageTasks.filter((t) => t.status === 'complete').length
  return stageTasks.length > 0 ? Math.round((completed / stageTasks.length) * 100) : 0
}

function isGateApproved(gateApprovals: NPDProject['gateApprovals'], gate: string) {
  return gateApprovals.some((g) => g.gate === gate)
}

function isStageUnlocked(
  stageKey: string,
  tasks: NPDTask[],
  gateApprovals: NPDProject['gateApprovals']
): boolean {
  switch (stageKey) {
    case '0':
      return true
    case '1':
      return tasks.filter((t) => t.stageKey === '0' && t.status === 'complete').length >= 1
    case '1/2':
      return stageProgress(tasks, '1') === 100
    case '2':
      return isGateApproved(gateApprovals, '1/2')
    case '2/3':
      return stageProgress(tasks, '2') === 100
    case '3':
      return isGateApproved(gateApprovals, '2/3')
    case '4':
      return stageProgress(tasks, '3') === 100
    default:
      return false
  }
}

function getActiveStage(tasks: NPDTask[], gateApprovals: NPDProject['gateApprovals']): string {
  for (let i = STAGES.length - 1; i >= 0; i--) {
    const s = STAGES[i]
    if (isStageUnlocked(s.key, tasks, gateApprovals)) {
      const progress = stageProgress(tasks, s.key)
      if (progress < 100) return s.key
      if (progress === 100 && s.isGate && !isGateApproved(gateApprovals, s.key)) return s.key
    }
  }
  return '0'
}

function formatDate(d: string) {
  if (!d) return '--'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return d
  }
}

function formatTimestamp(d: string) {
  if (!d) return '--'
  try {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return d
  }
}

/* ───────────────────────────── Sub-components ──────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.not_started
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.Medium
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: config.bg, color: config.text }}
    >
      {priority}
    </span>
  )
}

function ProjectStatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    Active: { bg: 'var(--success-light)', text: 'var(--success)' },
    'On Hold': { bg: 'var(--warning-light)', text: 'var(--warning)' },
    Cancelled: { bg: 'var(--danger-light)', text: 'var(--danger)' },
    Complete: { bg: 'var(--info-light)', text: 'var(--info)' },
  }
  const colors = colorMap[status] || { bg: 'var(--bg-hover)', text: 'var(--text-secondary)' }
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold"
      style={{ background: colors.bg, color: colors.text }}
    >
      {status}
    </span>
  )
}

/* ───────────────────────────── Task Row ─────────────────────────────── */

function TaskRow({
  task,
  stageColor,
  locked,
  onTaskUpdate,
}: {
  task: NPDTask
  stageColor: string
  locked: boolean
  onTaskUpdate: Props['onTaskUpdate']
}) {
  const [expanded, setExpanded] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [blockedReason, setBlockedReason] = useState(task.blockedReason || '')
  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started

  const toggleComplete = () => {
    if (locked) return
    onTaskUpdate(task.id, {
      status: task.status === 'complete' ? 'not_started' : 'complete',
      completedAt: task.status === 'complete' ? undefined : new Date().toISOString(),
    })
  }

  const handleStatusChange = (newStatus: NPDTask['status']) => {
    const updates: Partial<NPDTask> = { status: newStatus }
    if (newStatus === 'complete') updates.completedAt = new Date().toISOString()
    if (newStatus === 'blocked') updates.blockedReason = blockedReason
    onTaskUpdate(task.id, updates)
  }

  const handlePostNote = () => {
    if (!noteText.trim()) return
    onTaskUpdate(task.id, {
      notes: [
        ...task.notes,
        { user: 'You', text: noteText.trim(), createdAt: new Date().toISOString() },
      ],
    })
    setNoteText('')
  }

  const isSkipped = task.status === 'skipped'

  return (
    <div className="border-b border-[var(--border-subtle)] last:border-b-0">
      {/* Row */}
      <div
        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
          locked
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-[var(--bg-hover)] cursor-pointer'
        }`}
        onClick={() => !locked && setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleComplete()
          }}
          disabled={locked}
          className="flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
          style={{
            borderColor: task.status === 'complete' ? stageColor : 'var(--border-strong)',
            background: task.status === 'complete' ? stageColor : 'transparent',
          }}
        >
          {task.status === 'complete' && <Check size={12} className="text-white" strokeWidth={3} />}
        </button>

        {/* Task info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-tertiary)] font-mono tabular-nums">
              {task.taskNumber}
            </span>
            <span
              className={`text-[13px] font-medium truncate ${
                isSkipped
                  ? 'line-through text-[var(--text-tertiary)]'
                  : 'text-[var(--text-primary)]'
              }`}
            >
              {task.taskName}
            </span>
            {task.isGateTask && (
              <Shield size={12} style={{ color: stageColor }} className="flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Lead */}
        <span className="text-[12px] text-[var(--text-tertiary)] hidden sm:block w-24 truncate">
          {task.assignedName || task.leadRole}
        </span>

        {/* Due date */}
        <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums hidden sm:block w-24 text-right">
          {task.dueDate ? formatDate(task.dueDate) : '--'}
        </span>

        {/* Status */}
        <StatusBadge status={task.status} />

        {/* Chevron */}
        <div className="flex-shrink-0 text-[var(--text-tertiary)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && !locked && (
        <div className="px-4 pb-4 pt-1 ml-8 space-y-4 animate-fade-in">
          {/* Helper comment */}
          {task.helperComment && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--bg-highlight)] border border-[var(--border-subtle)]">
              <AlertTriangle size={14} className="text-[var(--warning)] mt-0.5 flex-shrink-0" />
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                {task.helperComment}
              </p>
            </div>
          )}

          {/* Status + Due + Assignee row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                Status
              </label>
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value as NPDTask['status'])}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              >
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="blocked">Blocked</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                Due Date
              </label>
              <input
                type="date"
                value={task.dueDate}
                onChange={(e) => onTaskUpdate(task.id, { dueDate: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                Assignee
              </label>
              <input
                type="text"
                value={task.assignedName}
                onChange={(e) => onTaskUpdate(task.id, { assignedName: e.target.value })}
                placeholder={task.leadRole}
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              />
            </div>
          </div>

          {/* Blocked reason */}
          {task.status === 'blocked' && (
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                Blocked Reason
              </label>
              <input
                type="text"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                onBlur={() => onTaskUpdate(task.id, { blockedReason })}
                placeholder="Why is this task blocked?"
                className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--danger)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--danger)]"
              />
            </div>
          )}

          {/* Collaborators */}
          {task.collaborators && (
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                Collaborators
              </label>
              <p className="text-[13px] text-[var(--text-secondary)]">{task.collaborators}</p>
            </div>
          )}

          {/* Attachments */}
          {task.attachments.length > 0 && (
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 block">
                <Paperclip size={11} /> Attachments
              </label>
              <div className="flex flex-wrap gap-2">
                {task.attachments.map((att, i) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)] text-[12px] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                  >
                    <FileText size={12} />
                    {att.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5 flex items-center gap-1.5 block">
              <MessageSquare size={11} /> Notes ({task.notes.length})
            </label>
            {task.notes.length > 0 && (
              <div className="space-y-2 mb-2 max-h-40 overflow-y-auto">
                {task.notes.map((note, i) => (
                  <div key={i} className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
                        {note.user}
                      </span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {formatTimestamp(note.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                      {note.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePostNote()}
                placeholder="Add a note..."
                className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
              />
              <button
                onClick={handlePostNote}
                disabled={!noteText.trim()}
                className="px-3 py-2 rounded-lg text-[12px] font-semibold btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Post
              </button>
            </div>
          </div>

          {/* Completion info */}
          {task.completedAt && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
              <CheckCircle2 size={12} className="text-[#10B981]" />
              Completed {formatTimestamp(task.completedAt)}
              {task.completedBy && <span>by {task.completedBy}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Gate Approval Card ──────────────────────── */

function GateApprovalCard({
  gate,
  stageConfig,
  isApproved,
  approval,
  allGateTasksComplete,
  onGateApprove,
}: {
  gate: string
  stageConfig: StageConfig
  isApproved: boolean
  approval?: NPDProject['gateApprovals'][number]
  allGateTasksComplete: boolean
  onGateApprove: Props['onGateApprove']
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [notes, setNotes] = useState('')

  const handleApprove = () => {
    onGateApprove(gate, notes)
    setShowConfirm(false)
    setNotes('')
  }

  if (isApproved && approval) {
    return (
      <div
        className="mx-4 mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border-l-4"
        style={{ borderLeftColor: stageConfig.color }}
      >
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 size={16} style={{ color: stageConfig.color }} />
          <span className="text-[13px] font-semibold text-[var(--text-primary)]">
            Gate Approved
          </span>
        </div>
        <p className="text-[12px] text-[var(--text-secondary)]">
          Approved by {approval.approvedBy} on {formatTimestamp(approval.approvedAt)}
        </p>
        {approval.notes && (
          <p className="text-[12px] text-[var(--text-tertiary)] mt-1 italic">{approval.notes}</p>
        )}
      </div>
    )
  }

  return (
    <div
      className="mx-4 mb-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] border-l-4"
      style={{ borderLeftColor: stageConfig.color }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Shield size={16} style={{ color: stageConfig.color }} />
        <span className="text-[13px] font-semibold text-[var(--text-primary)]">
          Gate Approval Required
        </span>
      </div>

      {!allGateTasksComplete ? (
        <p className="text-[12px] text-[var(--text-tertiary)]">
          Complete all gate tasks before requesting approval.
        </p>
      ) : !showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90"
          style={{ background: stageConfig.color }}
        >
          Approve Gate <ChevronRight size={14} />
        </button>
      ) : (
        <div className="space-y-3 mt-2 animate-fade-in">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Approval notes (optional)..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:border-transparent resize-none"
            style={{ '--tw-ring-color': stageConfig.color } as React.CSSProperties}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90"
              style={{ background: stageConfig.color }}
            >
              <Check size={14} /> Confirm Approval
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────── Stage Accordion ─────────────────────────── */

function StageSection({
  stageConfig,
  tasks,
  locked,
  isActive,
  gateApprovals,
  onTaskUpdate,
  onGateApprove,
  sectionRef,
}: {
  stageConfig: StageConfig
  tasks: NPDTask[]
  locked: boolean
  isActive: boolean
  gateApprovals: NPDProject['gateApprovals']
  onTaskUpdate: Props['onTaskUpdate']
  onGateApprove: Props['onGateApprove']
  sectionRef: (el: HTMLDivElement | null) => void
}) {
  const [open, setOpen] = useState(isActive || !locked)
  const countable = tasks.filter((t) => t.status !== 'skipped')
  const completed = countable.filter((t) => t.status === 'complete').length
  const progress = countable.length > 0 ? Math.round((completed / countable.length) * 100) : 0
  const allGateTasksComplete = stageConfig.isGate && progress === 100
  const gateApproval = gateApprovals.find((g) => g.gate === stageConfig.key)
  const approved = !!gateApproval

  return (
    <div ref={sectionRef} className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      {/* Stage Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--bg-hover)]"
      >
        {/* Color accent bar */}
        <div
          className="w-1 h-8 rounded-full flex-shrink-0"
          style={{ background: locked ? 'var(--border-default)' : stageConfig.color }}
        />

        {/* Chevron */}
        <div className="text-[var(--text-tertiary)]">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>

        {/* Stage name + lock */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {locked && <Lock size={13} className="text-[var(--text-tertiary)] flex-shrink-0" />}
          <span
            className={`text-[14px] font-semibold truncate ${
              locked ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'
            }`}
          >
            {stageConfig.label}
          </span>
          {isActive && !locked && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: stageConfig.color,
                boxShadow: `0 0 0 3px ${stageConfig.color}33`,
                animation: 'pulseDot 2s ease-in-out infinite',
              }}
            />
          )}
        </div>

        {/* Task count + progress */}
        <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums whitespace-nowrap">
          {completed}/{countable.length} tasks
        </span>
        <div className="w-16 h-1.5 rounded-full bg-[var(--border-default)] overflow-hidden flex-shrink-0">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: locked ? 'var(--border-strong)' : stageConfig.color,
            }}
          />
        </div>
        <span className="text-[11px] font-semibold tabular-nums w-8 text-right" style={{ color: locked ? 'var(--text-tertiary)' : stageConfig.color }}>
          {progress}%
        </span>
      </button>

      {/* Tasks */}
      {open && (
        <div className="border-t border-[var(--border-subtle)]">
          {/* Gate approval card (for gate stages) */}
          {stageConfig.isGate && (
            <div className="pt-3">
              <GateApprovalCard
                gate={stageConfig.key}
                stageConfig={stageConfig}
                isApproved={approved}
                approval={gateApproval}
                allGateTasksComplete={allGateTasksComplete}
                onGateApprove={onGateApprove}
              />
            </div>
          )}

          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                stageColor={stageConfig.color}
                locked={locked}
                onTaskUpdate={onTaskUpdate}
              />
            ))
          ) : (
            <div className="px-4 py-6 text-center text-[13px] text-[var(--text-tertiary)]">
              No tasks in this stage
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Tab: Checklist ────────────────────────────── */

function ChecklistTab({
  project,
  onTaskUpdate,
  onGateApprove,
  stageRefs,
}: {
  project: NPDProject
  onTaskUpdate: Props['onTaskUpdate']
  onGateApprove: Props['onGateApprove']
  stageRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>
}) {
  const activeStage = useMemo(
    () => getActiveStage(project.tasks, project.gateApprovals),
    [project.tasks, project.gateApprovals]
  )

  return (
    <div className="space-y-3">
      {STAGES.map((stage) => {
        const tasks = project.tasks.filter((t) => t.stageKey === stage.key)
        const locked = !isStageUnlocked(stage.key, project.tasks, project.gateApprovals)
        const isActive = stage.key === activeStage

        return (
          <StageSection
            key={stage.key}
            stageConfig={stage}
            tasks={tasks}
            locked={locked}
            isActive={isActive}
            gateApprovals={project.gateApprovals}
            onTaskUpdate={onTaskUpdate}
            onGateApprove={onGateApprove}
            sectionRef={(el) => {
              stageRefs.current[stage.key] = el
            }}
          />
        )
      })}
    </div>
  )
}

/* ─────────────────────── Tab: Overview ─────────────────────────────── */

function OverviewTab({
  project,
  onProjectUpdate,
}: {
  project: NPDProject
  onProjectUpdate: Props['onProjectUpdate']
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ ...project })

  const handleSave = () => {
    const { tasks, gateApprovals, activityLog, id, ...updatable } = draft
    onProjectUpdate(updatable)
    setEditing(false)
  }

  const handleCancel = () => {
    setDraft({ ...project })
    setEditing(false)
  }

  const Field = ({ label, value }: { label: string; value?: string | number | boolean | null }) => {
    const display =
      value === undefined || value === null || value === ''
        ? '--'
        : typeof value === 'boolean'
          ? value ? 'Yes' : 'No'
          : String(value)
    return (
      <div>
        <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-0.5">
          {label}
        </p>
        <p className="text-[14px] text-[var(--text-primary)]">{display}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Edit toggle */}
      <div className="flex justify-end">
        {!editing ? (
          <button
            onClick={() => {
              setDraft({ ...project })
              setEditing(true)
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-ghost"
          >
            <Edit3 size={14} /> Edit Details
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleCancel} className="btn-ghost text-[13px] px-3 py-2 rounded-lg">
              Cancel
            </button>
            <button onClick={handleSave} className="btn-primary text-[13px] px-3 py-2 rounded-lg">
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Project Info */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Project Information
        </h4>
        {editing ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Project Name</label>
              <input value={draft.projectName} onChange={(e) => setDraft({ ...draft, projectName: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Brand</label>
              <input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Category</label>
              <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Target Launch Date</label>
              <input type="date" value={draft.targetLaunchDate} onChange={(e) => setDraft({ ...draft, targetLaunchDate: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Description</label>
              <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Brand" value={project.brand} />
            <Field label="Sub-Brand" value={project.subBrand} />
            <Field label="Category" value={project.category} />
            <Field label="OTC Product" value={project.isOTC} />
            <Field label="Target Launch" value={formatDate(project.targetLaunchDate)} />
            <Field label="Priority" value={project.priority} />
            <div className="col-span-2 md:col-span-3">
              <Field label="Description" value={project.description} />
            </div>
          </div>
        )}
      </div>

      {/* Financial */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Financial & Volume
        </h4>
        {editing ? (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Target Retail Price</label>
              <input value={draft.targetRetailPrice} onChange={(e) => setDraft({ ...draft, targetRetailPrice: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Target COGS</label>
              <input value={draft.targetCOGS} onChange={(e) => setDraft({ ...draft, targetCOGS: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Projected Annual Volume</label>
              <input value={draft.projectedAnnualVolume} onChange={(e) => setDraft({ ...draft, projectedAnnualVolume: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
            <div>
              <label className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">MOQ</label>
              <input value={draft.moq} onChange={(e) => setDraft({ ...draft, moq: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Target Retail Price" value={project.targetRetailPrice} />
            <Field label="Target COGS" value={project.targetCOGS} />
            <Field label="Projected Annual Vol" value={project.projectedAnnualVolume} />
            <Field label="Amazon Volume" value={project.amazonVolume} />
            <Field label="MOQ" value={project.moq} />
            <Field label="Pipe Quantity" value={project.pipeQuantity} />
          </div>
        )}
      </div>

      {/* Markets & Retailers */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Markets & Distribution
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1.5">Markets</p>
            <div className="flex flex-wrap gap-1.5">
              {project.markets.length > 0 ? project.markets.map((m) => (
                <span key={m} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--accent-light)] text-[var(--accent)]">
                  {m}
                </span>
              )) : <span className="text-[13px] text-[var(--text-tertiary)]">--</span>}
            </div>
          </div>
          <Field label="Target Retailers" value={project.targetRetailers} />
          <Field label="Contract Manufacturer" value={project.contractManufacturerId} />
        </div>
      </div>

      {/* Team */}
      <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
          Team Assignments
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {project.teamAssignments.map((tm, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)]"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--accent-secondary-light)] flex items-center justify-center text-[var(--accent-secondary)] text-[12px] font-semibold flex-shrink-0">
                {(tm.assignedName || tm.defaultName || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                  {tm.assignedName || tm.defaultName || '--'}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)]">{tm.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stage Dates */}
      {Object.keys(project.stageDates).length > 0 && (
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
            Stage Target Dates
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {STAGES.map((s) =>
              project.stageDates[s.key] ? (
                <div key={s.key} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)]">{s.label}</p>
                    <p className="text-[13px] text-[var(--text-primary)] tabular-nums">
                      {formatDate(project.stageDates[s.key])}
                    </p>
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Tab: Documents ────────────────────────────── */

function DocumentsTab({ project }: { project: NPDProject }) {
  const allDocs = useMemo(() => {
    const docs: { taskNumber: string; taskName: string; stageKey: string; name: string; url: string }[] = []
    project.tasks.forEach((t) => {
      t.attachments.forEach((a) => {
        docs.push({
          taskNumber: t.taskNumber,
          taskName: t.taskName,
          stageKey: t.stageKey,
          name: a.name,
          url: a.url,
        })
      })
    })
    return docs
  }, [project.tasks])

  if (allDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileText size={40} className="text-[var(--text-tertiary)] mb-3" />
        <p className="text-[14px] text-[var(--text-secondary)] font-medium">No documents yet</p>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
          Attachments added to tasks will appear here.
        </p>
      </div>
    )
  }

  // Group by stage
  const grouped = STAGES.reduce(
    (acc, stage) => {
      const stageDocs = allDocs.filter((d) => d.stageKey === stage.key)
      if (stageDocs.length > 0) acc.push({ stage, docs: stageDocs })
      return acc
    },
    [] as { stage: StageConfig; docs: typeof allDocs }[]
  )

  return (
    <div className="space-y-4">
      {grouped.map(({ stage, docs }) => (
        <div key={stage.key}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
            <h4 className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              {stage.label}
            </h4>
            <span className="text-[11px] text-[var(--text-tertiary)]">({docs.length})</span>
          </div>
          <div className="space-y-1.5">
            {docs.map((doc, i) => (
              <a
                key={i}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors group"
              >
                <FileText size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-[var(--text-primary)] font-medium truncate">{doc.name}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {doc.taskNumber} - {doc.taskName}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────── Tab: Activity Log ─────────────────────────── */

function ActivityLogTab({ project }: { project: NPDProject }) {
  if (project.activityLog.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Clock size={40} className="text-[var(--text-tertiary)] mb-3" />
        <p className="text-[14px] text-[var(--text-secondary)] font-medium">No activity yet</p>
        <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
          Actions on this project will be logged here.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-[var(--border-default)]" />

      <div className="space-y-0">
        {project.activityLog.map((entry, i) => {
          const stageColor = entry.stage ? STAGE_COLOR_MAP[entry.stage] : 'var(--accent)'
          return (
            <div key={i} className="relative flex gap-4 py-3 pl-1">
              {/* Dot */}
              <div
                className="w-3 h-3 rounded-full flex-shrink-0 mt-1 z-10 ring-2 ring-[var(--bg-elevated)]"
                style={{ background: stageColor }}
              />
              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[var(--text-primary)]">
                  <span className="font-semibold">{entry.user}</span>{' '}
                  <span className="text-[var(--text-secondary)]">{entry.action}</span>
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-[var(--text-tertiary)] tabular-nums">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  {entry.stage && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: `${stageColor}18`, color: stageColor }}
                    >
                      {STAGES.find((s) => s.key === entry.stage)?.label || entry.stage}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══════════════════════ Main Component ═════════════════════════════ */

export function NPDProjectDetail({
  open,
  project,
  onClose,
  onTaskUpdate,
  onGateApprove,
  onProjectUpdate,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('checklist')
  const stageRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  if (!open || !project) return null

  const allCountable = project.tasks.filter((t) => t.status !== 'skipped')
  const allCompleted = allCountable.filter((t) => t.status === 'complete').length
  const overallPercent = allCountable.length > 0
    ? Math.round((allCompleted / allCountable.length) * 100)
    : 0

  const activeStage = getActiveStage(project.tasks, project.gateApprovals)

  const launchManager = project.teamAssignments.find(
    (t) => t.role.toLowerCase().includes('launch manager') || t.role.toLowerCase().includes('project manager')
  )

  const scrollToStage = (stageKey: string) => {
    setActiveTab('checklist')
    setTimeout(() => {
      const el = stageRefs.current[stageKey]
      if (el && scrollContainerRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'checklist', label: 'Checklist' },
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity Log' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col min-h-0 bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[960px] h-screen animate-slide-in-right"
      >
        {/* ─── Header ─── */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] space-y-3 flex-shrink-0">
          {/* Row 1: Brand chip + Project Name + Actions */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[var(--accent-secondary-light)] text-[var(--accent-secondary)]">
              {project.brand}
            </span>
            <h2 className="text-lg font-semibold text-[var(--text-primary)] truncate flex-1">
              {project.projectName}
            </h2>
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-ghost">
              <Edit3 size={14} /> Edit
            </button>
            <button className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
              <MoreHorizontal size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Row 2: Meta line */}
          <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
            <span>{project.category}</span>
            <span className="text-[var(--border-strong)]">&#183;</span>
            <span>CM: {project.contractManufacturerId || '--'}</span>
            <span className="text-[var(--border-strong)]">&#183;</span>
            <span>Launch: {formatDate(project.targetLaunchDate)}</span>
          </div>

          {/* Row 3: Manager + Priority + Status */}
          <div className="flex items-center gap-3">
            {launchManager && (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-[var(--accent-light)] flex items-center justify-center text-[var(--accent)] text-[10px] font-semibold">
                  {(launchManager.assignedName || launchManager.defaultName || '?').charAt(0).toUpperCase()}
                </div>
                <span className="text-[13px] text-[var(--text-primary)] font-medium">
                  {launchManager.assignedName || launchManager.defaultName}
                </span>
              </div>
            )}
            <PriorityBadge priority={project.priority} />
            <ProjectStatusBadge status={project.status} />
          </div>

          {/* Row 4: Overall progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[var(--text-secondary)] font-medium">
                Overall Progress
              </span>
              <span className="text-[12px] text-[var(--text-tertiary)] tabular-nums">
                {allCompleted} / {allCountable.length} tasks ({overallPercent}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-[var(--border-default)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${overallPercent}%`,
                  background: 'linear-gradient(90deg, #6366F1, #8B5CF6, #06B6D4, #10B981)',
                }}
              />
            </div>
          </div>

          {/* Row 5: Stage pipeline */}
          <div className="flex items-center gap-1">
            {STAGES.map((stage, idx) => {
              const progress = stageProgress(project.tasks, stage.key)
              const locked = !isStageUnlocked(stage.key, project.tasks, project.gateApprovals)
              const isActive = stage.key === activeStage
              const completed = progress === 100 && (!stage.isGate || isGateApproved(project.gateApprovals, stage.key))

              return (
                <div key={stage.key} className="flex items-center">
                  {idx > 0 && (
                    <div
                      className="w-3 h-px mx-0.5"
                      style={{
                        background: completed ? stage.color : 'var(--border-default)',
                      }}
                    />
                  )}
                  <button
                    onClick={() => scrollToStage(stage.key)}
                    className="relative flex items-center justify-center rounded-full transition-all"
                    style={{
                      width: stage.isGate ? 28 : 32,
                      height: 28,
                      borderRadius: stage.isGate ? '6px' : '14px',
                      background: completed
                        ? stage.color
                        : locked
                          ? 'var(--bg-hover)'
                          : isActive
                            ? `${stage.color}18`
                            : 'var(--bg-surface)',
                      border: isActive && !completed
                        ? `2px solid ${stage.color}`
                        : completed
                          ? 'none'
                          : '1px solid var(--border-default)',
                      boxShadow: isActive && !completed ? `0 0 0 3px ${stage.color}25` : 'none',
                    }}
                    title={stage.label}
                  >
                    {completed ? (
                      <Check size={12} className="text-white" strokeWidth={3} />
                    ) : locked ? (
                      <Lock size={10} className="text-[var(--text-tertiary)]" />
                    ) : (
                      <span
                        className="text-[9px] font-bold"
                        style={{ color: isActive ? stage.color : 'var(--text-tertiary)' }}
                      >
                        {PIPELINE_SHORT[stage.key]}
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ─── Linked Items Row ─── */}
        <div className="px-6 py-2.5 border-b border-[var(--border-subtle)] flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mr-1">
            Linked:
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors">
            <Link2 size={10} /> Brief
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] cursor-pointer transition-colors">
            <Link2 size={10} /> Formulation
          </span>
          {project.contractManufacturerId && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
              <Link2 size={10} /> CM: {project.contractManufacturerId}
            </span>
          )}
        </div>

        {/* ─── Tabs ─── */}
        <div className="px-6 border-b border-[var(--border-subtle)] flex gap-0 flex-shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-[13px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--text-primary)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>

        {/* ─── Scrollable Body ─── */}
        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {activeTab === 'checklist' && (
            <ChecklistTab
              project={project}
              onTaskUpdate={onTaskUpdate}
              onGateApprove={onGateApprove}
              stageRefs={stageRefs}
            />
          )}
          {activeTab === 'overview' && (
            <OverviewTab project={project} onProjectUpdate={onProjectUpdate} />
          )}
          {activeTab === 'documents' && <DocumentsTab project={project} />}
          {activeTab === 'activity' && <ActivityLogTab project={project} />}
        </div>
      </div>
    </div>
  )
}

export default NPDProjectDetail
