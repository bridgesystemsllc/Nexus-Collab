import { History } from 'lucide-react'

export interface ActivityEntry {
  id: string
  author: string
  authorInitial: string
  action: string
  timestamp: string
  type: 'status_change' | 'document_added' | 'note_added' | 'milestone_completed' | 'issue_logged'
}

export interface ActivityLogProps {
  entries: ActivityEntry[]
}

const TYPE_COLORS: Record<ActivityEntry['type'], string> = {
  status_change: 'var(--accent)',
  document_added: '#3B82F6',
  note_added: '#9CA3AF',
  milestone_completed: 'var(--success)',
  issue_logged: 'var(--danger)',
}

function relativeTime(timestamp: string): string {
  const now = Date.now()
  const then = new Date(timestamp).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

export function ActivityLog({ entries }: ActivityLogProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <History size={24} className="text-[var(--text-tertiary)] mb-2" />
        <p className="text-[13px] text-[var(--text-tertiary)]">
          No activity recorded yet.
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Vertical timeline line */}
      <div
        className="absolute left-[15px] top-3 bottom-3 w-[2px]"
        style={{ background: 'var(--border-subtle)' }}
      />

      <div className="space-y-0">
        {entries.map((entry) => (
          <div key={entry.id} className="relative flex gap-3 py-2.5">
            {/* Timeline dot */}
            <div className="relative z-10 flex-shrink-0 flex items-center justify-center w-[30px]">
              <span
                className="w-[10px] h-[10px] rounded-full"
                style={{ background: TYPE_COLORS[entry.type] }}
              />
            </div>

            {/* Avatar */}
            <div
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
              style={{
                background: 'var(--accent-light)',
                color: 'var(--accent)',
              }}
            >
              {entry.authorInitial}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[var(--text-primary)] leading-snug">
                <span className="font-medium">{entry.author}</span>{' '}
                <span className="text-[var(--text-secondary)]">{entry.action}</span>
              </p>
              <p
                className="text-[11px] text-[var(--text-tertiary)] mt-0.5"
                title={new Date(entry.timestamp).toLocaleString()}
              >
                {relativeTime(entry.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
