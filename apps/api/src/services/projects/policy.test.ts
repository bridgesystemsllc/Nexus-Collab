import { describe, it, expect } from 'vitest'
import {
  can, canView, isLaneLead, actorLanes, assertCan, PolicyError,
  type PolicyActor, type PolicyProject, type PolicyTask,
} from './policy'

const ORG = 'org-1'
const RD = 'dept-rd'
const OPS = 'dept-ops'
const MKT = 'dept-mkt'

const actor = (over: Partial<PolicyActor> = {}): PolicyActor => ({
  id: 'u-contributor', role: 'MEMBER', orgId: ORG, departmentId: RD, ...over,
})

const project = (over: Partial<PolicyProject> = {}): PolicyProject => ({
  id: 'p-1', orgId: ORG,
  projectManagerId: 'u-pm',
  executiveSponsorId: 'u-sponsor',
  ownerDepartmentId: RD,
  isConfidential: false,
  deletedAt: null,
  departments: [
    { departmentId: RD, role: 'OWNER', laneLeadId: 'u-rd-lead' },
    { departmentId: OPS, role: 'CONTRIBUTOR', laneLeadId: 'u-ops-lead' },
  ],
  members: [],
  ...over,
})

const task = (over: Partial<PolicyTask> = {}): PolicyTask => ({
  id: 't-1', departmentId: RD, ownerId: null, acceptanceStatus: null, ...over,
})

const ADMIN = actor({ id: 'u-admin', role: 'ADMIN', departmentId: null })
const PM = actor({ id: 'u-pm', role: 'PROJECT_LEAD', departmentId: RD })
const RD_LEAD = actor({ id: 'u-rd-lead', role: 'DEPT_LEAD', departmentId: RD })
const OPS_LEAD = actor({ id: 'u-ops-lead', role: 'DEPT_LEAD', departmentId: OPS })
const RD_CONTRIB = actor({ id: 'u-rd-contrib', role: 'MEMBER', departmentId: RD })
const OUTSIDER = actor({ id: 'u-mkt', role: 'MEMBER', departmentId: MKT })

describe('canView — org isolation and soft delete', () => {
  it('refuses a project belonging to another organization', () => {
    const d = canView(actor(), project({ orgId: 'org-2' }))
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('another organization')
  })

  it('refuses a soft-deleted project even to an admin', () => {
    expect(canView(ADMIN, project({ deletedAt: new Date() })).allowed).toBe(false)
  })
})

describe('canView — participation', () => {
  it('admits a member of a participating department', () => {
    expect(canView(RD_CONTRIB, project()).allowed).toBe(true)
    expect(canView(OPS_LEAD, project()).allowed).toBe(true)
  })

  it('refuses a department that is not participating', () => {
    const d = canView(OUTSIDER, project())
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('not participating')
  })

  it('admits an explicitly named member from a non-participating department', () => {
    const p = project({ members: [{ memberId: OUTSIDER.id, role: 'CONTRIBUTOR', departmentId: MKT }] })
    expect(canView(OUTSIDER, p).allowed).toBe(true)
  })

  it('admits an org admin with no department at all', () => {
    expect(canView(ADMIN, project()).allowed).toBe(true)
  })
})

describe('canView — confidential projects', () => {
  const confidential = project({ isConfidential: true })

  it('excludes a participating department member who is not named', () => {
    const d = canView(RD_CONTRIB, confidential)
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('confidential')
  })

  it('admits named members, the PM, the sponsor, and admins', () => {
    expect(canView(PM, confidential).allowed).toBe(true)
    expect(canView(ADMIN, confidential).allowed).toBe(true)
    expect(canView(actor({ id: 'u-sponsor', departmentId: null }), confidential).allowed).toBe(true)
    const named = project({
      isConfidential: true,
      members: [{ memberId: RD_CONTRIB.id, role: 'CONTRIBUTOR', departmentId: RD }],
    })
    expect(canView(RD_CONTRIB, named).allowed).toBe(true)
  })
})

describe('every action denies a user who cannot view the project', () => {
  const ACTIONS = [
    'VIEW_PROJECT', 'EDIT_PROJECT', 'SET_BASELINE', 'ADD_DEPARTMENT', 'LINK_COLLAB',
    'CREATE_TASK_OWN_LANE', 'CREATE_TASK_OTHER_LANE', 'EDIT_TASK_OWN_LANE',
    'EDIT_TASK_OTHER_LANE', 'ACCEPT_TASK_REQUEST', 'RESPOND_CHECKIN',
    'PUBLISH_REPORT', 'ARCHIVE_PROJECT',
  ] as const

  it.each(ACTIONS)('%s is denied to an outsider', (action) => {
    expect(can(OUTSIDER, action, project(), task()).allowed).toBe(false)
  })

  it.each(ACTIONS)('%s is denied when the project is missing', (action) => {
    // CREATE_PROJECT is the only action valid without a project.
    if (action === 'VIEW_PROJECT') return
    expect(can(ADMIN, action, null, task()).allowed).toBe(false)
  })
})

describe('CREATE_PROJECT', () => {
  it('allows any departmental member', () => {
    expect(can(RD_CONTRIB, 'CREATE_PROJECT').allowed).toBe(true)
  })

  it('allows an admin with no department', () => {
    expect(can(ADMIN, 'CREATE_PROJECT').allowed).toBe(true)
  })

  it('refuses a departmentless non-admin', () => {
    expect(can(actor({ role: 'MEMBER', departmentId: null }), 'CREATE_PROJECT').allowed).toBe(false)
  })
})

describe('project governance stays PM/admin only', () => {
  it.each(['SET_BASELINE', 'ADD_DEPARTMENT', 'PUBLISH_REPORT'] as const)(
    '%s allows PM and admin, denies lane lead and contributor',
    (action) => {
      expect(can(PM, action, project()).allowed).toBe(true)
      expect(can(ADMIN, action, project()).allowed).toBe(true)
      expect(can(RD_LEAD, action, project()).allowed).toBe(false)
      expect(can(RD_CONTRIB, action, project()).allowed).toBe(false)
    },
  )
})

describe('EDIT_PROJECT extends to any non-viewer participant', () => {
  it('allows the PM and an org admin', () => {
    expect(can(PM, 'EDIT_PROJECT', project()).allowed).toBe(true)
    expect(can(ADMIN, 'EDIT_PROJECT', project()).allowed).toBe(true)
  })

  it('allows a lane lead and a contributor in a participating department', () => {
    expect(can(RD_LEAD, 'EDIT_PROJECT', project()).allowed).toBe(true)
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', project()).allowed).toBe(true)
  })

  it('denies an explicit VIEWER member', () => {
    const p = project({
      members: [{ memberId: RD_CONTRIB.id, role: 'VIEWER', departmentId: RD }],
    })
    const d = can(RD_CONTRIB, 'EDIT_PROJECT', p)
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('Viewers')
  })

  it('denies a department participating only as VIEWER', () => {
    const p = project({
      departments: [{ departmentId: RD, role: 'VIEWER', laneLeadId: null }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(false)
  })

  it('prefers an explicit CONTRIBUTOR membership over a VIEWER department lane', () => {
    const p = project({
      departments: [{ departmentId: RD, role: 'VIEWER', laneLeadId: null }],
      members: [{ memberId: RD_CONTRIB.id, role: 'CONTRIBUTOR', departmentId: RD }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(true)
  })

  it('denies someone whose department is not participating', () => {
    expect(can(OUTSIDER, 'EDIT_PROJECT', project()).allowed).toBe(false)
  })

  it('recognises a PROJECT_MANAGER membership as well as the header field', () => {
    const p = project({
      projectManagerId: null,
      members: [{ memberId: RD_CONTRIB.id, role: 'PROJECT_MANAGER', departmentId: RD }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(true)
  })
})

describe('LINK_COLLAB extends to lane leads', () => {
  it('allows lane leads, PM and admin but not contributors', () => {
    expect(can(RD_LEAD, 'LINK_COLLAB', project()).allowed).toBe(true)
    expect(can(OPS_LEAD, 'LINK_COLLAB', project()).allowed).toBe(true)
    expect(can(PM, 'LINK_COLLAB', project()).allowed).toBe(true)
    expect(can(RD_CONTRIB, 'LINK_COLLAB', project()).allowed).toBe(false)
  })
})

describe('task creation — lane boundaries', () => {
  it('lets a contributor create in their own lane', () => {
    expect(can(RD_CONTRIB, 'CREATE_TASK_OWN_LANE', project(), task({ departmentId: RD })).allowed).toBe(true)
  })

  it('stops a contributor creating in another lane, and says what to do instead', () => {
    const d = can(RD_CONTRIB, 'CREATE_TASK_OWN_LANE', project(), task({ departmentId: OPS }))
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('cross-department request')
  })

  it('lets a lane lead reach into another lane, but only as a request', () => {
    expect(can(RD_LEAD, 'CREATE_TASK_OTHER_LANE', project(), task({ departmentId: OPS })).allowed).toBe(true)
    // ...and still not edit it once it exists.
    expect(can(RD_LEAD, 'EDIT_TASK_OTHER_LANE', project(), task({ departmentId: OPS })).allowed).toBe(false)
  })

  it('stops a plain contributor raising a cross-department request', () => {
    expect(can(RD_CONTRIB, 'CREATE_TASK_OTHER_LANE', project(), task({ departmentId: OPS })).allowed).toBe(false)
  })

  it('refuses a task with no lane', () => {
    expect(can(RD_LEAD, 'CREATE_TASK_OWN_LANE', project(), task({ departmentId: null })).allowed).toBe(false)
  })
})

describe('task editing — own lane', () => {
  it('lets a lane lead edit anything in their lane', () => {
    expect(can(RD_LEAD, 'EDIT_TASK_OWN_LANE', project(), task({ departmentId: RD, ownerId: 'someone-else' })).allowed).toBe(true)
  })

  it('lets a contributor edit only what is assigned to them', () => {
    expect(can(RD_CONTRIB, 'EDIT_TASK_OWN_LANE', project(), task({ departmentId: RD, ownerId: RD_CONTRIB.id })).allowed).toBe(true)
    const d = can(RD_CONTRIB, 'EDIT_TASK_OWN_LANE', project(), task({ departmentId: RD, ownerId: 'other' }))
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('assigned to them')
  })

  it('stops a contributor editing across lanes', () => {
    expect(can(RD_CONTRIB, 'EDIT_TASK_OWN_LANE', project(), task({ departmentId: OPS, ownerId: RD_CONTRIB.id })).allowed).toBe(false)
  })

  it('lets PM and admin edit any lane', () => {
    expect(can(PM, 'EDIT_TASK_OTHER_LANE', project(), task({ departmentId: OPS })).allowed).toBe(true)
    expect(can(ADMIN, 'EDIT_TASK_OTHER_LANE', project(), task({ departmentId: OPS })).allowed).toBe(true)
  })
})

describe('cross-department request acceptance', () => {
  it('only the RECEIVING lane lead may accept', () => {
    const t = task({ departmentId: OPS, acceptanceStatus: 'PENDING' })
    expect(can(OPS_LEAD, 'ACCEPT_TASK_REQUEST', project(), t).allowed).toBe(true)
    // The requesting lead cannot accept their own request into someone else's lane.
    expect(can(RD_LEAD, 'ACCEPT_TASK_REQUEST', project(), t).allowed).toBe(false)
  })

  it('allows PM and admin to unblock a stalled request', () => {
    const t = task({ departmentId: OPS, acceptanceStatus: 'PENDING' })
    expect(can(PM, 'ACCEPT_TASK_REQUEST', project(), t).allowed).toBe(true)
    expect(can(ADMIN, 'ACCEPT_TASK_REQUEST', project(), t).allowed).toBe(true)
  })
})

describe('viewers', () => {
  const viewerDept = project({
    departments: [
      { departmentId: RD, role: 'OWNER', laneLeadId: 'u-rd-lead' },
      { departmentId: MKT, role: 'VIEWER', laneLeadId: null },
    ],
  })
  const viewer = actor({ id: 'u-viewer', role: 'MEMBER', departmentId: MKT })

  it('can view but not create, edit, or respond', () => {
    expect(can(viewer, 'VIEW_PROJECT', viewerDept).allowed).toBe(true)
    expect(can(viewer, 'CREATE_TASK_OWN_LANE', viewerDept, task({ departmentId: MKT })).allowed).toBe(false)
    expect(can(viewer, 'EDIT_TASK_OWN_LANE', viewerDept, task({ departmentId: MKT })).allowed).toBe(false)
    expect(can(viewer, 'RESPOND_CHECKIN', viewerDept).allowed).toBe(false)
  })

  it('an individual VIEWER membership overrides a writable department lane', () => {
    const p = project({ members: [{ memberId: RD_CONTRIB.id, role: 'VIEWER', departmentId: RD }] })
    expect(can(RD_CONTRIB, 'CREATE_TASK_OWN_LANE', p, task({ departmentId: RD })).allowed).toBe(false)
  })
})

describe('RESPOND_CHECKIN', () => {
  it('is open to any non-viewer participant', () => {
    expect(can(RD_CONTRIB, 'RESPOND_CHECKIN', project()).allowed).toBe(true)
    expect(can(OPS_LEAD, 'RESPOND_CHECKIN', project()).allowed).toBe(true)
  })
})

describe('helpers', () => {
  it('isLaneLead is scoped to the named department', () => {
    expect(isLaneLead(OPS_LEAD, project(), OPS)).toBe(true)
    expect(isLaneLead(OPS_LEAD, project(), RD)).toBe(false)
    // Unscoped asks "a lane lead anywhere on this project".
    expect(isLaneLead(OPS_LEAD, project())).toBe(true)
    expect(isLaneLead(RD_CONTRIB, project())).toBe(false)
  })

  it('actorLanes includes the home department plus explicit lane memberships', () => {
    const p = project({ members: [{ memberId: RD_CONTRIB.id, role: 'CONTRIBUTOR', departmentId: OPS }] })
    expect([...actorLanes(RD_CONTRIB, p)].sort()).toEqual([OPS, RD].sort())
  })
})

describe('assertCan', () => {
  it('throws a 403-shaped PolicyError carrying the reason', () => {
    try {
      assertCan(RD_CONTRIB, 'EDIT_PROJECT', project())
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PolicyError)
      expect((err as PolicyError).status).toBe(403)
      expect((err as PolicyError).message).toContain('project manager')
    }
  })

  it('returns silently when allowed', () => {
    expect(() => assertCan(PM, 'EDIT_PROJECT', project())).not.toThrow()
  })
})
