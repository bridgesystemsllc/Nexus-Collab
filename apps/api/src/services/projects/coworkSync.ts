import type { PrismaClient } from '@prisma/client'

// ─── Cowork ↔ project assignment sync ────────────────────────
// When a person is assigned to a project (roster entry or task ownership),
// their work should surface in the Cowork Spaces area. That means: a cowork
// space linked to the project must exist, and the person must be in its
// member list. Conversely, when their last assignment is removed they should
// stop seeing the project there.
//
// These helpers are deliberately non-fatal: assignment writes must never fail
// because the cowork mirror hiccupped, so callers wrap them in try/catch (or
// use the safe variants below that log and swallow).

/**
 * Find the cowork space that represents a project — the legacy one-to-one
 * (CoworkSpace.projectId) or the first active CollabProjectLink. Creates a
 * space (and takes the legacy slot) when none exists.
 */
export async function ensureProjectSpace(
  prisma: PrismaClient,
  projectId: string,
): Promise<{ id: string; memberIds: string[] } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, title: true, projectNumber: true, deletedAt: true, isConfidential: true,
      coworkSpace: { select: { id: true, memberIds: true, status: true } },
      collabLinks: {
        where: { unlinkedAt: null },
        select: { coworkSpace: { select: { id: true, memberIds: true, status: true } } },
        orderBy: { linkedAt: 'asc' },
      },
      departments: { select: { department: { select: { name: true } } } },
    },
  })
  if (!project || project.deletedAt) return null

  const existing =
    (project.coworkSpace && project.coworkSpace.status !== 'ARCHIVED' ? project.coworkSpace : null) ??
    project.collabLinks.map((l) => l.coworkSpace).find((s) => s.status !== 'ARCHIVED') ??
    null
  if (existing) return { id: existing.id, memberIds: existing.memberIds }

  try {
    return await prisma.coworkSpace.create({
      data: {
        name: project.projectNumber ? `${project.projectNumber} — ${project.title}` : project.title,
        description: 'Auto-created when people were assigned to this project.',
        type: 'PROJECT',
        projectId: project.id,
        // Confidential projects get no department names: the cowork routes
        // grant confidential spaces to explicit members only, and dept names
        // would advertise the project's existence to whole departments.
        deptNames: project.isConfidential ? [] : project.departments.map((d) => d.department.name),
        memberIds: [],
      },
      select: { id: true, memberIds: true },
    })
  } catch (err: any) {
    // Unique-create race: a concurrent caller won the CoworkSpace.projectId
    // slot. Refetch the winner rather than dropping this member's sync.
    if (err?.code === 'P2002') {
      const winner = await prisma.coworkSpace.findUnique({
        where: { projectId: project.id },
        select: { id: true, memberIds: true },
      })
      if (winner) return winner
    }
    throw err
  }
}

/** Add members to the project's cowork space (creating the space if needed). */
export async function addMembersToProjectCowork(
  prisma: PrismaClient,
  projectId: string,
  memberIds: string[],
): Promise<void> {
  const wanted = Array.from(new Set(memberIds)).filter(Boolean)
  if (wanted.length === 0) return
  const space = await ensureProjectSpace(prisma, projectId)
  if (!space) return
  // Re-read inside the update to minimise lost concurrent pushes: push each
  // missing id via Prisma's atomic array push rather than overwriting.
  const current = new Set(space.memberIds)
  const missing = wanted.filter((id) => !current.has(id))
  if (missing.length === 0) return
  await prisma.coworkSpace.update({
    where: { id: space.id },
    data: { memberIds: { push: missing } },
  })
}

/** Single-member convenience wrapper. */
export async function addMemberToProjectCowork(
  prisma: PrismaClient,
  projectId: string,
  memberId: string,
): Promise<void> {
  return addMembersToProjectCowork(prisma, projectId, [memberId])
}

/**
 * Remove a member from the project's cowork space — but only when they have
 * no remaining assignment in the project (no roster entry and no open task).
 */
export async function removeMemberFromProjectCowork(
  prisma: PrismaClient,
  projectId: string,
  memberId: string,
): Promise<void> {
  const [roster, openTasks] = await Promise.all([
    prisma.projectMember.findUnique({
      where: { projectId_memberId: { projectId, memberId } },
      select: { id: true },
    }),
    prisma.task.count({
      where: {
        projectId, ownerId: memberId, deletedAt: null,
        status: { notIn: ['COMPLETE', 'CANCELLED'] },
      },
    }),
  ])
  if (roster || openTasks > 0) return

  const spaces = await prisma.coworkSpace.findMany({
    where: {
      memberIds: { has: memberId },
      OR: [
        { projectId },
        { projectLinks: { some: { projectId, unlinkedAt: null } } },
      ],
    },
    select: { id: true, memberIds: true },
  })
  for (const s of spaces) {
    await prisma.coworkSpace.update({
      where: { id: s.id },
      data: { memberIds: s.memberIds.filter((m) => m !== memberId) },
    })
  }
}

/** Fire-and-forget wrappers: assignment writes must not fail on mirror errors. */
export function syncCoworkAddSafe(prisma: PrismaClient, projectId: string, memberId: string): void {
  addMemberToProjectCowork(prisma, projectId, memberId).catch((err) =>
    console.error('[coworkSync] add failed:', err),
  )
}

/** Awaited batch variant: logs and swallows so callers stay non-fatal. */
export async function syncCoworkAddManySafe(
  prisma: PrismaClient,
  projectId: string,
  memberIds: string[],
): Promise<void> {
  try {
    await addMembersToProjectCowork(prisma, projectId, memberIds)
  } catch (err) {
    console.error('[coworkSync] batch add failed:', err)
  }
}

export function syncCoworkRemoveSafe(prisma: PrismaClient, projectId: string, memberId: string): void {
  removeMemberFromProjectCowork(prisma, projectId, memberId).catch((err) =>
    console.error('[coworkSync] remove failed:', err),
  )
}
