// ─── Projects & Initiatives — authorization ──────────────────
// One function decides every project mutation. Routes call `can(...)` and
// nothing else; UI hiding is convenience, never security.
//
// The rule that makes cross-department collaboration real rather than one
// department dumping work on another: writing into a lane you do not belong to
// is not a permission you either have or lack. A lane lead CAN create work in
// another department's lane, but only as a *request* the receiving lane lead
// must accept. That is expressed here as CREATE_TASK_OTHER_LANE being allowed
// while EDIT_TASK_OTHER_LANE is not.

export type ProjectAction =
  | 'VIEW_PROJECT'
  | 'CREATE_PROJECT'
  | 'EDIT_PROJECT'
  | 'SET_BASELINE'
  | 'ADD_DEPARTMENT'
  | 'LINK_COLLAB'
  | 'CREATE_TASK_OWN_LANE'
  | 'CREATE_TASK_OTHER_LANE'
  | 'EDIT_TASK_OWN_LANE'
  | 'EDIT_TASK_OTHER_LANE'
  | 'ACCEPT_TASK_REQUEST'
  | 'RESPOND_CHECKIN'
  | 'PUBLISH_REPORT'
  | 'ARCHIVE_PROJECT'

// Org-level role from Member.role.
export type OrgRole = 'ADMIN' | 'OPS_MANAGER' | 'DEPT_LEAD' | 'PROJECT_LEAD' | 'MEMBER'

// Project-level role from ProjectMember.role.
export type ProjectRole =
  | 'PROJECT_MANAGER' | 'LANE_LEAD' | 'CONTRIBUTOR' | 'REVIEWER' | 'VIEWER' | 'SPONSOR'

export interface PolicyActor {
  id: string
  role: OrgRole | string
  orgId: string
  departmentId?: string | null
}

export interface PolicyProject {
  id: string
  orgId: string
  projectManagerId?: string | null
  executiveSponsorId?: string | null
  ownerDepartmentId?: string | null
  isConfidential: boolean
  deletedAt?: Date | null
  // Participating departments, with the lane lead for each.
  departments: { departmentId: string; role: string; laneLeadId?: string | null }[]
  // Explicit member overrides.
  members: { memberId: string; role: string; departmentId?: string | null }[]
}

export interface PolicyTask {
  id?: string
  departmentId?: string | null
  ownerId?: string | null
  acceptanceStatus?: string | null
}

export interface PolicyDecision {
  allowed: boolean
  // Populated on denial so the route can return a message that says what was
  // actually wrong instead of a bare 403.
  reason?: string
}

const ALLOW: PolicyDecision = { allowed: true }
const deny = (reason: string): PolicyDecision => ({ allowed: false, reason })

// Org roles that may act on any project in their organization.
function isOrgAdmin(actor: PolicyActor): boolean {
  return actor.role === 'ADMIN' || actor.role === 'OPS_MANAGER'
}

function isProjectManager(actor: PolicyActor, project: PolicyProject): boolean {
  if (project.projectManagerId === actor.id) return true
  return project.members.some(
    (m) => m.memberId === actor.id && m.role === 'PROJECT_MANAGER',
  )
}

function isSponsor(actor: PolicyActor, project: PolicyProject): boolean {
  if (project.executiveSponsorId === actor.id) return true
  return project.members.some((m) => m.memberId === actor.id && m.role === 'SPONSOR')
}

// A lane lead for a specific department, either via ProjectDepartment.laneLeadId
// or an explicit LANE_LEAD membership scoped to that department.
export function isLaneLead(
  actor: PolicyActor,
  project: PolicyProject,
  departmentId?: string | null,
): boolean {
  if (!departmentId) {
    return (
      project.departments.some((d) => d.laneLeadId === actor.id) ||
      project.members.some((m) => m.memberId === actor.id && m.role === 'LANE_LEAD')
    )
  }
  const lane = project.departments.find((d) => d.departmentId === departmentId)
  if (lane?.laneLeadId === actor.id) return true
  return project.members.some(
    (m) => m.memberId === actor.id && m.role === 'LANE_LEAD' && m.departmentId === departmentId,
  )
}

// The departments an actor can act within on this project: their home
// department plus any lane they hold an explicit membership in.
export function actorLanes(actor: PolicyActor, project: PolicyProject): Set<string> {
  const lanes = new Set<string>()
  if (actor.departmentId) lanes.add(actor.departmentId)
  for (const m of project.members) {
    if (m.memberId === actor.id && m.departmentId) lanes.add(m.departmentId)
  }
  return lanes
}

function membership(actor: PolicyActor, project: PolicyProject) {
  return project.members.find((m) => m.memberId === actor.id) ?? null
}

// Is the actor's department participating at all?
function inParticipatingDept(actor: PolicyActor, project: PolicyProject): boolean {
  if (!actor.departmentId) return false
  return project.departments.some((d) => d.departmentId === actor.departmentId)
}

// Anyone with standing on this project: an explicit member, or a member of a
// participating department. Distinct from canView, which also admits the
// owning department. Callers must check isViewerOnly first — a VIEWER is a
// participant.
export function isProjectParticipant(actor: PolicyActor, project: PolicyProject): boolean {
  return !!membership(actor, project) || inParticipatingDept(actor, project)
}

function isViewerOnly(actor: PolicyActor, project: PolicyProject): boolean {
  const m = membership(actor, project)
  if (m) return m.role === 'VIEWER'
  // Department-level VIEWER lane with no individual override.
  const lane = actor.departmentId
    ? project.departments.find((d) => d.departmentId === actor.departmentId)
    : null
  return lane?.role === 'VIEWER'
}

// ─── Visibility ──────────────────────────────────────────────
export function canView(actor: PolicyActor, project: PolicyProject): PolicyDecision {
  if (project.orgId !== actor.orgId) return deny('Project belongs to another organization')
  if (project.deletedAt) return deny('Project has been deleted')

  // Confidential projects ignore department participation entirely — only
  // explicitly named members and org admins get in.
  if (project.isConfidential) {
    if (isOrgAdmin(actor)) return ALLOW
    if (isProjectManager(actor, project) || isSponsor(actor, project)) return ALLOW
    if (membership(actor, project)) return ALLOW
    return deny('Project is confidential and you are not a member')
  }

  if (isOrgAdmin(actor)) return ALLOW
  if (membership(actor, project)) return ALLOW
  if (inParticipatingDept(actor, project)) return ALLOW
  if (project.ownerDepartmentId && project.ownerDepartmentId === actor.departmentId) return ALLOW
  return deny('Your department is not participating in this project')
}

// ─── Main entry point ────────────────────────────────────────
export function can(
  actor: PolicyActor,
  action: ProjectAction,
  project?: PolicyProject | null,
  task?: PolicyTask | null,
): PolicyDecision {
  // Creating a project needs no project context — anyone who is not a pure
  // viewer may start an initiative in their own department.
  if (action === 'CREATE_PROJECT') {
    if (!actor.departmentId && !isOrgAdmin(actor)) {
      return deny('You must belong to a department to create a project')
    }
    return ALLOW
  }

  if (!project) return deny('Project not found')

  const view = canView(actor, project)
  if (!view.allowed) return view

  const admin = isOrgAdmin(actor)
  const pm = isProjectManager(actor, project)
  const viewerOnly = isViewerOnly(actor, project)

  switch (action) {
    case 'VIEW_PROJECT':
      return ALLOW

    // ── Project-level administration: PM or org admin only ──
    // Editing project content is open to anyone working on the project.
    // Baselining and the three below are not: baselineEndDate is frozen at
    // approval and every slip metric is measured against it.
    case 'EDIT_PROJECT':
      if (admin || pm) return ALLOW
      if (viewerOnly) return deny('Viewers cannot edit this project')
      return isProjectParticipant(actor, project)
        ? ALLOW
        : deny('You are not a member of this project')

    case 'SET_BASELINE':
    case 'ADD_DEPARTMENT':
    case 'PUBLISH_REPORT':
      return admin || pm ? ALLOW : deny('Requires the project manager or an admin')

    case 'ARCHIVE_PROJECT':
      // A PM may archive, but the spec requires sponsor approval; the route
      // enforces the approval record, the policy enforces who may ask.
      return admin || pm ? ALLOW : deny('Requires the project manager or an admin')

    case 'LINK_COLLAB':
      if (admin || pm) return ALLOW
      return isLaneLead(actor, project)
        ? ALLOW
        : deny('Requires a lane lead, the project manager, or an admin')

    // ── Tasks ──
    case 'CREATE_TASK_OWN_LANE': {
      if (viewerOnly) return deny('Viewers cannot create tasks')
      if (admin || pm) return ALLOW
      const lane = task?.departmentId
      if (!lane) return deny('A task must specify a department lane')
      return actorLanes(actor, project).has(lane)
        ? ALLOW
        : deny('That lane is not yours — raise it as a cross-department request instead')
    }

    case 'CREATE_TASK_OTHER_LANE': {
      // Allowed, but the route must mark it as a pending request. Only lane
      // leads and above may reach into another department at all.
      if (admin || pm) return ALLOW
      if (viewerOnly) return deny('Viewers cannot create tasks')
      return isLaneLead(actor, project)
        ? ALLOW
        : deny('Only a lane lead, the project manager, or an admin may request work from another department')
    }

    case 'EDIT_TASK_OWN_LANE': {
      if (viewerOnly) return deny('Viewers cannot edit tasks')
      if (admin || pm) return ALLOW
      const lane = task?.departmentId
      if (!lane) return deny('Task has no department lane')
      if (!actorLanes(actor, project).has(lane)) {
        return deny('You can only edit tasks in your own lane')
      }
      // Within their own lane a lane lead edits anything; a plain contributor
      // edits only what is assigned to them.
      if (isLaneLead(actor, project, lane)) return ALLOW
      return task?.ownerId === actor.id
        ? ALLOW
        : deny('Contributors can only edit tasks assigned to them')
    }

    case 'EDIT_TASK_OTHER_LANE':
      return admin || pm
        ? ALLOW
        : deny('Only the project manager or an admin may edit another department’s task')

    case 'ACCEPT_TASK_REQUEST': {
      if (admin || pm) return ALLOW
      const lane = task?.departmentId
      if (!lane) return deny('Task has no department lane')
      return isLaneLead(actor, project, lane)
        ? ALLOW
        : deny('Only the receiving lane lead may accept or reject a cross-department request')
    }

    case 'RESPOND_CHECKIN':
      return viewerOnly ? deny('Viewers cannot respond to check-ins') : ALLOW

    default: {
      // Exhaustiveness: a new action added to the union without a case here
      // fails closed rather than silently allowing.
      const _never: never = action
      return deny(`Unknown action: ${String(_never)}`)
    }
  }
}

// Convenience for routes: throws a shaped error instead of returning.
export class PolicyError extends Error {
  readonly status = 403
  constructor(message: string) {
    super(message)
    this.name = 'PolicyError'
  }
}

export function assertCan(
  actor: PolicyActor,
  action: ProjectAction,
  project?: PolicyProject | null,
  task?: PolicyTask | null,
): void {
  const decision = can(actor, action, project, task)
  if (!decision.allowed) throw new PolicyError(decision.reason ?? 'Forbidden')
}
