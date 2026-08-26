import type { PrismaClient } from '@prisma/client'
import { getMsConfig } from '../../lib/microsoftGraph'

// ─── Organization ↔ Entra tenant backfill ────────────────────
// Sign-in now keys on Organization.entraTenantId. The founding workspace was
// created long before that column existed, so without this nobody can sign in
// to it the moment the new resolver ships.
//
// It claims a tenant only in the one case where the answer is not a guess: a
// single organization, a single configured tenant. Anything else refuses and
// says so, because a wrong claim here silently merges two customers.

export interface OrgRow { id: string; entraTenantId: string | null }

export type BackfillPlan =
  | { action: 'claim'; orgId: string; tenantId: string }
  | { action: 'noop'; reason: 'already-claimed' | 'no-tenant-configured' | 'no-orgs' }
  | { action: 'refuse'; reason: 'ambiguous' }
  | { action: 'failed'; reason: string }

/** Pure. The whole decision, testable without a database. */
export function planBackfill(orgs: OrgRow[], configuredTenantId: string): BackfillPlan {
  if (orgs.length === 0) return { action: 'noop', reason: 'no-orgs' }
  if (!configuredTenantId) return { action: 'noop', reason: 'no-tenant-configured' }
  if (orgs.some((o) => o.entraTenantId === configuredTenantId)) {
    return { action: 'noop', reason: 'already-claimed' }
  }
  const unclaimed = orgs.filter((o) => o.entraTenantId === null)
  if (unclaimed.length !== 1) return { action: 'refuse', reason: 'ambiguous' }
  return { action: 'claim', orgId: unclaimed[0].id, tenantId: configuredTenantId }
}

/**
 * Never throws. A transient DB error while claiming the tenant is a serious
 * problem, but taking the API process down with it turns "the tenant claim
 * didn't happen yet" into "Nexus is offline", which is strictly worse — same
 * posture as `ensureRbacSeeded`, for the same reason.
 */
export async function ensureOrgTenantBackfill(prisma: PrismaClient): Promise<BackfillPlan> {
  try {
    const orgs = await prisma.organization.findMany({ select: { id: true, entraTenantId: true } })
    const plan = planBackfill(orgs, getMsConfig().tenantId)
    if (plan.action === 'claim') {
      await prisma.organization.update({
        where: { id: plan.orgId },
        data: { entraTenantId: plan.tenantId },
      })
      console.log(`[tenancy] claimed Entra tenant ${plan.tenantId} for org ${plan.orgId}`)
    } else if (plan.action === 'refuse') {
      // "Several unclaimed" and "none unclaimed" both refuse, but they are
      // different operator problems, so they get different messages rather
      // than a single word ("several") that is wrong for the zero case.
      const unclaimed = orgs.filter((o) => o.entraTenantId === null).length
      console.warn(
        unclaimed === 0
          ? '[tenancy] no organization is unclaimed and none matches the configured tenant — set entraTenantId by hand'
          : `[tenancy] ${unclaimed} organizations are unclaimed — set entraTenantId by hand for the right one`,
      )
    } else if (plan.action === 'noop' && plan.reason === 'no-tenant-configured') {
      // Silent for already-claimed/no-orgs — that is steady state. This one
      // is not: it means sign-in has no tenant to key on at all, and an
      // operator who forgot to set the env var deserves a breadcrumb.
      console.log(
        '[tenancy] no Entra tenant configured (AZURE_TENANT_ID / MICROSOFT_TENANT_ID) — ' +
        'sign-in is not wired to a tenant yet',
      )
    }
    return plan
  } catch (err) {
    console.error('[tenancy] could not run the org tenant backfill:', err)
    return { action: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

export interface Collision { orgId: string; email: string; memberIds: string[] }

/**
 * Members sharing an address inside one org.
 *
 * `@@unique([orgId, email])` cannot be created while one exists, and `db push`
 * reports that as an opaque constraint failure. Running this first turns it
 * into a list of rows somebody can actually fix.
 *
 * Operator tool, not part of the boot path: a full-table `GROUP BY` on every
 * process start is the wrong trade for a one-shot migration guard. Nothing
 * calls this automatically — run it by hand before a `db push` that adds the
 * `[orgId, email]` constraint.
 */
export async function findCrossOrgEmailCollisions(prisma: PrismaClient): Promise<Collision[]> {
  const rows = await prisma.$queryRaw<Array<{ orgId: string; email: string; ids: string[] }>>`
    SELECT "orgId", lower("email") AS email, array_agg("id") AS ids
    FROM "Member" GROUP BY "orgId", lower("email") HAVING count(*) > 1
  `
  return rows.map((r) => ({ orgId: r.orgId, email: r.email, memberIds: r.ids }))
}
