/**
 * Department Visibility Helpers
 *
 * User-scoped filters for Tasks and Projects within a department.
 * These helpers enforce the visibility rules:
 *   - Tasks: ownerId=actor OR createdById=actor
 *   - Projects: PM OR sponsor OR createdBy OR ProjectMember
 *
 * ModuleItems (Briefs, CM, Tech Transfers, Formulations, NPD) remain org-wide
 * and do NOT use these helpers — they have no createdById field.
 */

import type { Prisma } from '@prisma/client'

/**
 * Prisma `where` fragment for tasks the actor can see in a department.
 * A task is visible if the actor owns it OR created it.
 *
 * Used by: overview pendingTasks, any dept-scoped task list
 */
export function userScopedTasksWhere(
  departmentId: string,
  actorId: string,
): Prisma.TaskWhereInput {
  return {
    departmentId,
    OR: [{ ownerId: actorId }, { createdById: actorId }],
  }
}

/**
 * Prisma `where` fragment for projects the actor can see in a department.
 * A project is visible if the actor is:
 *   - Project Manager
 *   - Executive Sponsor
 *   - Created the project
 *   - A ProjectMember
 *
 * Used by: overview openProjects, dept-scoped project list
 */
export function userScopedProjectsWhere(
  departmentId: string,
  actorId: string,
  orgId: string,
): Prisma.ProjectWhereInput {
  return {
    orgId,
    deletedAt: null,
    OR: [
      { ownerDepartmentId: departmentId },
      { departments: { some: { departmentId } } },
    ],
    AND: [
      {
        OR: [
          { projectManagerId: actorId },
          { executiveSponsorId: actorId },
          { createdById: actorId },
          { members: { some: { memberId: actorId } } },
        ],
      },
    ],
  }
}

/**
 * Prisma `where` fragment for the Tasks list endpoint when a department
 * filter is active. Ensures the actor only sees tasks they own or created.
 *
 * Used by: GET /tasks when dept query param is set
 */
export function userScopedTasksListWhere(
  departmentId: string,
  actorId: string,
): Prisma.TaskWhereInput {
  return {
    departmentId,
    OR: [{ ownerId: actorId }, { createdById: actorId }],
  }
}
