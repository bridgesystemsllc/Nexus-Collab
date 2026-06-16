import { useState, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Send, Factory, Package, Calendar, MessageSquarePlus } from 'lucide-react'
import { api } from '@/lib/api'
import { Toast } from '@/components/shared/Toast'
import type { ToastData } from '@/components/shared/Toast'

// Detail drawer for a production order (purchase order). Shows the order's key
// fields, a running list of updates/notes (newest-first), and a form to add an
// update. Updates persist on the production item's data.notes[] and are the
// source the matching CM's profile aggregates as "Production Updates".

interface ProductionNote {
  id: string
  noteDate: string
  noteText: string
  createdBy: string
  createdAt: string
}

interface ProductionOrderDrawerProps {
  open: boolean
  item: any | null
  moduleId: string | null
  departmentId: string | null
  onClose: () => void
}

function statusColor(status: string): string {
  switch (status) {
    case 'QC Review': return 'var(--success)'
    case 'In Production': return 'var(--info)'
    case 'Production Scheduled': return 'var(--accent)'
    case 'Awaiting Materials': return 'var(--warning)'
    default: return 'var(--text-tertiary)'
  }
}

export function ProductionOrderDrawer({ open, item, moduleId, departmentId, onClose }: ProductionOrderDrawerProps) {
  const qc = useQueryClient()
  // Local copy so the timeline updates immediately after adding an update.
  const [localItem, setLocalItem] = useState<any>(item)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  useEffect(() => { setLocalItem(item) }, [item])

  const d = localItem?.data || {}
  const notes: ProductionNote[] = useMemo(
    () => [...((d.notes as ProductionNote[]) || [])].sort(
      (a, b) => new Date(b.createdAt || b.noteDate || 0).getTime() - new Date(a.createdAt || a.noteDate || 0).getTime(),
    ),
    [d.notes],
  )

  if (!open || !localItem) return null

  const color = statusColor(d.status)

  const addUpdate = async () => {
    const text = newNote.trim()
    if (!text || !moduleId || !localItem?.id) return
    setSaving(true)
    const now = new Date()
    const note: ProductionNote = {
      id: crypto.randomUUID(),
      noteDate: now.toISOString().slice(0, 10),
      noteText: text,
      createdBy: 'User',
      createdAt: now.toISOString(),
    }
    const updatedNotes = [...((d.notes as ProductionNote[]) || []), note]
    try {
      await api.patch(`/departments/_/modules/${moduleId}/items/${localItem.id}`, {
        data: { ...d, notes: updatedNotes },
      })
      setLocalItem({ ...localItem, data: { ...d, notes: updatedNotes } })
      setNewNote('')
      setToast({ message: 'Update added', type: 'success' })
      if (departmentId) qc.invalidateQueries({ queryKey: ['department', departmentId] })
    } catch {
      setToast({ message: 'Failed to add update', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex flex-col w-full max-w-[480px] h-screen bg-[var(--bg-elevated)] border-l border-[var(--border-default)] shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-[var(--text-primary)] truncate">{d.product || 'Production Order'}</h2>
            <p className="text-[12px] font-mono text-[var(--text-tertiary)] mt-0.5">{d.poNumber || '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          {/* Details */}
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <Detail icon={Factory} label="Contract Manufacturer" value={d.cm} />
            <Detail icon={Package} label="Brand" value={d.brand} />
            <Detail label="Quantity" value={d.qty != null ? Number(d.qty).toLocaleString() : '—'} />
            <Detail label="Order Value" value={d.value != null ? `$${Number(d.value).toLocaleString()}` : '—'} />
            <Detail icon={Calendar} label="ETA" value={d.eta} />
            <div>
              <p className="text-[11px] uppercase tracking-[0.06em] text-[var(--text-tertiary)] mb-1">Status</p>
              <span className="badge" style={{ background: `${color}20`, color }}>{d.status || '—'}</span>
            </div>
          </div>
          {typeof d.progress === 'number' && (
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

          {/* Add update form */}
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
            <button
              onClick={addUpdate}
              disabled={!newNote.trim() || saving}
              className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              <Send size={14} /> {saving ? 'Adding…' : 'Add Update'}
            </button>
          </div>

          {/* Running updates timeline */}
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
