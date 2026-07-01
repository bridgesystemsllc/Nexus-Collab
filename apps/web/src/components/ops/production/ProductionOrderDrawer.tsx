import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  X, Send, Factory, Package, Calendar, MessageSquarePlus,
  Pencil, Save, CalendarClock, History, ListChecks, Plus, Trash2, Check, Boxes,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Toast } from '@/components/shared/Toast'
import type { ToastData } from '@/components/shared/Toast'
import { TaskAttachments } from '@/components/shared/TaskAttachments'
import { ALL_PO_STATUSES, PO_STATUS_COLORS } from './productionData'

// Detail drawer for a production order (purchase order):
//  - inline edit of the order fields
//  - delivery-date change tracking with a full history of every push-out
//  - tasks checklist
//  - running updates/notes (feeds the CM profile's Production Updates)
//  - linked emails / files / comments via the shared attachments panel

interface ProductionNote {
  id: string
  noteDate: string
  noteText: string
  createdBy: string
  createdAt: string
}

interface ProductionTask {
  id: string
  text: string
  done: boolean
  createdAt: string
}

interface DeliveryChange {
  from: string
  to: string
  changedAt: string
  reason?: string
}

interface ProductionOrderDrawerProps {
  open: boolean
  item: any | null
  moduleId: string | null
  departmentId: string | null
  onClose: () => void
}

const STATUSES = [
  'Awaiting Materials', 'Production Scheduled', 'In Production',
  'QC Review', 'Ready to Ship', 'Shipped', 'On Hold',
]

function statusColor(status: string): string {
  switch (status) {
    case 'QC Review': return 'var(--success)'
    case 'Ready to Ship': return 'var(--success)'
    case 'Shipped': return 'var(--text-tertiary)'
    case 'In Production': return 'var(--info)'
    case 'Production Scheduled': return 'var(--accent)'
    case 'Awaiting Materials': return 'var(--warning)'
    case 'On Hold': return 'var(--danger)'
    default: return 'var(--text-tertiary)'
  }
}

const fieldClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'

export function ProductionOrderDrawer({ open, item, moduleId, departmentId, onClose }: ProductionOrderDrawerProps) {
  const qc = useQueryClient()
  const [localItem, setLocalItem] = useState<any>(item)
  const [newNote, setNewNote] = useState('')
  const [newTask, setNewTask] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [changingDate, setChangingDate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [dateReason, setDateReason] = useState('')

  useEffect(() => {
    setLocalItem(item)
    setEditing(false)
    setChangingDate(false)
  }, [item])

  const d = localItem?.data || {}
  const notes: ProductionNote[] = useMemo(
    () => [...((d.notes as ProductionNote[]) || [])].sort(
      (a, b) => new Date(b.createdAt || b.noteDate || 0).getTime() - new Date(a.createdAt || a.noteDate || 0).getTime(),
    ),
    [d.notes],
  )
  const tasks: ProductionTask[] = (d.tasks as ProductionTask[]) || []
  const deliveryHistory: DeliveryChange[] = (d.deliveryDateHistory as DeliveryChange[]) || []

  if (!open || !localItem) return null

  const color = statusColor(d.status)

  // Single PATCH helper — merges a partial into data, persists, updates local state.
  const patchData = async (partial: Record<string, any>, successMsg?: string) => {
    if (!moduleId || !localItem?.id) return false
    setSaving(true)
    const nextData = { ...d, ...partial }
    try {
      await api.patch(`/departments/_/modules/${moduleId}/items/${localItem.id}`, {
        data: nextData,
        ...(partial.status ? { status: partial.status } : {}),
      })
      setLocalItem({ ...localItem, data: nextData })
      if (successMsg) setToast({ message: successMsg, type: 'success' })
      if (departmentId) qc.invalidateQueries({ queryKey: ['department', departmentId] })
      return true
    } catch {
      setToast({ message: 'Save failed', type: 'error' })
      return false
    } finally {
      setSaving(false)
    }
  }

  // Best-effort push of this PO's status/notes to the ERP. Fire-and-forget:
  // dry-run when the ERP is unconfigured; never blocks the UI.
  const pushOpenOrder = () => {
    if (!localItem?.id) return
    api
      .post(`/integrations/erp/push-open-order/${localItem.id}`)
      .catch((err) => console.error('[open-order] push failed:', err))
  }

  const startEdit = () => {
    setEditForm({ product: d.product ?? '', cm: d.cm ?? '', brand: d.brand ?? '', status: d.status ?? '', qty: d.qty ?? '', value: d.value ?? '', progress: d.progress ?? '' })
    setEditing(true)
  }
  const saveEdit = async () => {
    const ok = await patchData({
      product: editForm.product,
      cm: editForm.cm,
      brand: editForm.brand,
      status: editForm.status,
      qty: editForm.qty === '' ? null : Number(editForm.qty),
      value: editForm.value === '' ? null : Number(editForm.value),
      progress: editForm.progress === '' ? null : Number(editForm.progress),
    }, 'Order updated')
    if (ok) setEditing(false)
  }

  const saveDeliveryChange = async () => {
    const to = newDate.trim()
    if (!to) return
    const from = d.eta || ''
    const change: DeliveryChange = { from, to, changedAt: new Date().toISOString(), reason: dateReason.trim() || undefined }
    const ok = await patchData({
      eta: to,
      // Preserve the original ETA the first time it changes.
      originalEta: d.originalEta || from || to,
      deliveryDateHistory: [...deliveryHistory, change],
    }, 'Delivery date updated')
    if (ok) { setChangingDate(false); setNewDate(''); setDateReason('') }
  }

  const addUpdate = async () => {
    const text = newNote.trim()
    if (!text) return
    const now = new Date()
    const note: ProductionNote = { id: crypto.randomUUID(), noteDate: now.toISOString().slice(0, 10), noteText: text, createdBy: 'User', createdAt: now.toISOString() }
    const ok = await patchData({ notes: [...((d.notes as ProductionNote[]) || []), note] }, 'Update added')
    if (ok) { setNewNote(''); pushOpenOrder() }
  }

  const addTask = async () => {
    const text = newTask.trim()
    if (!text) return
    const task: ProductionTask = { id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() }
    const ok = await patchData({ tasks: [...tasks, task] })
    if (ok) setNewTask('')
  }
  const toggleTask = (id: string) => patchData({ tasks: tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })
  const removeTask = (id: string) => patchData({ tasks: tasks.filter((t) => t.id !== id) })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex flex-col w-full max-w-[520px] h-screen bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)] truncate">{d.product || 'Production Order'}</h2>
            <p className="text-[12px] font-mono text-[var(--text-tertiary)] mt-0.5">{d.poNumber || '—'}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {!editing ? (
              <button onClick={startEdit} title="Edit order" className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors">
                <Pencil size={16} />
              </button>
            ) : (
              <button onClick={saveEdit} disabled={saving} title="Save" className="p-1.5 rounded-lg text-white bg-[var(--accent)] hover:opacity-90 transition-colors disabled:opacity-40">
                <Save size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* Details — view or edit */}
          {!editing ? (
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <Detail icon={Factory} label="Contract Manufacturer" value={d.cm} />
              <Detail icon={Package} label="Brand" value={d.brand} />
              <Detail label="Quantity" value={d.qty != null ? Number(d.qty).toLocaleString() : '—'} />
              <Detail label="Order Value" value={d.value != null ? `$${Number(d.value).toLocaleString()}` : '—'} />
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">Status</p>
                <span className="badge" style={{ background: `${color}20`, color }}>{d.status || '—'}</span>
              </div>
              <Detail label="Progress" value={typeof d.progress === 'number' ? `${d.progress}%` : '—'} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <EditField label="Product"><input className={fieldClass} value={editForm.product} onChange={(e) => setEditForm({ ...editForm, product: e.target.value })} /></EditField>
              <EditField label="Contract Manufacturer"><input className={fieldClass} value={editForm.cm} onChange={(e) => setEditForm({ ...editForm, cm: e.target.value })} /></EditField>
              <EditField label="Brand"><input className={fieldClass} value={editForm.brand} onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })} /></EditField>
              <EditField label="Status">
                <select className={fieldClass} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="">—</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </EditField>
              <EditField label="Quantity"><input type="number" className={fieldClass} value={editForm.qty} onChange={(e) => setEditForm({ ...editForm, qty: e.target.value })} /></EditField>
              <EditField label="Order Value"><input type="number" className={fieldClass} value={editForm.value} onChange={(e) => setEditForm({ ...editForm, value: e.target.value })} /></EditField>
              <EditField label="Progress %"><input type="number" className={fieldClass} value={editForm.progress} onChange={(e) => setEditForm({ ...editForm, progress: e.target.value })} /></EditField>
              <div className="col-span-2 flex gap-2">
                <button onClick={saveEdit} disabled={saving} className="btn-primary px-3 py-1.5 text-[13px] rounded-lg disabled:opacity-40">Save changes</button>
                <button onClick={() => setEditing(false)} className="btn-ghost px-3 py-1.5 text-[13px] rounded-lg">Cancel</button>
              </div>
            </div>
          )}

          {typeof d.progress === 'number' && !editing && (
            <div>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="text-[var(--text-tertiary)]">Progress</span>
                <span className="tabular-nums text-[var(--text-secondary)]">{d.progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${d.progress}%`, background: color }} />
              </div>
            </div>
          )}

          {/* Open Order — ERP-synced PO lifecycle (distinct from production Status) */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Boxes size={14} className="text-[var(--accent)]" /> Open Order
              {d.erpLastSyncAt && (
                <span className="text-[10px] font-normal text-[var(--text-tertiary)] normal-case tracking-normal">
                  · synced {String(d.erpLastSyncAt).slice(0, 10)}
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">PO Status</p>
                {(() => {
                  const poColor = PO_STATUS_COLORS[d.poStatus] ?? 'var(--text-tertiary)'
                  return (
                    <select
                      className={fieldClass}
                      style={{ color: d.poStatus ? poColor : undefined }}
                      value={d.poStatus || ''}
                      disabled={saving}
                      onChange={async (e) => {
                        const ok = await patchData({ poStatus: e.target.value }, 'PO status updated')
                        if (ok) pushOpenOrder()
                      }}
                    >
                      <option value="">—</option>
                      {ALL_PO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )
                })()}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">Urgency</p>
                <select
                  className={fieldClass}
                  value={d.urgency || 'Normal'}
                  disabled={saving}
                  onChange={async (e) => {
                    const ok = await patchData({ urgency: e.target.value }, 'Urgency updated')
                    if (ok) pushOpenOrder()
                  }}
                >
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <Detail label="Qty Received" value={d.qtyReceived != null ? Number(d.qtyReceived).toLocaleString() : '—'} />
              <Detail label="Qty Remaining" value={d.qtyRemaining != null ? Number(d.qtyRemaining).toLocaleString() : '—'} />
            </div>
          </div>

          {/* Delivery date + change history */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                <CalendarClock size={14} className="text-[var(--accent)]" /> Delivery Date
              </p>
              <button onClick={() => { setNewDate(''); setDateReason(''); setChangingDate((v) => !v) }} className="text-[12px] font-medium text-[var(--accent)] hover:underline flex items-center gap-1">
                <Calendar size={12} /> Change date
              </button>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="text-[var(--text-primary)] font-medium">{d.eta || '—'}</span>
              {d.originalEta && d.originalEta !== d.eta && (
                <span className="text-[11px] text-[var(--text-tertiary)]">(original: {d.originalEta})</span>
              )}
            </div>

            {changingDate && (
              <div className="mt-2 p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
                <input className={fieldClass} placeholder="New delivery date (e.g. May 15 or 2026-05-15)" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <input className={fieldClass} placeholder="Reason for change (optional)" value={dateReason} onChange={(e) => setDateReason(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={saveDeliveryChange} disabled={!newDate.trim() || saving} className="btn-primary px-3 py-1.5 text-[12px] rounded-lg disabled:opacity-40">Save date</button>
                  <button onClick={() => setChangingDate(false)} className="btn-ghost px-3 py-1.5 text-[12px] rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            {deliveryHistory.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-2 flex items-center gap-1"><History size={11} /> Delivery date history ({deliveryHistory.length})</p>
                <div className="space-y-2">
                  {[...deliveryHistory].reverse().map((c, i) => (
                    <div key={i} className="text-[12px] pl-3 border-l-2 border-[var(--border-default)]">
                      <span className="text-[var(--text-secondary)]">{c.from || '—'}</span>
                      <span className="text-[var(--text-tertiary)]"> → </span>
                      <span className="text-[var(--text-primary)] font-medium">{c.to}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)]"> · {c.changedAt ? c.changedAt.slice(0, 10) : ''}{c.reason ? ` · ${c.reason}` : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tasks */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <ListChecks size={14} className="text-[var(--accent)]" /> Tasks
              {tasks.length > 0 && <span className="text-[var(--text-tertiary)]">({tasks.filter((t) => t.done).length}/{tasks.length})</span>}
            </p>
            <div className="flex gap-2 mb-2">
              <input className={fieldClass} placeholder="Add a task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask() }} />
              <button onClick={addTask} disabled={!newTask.trim() || saving} className="btn-ghost px-2.5 rounded-lg disabled:opacity-40"><Plus size={15} /></button>
            </div>
            {tasks.length === 0 ? (
              <p className="text-[12px] text-[var(--text-tertiary)] italic">No tasks yet.</p>
            ) : (
              <div className="space-y-1.5">
                {tasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 group">
                    <button onClick={() => toggleTask(t.id)} className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${t.done ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-default)]'}`}>
                      {t.done && <Check size={11} className="text-white" />}
                    </button>
                    <span className={`text-[13px] flex-1 ${t.done ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>{t.text}</span>
                    <button onClick={() => removeTask(t.id)} className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-opacity"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add update */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <MessageSquarePlus size={14} className="text-[var(--accent)]" /> Add Update
            </p>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add an update or note from the CM about this order…"
              rows={3}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] resize-y"
            />
            <button onClick={addUpdate} disabled={!newNote.trim() || saving} className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-40" style={{ background: 'var(--accent)' }}>
              <Send size={14} /> {saving ? 'Saving…' : 'Add Update'}
            </button>
          </div>

          {/* Updates timeline */}
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">
              Updates {notes.length > 0 && <span className="text-[var(--text-tertiary)]">({notes.length})</span>}
            </p>
            {notes.length === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No updates yet.</p>
            ) : (
              <div className="space-y-3">
                {notes.map((n) => (
                  <div key={n.id} className="relative pl-4 border-l-2 border-[var(--border-default)]">
                    <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[var(--accent)]" />
                    <p className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap">{n.noteText}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                      {n.noteDate || (n.createdAt ? n.createdAt.slice(0, 10) : '')} · {n.createdBy || 'User'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked emails / files / comments */}
          <div className="border-t border-[var(--border-subtle)] pt-4">
            <TaskAttachments taskId={localItem.id} module="production_tracking" />
          </div>
        </div>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} duration={2500} />
    </div>
  )
}

function Detail({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value?: any }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1 flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </p>
      <p className="text-[var(--text-primary)] truncate">{value || '—'}</p>
    </div>
  )
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">{label}</p>
      {children}
    </div>
  )
}
