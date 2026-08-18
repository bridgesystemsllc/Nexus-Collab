import { describe, it, expect } from 'vitest'
import { projectCapabilities } from './capabilities'
import type { PolicyActor, PolicyProject } from './policy'

const ORG = 'org-1'
const RD = 'dept-rd'

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
  departments: [{ departmentId: RD, role: 'OWNER', laneLeadId: 'u-rd-lead' }],
  members: [],
  ...over,
})

const PM = actor({ id: 'u-pm', role: 'PROJECT_LEAD' })
const CONTRIB = actor({ id: 'u-rd-contrib' })

describe('projectCapabilities', () => {
  it('gives the PM everything', () => {
    expect(projectCapabilities(PM, project())).toEqual({
      editProject: true,
      editGovernance: true,
      createTask: true,
      editTaskOwnLane: true,
      editTimeline: true,
      setBaseline: true,
      publishReport: true,
      defaultTaskLaneId: RD,
    })
  })

  it('gives a contributor content editing but not governance', () => {
    const caps = projectCapabilities(CONTRIB, project())
    expect(caps.editProject).toBe(true)
    expect(caps.editTimeline).toBe(true)
    expect(caps.createTask).toBe(true)
    expect(caps.editTaskOwnLane).toBe(true)
    expect(caps.editGovernance).toBe(false)
    expect(caps.setBaseline).toBe(false)
    expect(caps.publishReport).toBe(false)
    expect(caps.defaultTaskLaneId).toBe(RD)
  })

  it('gives a viewer nothing', () => {
    const p = project({ members: [{ memberId: CONTRIB.id, role: 'VIEWER', departmentId: RD }] })
    const caps = projectCapabilities(CONTRIB, p)
    expect(caps.editProject).toBe(false)
    expect(caps.editTimeline).toBe(false)
    expect(caps.createTask).toBe(false)
    expect(caps.editGovernance).toBe(false)
    expect(caps.publishReport).toBe(false)
  })

  it('keeps editTimeline in lockstep with editProject', () => {
    for (const a of [PM, CONTRIB]) {
      const caps = projectCapabilities(a, project())
      expect(caps.editTimeline).toBe(caps.editProject)
    }
  })
})

// ─── defaultTaskLaneId ───────────────────────────────────────
// The lane the UI pre-fills when creating a task. It has to satisfy BOTH rules
// that guard task creation: the policy (is this the actor's own lane) and the
// create route (is this department participating in the project). The original
// implementation returned the actor's department unconditionally, so an admin
// opening another department's project got an "Add task" button that 422'd on
// save — reachable from the Projects page, whose default scope is the whole
// portfolio.

const MKT = 'dept-marketing'
const ADMIN = actor({ id: 'u-admin', role: 'ADMIN', departmentId: MKT })

describe('defaultTaskLaneId', () => {
  it("is the actor's own lane when the project has it", () => {
    expect(projectCapabilities(CONTRIB, project()).defaultTaskLaneId).toBe(RD)
  })

  it("never returns a department that is not participating", () => {
    // The regression. Admin is in Marketing; the project is R&D only.
    const caps = projectCapabilities(ADMIN, project())
    expect(caps.defaultTaskLaneId).not.toBe(MKT)
  })

  it('falls back to a usable lane for someone allowed to create in any of them', () => {
    const caps = projectCapabilities(ADMIN, project())
    expect(caps.createTask).toBe(true)
    // Must be a real lane on the project, or the button 422s on save.
    expect(caps.defaultTaskLaneId).toBe(RD)
  })

  it('prefers the owning lane over an arbitrary participant', () => {
    const p = project({
      ownerDepartmentId: MKT,
      departments: [
        { departmentId: RD, role: 'CONTRIBUTOR', laneLeadId: null },
        { departmentId: MKT, role: 'OWNER', laneLeadId: null },
      ],
    })
    expect(projectCapabilities(actor({ id: 'u-admin', role: 'ADMIN', departmentId: 'dept-other' }), p)
      .defaultTaskLaneId).toBe(MKT)
  })

  it('takes any participating lane when the owner is not itself a participant', () => {
    const p = project({
      ownerDepartmentId: 'dept-ghost',
      departments: [{ departmentId: RD, role: 'CONTRIBUTOR', laneLeadId: null }],
    })
    expect(projectCapabilities(actor({ id: 'u-admin', role: 'ADMIN', departmentId: 'dept-other' }), p)
      .defaultTaskLaneId).toBe(RD)
  })

  it('is null for someone who cannot create a task at all', () => {
    // No lane to default to, and no button to default it for. Offering one
    // would be worse than offering none.
    const outsider = actor({ id: 'u-outsider', role: 'MEMBER', departmentId: MKT })
    const caps = projectCapabilities(outsider, project())
    expect(caps.createTask).toBe(false)
    expect(caps.defaultTaskLaneId).toBeNull()
  })

  it('is null when the actor has no department and cannot create', () => {
    const nomad = actor({ id: 'u-nomad', role: 'MEMBER', departmentId: null })
    expect(projectCapabilities(nomad, project()).defaultTaskLaneId).toBeNull()
  })

  it('still resolves a lane for an admin with no department of their own', () => {
    const nomadAdmin = actor({ id: 'u-admin', role: 'ADMIN', departmentId: null })
    expect(projectCapabilities(nomadAdmin, project()).defaultTaskLaneId).toBe(RD)
  })

  it('never returns a lane absent from the project, across every actor shape', () => {
    // The invariant the whole fix exists to hold.
    const p = project({
      ownerDepartmentId: RD,
      departments: [{ departmentId: RD, role: 'OWNER', laneLeadId: null }],
    })
    for (const a of [PM, CONTRIB, ADMIN,
                     actor({ id: 'u-x', role: 'ADMIN', departmentId: null }),
                     actor({ id: 'u-y', role: 'MEMBER', departmentId: 'dept-nowhere' })]) {
      const lane = projectCapabilities(a, p).defaultTaskLaneId
      if (lane !== null) expect(p.departments.map((d) => d.departmentId)).toContain(lane)
    }
  })
})
