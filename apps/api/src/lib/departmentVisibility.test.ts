import { describe, expect, it } from 'vitest'
import {
  userScopedTasksWhere,
  userScopedProjectsWhere,
  userScopedTasksListWhere,
} from './departmentVisibility'

describe('departmentVisibility', () => {
  const DEPT_ID = 'dept-123'
  const ACTOR_ID = 'user-456'
  const ORG_ID = 'org-789'

  describe('userScopedTasksWhere', () => {
    it('returns a where clause scoped to department and actor ownership', () => {
      const where = userScopedTasksWhere(DEPT_ID, ACTOR_ID)

      expect(where).toEqual({
        departmentId: DEPT_ID,
        OR: [{ ownerId: ACTOR_ID }, { createdById: ACTOR_ID }],
      })
    })

    it('matches tasks owned by the actor', () => {
      const where = userScopedTasksWhere(DEPT_ID, ACTOR_ID)
      expect(where.OR).toContainEqual({ ownerId: ACTOR_ID })
    })

    it('matches tasks created by the actor', () => {
      const where = userScopedTasksWhere(DEPT_ID, ACTOR_ID)
      expect(where.OR).toContainEqual({ createdById: ACTOR_ID })
    })

    it('does NOT include tasks the actor neither owns nor created', () => {
      const where = userScopedTasksWhere(DEPT_ID, ACTOR_ID)
      expect(where.OR).toHaveLength(2)
      expect(where.OR).not.toContainEqual({ ownerId: { not: null } })
    })
  })

  describe('userScopedProjectsWhere', () => {
    it('returns a where clause for projects in a department visible to actor', () => {
      const where = userScopedProjectsWhere(DEPT_ID, ACTOR_ID, ORG_ID)

      expect(where.orgId).toBe(ORG_ID)
      expect(where.deletedAt).toBeNull()
      expect(where.OR).toBeDefined()
      expect(where.AND).toBeDefined()
    })

    it('matches projects owned by or participating in the department', () => {
      const where = userScopedProjectsWhere(DEPT_ID, ACTOR_ID, ORG_ID)

      expect(where.OR).toContainEqual({ ownerDepartmentId: DEPT_ID })
      expect(where.OR).toContainEqual({
        departments: { some: { departmentId: DEPT_ID } },
      })
    })

    it('requires actor to be PM, sponsor, creator, or member', () => {
      const where = userScopedProjectsWhere(DEPT_ID, ACTOR_ID, ORG_ID)
      const actorFilter = (where.AND as any[])[0].OR

      expect(actorFilter).toContainEqual({ projectManagerId: ACTOR_ID })
      expect(actorFilter).toContainEqual({ executiveSponsorId: ACTOR_ID })
      expect(actorFilter).toContainEqual({ createdById: ACTOR_ID })
      expect(actorFilter).toContainEqual({
        members: { some: { memberId: ACTOR_ID } },
      })
    })

    it('does NOT include random viewers not associated with project', () => {
      const where = userScopedProjectsWhere(DEPT_ID, ACTOR_ID, ORG_ID)
      const actorFilter = (where.AND as any[])[0].OR

      expect(actorFilter).toHaveLength(4)
    })
  })

  describe('userScopedTasksListWhere', () => {
    it('returns the same structure as userScopedTasksWhere', () => {
      const listWhere = userScopedTasksListWhere(DEPT_ID, ACTOR_ID)
      const tasksWhere = userScopedTasksWhere(DEPT_ID, ACTOR_ID)

      expect(listWhere).toEqual(tasksWhere)
    })

    it('is suitable for the Tasks & Follow-up dept list endpoint', () => {
      const where = userScopedTasksListWhere(DEPT_ID, ACTOR_ID)

      expect(where.departmentId).toBe(DEPT_ID)
      expect(where.OR).toHaveLength(2)
    })
  })

  describe('org-wide modules (no creator filter)', () => {
    it('userScopedTasksWhere does NOT filter by module items', () => {
      const where = userScopedTasksWhere(DEPT_ID, ACTOR_ID)
      expect(where).not.toHaveProperty('moduleId')
    })

    it('userScopedProjectsWhere does NOT filter moduleItems', () => {
      const where = userScopedProjectsWhere(DEPT_ID, ACTOR_ID, ORG_ID)
      expect(where).not.toHaveProperty('moduleItems')
    })
  })
})
