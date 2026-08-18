import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

// ─── Projects integration tests ──────────────────────────────
// The three scenarios §10 names by name: cross-department task request
// accept/reject, collab link propagation, and check-in escalation.
//
// These run over HTTP against a running API rather than calling services
// directly, on purpose. Accept/reject is enforced by the policy layer inside
// the route; a service-level test would exercise the database write and skip
// the authorization entirely — which is the half most worth testing.
//
// Excluded from the default `pnpm test` (vitest.config.ts) because they need a
// live server and database. Run with `pnpm test:integration`. If the server is
// not up they skip loudly rather than failing, so nobody has to remember.

const BASE = process.env.INTEGRATION_API_URL ?? 'http://localhost:3000'
const API = `${BASE}/api/v1`

const prisma = new PrismaClient()
let cookie = ''

// Probed at module load, with top-level await. `describe.skipIf` and the `it`
// selector below are evaluated during collection — before any beforeAll hook
// runs — so a flag set in beforeAll would always still be false and every test
// would silently skip.
const serverUp = await (async () => {
  try {
    const probe = await fetch(`${API}/projects/meta/departments`, { signal: AbortSignal.timeout(2500) })
    return probe.status < 500
  } catch {
    return false
  }
})()

if (!serverUp) {
  console.warn(
    `\n  [skip] No API at ${BASE}. Start it with \`pnpm --filter @nexus/api dev\` to run the integration suite.\n`,
  )
}

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* non-JSON response */ }
  return { status: res.status, json, text }
}

// Everything this suite creates carries this prefix, and teardown matches on it
// rather than on ids collected in memory.
const TAG_PREFIX = 'ITEST-'
const TAG = `${TAG_PREFIX}${Date.now()}`

/**
 * Delete every row matching a title/name prefix, children first.
 *
 * Collected ids only work if afterAll actually runs, and it does not when the
 * process is killed. A run interrupted mid-suite left ten projects and five
 * collabs in the development database, which is how this was found. Matching
 * on the prefix means a sweep before each run clears whatever the last one
 * abandoned, so debris cannot accumulate.
 *
 * `phases` and `milestones` are in the list because a project cannot be deleted
 * while they reference it — the previous version omitted both, so any test that
 * created one would have failed teardown on a foreign key.
 */
async function sweep(prefix: string, opts: { excludingThisRun?: boolean } = {}) {
  // Only relevant if two runs overlap. They should not — the config is serial —
  // but a sweep that could delete a live run's data is not worth the risk.
  const matches = (field: 'title' | 'name' | 'message') =>
    opts.excludingThisRun
      ? { AND: [{ [field]: { startsWith: prefix } }, { NOT: { [field]: { startsWith: TAG } } }] }
      : { [field]: { startsWith: prefix } }

  const projects = await prisma.project.findMany({
    where: matches('title') as never,
    select: { id: true },
  })
  const projectIds = projects.map((p) => p.id)

  if (projectIds.length) {
    const where = { projectId: { in: projectIds } }
    await prisma.collabProjectLink.deleteMany({ where })
    await prisma.projectCheckin.deleteMany({ where })
    await prisma.projectHealthSnapshot.deleteMany({ where })
    await prisma.projectReport.deleteMany({ where })
    await prisma.projectModuleLink.deleteMany({ where })
    await prisma.projectActivity.deleteMany({ where })
    await prisma.projectMilestone.deleteMany({ where })
    await prisma.task.deleteMany({ where })
    await prisma.projectPhase.deleteMany({ where })
    await prisma.projectMember.deleteMany({ where })
    await prisma.projectDepartment.deleteMany({ where })
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } })
  }

  const collabs = await prisma.coworkSpace.findMany({
    where: matches('name') as never,
    select: { id: true },
  })
  const collabIds = collabs.map((c) => c.id)
  if (collabIds.length) {
    await prisma.collabProjectLink.deleteMany({ where: { coworkSpaceId: { in: collabIds } } })
    await prisma.activity.deleteMany({ where: { coworkSpaceId: { in: collabIds } } })
    await prisma.coworkSpace.deleteMany({ where: { id: { in: collabIds } } })
  }

  // The engines raise pulses quoting task titles, so those carry the tag too.
  const pulses = await prisma.pulse.deleteMany({
    where: opts.excludingThisRun
      ? { AND: [{ message: { contains: prefix } }, { NOT: { message: { contains: TAG } } }] }
      : { message: { contains: prefix } },
  })

  return { projects: projectIds.length, collabs: collabIds.length, pulses: pulses.count }
}

beforeAll(async () => {
  if (!serverUp) return

  // Clear anything a previous run abandoned, before this one adds to it.
  const leftover = await sweep(TAG_PREFIX, { excludingThisRun: true })
  if (leftover.projects || leftover.collabs) {
    console.warn(
      `  [cleanup] removed ${leftover.projects} project(s) and ${leftover.collabs} collab(s) ` +
        'left behind by an interrupted run',
    )
  }

  const login = await fetch(`${BASE}/api/dev-login`, { redirect: 'manual' })
  const set = login.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]!
})

afterAll(async () => {
  // Matched on this run's tag, so a test that threw before its own cleanup is
  // still covered.
  if (serverUp) await sweep(TAG).catch((err) => console.error('  [cleanup] failed:', err?.message))
  await prisma.$disconnect()
})

async function makeProject(title: string, ownerDepartmentId: string, extra: Record<string, unknown> = {}) {
  const types = (await call('GET', '/projects/meta/types')).json.data
  const res = await call('POST', '/projects', {
    title: `${TAG} ${title}`,
    projectTypeId: types[0]?.id,
    ownerDepartmentId,
    status: 'ACTIVE',
    ...extra,
  })
  if (res.status !== 201) throw new Error(`create failed ${res.status}: ${res.text.slice(0, 200)}`)
  return res.json.data
}

const maybe = () => (serverUp ? it : it.skip)

describe.skipIf(!serverUp)('projects integration', () => {

  // ── Cross-department task requests ─────────────────────────

  describe('cross-department task request', () => {
    maybe()('a lane lead may request work of another department, but not edit it', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('cross-dept', ops.id, {
        participatingDepartments: [{ departmentId: mkt.id, role: 'CONTRIBUTOR' }],
      })

      // Created into another department's lane. Whether that becomes a
      // request is the server's call — isCrossDept is derived from the actor's
      // lanes, never accepted from the client, which is the point.
      const task = await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} needs marketing`,
        departmentId: mkt.id,
      })
      expect(task.status).toBe(201)
      expect(task.json.data.departmentId).toBe(mkt.id)

      // The client cannot assert cross-dept status for itself.
      const spoofed = await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} spoof`, departmentId: mkt.id, isCrossDept: true, acceptanceStatus: 'ACCEPTED',
      })
      expect(spoofed.status).toBe(422)
    })

    maybe()('acceptance moves it from PENDING to ACCEPTED exactly once', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('accept', ops.id, {
        participatingDepartments: [{ departmentId: mkt.id, role: 'CONTRIBUTOR' }],
      })
      const task = (await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} accept me`, departmentId: mkt.id,
      })).json.data

      if (task.acceptanceStatus !== 'PENDING') {
        // The dev-login actor is an admin who owns every lane, so the request
        // may be auto-accepted. Force the pending state the flow is about.
        await prisma.task.update({
          where: { id: task.id },
          data: { isCrossDept: true, acceptanceStatus: 'PENDING' },
        })
      }

      const accept = await call('POST', `/projects/tasks/${task.id}/accept`, {})
      expect(accept.status).toBe(200)
      expect(accept.json.data.acceptanceStatus).toBe('ACCEPTED')
      expect(accept.json.data.acceptedAt).toBeTruthy()

      // Accepting twice is a conflict, not a silent no-op that looks like success.
      const again = await call('POST', `/projects/tasks/${task.id}/accept`, {})
      expect(again.status).toBe(409)

      // The acceptance is recorded in the project's history.
      const activity = await prisma.projectActivity.findFirst({
        where: { projectId: project.id, action: 'REQUEST_ACCEPTED', entityId: task.id },
      })
      expect(activity).toBeTruthy()
    })

    maybe()('rejection requires a reason and records it', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('reject', ops.id, {
        participatingDepartments: [{ departmentId: mkt.id, role: 'CONTRIBUTOR' }],
      })
      const task = (await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} reject me`, departmentId: mkt.id,
      })).json.data
      await prisma.task.update({
        where: { id: task.id },
        data: { isCrossDept: true, acceptanceStatus: 'PENDING' },
      })

      // A rejection with no reason is useless to the requester.
      const noReason = await call('POST', `/projects/tasks/${task.id}/reject`, {})
      expect(noReason.status).toBe(422)

      const rejected = await call('POST', `/projects/tasks/${task.id}/reject`, {
        reason: 'Out of scope for this launch',
      })
      expect(rejected.status).toBe(200)
      expect(rejected.json.data.acceptanceStatus).toBe('REJECTED')

      const row = await prisma.task.findUnique({ where: { id: task.id } })
      expect(row?.acceptanceStatus).toBe('REJECTED')
    })

    maybe()('a rejected request cannot then be accepted', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const project = await makeProject('reject-then-accept', depts[0].id)
      const task = (await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} settled`, departmentId: depts[0].id,
      })).json.data
      await prisma.task.update({
        where: { id: task.id },
        data: { isCrossDept: true, acceptanceStatus: 'REJECTED' },
      })

      const accept = await call('POST', `/projects/tasks/${task.id}/accept`, {})
      expect(accept.status).toBe(409)
    })
  })

  // ── Collab link propagation ────────────────────────────────

  describe('collab link propagation', () => {
    maybe()('linking grants the collab\'s departments access to the same project', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('propagation', ops.id)

      const space = await call('POST', '/cowork', {
        name: `${TAG} collab`, type: 'INITIATIVE', deptNames: [ops.name, mkt.name],
      })
      const collabId = (space.json.data ?? space.json).id
    
      const before = await prisma.projectDepartment.count({
        where: { projectId: project.id, departmentId: mkt.id },
      })
      expect(before).toBe(0)

      const link = await call('POST', `/collabs/${collabId}/projects`, { projectId: project.id })
      expect(link.status).toBe(201)
      expect(link.json.data.departmentsAdded).toContain(mkt.name)

      // Access granted, and traceable to the link that granted it.
      const lane = await prisma.projectDepartment.findFirst({
        where: { projectId: project.id, departmentId: mkt.id },
      })
      expect(lane).toBeTruthy()
      expect(lane?.addedByLinkId).toBe(link.json.data.linkId)

      // The project appears in the other department's tab — same row, not a copy.
      const mktList = await call('GET', `/projects?departmentId=${mkt.id}&limit=100`)
      const seen = mktList.json.data.find((p: any) => p.id === project.id)
      expect(seen?.id).toBe(project.id)
    })

    maybe()('unlinking revokes a granted lane that holds no work', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('unlink-clean', ops.id)
      const space = await call('POST', '/cowork', {
        name: `${TAG} collab clean`, type: 'INITIATIVE', deptNames: [mkt.name],
      })
      const collabId = (space.json.data ?? space.json).id
    
      await call('POST', `/collabs/${collabId}/projects`, { projectId: project.id })
      const unlink = await call('DELETE', `/collabs/${collabId}/projects/${project.id}`)

      expect(unlink.status).toBe(200)
      expect(unlink.json.data.departmentsRemoved).toContain(mkt.name)
      const gone = await prisma.projectDepartment.count({
        where: { projectId: project.id, departmentId: mkt.id },
      })
      expect(gone).toBe(0)
    })

    maybe()('unlinking KEEPS a granted lane that has work, and deletes nothing', async () => {
      // §2.4: detaching revokes access but never deletes project data.
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('unlink-with-work', ops.id)
      const space = await call('POST', '/cowork', {
        name: `${TAG} collab work`, type: 'INITIATIVE', deptNames: [mkt.name],
      })
      const collabId = (space.json.data ?? space.json).id
    
      await call('POST', `/collabs/${collabId}/projects`, { projectId: project.id })
      const task = (await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} marketing work`, departmentId: mkt.id,
      })).json.data
      expect(task?.id).toBeTruthy()

      const unlink = await call('DELETE', `/collabs/${collabId}/projects/${project.id}`)
      expect(unlink.status).toBe(200)
      expect(unlink.json.data.departmentsRemoved).not.toContain(mkt.name)
      expect(unlink.json.data.departmentsKept.map((d: any) => d.name)).toContain(mkt.name)

      // The task survives — that is the whole point of the rule.
      const stillThere = await prisma.task.findUnique({ where: { id: task.id } })
      expect(stillThere).toBeTruthy()
      expect(stillThere?.deletedAt).toBeNull()
    })

    maybe()('a confidential project is refused', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const project = await makeProject('confidential', depts[0].id, { isConfidential: true })
      const space = await call('POST', '/cowork', {
        name: `${TAG} collab conf`, type: 'INITIATIVE', deptNames: [depts[0].name],
      })
      const collabId = (space.json.data ?? space.json).id
    
      const link = await call('POST', `/collabs/${collabId}/projects`, { projectId: project.id })
      expect(link.status).toBe(409)
      expect(link.json.error.message).toMatch(/confidential/i)
    })

    maybe()('a task completed in the collab is complete in the department view', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const [ops, mkt] = [depts[0], depts[1]]
      const project = await makeProject('same-row', ops.id)
      const space = await call('POST', '/cowork', {
        name: `${TAG} collab same`, type: 'INITIATIVE', deptNames: [mkt.name],
      })
      const collabId = (space.json.data ?? space.json).id
          await call('POST', `/collabs/${collabId}/projects`, { projectId: project.id })

      const task = (await call('POST', `/projects/${project.id}/tasks`, {
        title: `${TAG} shared`, departmentId: mkt.id,
      })).json.data

      await call('POST', `/projects/tasks/${task.id}/status`, { status: 'COMPLETE' })

      const board = await call('GET', `/collabs/${collabId}/projects/board`)
      const card = board.json.data.lanes.flatMap((l: any) => l.cards).find((c: any) => c.id === task.id)
      const deptView = await call('GET', `/projects/${project.id}/tasks?departmentId=${mkt.id}`)

      expect(card?.status).toBe('COMPLETE')
      expect(deptView.json.data.find((t: any) => t.id === task.id)?.status).toBe('COMPLETE')
    })
  })

  // ── Check-in escalation ────────────────────────────────────

  describe('check-in escalation', () => {
    maybe()('the engine is idempotent under a double run', async () => {
      const { runCheckinEngine } = await import('./checkinEngine')
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const project = await makeProject('checkin-idem', depts[0].id, { checkinCadence: 'WEEKLY' })

      // Due now, so this run will request one.
      await prisma.project.update({
        where: { id: project.id },
        data: { nextCheckinAt: new Date(Date.now() - 60_000) },
      })

      const first = await runCheckinEngine(prisma)
      const afterFirst = await prisma.projectCheckin.count({ where: { projectId: project.id } })
      const second = await runCheckinEngine(prisma)
      const afterSecond = await prisma.projectCheckin.count({ where: { projectId: project.id } })

      expect(first.errors).toEqual([])
      expect(second.errors).toEqual([])
      // A second run must not duplicate: the unique key blocks it.
      expect(afterSecond).toBe(afterFirst)
    })

    maybe()('an unanswered check-in escalates, notifies the PM, and records that it did', async () => {
      const { runCheckinEngine } = await import('./checkinEngine')
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const member = await prisma.member.findFirstOrThrow()
      const project = await makeProject('escalation', depts[0].id, {
        checkinCadence: 'WEEKLY',
        projectManagerId: member.id,
      })

      // A check-in already past its window, so the engine must escalate it.
      const checkin = await prisma.projectCheckin.create({
        data: {
          projectId: project.id,
          departmentId: depts[0].id,
          status: 'PENDING',
          requestedAt: new Date(Date.now() - 72 * 3_600_000),
          dueAt: new Date(Date.now() - 26 * 3_600_000),
        },
      })

      await runCheckinEngine(prisma)
      const afterFirst = await prisma.projectCheckin.findUnique({ where: { id: checkin.id } })

      // 26 hours past due goes straight to the sponsor stage — the engine may
      // never have seen this check-in at the PM stage at all, which is what
      // happens after a restart or on the first run following a deploy.
      expect(afterFirst?.status).toBe('OVERDUE')
      expect(afterFirst?.sponsorNotifiedAt).toBeTruthy()
      // The PM is notified at that stage too, so the escalation must be
      // recorded as having reached them. A null here would tell anyone reading
      // the audit trail that the PM was skipped.
      expect(afterFirst?.escalatedAt).toBeTruthy()

      // And the PM genuinely got a pulse, not just a timestamp.
      const pmPulse = await prisma.pulse.findFirst({
        where: { targetId: member.id, type: 'ALERT', message: { contains: 'overdue' } },
        orderBy: { createdAt: 'desc' },
      })
      expect(pmPulse).toBeTruthy()

      const escalatedAt = afterFirst!.escalatedAt!.toISOString()
      const reminders = afterFirst!.reminderCount

      // A second run at the same moment must not re-escalate or re-notify —
      // that is what turns an escalation into noise nobody reads.
      await runCheckinEngine(prisma)
      const afterSecond = await prisma.projectCheckin.findUnique({ where: { id: checkin.id } })
      expect(afterSecond?.escalatedAt?.toISOString()).toBe(escalatedAt)
      expect(afterSecond?.reminderCount).toBe(reminders)
    })

    maybe()('answering a check-in stops the chase', async () => {
      const { runCheckinEngine } = await import('./checkinEngine')
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const project = await makeProject('checkin-answered', depts[0].id)

      const checkin = await prisma.projectCheckin.create({
        data: {
          projectId: project.id,
          departmentId: depts[0].id,
          status: 'PENDING',
          requestedAt: new Date(Date.now() - 3 * 3_600_000),
          dueAt: new Date(Date.now() + 20 * 3_600_000),
        },
      })

      const respond = await call('POST', `/projects/checkins/${checkin.id}/respond`, {
        progressSummary: 'On track, artwork approved',
        blockers: '',
        needsFromOthers: '',
        confidence: 'ON_TRACK',
      })
      expect(respond.status).toBe(200)

      const before = await prisma.projectCheckin.findUnique({ where: { id: checkin.id } })
      expect(before?.status).toBe('RESPONDED')

      await runCheckinEngine(prisma)
      const after = await prisma.projectCheckin.findUnique({ where: { id: checkin.id } })
      // An answered check-in is never reopened or chased.
      expect(after?.status).toBe('RESPONDED')
      expect(after?.respondedAt).toBeTruthy()
    })
  })

  // ── Frozen report snapshot ─────────────────────────────────

  describe('report snapshots', () => {
    maybe()('regenerating does not mutate an existing report', async () => {
      const depts = (await call('GET', '/projects/meta/departments')).json.data
      const project = await makeProject('frozen', depts[0].id)

      const first = await call('POST', `/projects/${project.id}/reports/generate`, {
        reportType: 'PROJECT_UPDATE', withNarrative: false,
      })
      expect(first.status).toBe(201)
      const snapshot = JSON.stringify(first.json.data.payload)

      await call('PATCH', `/projects/${project.id}`, { title: `${TAG} frozen RENAMED` })
      await call('POST', `/projects/${project.id}/reports/generate`, {
        reportType: 'PROJECT_UPDATE', withNarrative: false,
      })

      const reread = await call('GET', `/projects/reports/${first.json.data.reportId}`)
      expect(JSON.stringify(reread.json.data.payload)).toBe(snapshot)
      expect(reread.json.data.payload.header.title).not.toMatch(/RENAMED/)
    })
  })
})
