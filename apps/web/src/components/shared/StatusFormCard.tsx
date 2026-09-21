import { useState, useEffect, useRef } from 'react'
import { Save, Loader2, X, Search, Plus, AlertCircle } from 'lucide-react'
import { useMembers } from '@/hooks/useData'

export interface StatusFormCardAssignee {
  userId: string
  userName: string
}

export interface StatusFormCardProps {
  lastUpdated: string | null
  needsRevisions: boolean
  needsRevisionsNotes: string
  revisionsAssignees: StatusFormCardAssignee[]
  approvalsAssignees: StatusFormCardAssignee[]
  updatesAssignees: StatusFormCardAssignee[]
  nextAction: string
  finalApprovalVersion: string
  onChange: (patch: Partial<Omit<StatusFormCardProps, 'onChange' | 'onSave' | 'saving' | 'error' | 'labels'>>) => void
  onSave: () => void
  saving?: boolean
  error?: string | null
  labels?: Partial<Record<'needsRevisions' | 'revisions' | 'approvals' | 'updates' | 'nextAction' | 'finalApprovalVersion', string>>
}

function MultiUserPicker({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: StatusFormCardAssignee[]
  onChange: (v: StatusFormCardAssignee[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const { data: members = [] } = useMembers()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selectedIds = new Set(value.map((v) => v.userId))
  const filtered = (members as any[]).filter((m: any) => {
    if (selectedIds.has(m.id)) return false
    const q = search.toLowerCase()
    return (m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q)
  })

  const handleSelect = (m: any) => {
    onChange([...value, { userId: m.id, userName: m.name }])
    setSearch('')
  }

  const handleRemove = (userId: string) => {
    onChange(value.filter((v) => v.userId !== userId))
  }

  return (
    <div ref={ref} className="relative">
      <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <div
        className="min-h-[40px] flex flex-wrap items-center gap-1.5 px-2.5 py-2 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg cursor-text transition-colors hover:border-[var(--accent)]"
        onClick={() => setOpen(true)}
      >
        {value.map((assignee) => (
          <span
            key={assignee.userId}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-medium bg-[var(--accent-subtle)] text-[var(--accent)] border border-[var(--accent)]/20"
          >
            {assignee.userName}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(assignee.userId)
              }}
              className="p-0.5 rounded-full hover:bg-[var(--accent)]/20 transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
        >
          <Plus size={12} /> {value.length === 0 ? (placeholder || 'Add assignee') : 'Add'}
        </button>
      </div>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border-subtle)]">
            <Search size={14} className="text-[var(--text-tertiary)] shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              autoFocus
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
            />
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-[var(--text-tertiary)]">
                {search ? 'No users found' : 'All users assigned'}
              </p>
            ) : (
              filtered.slice(0, 10).map((m: any) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelect(m)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                    {m.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                    <p className="text-[10px] text-[var(--text-tertiary)] truncate">{m.email}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function StatusFormCard({
  lastUpdated,
  needsRevisions,
  needsRevisionsNotes,
  revisionsAssignees,
  approvalsAssignees,
  updatesAssignees,
  nextAction,
  finalApprovalVersion,
  onChange,
  onSave,
  saving,
  error,
  labels,
}: StatusFormCardProps) {
  const l = {
    needsRevisions: labels?.needsRevisions ?? 'Needs revisions?',
    revisions: labels?.revisions ?? 'Revisions assigned to',
    approvals: labels?.approvals ?? 'Approvals assigned to',
    updates: labels?.updates ?? 'Updates assigned to',
    nextAction: labels?.nextAction ?? 'Next action',
    finalApprovalVersion: labels?.finalApprovalVersion ?? 'Final approval version',
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return null
    try {
      return new Date(iso).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-[13px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Status Form
        </h3>
        {lastUpdated && (
          <span className="text-[11px] text-[var(--text-tertiary)]">
            Last updated: {formatDate(lastUpdated)}
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">
            {l.needsRevisions}
          </label>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="needsRevisions"
                checked={needsRevisions === true}
                onChange={() => onChange({ needsRevisions: true })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-[13px] text-[var(--text-primary)]">Yes</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="needsRevisions"
                checked={needsRevisions === false}
                onChange={() => onChange({ needsRevisions: false })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-[13px] text-[var(--text-primary)]">No</span>
            </label>
          </div>
        </div>

        {needsRevisions && (
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Notes</label>
            <textarea
              value={needsRevisionsNotes}
              onChange={(e) => onChange({ needsRevisionsNotes: e.target.value })}
              placeholder="Describe what revisions are needed..."
              rows={3}
              className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] resize-y"
            />
          </div>
        )}

        <MultiUserPicker
          label={l.revisions}
          value={revisionsAssignees}
          onChange={(v) => onChange({ revisionsAssignees: v })}
          placeholder="Add revisions assignee"
        />

        <MultiUserPicker
          label={l.approvals}
          value={approvalsAssignees}
          onChange={(v) => onChange({ approvalsAssignees: v })}
          placeholder="Add approvals assignee"
        />

        <MultiUserPicker
          label={l.updates}
          value={updatesAssignees}
          onChange={(v) => onChange({ updatesAssignees: v })}
          placeholder="Add updates assignee"
        />

        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            {l.nextAction}
          </label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => onChange({ nextAction: e.target.value })}
            placeholder="Describe next action..."
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            {l.finalApprovalVersion}
          </label>
          <input
            type="text"
            value={finalApprovalVersion}
            onChange={(e) => onChange({ finalApprovalVersion: e.target.value })}
            placeholder="e.g. v2.1"
            className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]/20">
            <AlertCircle size={14} className="text-[var(--danger)] shrink-0" />
            <span className="text-[12px] text-[var(--danger)]">{error}</span>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={14} />
                Save status
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
