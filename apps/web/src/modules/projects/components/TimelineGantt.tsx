import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Diamond, Loader2, ZoomIn } from 'lucide-react'
import { buildScale, type ZoomLevel } from '../lib/ganttScale'
import { computeRipple, describeRipple, type RippleResult } from '../lib/ripple'
import { useUpdateTask } from '../hooks/useProjects'
import { formatDate } from './ProjectCard'
import type { ProjectTask } from '../types'

// ─── Gantt ───────────────────────────────────────────────────
// Rows grouped by phase, coloured by department. Each bar carries a baseline
// ghost underneath so slip is visible at a glance rather than needing a date
// comparison. Critical-path tasks are outlined in the accent.
//
// Dragging a bar does NOT write immediately. It computes the dependency
// cascade first and shows exactly what will move, because discovering after
// the fact that a drag shifted eleven downstream tasks is what makes people
// stop trusting a schedule.

interface TimelineData {
  project: {
    id: string
    startDate?: string | null
    targetEndDate?: string | null
    baselineEndDate?: string | null
    slipDays: number
  }
  phases: {
    id: string; name: string; sequence: number; status: string
    startDate?: string | null; endDate?: string | null
    baselineStart?: string | null; baselineEnd?: string | null
    slipDays: number
    department?: { id: string; name: string; color?: string | null } | null
  }[]
  milestones: {
    id: string; name: string; dueDate: string; baselineDate?: string | null
    completedDate?: string | null; isGate: boolean; status: string
    slipDays: number; isOverdue: boolean
    department?: { id: string; name: string; color?: string | null } | null
  }[]
  tasks: ProjectTask[]
  dependencies: { id: string; predecessorId: string; successorId: string; dependencyType: string; lagDays: number }[]
}

const ROW_H = 30
const LABEL_W = 260
// Milestones get their own rail rather than being overlaid on the first row,
// where a diamond would otherwise sit on top of whatever bar happened to be
// at the top of the chart.
const RAIL_H = 22

export function TimelineGantt({
  data, canReschedule, isLoading,
}: { data?: TimelineData; canReschedule: boolean; isLoading?: boolean }) {
  const [zoom, setZoom] = useState<ZoomLevel>('month')
  const [drag, setDrag] = useState<{ taskId: string; startX: number; deltaDays: number } | null>(null)
  const [preview, setPreview] = useState<{ taskId: string; delta: number; ripple: RippleResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const updateTask = useUpdateTask()

  const tasks = data?.tasks ?? []
  const phases = data?.phases ?? []
  const milestones = data?.milestones ?? []
  const deps = data?.dependencies ?? []

  const scale = useMemo(() => {
    const dates: (string | null | undefined)[] = []
    for (const t of tasks) { dates.push(t.startDate, t.dueDate) }
    for (const p of phases) { dates.push(p.startDate, p.endDate, p.baselineStart, p.baselineEnd) }
    for (const m of milestones) { dates.push(m.dueDate, m.baselineDate) }
    dates.push(data?.project.startDate, data?.project.targetEndDate, data?.project.baselineEndDate)
    return buildScale(dates, zoom)
  }, [tasks, phases, milestones, data?.project, zoom])

  // Rows: each phase followed by its tasks, then anything unphased. Grouping
  // by phase is what turns a flat task list into a readable plan.
  const rows = useMemo(() => {
    const out: ({ kind: 'phase'; phase: TimelineData['phases'][number] } | { kind: 'task'; task: ProjectTask })[] = []
    const ordered = [...phases].sort((a, b) => a.sequence - b.sequence)
    const claimed = new Set<string>()

    for (const phase of ordered) {
      out.push({ kind: 'phase', phase })
      for (const t of tasks.filter((x) => x.phaseId === phase.id)) {
        out.push({ kind: 'task', task: t }); claimed.add(t.id)
      }
    }
    const orphans = tasks.filter((t) => !claimed.has(t.id))
    for (const t of orphans) out.push({ kind: 'task', task: t })
    return out
  }, [phases, tasks])

  const onDragMove = (e: React.MouseEvent) => {
    if (!drag) return
    const deltaDays = scale.daysForPixels(e.clientX - drag.startX)
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays })
  }

  const onDragEnd = () => {
    if (!drag) return
    const { taskId, deltaDays } = drag
    setDrag(null)
    if (deltaDays === 0) return

    const ripple = computeRipple(
      tasks.map((t) => ({
        id: t.id, title: t.title, taskNumber: t.taskNumber,
        startDate: t.startDate, dueDate: t.dueDate, departmentId: t.departmentId,
      })),
      deps,
      taskId,
      deltaDays,
    )

    if (ripple.aborted) {
      setError('That dependency chain loops back on itself. Nothing was changed.')
      return
    }
    // Always confirm — even a clean move — so the write is never a surprise.
    setPreview({ taskId, delta: deltaDays, ripple })
  }

  const commit = async () => {
    if (!preview) return
    setError(null)
    const shifts = preview.ripple.shifts
    try {
      // Applied sequentially rather than in parallel: each write triggers a
      // debounced recompute server-side, and a burst would just contend.
      for (const s of shifts) {
        await updateTask.mutateAsync({
          taskId: s.id,
          body: {
            ...(s.toStart ? { startDate: s.toStart.toISOString().slice(0, 10) } : {}),
            ...(s.toDue ? { dueDate: s.toDue.toISOString().slice(0, 10) } : {}),
          },
        })
      }
      setPreview(null)
    } catch (err: any) {
      setError(err?.message ?? 'Could not apply the reschedule')
      setPreview(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-16 justify-center text-sm text-[var(--text-tertiary)]">
        <Loader2 size={15} className="animate-spin" /> Loading timeline…
      </div>
    )
  }

  if (rows.length === 0 && milestones.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-16 text-center">
        <ZoomIn size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
        <p className="text-sm text-[var(--text-secondary)]">Nothing scheduled yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Add phases, milestones or dated tasks and they will appear here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
          <Legend swatch="var(--accent-secondary)" label="Critical path" outline />
          <Legend swatch="var(--border-strong)" label="Baseline" ghost />
          <span className="inline-flex items-center gap-1">
            <Diamond size={9} className="text-[var(--text-secondary)]" /> Milestone
          </span>
        </div>
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          {(['week', 'month', 'quarter'] as ZoomLevel[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                zoom === z
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: 'rgba(255,69,58,0.08)' }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
          <span className="flex-1 text-[var(--text-primary)]">{error}</span>
          <button onClick={() => setError(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">Dismiss</button>
        </div>
      )}

      <div
        className="rounded-xl border border-[var(--border-subtle)] overflow-hidden select-none"
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onMouseLeave={() => drag && onDragEnd()}
      >
        <div className="flex">
          {/* Sticky labels */}
          <div className="shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)]" style={{ width: LABEL_W }}>
            <div className="h-9 border-b border-[var(--border-subtle)] flex items-center px-3">
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                {rows.length} rows
              </span>
            </div>
            <div
              className="flex items-center px-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              style={{ height: RAIL_H }}
            >
              <span className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
                Milestones
              </span>
            </div>
            {rows.map((row, i) => (
              <div
                key={row.kind === 'phase' ? `p-${row.phase.id}` : `t-${row.task.id}`}
                className={`flex items-center px-3 border-b border-[var(--border-subtle)] ${
                  row.kind === 'phase' ? 'bg-[var(--bg-overlay)]' : ''
                }`}
                style={{ height: ROW_H }}
              >
                {row.kind === 'phase' ? (
                  <span className="text-[11px] font-semibold text-[var(--text-primary)] truncate">
                    {row.phase.name}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 min-w-0 pl-2">
                    <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0">
                      #{row.task.taskNumber ?? '–'}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] truncate">{row.task.title}</span>
                  </span>
                )}
                {i === 0 && null}
              </div>
            ))}
          </div>

          {/* Chart */}
          <div ref={scrollRef} className="flex-1 overflow-x-auto">
            <div style={{ width: scale.width, minWidth: '100%' }} className="relative">
              {/* Axis */}
              <div className="h-9 border-b border-[var(--border-subtle)] relative bg-[var(--bg-surface)]">
                {scale.ticks.map((t) => (
                  <span
                    key={t.date.toISOString()}
                    className={`absolute top-0 h-full flex items-center pl-1 whitespace-nowrap ${
                      t.major ? 'text-[var(--text-secondary)] font-medium' : 'text-[var(--text-tertiary)]'
                    }`}
                    style={{ left: t.x, fontSize: 10 }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>

              {/* Grid + today */}
              <div className="absolute inset-0 top-9 pointer-events-none">
                {scale.ticks.map((t) => (
                  <div
                    key={`g-${t.date.toISOString()}`}
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: t.x, background: t.major ? 'var(--border-default)' : 'var(--border-subtle)' }}
                  />
                ))}
                {scale.todayX !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-px z-10"
                    style={{ left: scale.todayX, background: 'var(--danger)', opacity: 0.55 }}
                    title="Today"
                  />
                )}
              </div>

              {/* Milestone rail */}
              <div
                className="relative border-b border-[var(--border-subtle)]"
                style={{ height: RAIL_H }}
              >
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className="absolute"
                    style={{ left: scale.xFor(m.dueDate) - 5, top: RAIL_H / 2 - 5 }}
                    title={
                      `${m.isGate ? 'GATE — ' : ''}${m.name}\nDue ${formatDate(m.dueDate)}` +
                      (m.slipDays > 0 ? `\n${m.slipDays}d past baseline` : '') +
                      (m.isOverdue ? '\nOVERDUE' : '')
                    }
                  >
                    <span
                      className="block"
                      style={{
                        width: 10, height: 10,
                        transform: 'rotate(45deg)',
                        background:
                          m.status === 'COMPLETE' ? 'var(--success)'
                          : m.isOverdue ? 'var(--danger)'
                          : m.isGate ? 'var(--accent-secondary)'
                          : 'var(--text-tertiary)',
                        // A gate reads heavier than an ordinary milestone,
                        // because missing one blocks everything downstream.
                        boxShadow: m.isGate ? '0 0 0 2px var(--bg-elevated), 0 0 0 3.5px var(--accent-secondary)' : undefined,
                      }}
                    />
                  </div>
                ))}
                {/* Baseline ghost markers show where a milestone was promised. */}
                {milestones.filter((m) => m.slipDays > 0 && m.baselineDate).map((m) => (
                  <span
                    key={`b-${m.id}`}
                    className="absolute"
                    style={{
                      left: scale.xFor(m.baselineDate) - 3, top: RAIL_H / 2 - 3,
                      width: 6, height: 6, transform: 'rotate(45deg)',
                      background: 'var(--border-strong)', opacity: 0.6,
                    }}
                    title={`${m.name} was baselined for ${formatDate(m.baselineDate)}`}
                  />
                ))}
              </div>

              {/* Rows */}
              <div className="relative">
                {rows.map((row) => {
                  if (row.kind === 'phase') {
                    const p = row.phase
                    const color = p.department?.color ?? 'var(--text-tertiary)'
                    return (
                      <div key={`p-${p.id}`} className="relative border-b border-[var(--border-subtle)] bg-[var(--bg-overlay)]" style={{ height: ROW_H }}>
                        {p.baselineStart && p.baselineEnd && (
                          <div
                            className="absolute rounded"
                            style={{
                              left: scale.xFor(p.baselineStart),
                              width: scale.widthFor(p.baselineStart, p.baselineEnd),
                              top: ROW_H - 9, height: 4,
                              background: 'var(--border-strong)', opacity: 0.5,
                            }}
                            title={`Baseline: ${formatDate(p.baselineStart)} – ${formatDate(p.baselineEnd)}`}
                          />
                        )}
                        {(p.startDate || p.endDate) && (
                          <div
                            className="absolute rounded"
                            style={{
                              left: scale.xFor(p.startDate ?? p.endDate),
                              width: scale.widthFor(p.startDate, p.endDate),
                              top: 7, height: 9,
                              background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                            }}
                            title={`${p.name}${p.slipDays > 0 ? ` — ${p.slipDays}d past baseline` : ''}`}
                          />
                        )}
                      </div>
                    )
                  }

                  const t = row.task
                  const isDragging = drag?.taskId === t.id
                  const dragOffset = isDragging ? drag.deltaDays * scale.dayWidth : 0
                  const color = t.department?.color ?? 'var(--accent-secondary)'
                  const done = t.status === 'COMPLETE'

                  return (
                    <div key={`t-${t.id}`} className="relative border-b border-[var(--border-subtle)]" style={{ height: ROW_H }}>
                      {(t.startDate || t.dueDate) && (
                        <div
                          onMouseDown={(e) => {
                            if (!canReschedule) return
                            e.preventDefault()
                            setDrag({ taskId: t.id, startX: e.clientX, deltaDays: 0 })
                          }}
                          className={`absolute rounded transition-shadow ${
                            canReschedule ? 'cursor-ew-resize' : ''
                          } ${isDragging ? 'shadow-lg z-20' : ''}`}
                          style={{
                            left: scale.xFor(t.startDate ?? t.dueDate) + dragOffset,
                            width: scale.widthFor(t.startDate, t.dueDate),
                            top: 8, height: 14,
                            background: done ? `${color}55` : `linear-gradient(90deg, ${color}, ${color}cc)`,
                            outline: t.isCriticalPath ? '1.5px solid var(--accent-secondary)' : undefined,
                            outlineOffset: 1,
                            opacity: isDragging ? 0.85 : 1,
                          }}
                          title={
                            `${t.title}\n${formatDate(t.startDate)} – ${formatDate(t.dueDate)}` +
                            (t.isCriticalPath ? '\nOn the critical path' : '') +
                            (t.floatDays != null && !t.isCriticalPath ? `\n${t.floatDays}d float` : '') +
                            (canReschedule ? '\nDrag to reschedule' : '')
                          }
                        />
                      )}
                      {t.isOverdue && (
                        <span
                          className="absolute w-1.5 h-1.5 rounded-full"
                          style={{ left: scale.xFor(t.dueDate) - 3, top: ROW_H / 2 - 3, background: 'var(--danger)' }}
                          title="Overdue"
                        />
                      )}
                    </div>
                  )
                })}

              </div>
            </div>
          </div>
        </div>
      </div>

      {preview && (
        <RipplePreview
          preview={preview}
          onCancel={() => setPreview(null)}
          onConfirm={commit}
          pending={updateTask.isPending}
        />
      )}
    </div>
  )
}

function Legend({ swatch, label, outline, ghost }: { swatch: string; label: string; outline?: boolean; ghost?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block rounded"
        style={{
          width: 14, height: ghost ? 4 : 8,
          background: outline ? 'transparent' : swatch,
          outline: outline ? `1.5px solid ${swatch}` : undefined,
          opacity: ghost ? 0.5 : 1,
        }}
      />
      {label}
    </span>
  )
}

// The confirmation gate. Shown for every drag, including one that moves
// nothing downstream, so applying a schedule change is always deliberate.
function RipplePreview({
  preview, onCancel, onConfirm, pending,
}: {
  preview: { taskId: string; delta: number; ripple: RippleResult }
  onCancel: () => void
  onConfirm: () => void
  pending: boolean
}) {
  const origin = preview.ripple.shifts.find((s) => s.isOrigin)
  const affected = preview.ripple.affected

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label="Confirm reschedule"
      >
        <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Confirm reschedule</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{describeRipple(preview.ripple)}</p>
        </div>

        <div className="px-5 py-4 max-h-72 overflow-y-auto space-y-2">
          {origin && (
            <ShiftRow shift={origin} emphasis />
          )}
          {affected.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)] pt-2">
                Downstream
              </p>
              {affected.map((s) => <ShiftRow key={s.id} shift={s} />)}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[var(--border-subtle)]">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{ background: 'var(--accent-secondary)' }}
          >
            {pending ? 'Applying…' : `Apply to ${preview.ripple.shifts.length} task${preview.ripple.shifts.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function ShiftRow({ shift, emphasis }: { shift: RippleResult['shifts'][number]; emphasis?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-xs ${emphasis ? 'font-medium' : ''}`}>
      <span className="min-w-0 flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">#{shift.taskNumber ?? '–'}</span>
        <span className="truncate text-[var(--text-primary)]">{shift.title}</span>
      </span>
      <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
        {formatDate(shift.fromStart?.toISOString())} →{' '}
        <span style={{ color: shift.shiftDays > 0 ? 'var(--warning)' : 'var(--success)' }}>
          {formatDate(shift.toStart?.toISOString())}
        </span>
      </span>
    </div>
  )
}
