import type { PrismaClient } from '@prisma/client'

// Self-healing department structure, run once on every API boot.
//
// Code merged to main does NOT restructure an existing deployment's database —
// a department's `type`/`archived` and its modules live in the DB. So a freshly
// deployed build can still show the old Finance stub + lingering Sales/Marketing
// nav entries until the data is migrated. This makes the boot do that migration
// idempotently, so every deploy self-corrects with no manual script.
//
// Design: the one-time restructure (Finance -> BUILTIN_FINANCE, create the
// FINANCE_COSTING module, archive the stub departments) only runs while Finance
// is still the old CUSTOM type. Once Finance is BUILTIN_FINANCE we only keep the
// FINANCE_COSTING module present as an invariant and never touch archive flags
// again — so an admin can later un-archive a department without the boot
// re-archiving it on the next restart.
const ARCHIVE_NAMES = ['vendor mgmt', 'vendor management', 'sales', 'marketing']

export async function ensureDepartmentStructure(prisma: PrismaClient): Promise<void> {
  try {
    const finance = await prisma.department.findFirst({
      where: { name: { equals: 'Finance', mode: 'insensitive' } },
      include: { modules: { select: { type: true } } },
    })
    if (!finance) return

    const firstTimeSetup = finance.type !== 'BUILTIN_FINANCE'

    if (firstTimeSetup) {
      await prisma.department.update({ where: { id: finance.id }, data: { type: 'BUILTIN_FINANCE' } })
      console.log('[structure] Finance department -> BUILTIN_FINANCE')
    }

    // Invariant: Finance always has a FINANCE_COSTING module (the cost-override store).
    if (!finance.modules.some((m) => m.type === 'FINANCE_COSTING')) {
      await prisma.departmentModule.create({
        data: { name: 'Costing', type: 'FINANCE_COSTING', departmentId: finance.id, sortOrder: 0 },
      })
      console.log('[structure] created FINANCE_COSTING module under Finance')
    }

    // One-time only: archive the retired stub departments. Skipped once Finance
    // is already set up, so manual un-archiving later is respected.
    if (firstTimeSetup) {
      const stubs = await prisma.department.findMany({ where: { archived: false } })
      for (const d of stubs) {
        if (ARCHIVE_NAMES.includes(d.name.toLowerCase())) {
          await prisma.department.update({ where: { id: d.id }, data: { archived: true } })
          console.log(`[structure] archived department: ${d.name}`)
        }
      }
    }
  } catch (err) {
    // Never let a structure-ensure failure crash the server.
    console.error('[structure] ensureDepartmentStructure failed (non-fatal):', err)
  }
}
