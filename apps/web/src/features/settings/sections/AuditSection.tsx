import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, ScrollText } from 'lucide-react'
import { fetchAudit, fetchUsers, type AuditRow } from '@/features/users/api/usersApi'
import { relativeTime } from '@/features/users/components/StatusPill'
import { Section, Alert, inputClass, borderFor } from '../components/SettingsPrimitives'

// ─── Audit log ───────────────────────────────────────────────
// Read-only, and read-only all the way down: the repository exposes append and
// query, there is no update or delete route, and nothing on this screen
// pretends otherwise.

const ACTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Everything' },
  { value: 'user.invited', label: 'Invitations sent' },
  { value: 'user.updated', label: 'Profiles edited' },
  { value: 'user.role_changed', label: 'Roles changed' },
  { value: 'user.status_changed', label: 'Accounts activated or suspended' },
  { value: 'user.permission_overridden', label: 'Permission overrides set' },
  { value: 'user.permission_override_removed', label: 'Permission overrides removed' },
  { value: 'user.sessions_revoked', label: 'Sessions ended' },
  { value: 'user.email_change_requested', label: 'Email changes started' },
  { value: 'user.email_changed', label: 'Email changes completed' },
  { value: 'role.created', label: 'Roles created' },
  { value: 'role.updated', label: 'Roles edited' },
  { value: 'role.deleted', label: 'Roles deleted' },
  { value: 'preferences.updated', label: 'Preferences changed' },
  { value: 'notifications.updated', label: 'Notification settings changed' },
]

const ACTION_LABELS: Record<string, string> = {
  'user.invited': 'Invited someone',
  'user.invite_resent': 'Resent an invitation',
  'user.updated': 'Edited a profile',
  'user.role_changed': 'Changed a role',
  'user.status_changed': 'Changed an account status',
  'user.permission_overridden': 'Set a permission override',
  'user.permission_override_removed': 'Removed a permission override',
  'user.sessions_revoked': 'Ended sessions',
  'user.email_change_requested': 'Started an email change',
  'user.email_changed': 'Completed an email change',
  'role.created': 'Created a role',
  'role.updated': 'Edited a role',
  'role.deleted': 'Deleted a role',
  'preferences.updated': 'Changed preferences',
  'notifications.updated': 'Changed notification settings',
}

const PAGE_SIZE = 25

export function AuditSection() {
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const reset = () => { setAction(''); setActorId(''); setFrom(''); setTo(''); setPage(1) }
  const hasFilters = !!(action || actorId || from || to)

  const actors = useQuery({
    queryKey: ['users', { pageSize: 100 }],
    queryFn: () => fetchUsers({ pageSize: 100 }),
    staleTime: 5 * 60_000,
  })

  const log = useQuery({
    queryKey: ['audit', { action, actorId, from, to, page }],
    queryFn: () => fetchAudit({
      ...(action ? { action } : {}),
      ...(actorId ? { actorId } : {}),
      ...(from ? { from: new Date(from).toISOString() } : {}),
      // A date input means the whole day. Sending midnight would exclude
      // everything that happened on the day the user picked.
      ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      page,
      pageSize: PAGE_SIZE,
    }),
    placeholderData: (prev) => prev,
  })

  const change = (fn: () => void) => { fn(); setPage(1) }

  return (
    <Section
      title="Audit log"
      description="Every change to people, roles and settings, in the order it happened. Nothing here can be edited or deleted."
      action={
        hasFilters ? (
          <button onClick={reset} className="inline-flex shrink-0 items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
            <RotateCcw size={11} /> Clear filters
          </button>
        ) : undefined
      }
    >
      <div className="mb-3 grid gap-2 sm:grid-cols-4">
        <select value={action} onChange={(e) => change(() => setAction(e.target.value))} aria-label="Filter by action" className={inputClass} style={borderFor()}>
          {ACTIONS.map((a) => <option key={a.value || 'all'} value={a.value}>{a.label}</option>)}
        </select>
        <select value={actorId} onChange={(e) => change(() => setActorId(e.target.value))} aria-label="Filter by person" className={inputClass} style={borderFor()}>
          <option value="">Anyone</option>
          {(actors.data?.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => change(() => setFrom(e.target.value))} aria-label="From date" className={inputClass} style={borderFor()} />
        <input type="date" value={to} onChange={(e) => change(() => setTo(e.target.value))} aria-label="To date" className={inputClass} style={borderFor()} />
      </div>

      {log.isLoading ? (
        <div className="space-y-1.5" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
        </div>
      ) : log.isError ? (
        <Alert>Could not read the audit log. It may be that your role does not include audit:read.</Alert>
      ) : (log.data?.data.length ?? 0) === 0 ? (
        <div className="py-12 text-center">
          <ScrollText size={20} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
          <p className="text-xs text-[var(--text-primary)]">
            {hasFilters ? 'Nothing matches those filters' : 'Nothing has been recorded yet'}
          </p>
          {hasFilters && (
            <button onClick={reset} className="mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-2 text-[10px] text-[var(--text-tertiary)]">
            {log.data!.total} entr{log.data!.total === 1 ? 'y' : 'ies'}
          </p>
          <ul className="space-y-1.5">
            {log.data!.data.map((row) => <Entry key={row.id} row={row} />)}
          </ul>
        </>
      )}

      {(log.data?.pages ?? 1) > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            Previous
          </button>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
            Page {log.data!.page} of {log.data!.pages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)} disabled={page >= (log.data?.pages ?? 1)}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            Next
          </button>
        </div>
      )}
    </Section>
  )
}

function Entry({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false)
  const { diffs, reason, notes } = splitChanges(row.changes)
  const meta = (row.metadata ?? {}) as Record<string, unknown>

  return (
    <li className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--text-primary)]">
          <b className="font-medium">{row.actorLabel}</b>{' '}
          {(ACTION_LABELS[row.action] ?? row.action).toLowerCase()}
        </p>
        <time className="text-[10px] text-[var(--text-tertiary)]" dateTime={row.createdAt}>
          {relativeTime(row.createdAt)}
        </time>
      </div>

      {diffs.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {diffs.map(([field, c]) => (
            <li key={field} className="text-[10px] text-[var(--text-tertiary)]">
              <span className="text-[var(--text-secondary)]">{field}</span>{': '}
              <span className="line-through">{render(c.from)}</span>{' → '}
              <span className="text-[var(--text-secondary)]">{render(c.to)}</span>
            </li>
          ))}
        </ul>
      )}
      {reason && <p className="mt-1 text-[10px] italic text-[var(--text-secondary)]">“{reason}”</p>}
      {notes.map((n) => <p key={n} className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{n}</p>)}

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-1 text-[10px] text-[var(--text-tertiary)] underline underline-offset-2"
      >
        {open ? 'Hide details' : 'Details'}
      </button>

      {open && (
        <dl className="mt-1 space-y-0.5 rounded bg-[var(--bg-subtle)] px-2 py-1.5">
          <Meta label="Action" value={row.action} />
          <Meta label="Entity" value={`${row.entityType}${row.entityId ? ` · ${row.entityId}` : ''}`} />
          <Meta label="When" value={new Date(row.createdAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} />
          {meta.ip ? <Meta label="IP" value={String(meta.ip)} /> : null}
          {meta.requestId ? <Meta label="Request" value={String(meta.requestId)} /> : null}
        </dl>
      )}
    </li>
  )
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2">
    <dt className="w-16 shrink-0 text-[10px] text-[var(--text-tertiary)]">{label}</dt>
    <dd className="min-w-0 break-all font-mono text-[10px] text-[var(--text-secondary)]">{value}</dd>
  </div>
)

const render = (v: unknown) => (v === null || v === undefined || v === '' ? 'empty' : String(v))

/** Same split as the profile's Activity tab: reason and side effects are not diffs. */
function splitChanges(changes: AuditRow['changes']) {
  const diffs: [string, { from: unknown; to: unknown }][] = []
  let reason: string | null = null
  const notes: string[] = []

  for (const [field, c] of Object.entries(changes ?? {})) {
    if (field === 'reason') {
      reason = c.to == null ? null : String(c.to)
    } else if (field === 'sessionsRevoked') {
      const n = Number(c.to) || 0
      notes.push(`Ended ${n} active session${n === 1 ? '' : 's'}.`)
    } else {
      diffs.push([field, c])
    }
  }
  return { diffs, reason, notes }
}
