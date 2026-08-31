import type { PrismaClient } from '@prisma/client'

// ─── Open Order Report module ensure ────────────────────────
// Runs on every boot, following the pattern in ensureDepartmentStructure: code
// merged to main does not restructure a deployment's database, so the module
// row that makes the tab resolvable has to be an idempotent boot invariant
// rather than a script somebody has to remember to run.
//
// The OOR's data lives in its own tables — this row exists so the tab resolves
// through the same MODULE_TYPE_BY_TAB lookup as its neighbours, and so an admin
// can reorder or rename it like any other Operations module.
//
// Why the advisory lock: a plain find-then-create is only idempotent when boots
// are serial. Two API processes starting together — which is exactly what a
// deploy and a tsx watch restart look like — both see no row and both create
// one. That was observed, not theorised. DepartmentModule cannot carry a unique
// on (departmentId, type) to prevent it either, because Inventory Health
// legitimately has two rows, one for Geodis and one for KarEve. So the mutual
// exclusion has to live here.

export const OOR_MODULE_TYPE = 'OPEN_ORDER_REPORT'
const OOR_MODULE_NAME = 'Open Order Report'

// Any stable 64-bit constant. Scoped to this ensure so it cannot contend with
// another boot task that also takes an advisory lock.
const OOR_ENSURE_LOCK_KEY = 8_270_114_001n

/** Finds or creates the Operations OOR module. Returns its id, or null if
 *  there is no Operations department yet (a fresh database mid-seed). */
export async function ensureOorModule(prisma: PrismaClient): Promise<string | null> {
  const ops = await prisma.department.findFirst({
    where: { OR: [{ type: 'BUILTIN_OPS' }, { name: { equals: 'Operations', mode: 'insensitive' } }] },
    select: { id: true },
  })
  // No Operations department means the workspace has not been seeded yet.
  // Inventing one here would fight ensureDepartmentStructure for ownership.
  if (!ops) return null

  return prisma.$transaction(async (tx) => {
    // Held until the transaction ends; a concurrent boot waits here and then
    // finds the row this one created.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OOR_ENSURE_LOCK_KEY}::bigint)`

    const existing = await tx.departmentModule.findMany({
      where: { departmentId: ops.id, type: OOR_MODULE_TYPE },
      orderBy: { createdAt: 'asc' },
      select: { id: true, _count: { select: { items: true } } },
    })

    if (existing.length > 0) {
      // Heal duplicates a pre-lock boot may already have left behind. Only ever
      // removes an empty one, so a module someone attached data to survives
      // even if it should not exist.
      const [keep, ...extras] = existing
      const removable = extras.filter((m) => m._count.items === 0).map((m) => m.id)
      if (removable.length > 0) {
        await tx.departmentModule.deleteMany({ where: { id: { in: removable } } })
        console.log(`[oor] removed ${removable.length} duplicate OPEN_ORDER_REPORT module(s)`)
      }
      return keep.id
    }

    const created = await tx.departmentModule.create({
      data: { name: OOR_MODULE_NAME, type: OOR_MODULE_TYPE, departmentId: ops.id, sortOrder: 40 },
      select: { id: true },
    })
    console.log('[oor] created OPEN_ORDER_REPORT module under Operations')
    return created.id
  })
}
