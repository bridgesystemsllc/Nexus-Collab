import type { PrismaClient } from '@prisma/client'

// ─── Merged collab activity ──────────────────────────────────
// A collab's feed shows its own chat plus the activity of every project shared
// into it, so collab conversation and project work sit in one narrative (§6.5).
//
// Merged at read time. Writing a second copy of each project event into
// Activity would give one fact two rows that could disagree, in a module whose
// premise is that a fact has exactly one home.
//
// Lives here rather than inline in the route because two endpoints need it —
// the space detail (which the UI actually renders) and the paginated feed — and
// a feed that differs depending on which one you called is worse than no merge.

export interface FeedEntry {
  id: string
  type: string
  content: string
  coworkSpaceId: string | null
  authorId: string | null
  author: { id: string | null; name: string; avatar: string | null } | null
  metadata: unknown
  createdAt: Date
  source: 'COLLAB' | 'PROJECT'
  project: { id: string; projectNumber: string | null; title: string } | null
}

/** Projects whose activity belongs in this collab's feed. */
export async function feedProjectIds(
  prisma: PrismaClient,
  coworkSpaceId: string,
): Promise<string[]> {
  const links = await prisma.collabProjectLink.findMany({
    where: {
      coworkSpaceId,
      unlinkedAt: null,
      // A summary-only share does not put its day-to-day work in the feed.
      visibility: { not: 'SUMMARY_ONLY' },
    },
    select: { projectId: true },
  })
  return links.map((l) => l.projectId)
}

/**
 * The newest `limit` entries from `skip`, across both sources.
 *
 * Each side is asked for skip+limit so the merged window is complete however
 * the two streams interleave — taking `limit` from each and merging would drop
 * entries whenever one source dominated the period.
 */
export async function mergedCollabFeed(
  prisma: PrismaClient,
  coworkSpaceId: string,
  opts: { skip?: number; limit?: number } = {},
): Promise<{ entries: FeedEntry[]; total: number; projectCount: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const skip = Math.max(opts.skip ?? 0, 0)
  const window = skip + limit

  const projectIds = await feedProjectIds(prisma, coworkSpaceId)

  const [collabRows, collabTotal, projectRows, projectTotal] = await Promise.all([
    prisma.activity.findMany({
      where: { coworkSpaceId },
      include: { author: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: window,
    }),
    prisma.activity.count({ where: { coworkSpaceId } }),
    projectIds.length
      ? prisma.projectActivity.findMany({
          where: { projectId: { in: projectIds } },
          include: {
            actor: { select: { id: true, name: true, avatar: true } },
            project: { select: { id: true, projectNumber: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: window,
        })
      : Promise.resolve([]),
    projectIds.length
      ? prisma.projectActivity.count({ where: { projectId: { in: projectIds } } })
      : Promise.resolve(0),
  ])

  // Project events are shaped to look like collab activity so the existing feed
  // renders them with no second code path. `source` and `project` are additive,
  // so a client that ignores them still works.
  const shaped: FeedEntry[] = projectRows.map((a) => ({
    // Prefixed: a ProjectActivity id and an Activity id could collide as React
    // keys, and one entry silently replacing another is hard to notice.
    id: `pa_${a.id}`,
    type: a.action,
    content: a.summary,
    coworkSpaceId,
    authorId: a.actorId,
    // Engine-driven events genuinely have no author. A named source beats a
    // null the feed would render as a blank byline.
    author: a.actor ?? { id: null, name: 'Nexus', avatar: null },
    metadata: { entityType: a.entityType, entityId: a.entityId, projectId: a.projectId },
    createdAt: a.createdAt,
    source: 'PROJECT',
    project: a.project,
  }))

  const entries = mergeFeeds(
    collabRows.map((a): FeedEntry => ({ ...a, source: 'COLLAB', project: null })),
    shaped,
    skip,
    limit,
  )

  return { entries, total: collabTotal + projectTotal, projectCount: projectIds.length }
}

/**
 * Merge two newest-first streams into one page.
 *
 * Separated out because the windowing is the part that is easy to get wrong and
 * hard to notice: entries do not vanish loudly, they just quietly stop
 * appearing on page two. Ties break on id so a fixed input always produces a
 * fixed order — two events written in the same millisecond must not swap places
 * between requests and shift the pagination under the reader.
 */
export function mergeFeeds(
  collab: FeedEntry[],
  project: FeedEntry[],
  skip: number,
  limit: number,
): FeedEntry[] {
  return [...collab, ...project]
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id),
    )
    .slice(skip, skip + limit)
}
