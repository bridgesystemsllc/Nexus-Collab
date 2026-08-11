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
