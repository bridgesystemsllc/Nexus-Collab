import { useState } from 'react'
import { ProjectScopeProvider, type ProjectScope } from './context/ProjectScopeContext'
import { ProjectsListView } from './views/ProjectsListView'
import { ProjectDetailView } from './views/ProjectDetailView'
import { ProjectCreateWizard } from './components/ProjectCreateWizard'

// ─── Projects & Initiatives — scope-aware shell ──────────────
// THE mount point. A department tab, a collab workspace and the portfolio all
// render this same component and differ only in the `scope` they pass.
//
// If a future change ever requires a per-department variant of anything below,
// that is the signal to widen the scope contract — not to copy this file.

export interface ProjectsModuleProps {
  scope: ProjectScope
  /** Used for "my tasks only" filtering; optional so read-only mounts work. */
  currentMemberId?: string | null
  /**
   * Selected project, lifted so the host page can survive a remount and so
   * navigation state can live in the app store. Uncontrolled when omitted.
   */
  projectId?: string | null
  onSelectProject?: (id: string | null) => void
}

export function ProjectsModule({
  scope, currentMemberId, projectId, onSelectProject,
}: ProjectsModuleProps) {
  const [internalId, setInternalId] = useState<string | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  const controlled = projectId !== undefined
  const selectedId = controlled ? projectId : internalId
  const select = (id: string | null) => {
    if (controlled) onSelectProject?.(id)
    else setInternalId(id)
  }

  return (
    <ProjectScopeProvider scope={scope}>
      {selectedId ? (
        <ProjectDetailView
          projectId={selectedId}
          onBack={() => select(null)}
          currentMemberId={currentMemberId}
        />
      ) : (
        <ProjectsListView onOpen={select} onCreate={() => setWizardOpen(true)} />
      )}

      {wizardOpen && (
        <ProjectCreateWizard
          onClose={() => setWizardOpen(false)}
          onCreated={(id) => { setWizardOpen(false); select(id) }}
        />
      )}
    </ProjectScopeProvider>
  )
}

/**
 * Convenience wrapper for department pages: the common case is "mount the
 * module scoped to this department", and requiring every page to build a
 * scope object by hand invites subtle differences between them.
 */
export function DepartmentProjectsTab({
  departmentId, departmentName, departmentCode, currentMemberId,
}: {
  departmentId: string | null
  departmentName: string
  departmentCode?: string | null
  currentMemberId?: string | null
}) {
  if (!departmentId) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] py-12 text-center">
        <p className="text-sm text-[var(--text-secondary)]">This department is still loading</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Projects appear once the department record is available.
        </p>
      </div>
    )
  }
  return (
    <ProjectsModule
      scope={{ type: 'department', departmentId, departmentName, departmentCode }}
      currentMemberId={currentMemberId}
    />
  )
}

export { ProjectScopeProvider } from './context/ProjectScopeContext'
export type { ProjectScope } from './context/ProjectScopeContext'
