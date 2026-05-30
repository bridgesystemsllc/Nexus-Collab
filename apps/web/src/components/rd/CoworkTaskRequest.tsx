// ─── Co-Work Task Request Component ───────────────────────
// Embeddable in any R&D module detail view.
// Shows pending cowork tasks and allows creating new ones.

import { useState, useRef, useEffect } from 'react'
import {
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  User,
  Calendar,
  Link2,
  RefreshCw,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useCoworkSpaces } from '@/hooks/useData'

// ─── Types ─────────────────────────────────────────────────

export interface CoworkTaskRef {
  id: string
  title: string
  assignee: string
  status: string
  dueDate: string
  coworkSpaceId: string
}

type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

// ─── Helpers ───────────────────────────────────────────────

function statusStyle(status: string): { bg: string; text: string } {
  switch (status?.toUpperCase()) {
    case 'DONE':
    case 'COMPLETE':
    case 'COMPLETED':
      return { bg: 'var(--success-light)', text: 'var(--success)' }
    case 'IN_PROGRESS':
    case 'IN PROGRESS':
      return { bg: 'var(--info-light)', text: 'var(--info)' }
    case 'BLOCKED':
      return { bg: 'var(--danger-light)', text: 'var(--danger)' }
    default:
      return { bg: 'var(--warning-light)', text: 'var(--warning)' }
  }
}

function priorityStyle(priority: Priority): { bg: string; text: string } {
  switch (priority) {
    case 'CRITICAL':
      return { bg: 'var(--danger-light)', text: 'var(--danger)' }
    case 'HIGH':
      return { bg: 'var(--warning-light)', text: 'var(--warning)' }
    case 'MEDIUM':
      return { bg: 'var(--info-light)', text: 'var(--info)' }
    case 'LOW':
      return { bg: 'var(--bg-hover)', text: 'var(--text-tertiary)' }
  }
}

function isComplete(status: string): boolean {
  const s = status?.toUpperCase()
  return s === 'DONE' || s === 'COMPLETE' || s === 'COMPLETED'
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Component 1: CoworkTaskBadge ─────────────────────────
// Small inline badge showing pending cowork tasks count.
// Clicking expands a dropdown with task details.

export function CoworkTaskBadge({ tasks }: { tasks: CoworkTaskRef[] }) {
  const [expanded, setExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const pending = (tasks ?? []).filter((t) => !isComplete(t.status))
  if (pending.length === 0) return null

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    if (expanded) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [expanded])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Pill badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 10px',
          borderRadius: 999,
          background: 'var(--warning-light)',
          color: 'var(--warning)',
          border: 'none',
          cursor: 'pointer',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
        }}
      >
        <Clock size={12} />
        {pending.length} pending task{pending.length !== 1 ? 's' : ''}
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Dropdown */}
      {expanded && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 50,
            minWidth: 320,
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,.12)',
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.04em',
              color: 'var(--text-tertiary)',
              marginBottom: 8,
            }}
          >
            Pending Co-Work Tasks
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {t.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)' }}>
                    <User size={11} /> {t.assignee || 'Unassigned'}
                  </span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: statusStyle(t.status).bg,
                      color: statusStyle(t.status).text,
                    }}
                  >
                    {t.status}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-tertiary)' }}>
                    <Calendar size={11} /> {formatDate(t.dueDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component 2: CreateCoworkTaskModal ───────────────────
// Modal for creating a cowork task linked to an R&D item.

interface CreateCoworkTaskModalProps {
  open: boolean
  onClose: () => void
  onCreated: (task: CoworkTaskRef) => void
  itemName: string
  itemType: string
  linkedItemId: string
}

export function CreateCoworkTaskModal({
  open,
  onClose,
  onCreated,
  itemName,
  itemType,
  linkedItemId,
}: CreateCoworkTaskModalProps) {
  const { data: spaces } = useCoworkSpaces()

  const [title, setTitle] = useState(`Complete review for ${itemName}`)
  const [description, setDescription] = useState('')
  const [assignTo, setAssignTo] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [spaceMode, setSpaceMode] = useState<'new' | 'existing'>('new')
  const [selectedSpaceId, setSelectedSpaceId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setTitle(`Complete review for ${itemName}`)
      setDescription('')
      setAssignTo('')
      setPriority('MEDIUM')
      setDueDate('')
      setSpaceMode('new')
      setSelectedSpaceId('')
      setReason('')
      setError('')
    }
  }, [open, itemName])

  if (!open) return null

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Task title is required')
      return
    }
    setSubmitting(true)
    setError('')

    try {
      let spaceId: string

      if (spaceMode === 'new') {
        const spaceName = `${itemType}: ${itemName}`
        const space = await api.post('/cowork', {
          name: spaceName,
          type: 'INITIATIVE',
          description: `Co-work space for R&D item: ${itemName}`,
          memberIds: [],
        })
        spaceId = space.data.id
      } else {
        spaceId = selectedSpaceId
        if (!spaceId) {
          setError('Please select a co-work space')
          setSubmitting(false)
          return
        }
      }

      const taskPayload: Record<string, any> = {
        title: title.trim(),
        description: [description, reason ? `\n\n---\nContext: ${reason}` : ''].join(''),
        priority,
        dueDate: dueDate || null,
        ownerId: null,
        metadata: { linkedItemId, itemType, itemName },
      }

      const taskRes = await api.post(`/cowork/${spaceId}/tasks`, taskPayload)
      const task = taskRes.data

      onCreated({
        id: task.id,
        title: task.title,
        assignee: assignTo || 'Unassigned',
        status: task.status ?? 'PENDING',
        dueDate: task.dueDate ?? dueDate,
        coworkSpaceId: spaceId,
      })

      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to create task')
    } finally {
      setSubmitting(false)
    }
  }

  const spaceList = Array.isArray(spaces) ? spaces : spaces?.data ?? []

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.45)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,.2)',
          padding: 28,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Request Co-Work Task
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
              Create a task linked to <strong>{itemName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Task Title */}
          <Field label="Task Title *">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Complete formulation review for Product X"
              style={inputStyle}
            />
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          {/* Row: Assign To + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Assign To">
              <input
                type="text"
                value={assignTo}
                onChange={(e) => setAssignTo(e.target.value)}
                placeholder="Name or email"
                style={inputStyle}
              />
            </Field>
            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                style={inputStyle}
              >
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </Field>
          </div>

          {/* Due Date */}
          <Field label="Due Date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={inputStyle}
            />
          </Field>

          {/* Co-Work Space */}
          <Field label="Co-Work Space">
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button
                onClick={() => setSpaceMode('new')}
                style={{
                  ...pillButtonStyle,
                  ...(spaceMode === 'new' ? pillActiveStyle : {}),
                }}
              >
                <Plus size={12} /> Create New Space
              </button>
              <button
                onClick={() => setSpaceMode('existing')}
                style={{
                  ...pillButtonStyle,
                  ...(spaceMode === 'existing' ? pillActiveStyle : {}),
                }}
              >
                <Link2 size={12} /> Existing Space
              </button>
            </div>
            {spaceMode === 'new' ? (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                }}
              >
                A new space will be created: <strong>{itemType}: {itemName}</strong>
              </div>
            ) : (
              <select
                value={selectedSpaceId}
                onChange={(e) => setSelectedSpaceId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a space...</option>
                {spaceList.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* Reason / Context */}
          <Field label="Reason / Context">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this task needed? What's blocking the status change?"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
          }}
        >
          <button onClick={onClose} style={secondaryBtnStyle} disabled={submitting}>
            Cancel
          </button>
          <button onClick={handleSubmit} style={primaryBtnStyle} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Component 3: CoworkTasksPanel ────────────────────────
// Expandable section for a detail view showing all linked cowork tasks.

interface CoworkTasksPanelProps {
  tasks: CoworkTaskRef[]
  onCreateTask: () => void
  onRefresh: () => void
}

export function CoworkTasksPanel({ tasks, onCreateTask, onRefresh }: CoworkTasksPanelProps) {
  const [expanded, setExpanded] = useState(true)

  const pending = (tasks ?? []).filter((t) => !isComplete(t.status))
  const completed = (tasks ?? []).filter((t) => isComplete(t.status))
  const total = (tasks ?? []).length

  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {expanded ? (
          <ChevronUp size={16} style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <ChevronDown size={16} style={{ color: 'var(--text-tertiary)' }} />
        )}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          Co-Work Tasks
        </span>
        {total > 0 && (
          <span
            style={{
              padding: '1px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              background: pending.length > 0 ? 'var(--warning-light)' : 'var(--success-light)',
              color: pending.length > 0 ? 'var(--warning)' : 'var(--success)',
            }}
          >
            {total}
          </span>
        )}
        {/* Spacer */}
        <span style={{ flex: 1 }} />
        {/* Refresh */}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onRefresh()
          }}
          style={{ color: 'var(--text-tertiary)', cursor: 'pointer', padding: 2 }}
        >
          <RefreshCw size={14} />
        </span>
        {/* + Request Task */}
        <span
          onClick={(e) => {
            e.stopPropagation()
            onCreateTask()
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--accent)',
            background: 'var(--accent-light)',
            cursor: 'pointer',
          }}
        >
          <Plus size={12} /> Request Task
        </span>
      </button>

      {/* Task list */}
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {total === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '20px 0',
                fontSize: 13,
                color: 'var(--text-tertiary)',
              }}
            >
              No co-work tasks linked to this item.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Pending tasks first */}
              {pending.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
              {/* Completed tasks */}
              {completed.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Internal sub-components ──────────────────────────────

function TaskRow({ task }: { task: CoworkTaskRef }) {
  const done = isComplete(task.status)
  const style = statusStyle(task.status)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        background: done ? 'transparent' : 'var(--bg-secondary)',
        opacity: done ? 0.6 : 1,
      }}
    >
      {done ? (
        <CheckCircle2 size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
      ) : (
        <Clock size={14} style={{ color: 'var(--warning)', flexShrink: 0 }} />
      )}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {task.title}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: 'var(--text-tertiary)',
        }}
      >
        <User size={11} /> {task.assignee || 'Unassigned'}
      </span>
      <span
        style={{
          padding: '1px 6px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          background: style.bg,
          color: style.text,
        }}
      >
        {task.status}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
        {formatDate(task.dueDate)}
      </span>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
      {children}
    </div>
  )
}

// ─── Shared styles ────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const pillButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 12px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
}

const pillActiveStyle: React.CSSProperties = {
  background: 'var(--accent-light)',
  color: 'var(--accent)',
  borderColor: 'var(--accent)',
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-secondary)',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
