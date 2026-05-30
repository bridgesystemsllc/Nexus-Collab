import { useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, Plus, X } from 'lucide-react'

export interface Issue {
  id: string
  description: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  category?: string
  reportedDate: string
  status: 'Open' | 'In Review' | 'Resolved'
  assignedTo?: string
  resolutionNotes?: string
}

export interface IssueLoggerProps {
  issues: Issue[]
  onAdd: (issue: Omit<Issue, 'id' | 'reportedDate' | 'status'>) => void
  onResolve: (id: string) => void
  categories?: string[]
  title?: string
}

const PRIORITY_COLORS: Record<Issue['priority'], { bg: string; text: string }> = {
  Critical: { bg: 'var(--danger-light)', text: 'var(--danger)' },
  High: { bg: '#FEF3C7', text: '#F59E0B' },
  Medium: { bg: 'var(--info-light)', text: 'var(--info)' },
  Low: { bg: 'var(--bg-hover)', text: '#6B7280' },
}

const STATUS_COLORS: Record<Issue['status'], { bg: string; text: string }> = {
  Open: { bg: 'var(--danger-light)', text: 'var(--danger)' },
  'In Review': { bg: 'var(--warning-light)', text: 'var(--warning)' },
  Resolved: { bg: 'var(--success-light)', text: 'var(--success)' },
}

function Badge({ label, colors }: { label: string; colors: { bg: string; text: string } }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      {label}
    </span>
  )
}

export function IssueLogger({
  issues,
  onAdd,
  onResolve,
  categories,
  title = 'Issues',
}: IssueLoggerProps) {
  const [showForm, setShowForm] = useState(false)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')

  // Form state
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Issue['priority']>('Medium')
  const [category, setCategory] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [notes, setNotes] = useState('')

  const handleSubmit = () => {
    if (!description.trim()) return
    onAdd({
      description: description.trim(),
      priority,
      category: category || undefined,
      assignedTo: assignedTo.trim() || undefined,
      resolutionNotes: notes.trim() || undefined,
    })
    resetForm()
  }

  const resetForm = () => {
    setDescription('')
    setPriority('Medium')
    setCategory('')
    setAssignedTo('')
    setNotes('')
    setShowForm(false)
  }

  const handleResolve = (id: string) => {
    onResolve(id)
    setResolvingId(null)
    setResolutionNotes('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <AlertCircle size={15} className="text-[var(--accent)]" />
          {title}
          <span className="text-[12px] font-normal text-[var(--text-tertiary)]">
            ({issues.filter((i) => i.status !== 'Resolved').length} open)
          </span>
        </h3>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
          >
            <Plus size={13} />
            Log Issue
          </button>
        )}
      </div>

      {/* Inline Form */}
      {showForm && (
        <div className="p-3 mb-3 rounded-[8px] border border-[var(--accent)]/30 bg-[var(--accent-subtle)] space-y-2.5">
          <textarea
            placeholder="Describe the issue... (required)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] resize-none"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Issue['priority'])}
              className="px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            {categories && categories.length > 0 && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="">Category...</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
            <input
              type="text"
              placeholder="Assigned to"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
          </div>
          <input
            type="text"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!description.trim()}
              className="px-3 py-1.5 rounded-[6px] text-[12px] font-medium text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Issues Table */}
      {issues.length === 0 ? (
        <p className="text-[13px] text-[var(--text-tertiary)] py-4 text-center">
          No issues logged yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="nexus-table w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">#</th>
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Description</th>
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Priority</th>
                {categories && (
                  <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Category</th>
                )}
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Reported</th>
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Status</th>
                <th className="text-left py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Assigned</th>
                <th className="text-right py-2 px-3 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue, idx) => (
                <tr
                  key={issue.id}
                  className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  <td className="py-2 px-3 text-[var(--text-tertiary)] tabular-nums">{idx + 1}</td>
                  <td className="py-2 px-3 text-[var(--text-primary)] max-w-[280px]">
                    <p className="truncate">{issue.description}</p>
                  </td>
                  <td className="py-2 px-3">
                    <Badge label={issue.priority} colors={PRIORITY_COLORS[issue.priority]} />
                  </td>
                  {categories && (
                    <td className="py-2 px-3 text-[var(--text-secondary)]">{issue.category || '—'}</td>
                  )}
                  <td className="py-2 px-3 text-[var(--text-secondary)] whitespace-nowrap">{issue.reportedDate}</td>
                  <td className="py-2 px-3">
                    <Badge label={issue.status} colors={STATUS_COLORS[issue.status]} />
                  </td>
                  <td className="py-2 px-3 text-[var(--text-secondary)]">{issue.assignedTo || '—'}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      {issue.status !== 'Resolved' && resolvingId !== issue.id && (
                        <button
                          onClick={() => setResolvingId(issue.id)}
                          className="p-1 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--success)] hover:bg-[var(--success-light)] transition-colors"
                          title="Resolve"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                    </div>
                    {resolvingId === issue.id && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <input
                          type="text"
                          placeholder="Resolution notes..."
                          value={resolutionNotes}
                          onChange={(e) => setResolutionNotes(e.target.value)}
                          className="flex-1 px-2 py-1 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-input)] text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          onClick={() => handleResolve(issue.id)}
                          className="px-2 py-1 rounded-[6px] text-[11px] font-medium text-white bg-[var(--success)] hover:opacity-90 transition-colors"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={() => { setResolvingId(null); setResolutionNotes('') }}
                          className="p-1 rounded-[6px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
