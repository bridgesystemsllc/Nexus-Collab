import { can, type PolicyActor, type PolicyProject, type PolicyTask } from './policy'

// What the current actor may do to this project, computed from the same
// policy the write routes enforce.
//
// This exists because the client used to guess. A guess drifts: the old one
// both failed open before the member id resolved and omitted org admins. The
// server already knows the answer, so it says so.

export interface ProjectCapabilities {
  editProject: boolean
  editGovernance: boolean
  createTask: boolean
  /** Task dates on the Gantt go through per-task lane rules, not EDIT_PROJECT. */
  editTaskOwnLane: boolean
  /** Every timeline write route asserts EDIT_PROJECT, so this tracks it. */
  editTimeline: boolean
  setBaseline: boolean
  publishReport: boolean
  /**
   * The lane a new task should default to. The client cannot derive this — it
   * has no reliable handle on the current member.
   *
   * Must be a lane that exists ON THIS PROJECT, not merely the actor's own
   * department. CREATE_TASK_OWN_LANE is satisfied by the actor's department,
   * but the create route additionally rejects any department that is not
   * participating — so returning a non-participating lane hands the UI a
   * default the server will refuse.
   */
  defaultTaskLaneId: string | null
}

export function projectCapabilities(
  actor: PolicyActor,
  project: PolicyProject,
): ProjectCapabilities {
  const editProject = can(actor, 'EDIT_PROJECT', project).allowed
  const governance = can(actor, 'SET_BASELINE', project).allowed

  // Lane-scoped task actions need a task to judge. Probe with a task in the
  // actor's own lane, assigned to the actor — a plain contributor may only
  // edit tasks in their own lane that they themselves own, so that is the
  // "own lane" question EDIT_TASK_OWN_LANE actually asks.
  const ownLaneProbe: PolicyTask = {
    id: 'probe',
    departmentId: actor.departmentId ?? null,
    ownerId: actor.id,
    acceptanceStatus: null,
  }

  const createTask = can(actor, 'CREATE_TASK_OWN_LANE', project, ownLaneProbe).allowed

  return {
    editProject,
    editGovernance: governance,
    createTask,
    editTaskOwnLane: can(actor, 'EDIT_TASK_OWN_LANE', project, ownLaneProbe).allowed,
    editTimeline: editProject,
    setBaseline: governance,
    publishReport: can(actor, 'PUBLISH_REPORT', project).allowed,
    defaultTaskLaneId: defaultTaskLane(actor, project, createTask),
  }
}

/**
 * A lane the actor can actually create a task in on this project.
 *
 * Two rules have to agree. The policy asks "is this the actor's own lane"; the
 * create route separately rejects a department that is not participating in
 * the project. Returning the actor's department without checking the second
 * gives an admin viewing another department's project an "Add task" button
 * that 422s on save — reachable from the Projects page, whose default scope is
 * the whole portfolio.
 */
function defaultTaskLane(
  actor: PolicyActor,
  project: PolicyProject,
  createTask: boolean,
): string | null {
  const lanes = project.departments.map((d) => d.departmentId)

  // The actor's own lane, when the project actually has it. Correct for the
  // common case and the only option a plain contributor has.
  if (actor.departmentId && lanes.includes(actor.departmentId)) return actor.departmentId

  // Otherwise the actor is working outside their department. Only offer a
  // fallback to someone the policy lets create in any lane — for anyone else
  // createTask is already false and the UI shows no button to default.
  if (!createTask) return null

  // The owning lane is the least surprising home for a task on someone else's
  // project; any participating lane beats none.
  if (project.ownerDepartmentId && lanes.includes(project.ownerDepartmentId)) {
    return project.ownerDepartmentId
  }
  return lanes[0] ?? project.ownerDepartmentId ?? null
}
