import { createContext, useContext, useMemo, type ReactNode } from 'react'

// ─── Project scope ───────────────────────────────────────────
// The single mechanism that lets one module serve every mount point. A
// department page, a collab workspace and the portfolio all render the SAME
// components; only the scope differs.
//
// If a component ever needs to know "which department am I in", it reads it
// from here. Nothing takes a departmentId prop threaded down from a page,
// because that is how per-department copies start.

export type ProjectScope =
  | { type: 'department'; departmentId: string; departmentCode?: string | null; departmentName: string }
  | { type: 'collab'; collabId: string; collabName: string }
  | { type: 'portfolio' }

export interface ProjectScopeValue {
  scope: ProjectScope
  /** Department filter for list queries, or undefined for unscoped views. */
  departmentId?: string
  /** Human label for headers and empty states. */
  label: string
  /**
   * Should the list include projects the department merely participates in?
   * True everywhere — a project owned by R&D that Marketing contributes to
   * must appear in Marketing's tab, or the whole "one project, many
   * departments" model is invisible.
   */
  includeParticipating: boolean
  isDepartment: boolean
  isCollab: boolean
  isPortfolio: boolean
}

const ProjectScopeContext = createContext<ProjectScopeValue | null>(null)

export function ProjectScopeProvider({
  scope,
  children,
}: {
  scope: ProjectScope
  children: ReactNode
}) {
  const value = useMemo<ProjectScopeValue>(() => {
    switch (scope.type) {
      case 'department':
        return {
          scope,
          departmentId: scope.departmentId,
          label: scope.departmentName,
          includeParticipating: true,
          isDepartment: true,
          isCollab: false,
          isPortfolio: false,
        }
      case 'collab':
        return {
          scope,
          departmentId: undefined,
          label: scope.collabName,
          includeParticipating: true,
          isDepartment: false,
          isCollab: true,
          isPortfolio: false,
        }
      case 'portfolio':
      default:
        return {
          scope: { type: 'portfolio' },
          departmentId: undefined,
          label: 'All initiatives',
          includeParticipating: true,
          isDepartment: false,
          isCollab: false,
          isPortfolio: true,
        }
    }
  }, [scope])

  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>
}

export function useProjectScope(): ProjectScopeValue {
  const ctx = useContext(ProjectScopeContext)
  if (!ctx) {
    // Failing loudly beats silently rendering the portfolio inside a
    // department tab, which would show every project to everyone.
    throw new Error('useProjectScope must be used inside a ProjectScopeProvider')
  }
  return ctx
}

/**
 * Default task-board grouping for the current scope.
 * Inside a collab the interesting question is "which department is doing
 * what", so lanes are the swimlanes. Inside one department everyone is the
 * same department, so grouping by it would produce a single column.
 */
export function useDefaultBoardGrouping(): 'status' | 'department' {
  const { isCollab, isPortfolio } = useProjectScope()
  return isCollab || isPortfolio ? 'department' : 'status'
}
