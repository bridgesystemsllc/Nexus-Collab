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

  return {
    editProject,
    editGovernance: governance,
    createTask: can(actor, 'CREATE_TASK_OWN_LANE', project, ownLaneProbe).allowed,
    editTaskOwnLane: can(actor, 'EDIT_TASK_OWN_LANE', project, ownLaneProbe).allowed,
    editTimeline: editProject,
    setBaseline: governance,
  }
}
