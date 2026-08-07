import type { ProjectDepartmentRow } from '../types'

// ─── Department lane chips ───────────────────────────────────
// The visual answer to "who else is on this?". Shown on every project card and
// row, because the whole point of the module is that a project belongs to more
// than one department at once.

const ROLE_TITLE: Record<string, string> = {
  OWNER: 'owns this project',
  CONTRIBUTOR: 'contributing',
  REVIEWER: 'reviewing',
  VIEWER: 'view only',
}

export function DepartmentLaneChips({
  departments,
  max = 4,
  highlightDepartmentId,
  size = 'sm',
}: {
  departments: ProjectDepartmentRow[]
  max?: number
  /** Ring the current department so a user can spot their own lane instantly. */
  highlightDepartmentId?: string
  size?: 'sm' | 'md'
}) {
  if (!departments?.length) {
    return <span className="text-xs text-[var(--text-tertiary)]">—</span>
  }

  // Owner first, then the viewer's own department, then the rest. A user
  // scanning a list cares most about whether they are involved.
  const sorted = [...departments].sort((a, b) => {
    if (a.role === 'OWNER') return -1
    if (b.role === 'OWNER') return 1
    if (a.departmentId === highlightDepartmentId) return -1
    if (b.departmentId === highlightDepartmentId) return 1
    return a.department.name.localeCompare(b.department.name)
  })

  const shown = sorted.slice(0, max)
  const overflow = sorted.length - shown.length
  const pad = size === 'md' ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]'

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((d) => {
        const color = d.department.color || 'var(--text-tertiary)'
        const isMine = d.departmentId === highlightDepartmentId
        return (
          <span
            key={d.id ?? d.departmentId}
            className={`inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap ${pad}`}
            style={{
              background: `${color}14`,
              color,
              boxShadow: isMine ? `inset 0 0 0 1px ${color}` : undefined,
            }}
            title={`${d.department.name} — ${ROLE_TITLE[d.role] ?? d.role.toLowerCase()}${
              d.laneLead ? ` (lead: ${d.laneLead.name})` : ''
            }`}
          >
            {d.role === 'OWNER' && <span aria-hidden>★</span>}
            {d.department.name}
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          className={`rounded-md font-medium text-[var(--text-tertiary)] bg-[var(--bg-overlay)] ${pad}`}
          title={sorted.slice(max).map((d) => d.department.name).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
