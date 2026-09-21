import { useState, useRef, useEffect } from 'react'
import { Check, X, ChevronDown, Search, Clock, AlertCircle } from 'lucide-react'
import { useMembers } from '@/hooks/useData'

export interface StatusAssignee {
  userId: string
  userName: string
}

export interface StatusFormCardProps {
  lastUpdated: string | null
  needsRevisions: boolean
  needsRevisionsNotes: string
  revisionsAssignees: StatusAssignee[]
  approvalsAssignees: StatusAssignee[]
  updatesAssignees: StatusAssignee[]
  nextAction: string
  finalApprovalVersion: string
  onChange: (patch: Partial<Omit<StatusFormCardProps, 'onChange' | 'onSave' | 'saving' | 'error' | 'labels'>>) => void
  onSave: () => void
  saving?: boolean
  error?: string | null
  labels?: Partial<Record<'needsRevisions' | 'revisions' | 'approvals' | 'updates' | 'nextAction' | 'finalApprovalVersion', string>>
}

const inputClass =
  'w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_rgba(47,128,237,0.12)]'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

interface MultiUserPickerProps {
  label: string
  value: StatusAssignee[]
  onChange: (val: StatusAssignee[]) => void
}

function MultiUserPicker({ label, value, onChange }: MultiUserPickerProps) {
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

  const filtered = (members as any[]).filter((m: any) => {
    const q = search.toLowerCase()
    const alreadySelected = value.some((v) => v.userId === m.id)
    return (
      !alreadySelected &&
      ((m.name ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q))
    )
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
      <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
        {label}
      </label>
      <div
        onClick={() => setOpen(true)}
        className={`min-h-[38px] flex flex-wrap items-center gap-1.5 bg-[var(--bg-input)] border rounded-lg px-2.5 py-1.5 cursor-text transition-all ${
          open
            ? 'border-[var(--accent)] shadow-[0_0_0_2px_rgba(47,128,237,0.12)]'
            : 'border-[var(--border-default)] hover:border-[var(--accent)]'
        }`}
      >
        {value.map((v) => (
          <span
            key={v.userId}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[var(--accent-subtle)] text-[var(--accent)]"
          >
            <span className="font-medium">{v.userName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleRemove(v.userId)
              }}
              className="hover:opacity-70"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={value.length === 0 ? 'Select users...' : ''}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] py-0.5"
        />
        <ChevronDown size={14} className="text-[var(--text-tertiary)] shrink-0" />
      </div>

      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--border-subtle)]">
            <Search size={12} className="text-[var(--text-tertiary)]" />
            <span className="text-[11px] text-[var(--text-tertiary)]">
              {filtered.length} user{filtered.length === 1 ? '' : 's'} available
            </span>
          </div>
          <div className="max-h-[180px] overflow-y-auto">
            {filtered.map((m: any) => (
              <button
                key={m.id}
                onClick={() => handleSelect(m)}
                className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
                  {m.name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[var(--text-primary)] truncate">{m.name}</p>
                  <p className="text-[10px] text-[var(--text-tertiary)] truncate">{m.email}</p>
                </div>
              </button>
            ))}
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
  const labelNeedsRevisions = labels?.needsRevisions ?? 'Needs revisions?'
  const labelRevisions = labels?.revisions ?? 'Revisions assigned to'
  const labelApprovals = labels?.approvals ?? 'Approvals assigned to'
  const labelUpdates = labels?.updates ?? 'Updates assigned to'
  const labelNextAction = labels?.nextAction ?? 'Next action'
  const labelFinalApprovalVersion = labels?.finalApprovalVersion ?? 'Final approval version'

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Status</h3>
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
          <Clock size={12} />
          <span>Last updated: {formatDate(lastUpdated)}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Needs revisions */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">
            {labelNeedsRevisions}
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange({ needsRevisions: true })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                needsRevisions
                  ? 'bg-[var(--warning-light)] text-[var(--warning)] border border-[var(--warning)]'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]'
              }`}
            >
              <AlertCircle size={12} />
              Yes
            </button>
            <button
              onClick={() => onChange({ needsRevisions: false, needsRevisionsNotes: '' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                !needsRevisions
                  ? 'bg-[var(--success-light)] text-[var(--success)] border border-[var(--success)]'
                  : 'bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]'
              }`}
            >
              <Check size={12} />
              No
            </button>
          </div>
        </div>

        {/* Revision notes (shown when needsRevisions) */}
        {needsRevisions && (
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Revision notes
            </label>
            <textarea
              value={needsRevisionsNotes}
              onChange={(e) => onChange({ needsRevisionsNotes: e.target.value })}
              rows={3}
              placeholder="Describe what needs to be revised..."
              className={`${inputClass} resize-none`}
            />
          </div>
        )}

        {/* Assignee pickers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MultiUserPicker
            label={labelRevisions}
            value={revisionsAssignees}
            onChange={(val) => onChange({ revisionsAssignees: val })}
          />
          <MultiUserPicker
            label={labelApprovals}
            value={approvalsAssignees}
            onChange={(val) => onChange({ approvalsAssignees: val })}
          />
          <MultiUserPicker
            label={labelUpdates}
            value={updatesAssignees}
            onChange={(val) => onChange({ updatesAssignees: val })}
          />
        </div>

        {/* Next action */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            {labelNextAction}
          </label>
          <input
            type="text"
            value={nextAction}
            onChange={(e) => onChange({ nextAction: e.target.value })}
            placeholder="e.g., Waiting for legal review"
            className={inputClass}
          />
        </div>

        {/* Final approval version */}
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            {labelFinalApprovalVersion}
          </label>
          <input
            type="text"
            value={finalApprovalVersion}
            onChange={(e) => onChange({ finalApprovalVersion: e.target.value })}
            placeholder="e.g., v3.1"
            className={inputClass}
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--danger-light)] border border-[var(--danger)]">
          <AlertCircle size={14} className="text-[var(--danger)]" />
          <span className="text-[12px] text-[var(--danger)]">{error}</span>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-all"
        >
          {saving ? (
            <>
              <span className="animate-spin">⏳</span>
              Saving...
            </>
          ) : (
            <>
              <Check size={14} />
              Save status
            </>
          )}
        </button>
      </div>
    </div>
  )
}
