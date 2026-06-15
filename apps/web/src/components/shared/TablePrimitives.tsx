import { useState, useRef, useEffect } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { BRIEF_STATUS_COLORS } from '@/lib/briefStatus'

// ─── Status Badge ──────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
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
export function ActionsMenu({ actions }: { actions: { label: string; icon: React.ElementType; onClick: () => void; danger?: boolean }[] }) {
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
export function DeleteConfirmDialog({ open, itemName, onConfirm, onCancel }: {
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
