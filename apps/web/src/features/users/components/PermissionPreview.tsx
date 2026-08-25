import { useQuery } from '@tanstack/react-query'
import { Check, ShieldAlert } from 'lucide-react'
import { fetchRole } from '../api/usersApi'

// ─── Permission preview ──────────────────────────────────────
// §7.2 calls this the single most important element on the invite screen: an
// admin should never assign a role without seeing its consequences.
//
// It reads the role's real permission set from the server rather than any
// client-side notion of what a role means, so what is previewed is exactly
// what will apply.

const RESOURCE_LABELS: Record<string, string> = {
  users: 'People',
  roles: 'Roles and permissions',
  settings: 'Workspace settings',
  audit: 'Audit log',
  projects: 'Projects',
  departments: 'Departments',
  billing: 'Billing',
}

export function PermissionPreview({ roleId }: { roleId: string | null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['rbac', 'role', roleId],
    queryFn: () => fetchRole(roleId as string),
    enabled: !!roleId,
    // Roles change rarely and this refetches on every select; caching keeps the
    // preview instant when someone compares two roles back and forth.
    staleTime: 5 * 60_000,
  })

  if (!roleId) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center">
        <p className="text-[11px] text-[var(--text-tertiary)]">
          Choose a role to see exactly what it allows.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-label="Loading permissions">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-[var(--border)] px-3 py-3">
        <p className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
          <ShieldAlert size={12} />
          Could not load this role's permissions. Assigning it will still work —
          you just cannot preview it right now.
        </p>
      </div>
    )
  }

  const total = data.permissionsByResource.reduce((n, g) => n + g.permissions.length, 0)

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-[var(--text-primary)]">
          {/* "A Admin" reads as a typo the first time and every time after. */}
          {/^[AEIOU]/i.test(data.name) ? 'An' : 'A'} {data.name} can:
        </p>
        <span className="text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {total} permission{total === 1 ? '' : 's'}
        </span>
      </div>

      {total === 0 ? (
        // A role with nothing is a real configuration, and silently showing an
        // empty box would read as a loading failure.
        <p className="text-[11px] text-[var(--text-tertiary)]">
          Nothing yet — this role has no permissions, so the person will be able
          to sign in but not see any module.
        </p>
      ) : (
        <div className="space-y-2">
          {data.permissionsByResource.map((group) => (
            <div key={group.resource}>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                {RESOURCE_LABELS[group.resource] ?? group.resource}
              </p>
              <ul className="space-y-0.5">
                {group.permissions.map((p) => (
                  <li key={p.key} className="flex items-start gap-1.5">
                    <Check size={11} className="mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                    <span className="text-[11px] leading-snug text-[var(--text-secondary)]">
                      {p.label}
                      {p.description && (
                        <span className="text-[var(--text-tertiary)]"> — {p.description}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
