import type { PrismaClient } from '@prisma/client'
import type { Tx } from './numbering'
import { logActivity } from './activity'

// ─── Collab bridge ───────────────────────────────────────────
// Attaching a project to a collab workspace does NOT duplicate it (§2.4). It
// writes one link row and grants the workspace's departments participant access
// to the same project. R&D and Marketing working #412 in a collab are looking
// at the same row their own department tabs show, not at copies.
//
// The hard part is not linking, it is unlinking. "Revokes access but never
// deletes project data" means unlink has to distinguish access it granted from
// access someone set up deliberately — hence `addedByLinkId` on the rows it
// creates. Without that provenance, unlink could only choose between leaving
// stale access behind or deleting lanes that hold real work.

export type CollabVisibility = 'FULL' | 'TASKS_ONLY' | 'SUMMARY_ONLY'
export const COLLAB_VISIBILITIES: CollabVisibility[] = ['FULL', 'TASKS_ONLY', 'SUMMARY_ONLY']

export class BridgeError extends Error {
  readonly status: number
  readonly details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = status === 404 ? 'NotFoundError' : status === 409 ? 'ConflictError' : 'BridgeError'
    this.status = status
    this.details = details
  }
}

// ─── Department resolution ───────────────────────────────────
// CoworkSpace.deptNames is a String[] of display names, not ids — it predates
// the projects module. Matching is case-insensitive and unmatched names are
// returned rather than dropped, because a collab whose department was renamed
// would otherwise silently propagate nothing and look like it worked.

export interface ResolvedDepartments {
  matched: { id: string; name: string }[]
  unmatched: string[]
}

export async function resolveCollabDepartments(
  prisma: PrismaClient | Tx,
  deptNames: string[],
  orgId: string,
): Promise<ResolvedDepartments> {
  if (deptNames.length === 0) return { matched: [], unmatched: [] }

  const all = await prisma.department.findMany({
    where: { orgId, archived: false },
    select: { id: true, name: true },
  })
  const byLowerName = new Map(all.map((d) => [d.name.toLowerCase().trim(), d]))

  const matched: { id: string; name: string }[] = []
  const unmatched: string[] = []
  const seen = new Set<string>()

  for (const raw of deptNames) {
    const hit = byLowerName.get(raw.toLowerCase().trim())
    if (!hit) { unmatched.push(raw); continue }
    if (seen.has(hit.id)) continue
    seen.add(hit.id)
    matched.push(hit)
  }
  return { matched, unmatched }
}

// ─── Link ────────────────────────────────────────────────────

export interface LinkResult {
  linkId: string
  reactivated: boolean
  departmentsAdded: string[]
  departmentsAlreadyPresent: string[]
  membersAdded: number
  unmatchedDepartmentNames: string[]
}

/**
 * Attach a project to a collab workspace.
 *
 * Idempotent: linking a project that is already linked returns the existing
 * link rather than erroring, and relinking one that was detached reactivates
 * the original row — the unique constraint on (collab, project) means a second
 * row was never an option, and silently failing there would look like the
 * button did nothing.
 */
export async function linkProject(
  tx: Tx,
  input: {
    coworkSpaceId: string
    projectId: string
    visibility: CollabVisibility
    autoAddMembers: boolean
    actorId: string
  },
): Promise<LinkResult> {
  const space = await tx.coworkSpace.findUnique({
    where: { id: input.coworkSpaceId },
    select: { id: true, name: true, deptNames: true, memberIds: true, status: true },
  })
  if (!space) throw new BridgeError(404, 'Collab workspace not found')
  if (space.status === 'ARCHIVED') {
    throw new BridgeError(409, 'That collab workspace is archived')
  }

  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true, title: true, projectNumber: true, orgId: true,
      isConfidential: true, deletedAt: true,
      departments: { select: { departmentId: true } },
      members: { select: { memberId: true } },
    },
  })
  if (!project || project.deletedAt) throw new BridgeError(404, 'Project not found')

  // A confidential project is one whose access list is explicit. Linking it
  // would grant a whole workspace's departments participant access, which is
  // the exact thing the flag exists to prevent. Refusing is the honest
  // behaviour; sharing it means turning confidentiality off first, deliberately.
  if (project.isConfidential) {
    throw new BridgeError(
      409,
      'A confidential project cannot be shared into a collab. Turn off confidentiality first if you intend to share it.',
    )
  }

  const existing = await tx.collabProjectLink.findUnique({
    where: { coworkSpaceId_projectId: { coworkSpaceId: space.id, projectId: project.id } },
  })

  const link = existing
    ? await tx.collabProjectLink.update({
        where: { id: existing.id },
        data: {
          visibility: input.visibility,
          autoAddMembers: input.autoAddMembers,
          unlinkedAt: null,
          unlinkedById: null,
          linkedById: input.actorId,
          linkedAt: new Date(),
        },
      })
    : await tx.collabProjectLink.create({
        data: {
          coworkSpaceId: space.id,
          projectId: project.id,
          visibility: input.visibility,
          autoAddMembers: input.autoAddMembers,
          linkedById: input.actorId,
        },
      })

  const result: LinkResult = {
    linkId: link.id,
    reactivated: !!existing?.unlinkedAt,
    departmentsAdded: [],
    departmentsAlreadyPresent: [],
    membersAdded: 0,
    unmatchedDepartmentNames: [],
  }

  // SUMMARY_ONLY shares the headline, not the work. Granting lane access under
  // it would contradict the visibility the linker chose.
  if (input.visibility === 'SUMMARY_ONLY') return result

  const { matched, unmatched } = await resolveCollabDepartments(tx, space.deptNames, project.orgId)
  result.unmatchedDepartmentNames = unmatched

  const alreadyOnProject = new Set(project.departments.map((d) => d.departmentId))
  for (const dept of matched) {
    if (alreadyOnProject.has(dept.id)) {
      // Left exactly as it is. A lane someone set up as OWNER must not be
      // demoted to CONTRIBUTOR because a collab link happened to mention it.
      result.departmentsAlreadyPresent.push(dept.name)
      continue
    }
    await tx.projectDepartment.create({
      data: {
        projectId: project.id,
        departmentId: dept.id,
        role: 'CONTRIBUTOR',
        addedByLinkId: link.id,
      },
    })
    result.departmentsAdded.push(dept.name)
  }

  if (input.autoAddMembers && space.memberIds.length > 0) {
    const alreadyMembers = new Set(project.members.map((m) => m.memberId))
    // Filtered to real members of this org — memberIds is a plain String[] with
    // no foreign key, so it can contain ids of people who have since left.
    const members = await tx.member.findMany({
      where: { id: { in: space.memberIds }, orgId: project.orgId },
      select: { id: true, departmentId: true },
    })
    for (const m of members) {
      if (alreadyMembers.has(m.id)) continue
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          memberId: m.id,
          role: 'CONTRIBUTOR',
          departmentId: m.departmentId,
          addedByLinkId: link.id,
        },
      })
      result.membersAdded++
    }
  }

  await logActivity(tx, {
    projectId: project.id,
    actorId: input.actorId,
    entityType: 'COLLAB',
    entityId: link.id,
    action: result.reactivated ? 'RELINKED' : 'LINKED',
    summary:
      `Shared into "${space.name}"` +
      (result.departmentsAdded.length ? ` — added ${result.departmentsAdded.join(', ')}` : ''),
  })

  return result
}

// ─── Unlink ──────────────────────────────────────────────────

export interface UnlinkResult {
  departmentsRemoved: string[]
  departmentsKept: { name: string; reason: string }[]
  membersRemoved: number
}

/**
 * Detach a project from a collab. Revokes the access the link granted; never
 * deletes project data.
 *
 * A lane this link added is removed only if it holds no work. Once a department
 * has tasks on the project, those tasks and their history are project data, and
 * ripping the lane out to tidy up an unlink would destroy exactly what §2.4
 * says must survive. Kept lanes are reported so the caller can say why rather
 * than leaving the user to notice.
 */
export async function unlinkProject(
  tx: Tx,
  input: { coworkSpaceId: string; projectId: string; actorId: string },
): Promise<UnlinkResult> {
  const link = await tx.collabProjectLink.findUnique({
    where: {
      coworkSpaceId_projectId: {
        coworkSpaceId: input.coworkSpaceId,
        projectId: input.projectId,
      },
    },
    include: { coworkSpace: { select: { name: true } } },
  })
  if (!link) throw new BridgeError(404, 'That project is not linked to this collab')
  if (link.unlinkedAt) throw new BridgeError(409, 'That project is already detached from this collab')

  const result: UnlinkResult = { departmentsRemoved: [], departmentsKept: [], membersRemoved: 0 }

  const granted = await tx.projectDepartment.findMany({
    where: { addedByLinkId: link.id, projectId: input.projectId },
    include: { department: { select: { id: true, name: true } } },
  })

  for (const lane of granted) {
    const taskCount = await tx.task.count({
      where: { projectId: input.projectId, departmentId: lane.departmentId, deletedAt: null },
    })
    if (taskCount > 0) {
      result.departmentsKept.push({
        name: lane.department.name,
        reason: `${taskCount} task${taskCount === 1 ? '' : 's'} on this project`,
      })
      // Provenance is cleared so a future unlink does not reconsider a lane
      // that has become the department's own work.
      await tx.projectDepartment.update({
        where: { id: lane.id },
        data: { addedByLinkId: null },
      })
      continue
    }
    await tx.projectDepartment.delete({ where: { id: lane.id } })
    result.departmentsRemoved.push(lane.department.name)
  }

  // A person who owns a task or leads a lane keeps their membership; the rest
  // of the auto-added roster goes.
  const grantedMembers = await tx.projectMember.findMany({
    where: { addedByLinkId: link.id, projectId: input.projectId },
    select: { id: true, memberId: true },
  })
  for (const pm of grantedMembers) {
    const owns = await tx.task.count({
      where: { projectId: input.projectId, ownerId: pm.memberId, deletedAt: null },
    })
    const leads = await tx.projectDepartment.count({
      where: { projectId: input.projectId, laneLeadId: pm.memberId },
    })
    if (owns > 0 || leads > 0) {
      await tx.projectMember.update({ where: { id: pm.id }, data: { addedByLinkId: null } })
      continue
    }
    await tx.projectMember.delete({ where: { id: pm.id } })
    result.membersRemoved++
  }

  await tx.collabProjectLink.update({
    where: { id: link.id },
    data: { unlinkedAt: new Date(), unlinkedById: input.actorId },
  })

  await logActivity(tx, {
    projectId: input.projectId,
    actorId: input.actorId,
    entityType: 'COLLAB',
    entityId: link.id,
    action: 'UNLINKED',
    summary:
      `Detached from "${link.coworkSpace.name}"` +
      (result.departmentsKept.length
        ? ` — kept ${result.departmentsKept.map((d) => d.name).join(', ')} (has work on this project)`
        : ''),
  })

  return result
}

// ─── Unified collab board ────────────────────────────────────

export interface BoardCard {
  id: string
  taskNumber: number | null
  title: string
  status: string
  priority: string | null
  dueDate: Date | null
  blockedReason: string | null
  isCrossDept: boolean
  acceptanceStatus: string | null
  owner: { id: string; name: string } | null
  department: { id: string; name: string; color: string | null } | null
  // The chip that tells you which project a card belongs to. On a board that
  // spans projects it is the difference between a task list and a task pile.
  project: { id: string; projectNumber: string | null; title: string; healthBand: string }
}

export interface CollabBoard {
  lanes: { departmentId: string | null; departmentName: string; color: string | null; cards: BoardCard[] }[]
  projects: { id: string; projectNumber: string | null; title: string; healthBand: string; visibility: string }[]
  totals: { tasks: number; blocked: number; overdue: number }
  excludedProjects: { id: string; title: string; reason: string }[]
}

/**
 * One board across every project shared into this collab, swimlaned by
 * department. SUMMARY_ONLY projects appear in the header list but contribute no
 * cards — the visibility on the link is enforced here, not just described.
 */
export async function buildCollabBoard(
  prisma: PrismaClient,
  coworkSpaceId: string,
  opts: { now?: Date } = {},
): Promise<CollabBoard> {
  const now = opts.now ?? new Date()

  const links = await prisma.collabProjectLink.findMany({
    where: { coworkSpaceId, unlinkedAt: null },
    include: {
      project: {
        select: {
          id: true, projectNumber: true, title: true, healthBand: true, deletedAt: true,
        },
      },
    },
  })

  const live = links.filter((l) => !l.project.deletedAt)
  const withTasks = live.filter((l) => l.visibility !== 'SUMMARY_ONLY')

  const board: CollabBoard = {
    lanes: [],
    projects: live.map((l) => ({
      id: l.project.id,
      projectNumber: l.project.projectNumber,
      title: l.project.title,
      healthBand: l.project.healthBand,
      visibility: l.visibility,
    })),
    totals: { tasks: 0, blocked: 0, overdue: 0 },
    excludedProjects: live
      .filter((l) => l.visibility === 'SUMMARY_ONLY')
      .map((l) => ({
        id: l.project.id,
        title: l.project.title,
        reason: 'Shared as summary only — its tasks are not on this board',
      })),
  }

  if (withTasks.length === 0) return board

  const projectById = new Map(
    withTasks.map((l) => [l.project.id, l.project]),
  )

  // One query for every card on the board, regardless of how many projects are
  // linked. A per-project query here would be an N+1 that grows with the collab.
  const tasks = await prisma.task.findMany({
    where: {
      projectId: { in: [...projectById.keys()] },
      deletedAt: null,
      status: { not: 'CANCELLED' },
    },
    include: {
      owner: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { taskNumber: 'asc' }],
  })

  const grouped = groupIntoLanes(tasks, projectById, now)
  board.lanes = grouped.lanes
  board.totals = grouped.totals

  return board
}

// ─── Lane grouping (pure) ────────────────────────────────────

export interface BoardTaskInput {
  id: string
  taskNumber: number | null
  title: string
  status: string
  priority: string | null
  dueDate: Date | null
  blockedReason: string | null
  isCrossDept: boolean
  acceptanceStatus: string | null
  projectId: string | null
  departmentId: string | null
  owner: { id: string; name: string } | null
  department: { id: string; name: string; color: string | null } | null
}

export interface BoardProjectInput {
  id: string
  projectNumber: string | null
  title: string
  healthBand: string
}

/**
 * Group tasks into department swimlanes and total them.
 *
 * Separated from the query so the grouping can be tested with plain objects.
 * `now` is a parameter rather than a clock read, so an overdue count is a
 * function of its inputs and a test does not have to fake time.
 */
export function groupIntoLanes(
  tasks: BoardTaskInput[],
  projectById: Map<string, BoardProjectInput>,
  now: Date,
): { lanes: CollabBoard['lanes']; totals: CollabBoard['totals'] } {
  const laneMap = new Map<string, CollabBoard['lanes'][number]>()
  const totals = { tasks: 0, blocked: 0, overdue: 0 }

  for (const t of tasks) {
    const project = t.projectId ? projectById.get(t.projectId) : undefined
    // A task whose project is not on this board (unlinked, deleted, or shared
    // summary-only) must not appear as an orphan card with no chip.
    if (!project) continue

    const key = t.departmentId ?? '__unassigned'
    let lane = laneMap.get(key)
    if (!lane) {
      lane = {
        departmentId: t.departmentId,
        departmentName: t.department?.name ?? 'Unassigned',
        color: t.department?.color ?? null,
        cards: [],
      }
      laneMap.set(key, lane)
    }

    lane.cards.push({
      id: t.id,
      taskNumber: t.taskNumber,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      blockedReason: t.blockedReason,
      isCrossDept: t.isCrossDept,
      acceptanceStatus: t.acceptanceStatus,
      owner: t.owner,
      department: t.department,
      project: {
        id: project.id,
        projectNumber: project.projectNumber,
        title: project.title,
        healthBand: project.healthBand,
      },
    })

    totals.tasks++
    if (t.status === 'BLOCKED') totals.blocked++
    // A completed task that ran late is not still overdue — the board is a
    // to-do list, not an audit of punctuality.
    if (t.dueDate && t.dueDate < now && t.status !== 'COMPLETE') totals.overdue++
  }

  // Unassigned last; it is a bucket, not a department.
  const lanes = [...laneMap.values()].sort((a, b) => {
    if (!a.departmentId) return 1
    if (!b.departmentId) return -1
    return a.departmentName.localeCompare(b.departmentName)
  })

  return { lanes, totals }
}
