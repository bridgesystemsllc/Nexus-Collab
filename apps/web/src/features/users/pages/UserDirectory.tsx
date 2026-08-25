import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, RotateCcw, Search, UserPlus, Users } from 'lucide-react'
import {
  fetchUsers, fetchMe, fetchRoles, fetchDepartments,
  type DirectoryUser, type LifecycleStatus, type UserListParams, type InviteResponse,
} from '../api/usersApi'
import { StatusPill, RoleChip, relativeTime } from '../components/StatusPill'
import { InviteUserDrawer, InviteResultBanner } from '../components/InviteUserDrawer'
import { UserProfile } from './UserProfile'

// ─── User directory ──────────────────────────────────────────
// All filter and page state lives in the URL, so a filtered view is
// shareable and survives a refresh (§12). The app switches pages through
// Zustand rather than routes, but BrowserRouter is mounted, so the query
// string is available without touching that.

const STATUS_FILTERS: { value: LifecycleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invited' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deactivated', label: 'Deactivated' },
]

export function UserDirectory() {
  const [params, setParams] = useSearchParams()
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<InviteResponse | null>(null)
  const [openUserId, setOpenUserId] = useState<string | null>(null)

  // Read straight from the URL — no mirrored state to fall out of step.
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? '') as LifecycleStatus | ''
  const roleId = params.get('role') ?? ''
  const departmentId = params.get('dept') ?? ''
  const page = Number(params.get('page') ?? '1')

  const [searchInput, setSearchInput] = useState(q)

  // Name the page in the URL so a refresh returns here rather than to the
  // dashboard — the filters alone survive a reload, but they are meaningless
  // on a screen that no longer shows them. Cleared on the way out so the
  // next page does not inherit a query string that means nothing to it.
  useEffect(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('view', 'people')
      return next
    }, { replace: true })
    return () => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const key of ['view', 'q', 'status', 'role', 'dept', 'page']) next.delete(key)
        return next
      }, { replace: true })
    }
  }, [setParams])

  // Debounced so a search does not fire a request per keystroke, and does not
  // push a history entry per keystroke either.
  useEffect(() => {
    if (searchInput === q) return
    const t = setTimeout(() => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (searchInput) next.set('q', searchInput)
        else next.delete('q')
        next.delete('page')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput, q, setParams])

  const setFilter = (key: string, value: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      // Any filter change resets paging — page 4 of a different result set is
      // almost always empty, and looks like a bug.
      next.delete('page')
      return next
    })
  }

  const listParams: UserListParams = useMemo(() => ({
    ...(q ? { q } : {}),
    ...(status ? { status } : {}),
    ...(roleId ? { roleId } : {}),
    ...(departmentId ? { departmentId } : {}),
    page,
    pageSize: 25,
  }), [q, status, roleId, departmentId, page])

  const me = useQuery({ queryKey: ['rbac', 'me'], queryFn: fetchMe })
  const roles = useQuery({ queryKey: ['rbac', 'roles'], queryFn: fetchRoles, staleTime: 5 * 60_000 })
  const departments = useQuery({ queryKey: ['departments'], queryFn: fetchDepartments, staleTime: 5 * 60_000 })

  const users = useQuery({
    queryKey: ['users', listParams],
    queryFn: () => fetchUsers(listParams),
    placeholderData: (prev) => prev,
  })

  // The invite drawer's reactivate action opens a profile from inside a
  // component that has no route to navigate to.
  useEffect(() => {
    const open = (e: Event) => setOpenUserId((e as CustomEvent<string>).detail)
    window.addEventListener('nexus:open-user', open)
    return () => window.removeEventListener('nexus:open-user', open)
  }, [])

  const can = (key: string) => (me.data?.permissions ?? []).some((p) => p.key === key)
  const hasFilters = !!(q || status || roleId || departmentId)
  // Clears the filters, not the page marker — dropping `view` here would send
  // the next refresh to the dashboard.
  const clearFilters = () => { setSearchInput(''); setParams(new URLSearchParams({ view: 'people' })) }

  if (openUserId) {
    return <UserProfile userId={openUserId} onBack={() => setOpenUserId(null)} />
  }

  return (
    <div className="projects-module mx-auto max-w-[1400px] space-y-4 p-6">
      <header>
        <h1 className="display-type text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          People
        </h1>
        <p className="text-sm text-[var(--text-tertiary)]">
          Everyone with access to this workspace, and what they can do
        </p>
      </header>

      {inviteResult && (
        <InviteResultBanner result={inviteResult} onDismiss={() => setInviteResult(null)} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-primary)]">Directory</h2>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
            {users.data?.total ?? '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search people…"
              aria-label="Search people"
              className="w-52 rounded-lg border py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
            />
          </div>

          <select
            value={roleId} onChange={(e) => setFilter('role', e.target.value)} aria-label="Filter by role"
            className="rounded-lg border px-2 py-1.5 text-xs text-[var(--text-secondary)]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <option value="">All roles</option>
            {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <select
            value={departmentId} onChange={(e) => setFilter('dept', e.target.value)} aria-label="Filter by department"
            className="rounded-lg border px-2 py-1.5 text-xs text-[var(--text-secondary)]"
            style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
          >
            <option value="">All departments</option>
            {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Hidden without the permission, not disabled — §7.2. A button
              someone can never use is noise. */}
          {can('users:create') && (
            <button
              onClick={() => setInviting(true)}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              <UserPlus size={14} /> Invite user
            </button>
          )}
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((s) => {
          const active = status === s.value
          return (
            <button
              key={s.value || 'all'}
              onClick={() => setFilter('status', s.value)}
              aria-pressed={active}
              className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
              style={
                active
                  ? { background: 'var(--accent)', color: '#fff', borderColor: 'transparent' }
                  : { background: 'var(--bg-surface)', color: 'var(--text-secondary)', borderColor: 'var(--border)' }
              }
            >
              {s.label}
            </button>
          )
        })}
        {hasFilters && (
          <button onClick={clearFilters} className="ml-1 text-xs text-[var(--text-tertiary)] underline underline-offset-2 hover:text-[var(--text-primary)]">
            Clear
          </button>
        )}
      </div>

      {/* Content — every state accounted for (§12) */}
      {users.isLoading ? (
        <TableSkeleton />
      ) : users.isError ? (
        <ErrorState onRetry={() => users.refetch()} />
      ) : (users.data?.data.length ?? 0) === 0 ? (
        hasFilters ? <ZeroResults onClear={clearFilters} /> : <EmptyState canInvite={can('users:create')} onInvite={() => setInviting(true)} />
      ) : (
        <UserTable users={users.data!.data} onOpen={setOpenUserId} />
      )}

      {/* Pagination */}
      {(users.data?.pages ?? 1) > 1 && (
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setFilter('page', String(Math.max(1, page - 1)))}
            disabled={page <= 1}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            Previous
          </button>
          <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
            Page {users.data!.page} of {users.data!.pages}
          </span>
          <button
            onClick={() => setFilter('page', String(page + 1))}
            disabled={page >= (users.data?.pages ?? 1)}
            className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}
          >
            Next
          </button>
        </div>
      )}

      {inviting && (
        <InviteUserDrawer
          onClose={() => setInviting(false)}
          onInvited={(result) => {
            setInviting(false)
            // Only surfaced when email is unconfigured — otherwise the
            // invitation simply went out and there is nothing to say.
            if (result.meta.acceptUrl) setInviteResult(result)
          }}
        />
      )}
    </div>
  )
}

// ─── Table ───────────────────────────────────────────────────

function UserTable({ users, onOpen }: { users: DirectoryUser[]; onOpen: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-subtle)' }}>
            {['Name', 'Role', 'Department', 'Status', 'Last active'].map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium text-[var(--text-tertiary)] ${i === 0 ? 'text-left' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              onClick={() => onOpen(u.id)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(u.id) }}
              tabIndex={0}
              role="button"
              aria-label={`Open ${u.name}`}
              className="cursor-pointer border-b transition-colors last:border-0 hover:bg-[var(--bg-subtle)] focus:outline-none focus:ring-2"
              style={{ borderColor: 'var(--border)' }}
            >
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Avatar user={u} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-primary)]">
                      {u.displayName || u.name}
                    </p>
                    <p className="truncate text-[10px] text-[var(--text-tertiary)]">{u.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2"><RoleChip role={u.role} /></td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{u.department?.name ?? '—'}</td>
              <td className="px-3 py-2"><StatusPill status={u.lifecycleStatus} /></td>
              <td className="px-3 py-2 tabular-nums text-[var(--text-tertiary)]">{relativeTime(u.lastLoginAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Avatar({ user, size = 28 }: { user: { name: string; avatar: string | null }; size?: number }) {
  // `Member.avatar` holds either a URL or pre-computed initials — TopBar has
  // always treated it that way, and rendering the initials as an <img src>
  // gives a broken-image icon for most of the directory.
  const isUrl = !!user.avatar && /^(https?:|\/)/.test(user.avatar)
  if (isUrl) {
    return <img src={user.avatar!} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  const initials =
    user.avatar?.trim() ||
    user.name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-white"
      style={{ width: size, height: size, background: 'var(--accent)', fontSize: size * 0.36 }}
    >
      {initials || '?'}
    </span>
  )
}

// ─── States ──────────────────────────────────────────────────

const TableSkeleton = () => (
  <div className="space-y-1.5" aria-busy="true" aria-label="Loading people">
    {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
  </div>
)

const EmptyState = ({ canInvite, onInvite }: { canInvite: boolean; onInvite: () => void }) => (
  <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: 'var(--border-strong)' }}>
    <Users size={22} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
    <p className="text-sm text-[var(--text-primary)]">Nobody here yet</p>
    <p className="mt-1 text-xs text-[var(--text-tertiary)]">Invite the first person to this workspace.</p>
    {canInvite && (
      <button onClick={onInvite} className="mt-3 text-xs font-medium" style={{ color: 'var(--accent)' }}>
        Invite someone
      </button>
    )}
  </div>
)

const ZeroResults = ({ onClear }: { onClear: () => void }) => (
  <div className="rounded-xl border border-dashed py-16 text-center" style={{ borderColor: 'var(--border-strong)' }}>
    <Search size={22} className="mx-auto mb-2 text-[var(--text-tertiary)]" />
    <p className="text-sm text-[var(--text-primary)]">Nobody matches those filters</p>
    <button onClick={onClear} className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
      <RotateCcw size={11} /> Clear filters
    </button>
  </div>
)

const ErrorState = ({ onRetry }: { onRetry: () => void }) => (
  <div className="rounded-xl border py-16 text-center" style={{ borderColor: 'var(--border)' }}>
    <AlertTriangle size={22} className="mx-auto mb-2" style={{ color: 'var(--danger)' }} />
    <p className="text-sm text-[var(--text-primary)]">Could not load the directory</p>
    <button onClick={onRetry} className="mt-2 text-xs font-medium" style={{ color: 'var(--accent)' }}>
      Try again
    </button>
  </div>
)
