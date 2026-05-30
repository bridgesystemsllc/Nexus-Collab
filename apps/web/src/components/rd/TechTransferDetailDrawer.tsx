import { useState, useEffect, useMemo } from 'react'
import {
  X, ChevronRight, ChevronDown, CheckCircle2, Clock, AlertTriangle,
  Play, SkipForward, Lock, Users, FileText, MessageSquare, Plus, Trash2,
} from 'lucide-react'
import { TaskAttachments } from '@/components/shared/TaskAttachments'

// ─── Types ─────────────────────────────────────────────────

interface TechTransferDetailDrawerProps {
  open: boolean
  transfer: any
  onClose: () => void
  onUpdate: (updates: any) => void
}

interface StageTask {
  id: string
  name: string
  assignee: string
  dueDate: string
  status: 'pending' | 'in_progress' | 'complete'
}

interface Stage {
  name: string
  status: 'pending' | 'in_progress' | 'complete' | 'blocked' | 'skipped'
  assignee: string
  startedAt: string | null
  completedAt: string | null
  notes: string
  tasks: StageTask[]
}

type TransferType = 'formula_transfer' | 'packaging_transfer' | 'full_transfer' | 'reformulation'

// ─── Constants ─────────────────────────────────────────────

const DEFAULT_STAGES: Record<TransferType, string[]> = {
  formula_transfer: [
    'Brief Submitted', 'Planning', 'Document Transfer', 'Pilot Batch',
    'Pilot Review', 'Scale-up', 'Validation', 'Complete',
  ],
  packaging_transfer: [
    'Brief Submitted', 'Component Sourcing', 'Pilot Run', 'QC Review', 'Complete',
  ],
  full_transfer: [
    'Brief Submitted', 'Planning', 'Doc Transfer', 'RM Sourcing', 'Pilot Batch',
    'Scale-up', 'Regulatory Review', 'First Production', 'Validation', 'Complete',
  ],
  reformulation: [
    'Brief Submitted', 'Benchmark', 'Formula Development', 'Stability',
    'Pilot Batch', 'Scale-up', 'Validation', 'Complete',
  ],
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  Critical: { bg: 'var(--danger-light)', text: 'var(--danger)' },
  High:     { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Standard: { bg: 'var(--bg-hover)', text: '#6B7280' },
  Low:      { bg: 'var(--bg-hover)', text: '#9CA3AF' },
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  Draft:        { bg: 'var(--bg-hover)', text: '#6B7280' },
  'In Progress': { bg: 'var(--info-light)', text: 'var(--info)' },
  'On Hold':    { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Complete:     { bg: 'var(--success-light)', text: 'var(--success)' },
  Cancelled:    { bg: 'var(--danger-light)', text: 'var(--danger)' },
}

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  formula_transfer: 'Formula Transfer',
  packaging_transfer: 'Packaging Transfer',
  full_transfer: 'Full Transfer',
  reformulation: 'Reformulation',
}

// ─── Helpers ───────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatTimestamp(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014'
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function buildDefaultStages(transferType: string): Stage[] {
  const key = (transferType || 'formula_transfer') as TransferType
  const names = DEFAULT_STAGES[key] || DEFAULT_STAGES.formula_transfer
  return names.map((name, i) => ({
    name,
    status: i === 0 ? 'in_progress' : 'pending',
    assignee: '',
    startedAt: i === 0 ? new Date().toISOString() : null,
    completedAt: null,
    notes: '',
    tasks: [],
  }))
}

function computeProgress(stages: Stage[]): number {
  if (stages.length === 0) return 0
  const completed = stages.filter((s) => s.status === 'complete').length
  return Math.round((completed / stages.length) * 100)
}

// ─── Sub-components ────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 pb-2 mb-3 border-b border-[var(--border-subtle)]">
      <Icon size={15} className="text-[var(--accent)]" />
      <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">{label}</h3>
    </div>
  )
}

function StageStatusIcon({ status, size = 16 }: { status: Stage['status']; size?: number }) {
  switch (status) {
    case 'complete':
      return <CheckCircle2 size={size} className="text-emerald-500" />
    case 'in_progress':
      return <Play size={size} className="text-indigo-500" />
    case 'blocked':
      return <Lock size={size} className="text-rose-500" />
    case 'skipped':
      return <SkipForward size={size} className="text-zinc-400" />
    case 'pending':
    default:
      return (
        <div
          className="rounded-full border-2 border-slate-300"
          style={{ width: size, height: size }}
        />
      )
  }
}

function stageBorderColor(status: Stage['status']): string {
  switch (status) {
    case 'complete': return 'border-l-emerald-500'
    case 'in_progress': return 'border-l-indigo-500'
    case 'blocked': return 'border-l-rose-500'
    case 'skipped': return 'border-l-zinc-400'
    case 'pending':
    default: return 'border-l-slate-300'
  }
}

function stageCardBg(status: Stage['status'], isSelected: boolean): string {
  const base = isSelected ? 'ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg-elevated)]' : ''
  switch (status) {
    case 'complete': return `bg-emerald-500/5 ${base}`
    case 'in_progress': return `bg-indigo-500/5 ${base}`
    case 'blocked': return `bg-rose-500/5 ${base}`
    case 'skipped': return `bg-zinc-500/5 ${base}`
    case 'pending':
    default: return `bg-[var(--bg-surface)] ${base}`
  }
}

function TaskStatusBadge({ status }: { status: StageTask['status'] }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending:     { bg: 'var(--bg-hover)', text: '#6B7280', label: 'Pending' },
    in_progress: { bg: 'var(--info-light)', text: 'var(--info)', label: 'In Progress' },
    complete:    { bg: 'var(--success-light)', text: 'var(--success)', label: 'Done' },
  }
  const conf = map[status] || map.pending
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: conf.bg, color: conf.text }}
    >
      {conf.label}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────

export function TechTransferDetailDrawer({
  open,
  transfer,
  onClose,
  onUpdate,
}: TechTransferDetailDrawerProps) {
  const [stages, setStages] = useState<Stage[]>([])
  const [selectedStageIndex, setSelectedStageIndex] = useState(0)
  const [stageNotes, setStageNotes] = useState('')

  // Initialize stages from transfer data or defaults
  useEffect(() => {
    if (!transfer) return
    if (transfer.stages && transfer.stages.length > 0) {
      setStages(transfer.stages)
    } else {
      setStages(buildDefaultStages(transfer.transferType))
    }
  }, [transfer])

  // Sync notes textarea when stage selection changes
  useEffect(() => {
    if (stages[selectedStageIndex]) {
      setStageNotes(stages[selectedStageIndex].notes || '')
    }
  }, [selectedStageIndex, stages])

  // Escape key handler
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  const progress = useMemo(() => computeProgress(stages), [stages])

  const activeStageIndex = useMemo(
    () => stages.findIndex((s) => s.status === 'in_progress'),
    [stages],
  )

  const selectedStage = stages[selectedStageIndex] || null

  // ── Stage Completion Logic ──────────────────────────────

  function markStageComplete(stageIndex: number) {
    const updated = [...stages]
    const now = new Date().toISOString()

    // Complete current stage
    updated[stageIndex] = {
      ...updated[stageIndex],
      status: 'complete',
      completedAt: now,
      notes: stageIndex === selectedStageIndex ? stageNotes : updated[stageIndex].notes,
    }

    // Activate next stage if available
    const nextIndex = stageIndex + 1
    if (nextIndex < updated.length && updated[nextIndex].status === 'pending') {
      updated[nextIndex] = {
        ...updated[nextIndex],
        status: 'in_progress',
        startedAt: now,
      }
    }

    setStages(updated)

    // Compute overall status
    const allComplete = updated.every((s) => s.status === 'complete' || s.status === 'skipped')
    const newProgress = computeProgress(updated)

    onUpdate({
      stages: updated,
      progress: newProgress,
      ...(allComplete ? { status: 'Complete' } : {}),
    })

    // Move selection to next stage if it exists
    if (nextIndex < updated.length) {
      setSelectedStageIndex(nextIndex)
    }
  }

  function handleAdvanceStage() {
    if (activeStageIndex >= 0) {
      markStageComplete(activeStageIndex)
    }
  }

  // ── Stage Notes ─────────────────────────────────────────

  function handleNotesBlur() {
    if (!selectedStage) return
    if (stageNotes === selectedStage.notes) return
    const updated = [...stages]
    updated[selectedStageIndex] = { ...updated[selectedStageIndex], notes: stageNotes }
    setStages(updated)
    onUpdate({ stages: updated })
  }

  // ── Sub-task Management ─────────────────────────────────

  function addTask() {
    if (!selectedStage) return
    const newTask: StageTask = {
      id: generateId(),
      name: '',
      assignee: '',
      dueDate: '',
      status: 'pending',
    }
    const updated = [...stages]
    updated[selectedStageIndex] = {
      ...updated[selectedStageIndex],
      tasks: [...(updated[selectedStageIndex].tasks || []), newTask],
    }
    setStages(updated)
    onUpdate({ stages: updated })
  }

  function updateTask(taskIndex: number, patch: Partial<StageTask>) {
    const updated = [...stages]
    const tasks = [...(updated[selectedStageIndex].tasks || [])]
    tasks[taskIndex] = { ...tasks[taskIndex], ...patch }
    updated[selectedStageIndex] = { ...updated[selectedStageIndex], tasks }
    setStages(updated)
    onUpdate({ stages: updated })
  }

  function toggleTaskStatus(taskIndex: number) {
    const task = selectedStage?.tasks?.[taskIndex]
    if (!task) return
    const nextStatus = task.status === 'complete' ? 'pending' : 'complete'
    updateTask(taskIndex, { status: nextStatus })
  }

  function removeTask(taskIndex: number) {
    const updated = [...stages]
    const tasks = [...(updated[selectedStageIndex].tasks || [])]
    tasks.splice(taskIndex, 1)
    updated[selectedStageIndex] = { ...updated[selectedStageIndex], tasks }
    setStages(updated)
    onUpdate({ stages: updated })
  }

  // ── Render ──────────────────────────────────────────────

  if (!open || !transfer) return null

  const transferTypeLabel = TRANSFER_TYPE_LABELS[transfer.transferType] || transfer.transferType || 'Transfer'
  const priorityColors = PRIORITY_COLORS[transfer.priority] || PRIORITY_COLORS.Standard
  const statusColors = STATUS_COLORS[transfer.status] || STATUS_COLORS.Draft

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 flex flex-col bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl w-full max-w-[760px] animate-slide-in-right"
        style={{ height: '100vh' }}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] space-y-3">
          {/* Top row: title + close */}
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-[var(--text-primary)] truncate">
                {transfer.product || transfer.productName || 'Untitled Transfer'}
              </h2>

              {/* Pills row */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
                >
                  {transferTypeLabel}
                </span>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: priorityColors.bg, color: priorityColors.text }}
                >
                  {transfer.priority || 'Standard'}
                </span>
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ background: statusColors.bg, color: statusColors.text }}
                >
                  {transfer.status || 'Draft'}
                </span>
              </div>

              {/* Sub-line */}
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">
                {transfer.fromCM || '\u2014'} <span className="mx-1">&rarr;</span> {transfer.toCM || '\u2014'}
                {transfer.requesterName && (
                  <> &middot; Requester: <span className="text-[var(--text-secondary)] font-medium">{transfer.requesterName}</span></>
                )}
                {(transfer.targetCompletionDate || transfer.targetDate) && (
                  <> &middot; Target: <span className="text-[var(--text-secondary)] font-medium">{formatDate(transfer.targetCompletionDate || transfer.targetDate)}</span></>
                )}
              </p>

              {/* Linked brief chip */}
              {(transfer.linkedBriefId || transfer.linkedBriefName) && (
                <div className="mt-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/20 bg-[var(--accent-subtle)] cursor-pointer hover:bg-[var(--accent)]/10 transition-colors">
                    <FileText size={13} className="text-[var(--accent)]" />
                    <span className="text-[12px] font-medium text-[var(--accent)]">
                      {transfer.linkedBriefName || 'Linked Brief'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 ml-4 shrink-0">
              <button
                onClick={handleAdvanceStage}
                disabled={activeStageIndex < 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} /> Advance Stage
              </button>
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium btn-secondary">
                Edit
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Full-width progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Progress
              </span>
              <span className="text-[11px] font-bold text-[var(--text-secondary)] tabular-nums">
                {progress}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--bg-hover)] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress}%`,
                  background: progress === 100
                    ? 'var(--success)'
                    : 'linear-gradient(90deg, var(--accent), #818cf8)',
                }}
              />
            </div>
          </div>
        </div>

        {/* ── Scrollable Body ─────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Section 1: Stage Pipeline (horizontal strip) */}
          <div>
            <SectionHeader icon={ChevronRight} label="Stage Pipeline" />
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {stages.map((stage, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedStageIndex(i)}
                  className={`
                    flex-shrink-0 w-[140px] rounded-xl border border-[var(--border-default)] p-4
                    border-l-[3px] ${stageBorderColor(stage.status)}
                    ${stageCardBg(stage.status, i === selectedStageIndex)}
                    text-left transition-all hover:border-[var(--border-default)] hover:shadow-sm
                    cursor-pointer
                  `}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold text-[var(--text-tertiary)] tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <StageStatusIcon status={stage.status} size={14} />
                  </div>
                  <p className="text-[12px] font-semibold text-[var(--text-primary)] leading-tight mb-1.5 line-clamp-2">
                    {stage.name}
                  </p>
                  {stage.status === 'complete' && stage.completedAt && (
                    <p className="text-[10px] text-emerald-600 font-medium">
                      Completed {formatDate(stage.completedAt)}
                    </p>
                  )}
                  {stage.status === 'in_progress' && (
                    <p className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wider">
                      Active
                    </p>
                  )}
                  {stage.status === 'blocked' && (
                    <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                      Blocked
                    </p>
                  )}
                  {stage.status === 'skipped' && (
                    <p className="text-[10px] text-zinc-400 font-medium">
                      Skipped
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 2: Stage Detail (expanded) */}
          {selectedStage && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
                    {selectedStage.name}
                  </h3>
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                    style={{
                      background:
                        selectedStage.status === 'complete' ? 'var(--success-light)'
                          : selectedStage.status === 'in_progress' ? 'var(--info-light)'
                            : selectedStage.status === 'blocked' ? 'var(--danger-light)'
                              : 'var(--bg-hover)',
                      color:
                        selectedStage.status === 'complete' ? 'var(--success)'
                          : selectedStage.status === 'in_progress' ? 'var(--info)'
                            : selectedStage.status === 'blocked' ? 'var(--danger)'
                              : '#6B7280',
                    }}
                  >
                    <StageStatusIcon status={selectedStage.status} size={12} />
                    {selectedStage.status === 'complete' ? 'Complete'
                      : selectedStage.status === 'in_progress' ? 'In Progress'
                        : selectedStage.status === 'blocked' ? 'Blocked'
                          : selectedStage.status === 'skipped' ? 'Skipped'
                            : 'Pending'}
                  </span>
                </div>
                {selectedStage.status === 'in_progress' && (
                  <button
                    onClick={() => markStageComplete(selectedStageIndex)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                  >
                    <CheckCircle2 size={13} /> Mark Complete
                  </button>
                )}
              </div>

              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-4">
                {/* Assignee */}
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 font-medium">Assignee</p>
                  <p className="text-[14px] text-[var(--text-primary)]">
                    {selectedStage.assignee || '\u2014'}
                  </p>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 font-medium">Started</p>
                    <p className="text-[13px] text-[var(--text-primary)] tabular-nums">
                      {formatTimestamp(selectedStage.startedAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 font-medium">Completed</p>
                    <p className="text-[13px] text-[var(--text-primary)] tabular-nums">
                      {formatTimestamp(selectedStage.completedAt)}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider mb-1 font-medium">Notes</p>
                  <textarea
                    value={stageNotes}
                    onChange={(e) => setStageNotes(e.target.value)}
                    onBlur={handleNotesBlur}
                    className="w-full px-3 py-2 rounded-lg text-[13px] text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)] transition-colors resize-none"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-subtle)' }}
                    rows={3}
                    placeholder="Stage notes..."
                  />
                </div>

                {/* Sub-tasks checklist */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
                      Sub-tasks
                      {(selectedStage.tasks?.length || 0) > 0 && (
                        <span className="ml-1 text-[var(--text-secondary)]">
                          ({selectedStage.tasks.filter((t) => t.status === 'complete').length}/{selectedStage.tasks.length})
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    {(selectedStage.tasks || []).map((task, ti) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] transition-colors group"
                      >
                        {/* Checkbox */}
                        <button
                          onClick={() => toggleTaskStatus(ti)}
                          className="flex-shrink-0"
                        >
                          {task.status === 'complete' ? (
                            <CheckCircle2 size={16} className="text-[var(--success)]" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-[var(--accent)] transition-colors" />
                          )}
                        </button>

                        {/* Task name (editable) */}
                        <input
                          value={task.name}
                          onChange={(e) => updateTask(ti, { name: e.target.value })}
                          className={`flex-1 min-w-0 text-[13px] bg-transparent outline-none ${
                            task.status === 'complete'
                              ? 'text-[var(--text-tertiary)] line-through'
                              : 'text-[var(--text-primary)]'
                          }`}
                          placeholder="Task name..."
                        />

                        {/* Assignee */}
                        <input
                          value={task.assignee}
                          onChange={(e) => updateTask(ti, { assignee: e.target.value })}
                          className="w-[100px] text-[11px] text-[var(--text-secondary)] bg-transparent outline-none text-right"
                          placeholder="Assignee"
                        />

                        {/* Due date */}
                        <input
                          type="date"
                          value={task.dueDate}
                          onChange={(e) => updateTask(ti, { dueDate: e.target.value })}
                          className="text-[11px] text-[var(--text-tertiary)] bg-transparent outline-none cursor-pointer"
                        />

                        {/* Status badge */}
                        <TaskStatusBadge status={task.status} />

                        {/* Delete */}
                        <button
                          onClick={() => removeTask(ti)}
                          className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] transition-all"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={addTask}
                    className="flex items-center gap-1.5 mt-2 px-3 py-2 rounded-lg text-[12px] font-medium text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors w-full"
                  >
                    <Plus size={13} /> Add task
                  </button>
                </div>

                {/* Stage Attachments */}
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <TaskAttachments
                    taskId={selectedStage.id || `stage-${selectedStageIndex}`}
                    module="tech_transfer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Transfer-Level Attachments */}
          <div>
            <SectionHeader icon={FileText} label="Transfer Attachments" />
            <TaskAttachments
              taskId={transfer.id || 'unknown'}
              module="tech_transfer"
            />
          </div>

          {/* Section 4: Activity Log */}
          <div>
            <SectionHeader icon={MessageSquare} label="Activity Log" />
            {transfer.activityLog && transfer.activityLog.length > 0 ? (
              <div className="space-y-0">
                {transfer.activityLog.map((entry: any, i: number) => (
                  <div key={i} className="flex gap-3 py-2.5">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] flex items-center justify-center text-[11px] font-bold text-[var(--accent)] flex-shrink-0">
                        {entry.authorInitial || entry.author?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      {i < transfer.activityLog.length - 1 && (
                        <div className="w-px flex-1 bg-[var(--border-subtle)] mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-2">
                      <p className="text-[13px] text-[var(--text-primary)]">
                        <span className="font-medium">{entry.author || 'System'}</span>{' '}
                        <span className="text-[var(--text-secondary)]">{entry.action}</span>
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                        {entry.timestamp || formatTimestamp(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : transfer.notes ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                <p className="text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {transfer.notes}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
                No activity logged yet.
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
