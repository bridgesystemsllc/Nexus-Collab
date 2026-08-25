import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, ArrowLeft, LogOut, Shield, ShieldOff, UserCog,
} from 'lucide-react'
import { useModalBehaviour } from '@/modules/projects/lib/useModalBehaviour'
import {
  ApiError, fetchUser, fetchMe, changeUserRole, changeUserStatus, forceLogout,
  type AuditRow, type EffectivePermission, type DirectoryUser,
} from '../api/usersApi'
import { StatusPill, RoleChip, relativeTime } from '../components/StatusPill'
import { PermissionPreview } from '../components/PermissionPreview'
import { Avatar } from './UserDirectory'

// ─── Profile ─────────────────────────────────────────────────
// Overview / Permissions / Activity, per §7.2.
//
// Viewing yourself renders the same page with the authority controls absent,
// not disabled — a greyed-out button you can never use is noise.

type Tab = 'overview' | 'permissions' | 'activity'

export function UserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [dialog, setDialog] = useState<'role' | 'status' | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const me = useQuery({ queryKey: ['rbac', 'me'], queryFn: fetchMe })
  const { data, isLoading, isError } = useQuery({
    queryKey: ['users', 'detail', userId],
    queryFn: () => fetchUser(userId),
  })

  if (isLoading) {
    return <div className="mx-auto max-w-[1000px] space-y-3 p-6"><div className="skeleton h-32 rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div>
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-[1000px] p-6">
        <BackButton onBack={onBack} />
        <div className="mt-4 rounded-xl border py-16 text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm text-[var(--text-primary)]">Could not load this person</p>
        </div>
      </div>
    )
  }

  const { user, effectivePermissions, recentActivity } = data
  const isSelf = me.data?.id === user.id
  const can = (key: string) => (me.data?.permissions ?? []).some((p) => p.key === key)
  // Authority controls are hidden on your own profile — the server refuses
  // them anyway, and rendering them would promise something untrue.
  const showAuthority = !isSelf

  return (
    <div className="projects-module mx-auto max-w-[1000px] space-y-4 p-6">
      <BackButton onBack={onBack} />

      {toast && (
        <div role="status" className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Avatar user={user} size={52} />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="display-type text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  {user.displayName || user.name}
                </h1>
                {isSelf && <span className="text-[10px] text-[var(--text-tertiary)]">(you)</span>}
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">{user.email}</p>
              {user.jobTitle && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{user.jobTitle}</p>}
              <div className="mt-1.5 flex items-center gap-1.5">
                <RoleChip role={user.role} />
                <StatusPill status={user.lifecycleStatus} />
              </div>
            </div>
          </div>

          {showAuthority && (
            <div className="flex flex-wrap gap-2">
              {can('roles:assign') && (
                <button onClick={() => setDialog('role')} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                  <UserCog size={12} /> Change role
                </button>
              )}
              {can('users:deactivate') && (
                <>
                  <button onClick={() => setDialog('status')} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: 'var(--border)', color: user.lifecycleStatus === 'active' ? 'var(--danger)' : 'var(--success)' }}>
                    {user.lifecycleStatus === 'active' ? <><ShieldOff size={12} /> Deactivate</> : <><Shield size={12} /> Reactivate</>}
                  </button>
                  <button
                    onClick={async () => {
                      const r = await forceLogout(user.id)
                      setToast(`Signed out of ${r.data.sessionsRevoked} session${r.data.sessionsRevoked === 1 ? '' : 's'}.`)
                      qc.invalidateQueries({ queryKey: ['users'] })
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-[var(--text-secondary)]"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <LogOut size={12} /> Force logout
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        {(['overview', 'permissions', 'activity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all"
            style={tab === t ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-secondary)' }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview user={user} />}
      {tab === 'permissions' && <Permissions permissions={effectivePermissions} roleName={user.role?.name ?? null} />}
      {tab === 'activity' && <Activity rows={recentActivity} />}

      {dialog === 'role' && (
        <ChangeRoleDialog
          user={user}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); setToast(msg); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}
      {dialog === 'status' && (
        <ChangeStatusDialog
          user={user}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); setToast(msg); qc.invalidateQueries({ queryKey: ['users'] }) }}
        />
      )}
    </div>
  )
}

const BackButton = ({ onBack }: { onBack: () => void }) => (
  <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
    <ArrowLeft size={13} /> All people
  </button>
)

// ─── Tabs ────────────────────────────────────────────────────

function Overview({ user }: { user: DirectoryUser }) {
  const rows: [string, string][] = [
    ['Email', user.email],
    ['Department', user.department?.name ?? '—'],
    ['Job title', user.jobTitle ?? '—'],
    ['Phone', user.phone ?? '—'],
    ['Timezone', user.timezone],
    ['Joined', new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })],
    ['Last active', relativeTime(user.lastLoginAt)],
    ...(user.deactivatedAt ? ([['Deactivated', relativeTime(user.deactivatedAt)]] as [string, string][]) : []),
  ]
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b py-1.5" style={{ borderColor: 'var(--border)' }}>
            <dt className="text-xs text-[var(--text-tertiary)]">{k}</dt>
            <dd className="text-xs text-[var(--text-primary)]">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Permissions({ permissions, roleName }: { permissions: EffectivePermission[]; roleName: string | null }) {
  const byResource = new Map<string, EffectivePermission[]>()
  for (const p of permissions) {
    const resource = p.key.split(':')[0] ?? 'other'
    const list = byResource.get(resource)
    if (list) list.push(p)
    else byResource.set(resource, [p])
  }

  return (
    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      {permissions.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--text-tertiary)]">
          No permissions. An invited, suspended or deactivated account holds none,
          whatever its role says.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[11px] text-[var(--text-tertiary)]">
            {permissions.length} permission{permissions.length === 1 ? '' : 's'} in effect
            {roleName ? `, mostly from the ${roleName} role` : ''}.
          </p>
          <div className="space-y-3">
            {[...byResource.entries()].map(([resource, items]) => (
              <div key={resource}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">{resource}</p>
                <ul className="space-y-1">
                  {items.map((p) => (
                    <li key={p.key} className="flex items-center justify-between gap-3 border-b py-1" style={{ borderColor: 'var(--border)' }}>
                      <span className="font-mono text-[11px] text-[var(--text-primary)]">{p.key}</span>
                      {/* Where it came from, and why — the override reason on
                          hover is the whole point of storing one. */}
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                        title={p.source === 'override' ? p.reason ?? 'Granted directly' : `From the ${roleName ?? 'role'}`}
                        style={
                          p.source === 'override'
                            ? { color: 'var(--warning)', background: 'rgba(199,119,0,0.10)' }
                            : { color: 'var(--text-tertiary)', background: 'rgba(0,0,0,0.04)' }
                        }
                      >
                        {p.source === 'override' ? 'override' : 'from role'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Activity({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border py-12 text-center" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
        <p className="text-xs text-[var(--text-tertiary)]">Nothing has happened to this account yet.</p>
      </section>
    )
  }
  return (
    <section className="space-y-1.5">
      {rows.map((row) => {
        const { diffs, reason, notes } = splitChanges(row.changes)
        return (
          <article key={row.id} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
            <p className="text-[11px] text-[var(--text-primary)]">{humaniseAction(row.action)}</p>
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
            {reason && (
              <p className="mt-1 text-[10px] italic text-[var(--text-secondary)]">“{reason}”</p>
            )}
            {notes.map((n) => (
              <p key={n} className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{n}</p>
            ))}
            <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
              {row.actorLabel} · {relativeTime(row.createdAt)}
            </p>
          </article>
        )
      })}
    </section>
  )
}

/**
 * The audit record stores the actor's reason and a few side effects alongside
 * the real field changes. Rendering them as diffs produces lines like
 * "reason: empty → Left the company", which reads as a bug. They are the same
 * record; only the presentation differs.
 */
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

const render = (v: unknown) => (v === null || v === undefined || v === '' ? 'empty' : String(v))

function humaniseAction(action: string): string {
  const map: Record<string, string> = {
    'user.invited': 'Invited',
    'user.invite_resent': 'Invitation resent',
    'user.updated': 'Profile updated',
    'user.role_changed': 'Role changed',
    'user.status_changed': 'Status changed',
    'user.permission_overridden': 'Permission override set',
    'user.permission_override_removed': 'Permission override removed',
    'user.sessions_revoked': 'Signed out of all sessions',
  }
  return map[action] ?? action
}

// ─── Dialogs ─────────────────────────────────────────────────

function ChangeRoleDialog({ user, onClose, onDone }: { user: DirectoryUser; onClose: () => void; onDone: (m: string) => void }) {
  const ref = useModalBehaviour(onClose)
  const me = useQuery({ queryKey: ['rbac', 'me'], queryFn: fetchMe })
  const [roleId, setRoleId] = useState(user.role?.id ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => changeUserRole(user.id, roleId, reason.trim() || undefined),
    onSuccess: () => onDone(`${user.name}'s role was changed.`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change the role.'),
  })

  const roles = me.data?.assignableRoles ?? []

  return (
    <Dialog dialogRef={ref} title={`Change ${user.name}'s role`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}
      <select
        value={roleId} onChange={(e) => { setRoleId(e.target.value); setError(null) }}
        className="w-full rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}
      >
        <option value="">Choose a role…</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      {roles.length === 0 && (
        <p className="text-[10px] text-[var(--text-tertiary)]">
          You can only assign roles below your own, and there are none.
        </p>
      )}

      <PermissionPreview roleId={roleId || null} />

      <input
        value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}
      />

      <DialogActions
        onClose={onClose}
        confirmLabel={save.isPending ? 'Saving…' : 'Change role'}
        disabled={!roleId || roleId === user.role?.id || save.isPending}
        onConfirm={() => { setError(null); save.mutate() }}
      />
    </Dialog>
  )
}

function ChangeStatusDialog({ user, onClose, onDone }: { user: DirectoryUser; onClose: () => void; onDone: (m: string) => void }) {
  const ref = useModalBehaviour(onClose)
  const reactivating = user.lifecycleStatus !== 'active'
  const [status, setStatus] = useState<'active' | 'suspended' | 'deactivated'>(reactivating ? 'active' : 'deactivated')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => changeUserStatus(user.id, status, reason.trim()),
    onSuccess: (r) => onDone(
      status === 'active'
        ? `${user.name} was reactivated.`
        : `${user.name} was ${status}. ${r.data.sessionsRevoked} session${r.data.sessionsRevoked === 1 ? '' : 's'} ended.`,
    ),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not change the status.'),
  })

  return (
    <Dialog dialogRef={ref} title={reactivating ? `Reactivate ${user.name}` : `Deactivate ${user.name}`} onClose={onClose}>
      {error && <Alert>{error}</Alert>}

      {/* §7.3: state the consequence in plain language, not a generic warning. */}
      {!reactivating && (
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {user.name} will be signed out immediately and will not be able to sign back in.
          Their task assignments, comments and history are all preserved — nothing is deleted.
        </p>
      )}
      {reactivating && (
        <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
          {user.name} will be able to sign in again with the {user.role?.name ?? 'their'} role
          and everything it allows.
        </p>
      )}

      {!reactivating && (
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-full rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}>
          <option value="deactivated">Deactivate — no longer has access</option>
          <option value="suspended">Suspend — temporarily blocked</option>
        </select>
      )}

      <div>
        <input
          value={reason} onChange={(e) => { setReason(e.target.value); setError(null) }}
          placeholder="Why? (required)"
          className="w-full rounded-lg border px-2.5 py-2 text-xs" style={{ borderColor: 'var(--border)' }}
        />
        <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
          Recorded in the audit log, so whoever reviews this later knows why.
        </p>
      </div>

      <DialogActions
        onClose={onClose}
        confirmLabel={save.isPending ? 'Saving…' : reactivating ? 'Reactivate' : 'Confirm'}
        disabled={reason.trim().length < 5 || save.isPending}
        danger={!reactivating}
        onConfirm={() => { setError(null); save.mutate() }}
      />
    </Dialog>
  )
}

// ─── Dialog shell ────────────────────────────────────────────

function Dialog({
  dialogRef, title, onClose, children,
}: { dialogRef: React.RefObject<HTMLDivElement>; title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="projects-module fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      style={{ background: 'rgba(0,0,0,0.28)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl border p-5 shadow-xl"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const Alert = ({ children }: { children: React.ReactNode }) => (
  <div role="alert" className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px]" style={{ background: 'rgba(216,53,42,0.08)' }}>
    <AlertTriangle size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />
    <span className="text-[var(--text-primary)]">{children}</span>
  </div>
)

function DialogActions({
  onClose, onConfirm, confirmLabel, disabled, danger,
}: { onClose: () => void; onConfirm: () => void; confirmLabel: string; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onClose} className="rounded-lg border px-3 py-2 text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--border)' }}>
        Cancel
      </button>
      <button
        onClick={onConfirm} disabled={disabled}
        className="rounded-lg px-3 py-2 text-xs font-medium text-white transition-all active:scale-[0.98] disabled:opacity-50"
        style={{ background: danger ? 'var(--danger)' : 'var(--accent)' }}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
