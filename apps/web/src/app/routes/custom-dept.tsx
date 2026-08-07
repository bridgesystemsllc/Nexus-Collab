import { useMemo, useState } from 'react'
import { Boxes, CheckCircle2, FolderKanban, Loader2 } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { useDepartments, useDepartment } from '@/hooks/useData'
import { DepartmentProjectsTab } from '@/modules/projects/ProjectsModule'

// ─── Generic department page ─────────────────────────────────
// Every department that is not R&D, Operations or Finance lands here —
// including any created in future. It was previously a static mock keyed off a
// hardcoded slug map, which meant a new department showed somebody else's
// invented metrics.
//
// It is now driven entirely by the department record, so a department created
// tomorrow gets a working page with a Projects tab and no code change. That is
// the requirement: the module reaches every department, now and future.

type Tab = 'projects' | 'modules'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'projects', label: 'Projects', icon: FolderKanban },
  { key: 'modules', label: 'Modules', icon: Boxes },
]

export function CustomDeptPage() {
  const selectedDeptId = useAppStore((s) => s.selectedDeptId)
  const [tab, setTab] = useState<Tab>('projects')

  const { data: departments, isLoading: deptsLoading } = useDepartments()

  // The sidebar stores a slug for the legacy entries and an id for real ones,
  // so resolve by either rather than assuming the newer shape.
  const department = useMemo(() => {
    if (!Array.isArray(departments)) return null
    return (
      departments.find((d: any) => d.id === selectedDeptId) ??
      departments.find(
        (d: any) => d.name?.toLowerCase().replace(/[^a-z]+/g, '-') === selectedDeptId,
      ) ??
      null
    )
  }, [departments, selectedDeptId])

  const { data: detail } = useDepartment(department?.id ?? '')
  const modules = (detail?.modules as any[]) ?? []

  if (deptsLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 size={15} className="animate-spin" />
        Loading department…
      </div>
    )
  }

  if (!department) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="rounded-xl border border-dashed border-[var(--border-default)] py-16 text-center">
          <p className="text-sm font-medium text-[var(--text-primary)]">Department not found</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            It may have been archived or renamed. Pick another from the sidebar.
          </p>
        </div>
      </div>
    )
  }

  const color = department.color || 'var(--accent)'

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
          style={{ background: `${color}20`, color }}
        >
          {department.icon && department.icon.length <= 2 ? department.icon : <Boxes size={20} />}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            {department.name}
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            {department.description || 'Department workspace'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] rounded-xl border border-[var(--border-subtle)] w-fit">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? 'text-white shadow-md'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              }`}
              style={active ? { background: 'var(--accent-secondary)' } : undefined}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="stagger">
        {tab === 'projects' ? (
          <DepartmentProjectsTab
            departmentId={department.id}
            departmentName={department.name}
            departmentCode={department.code ?? null}
          />
        ) : modules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
            <Boxes size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">No modules configured yet</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Add modules to {department.name} from the Department Manager.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {modules.map((m: any) => (
              <div key={m.id} className="data-cell">
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--text-tertiary)]">
                  {m.type.replace(/_/g, ' ').toLowerCase()}
                </p>
                <p className="text-sm font-medium text-[var(--text-primary)] mt-1">{m.name}</p>
                <p className="text-2xl font-semibold tabular-nums mt-2 text-[var(--text-primary)]">
                  {m.items?.length ?? 0}
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">records</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="data-cell flex items-start gap-3">
        <CheckCircle2 size={18} className="text-[var(--success)] mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Connected to command center workflows
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {department.name} records surface in Everything, Cowork Spaces, tasks and Pulse.
            Initiatives owned by or shared with this department appear in the Projects tab.
          </p>
        </div>
      </div>
    </div>
  )
}
