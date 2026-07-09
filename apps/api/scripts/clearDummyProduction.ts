/**
 * One-off cleanup: remove the seeded dummy PRODUCTION_TRACKING items.
 *
 * Since Operations now runs entirely off the ERP-synced OPEN_ORDERS module
 * (Table / Board / Open Orders all read it), the old PRODUCTION_TRACKING module
 * only holds the sample POs from the seed (PO-2026-0xx). This deletes them.
 *
 * Safe by default — prints what it WOULD delete. Pass --apply to actually delete.
 *
 *   Dry run:  npx tsx apps/api/scripts/clearDummyProduction.ts
 *   Delete:   npx tsx apps/api/scripts/clearDummyProduction.ts --apply
 *
 * Requires DATABASE_URL in the environment (loaded from apps/api/.env or set
 * inline). Run it once per environment (local dev, and on Replit for prod).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const mods = await prisma.departmentModule.findMany({ where: { type: 'PRODUCTION_TRACKING' } })
  if (mods.length === 0) {
    console.log('No PRODUCTION_TRACKING modules found — nothing to do.')
    return
  }

  let total = 0
  for (const m of mods) {
    const items = await prisma.moduleItem.findMany({ where: { moduleId: m.id } })
    console.log(`\nModule "${m.name}" (${m.id}) — ${items.length} item(s):`)
    for (const it of items) {
      const d = (it.data ?? {}) as Record<string, any>
      console.log(`  - ${d.poNumber ?? '(no PO)'} | ${d.product ?? ''} | status=${d.status ?? ''}`)
    }
    total += items.length
    if (APPLY && items.length > 0) {
      const res = await prisma.moduleItem.deleteMany({ where: { moduleId: m.id } })
      console.log(`  → deleted ${res.count}`)
    }
  }

  console.log(
    APPLY
      ? `\n✅ Deleted ${total} dummy production item(s).`
      : `\nDRY RUN — ${total} item(s) would be deleted. Re-run with --apply to delete.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
