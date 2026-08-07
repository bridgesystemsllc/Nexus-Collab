import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Activity as ActivityIcon, Bot } from 'lucide-react'
import { api } from '@/lib/api'

// ─── Project activity feed ───────────────────────────────────
// Reads the trail every phase of this module has been writing: creations,
// status changes, health band drops, check-in escalations, collab links,
// report publishes. It existed in the database from Phase 1; nothing read it
// back until now.
//
// Cursor-paginated, because the feed grows at the head — an offset page 2
// fetched a moment later would repeat rows the new entries pushed down.

interface ActivityRow {
  id: string
  action: string
  summary: string
  entityType: string
  entityId: string | null
  fieldChanges: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
  actor: { id: string; name: string; avatar: string | null } | null
  department: { id: string; name: string; color: string | null } | null
}

// Actions worth colouring. Everything else stays neutral — colour on every row
// is the same as colour on none.
const ACTION_TONE: Record<string, string> = {
  HEALTH_CHANGED: 'var(--warning)',
  BLOCKED: 'var(--danger)',
  ESCALATED: 'var(--danger)',
  REQUEST_REJECTED: 'var(--danger)',
  COMPLETED: 'var(--success)',
  REQUEST_ACCEPTED: 'var(--success)',
  PUBLISHED: 'var(--success)',
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  })
}

function renderValue(v: unknown): string {
  if (v == null || v === '') return 'empty'
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'empty'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function ActivityFeed({ projectId }: { projectId: string }) {
  const [before, setBefore] = useState<string | null>(null)
  const [pages, setPages] = useState<ActivityRow[]>([])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['projects', 'activity', projectId, before],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/activity`, {
        params: { limit: 50, ...(before ? { before } : {}) },
      })
      return res.data as { data: ActivityRow[]; meta: { hasMore: boolean; nextBefore: string | null } }
    },
    placeholderData: keepPreviousData,
  })

  // Accumulate pages rather than replacing, so "load more" appends.
  const rows: ActivityRow[] = before ? [...pages, ...(data?.data ?? [])] : data?.data ?? []

  if (isLoading && !data) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-[var(--border-subtle)] py-12 text-center">
        <p className="text-sm text-[var(--text-primary)]">Could not load the activity feed</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          {(error as any)?.response?.data?.error?.message ?? (error as any)?.message ?? 'Try again in a moment.'}
        </p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
        <ActivityIcon size={24} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
        <p className="text-sm text-[var(--text-secondary)]">Nothing has happened on this project yet</p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          Edits, status changes, check-ins and health movements all land here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5"
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: ACTION_TONE[row.action] ?? 'var(--text-tertiary)' }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs leading-snug text-[var(--text-primary)]">{row.summary}</p>

              {/* What actually changed, when the entry recorded it. */}
              {row.fieldChanges && Object.keys(row.fieldChanges).length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(row.fieldChanges).slice(0, 4).map(([field, change]) => (
                    <li key={field} className="text-[11px] text-[var(--text-tertiary)]">
                      <span className="text-[var(--text-secondary)]">{field}</span>
                      {': '}
                      <span className="line-through">{renderValue(change.from)}</span>
                      {' → '}
                      <span className="text-[var(--text-secondary)]">{renderValue(change.to)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                {row.actor ? (
                  row.actor.name
                ) : (
                  // Engine actions genuinely have no author. Naming the system
                  // beats a blank byline that reads like missing data.
                  <span className="inline-flex items-center gap-1">
                    <Bot size={9} /> Nexus
                  </span>
                )}
                {row.department && <> · {row.department.name}</>}
                {' · '}
                <time dateTime={row.createdAt} title={new Date(row.createdAt).toLocaleString()}>
                  {relativeTime(row.createdAt)}
                </time>
              </p>
            </div>
          </li>
        ))}
      </ul>

      {data?.meta.hasMore && (
        <button
          onClick={() => {
            setPages(rows)
            setBefore(data.meta.nextBefore)
          }}
          className="w-full rounded-lg border border-[var(--border-subtle)] py-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          Load older activity
        </button>
      )}
    </div>
  )
}
