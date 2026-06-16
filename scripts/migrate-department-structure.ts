// scripts/migrate-department-structure.ts
//
// Applies the Finance/department restructure to an EXISTING database in place
// (non-destructive — no data is wiped). Run this on any instance whose data
// predates the Finance hub so the structural changes take effect:
//
//   1. Finance department  ->  type BUILTIN_FINANCE  (so the costing hub page renders)
//   2. Ensure a FINANCE_COSTING module exists under Finance (created if missing)
//   3. Archive the stub departments that are no longer surfaced in nav:
//        Vendor Mgmt, Sales, Marketing   (archived = true; data preserved)
//
// Idempotent: re-running makes no further changes once applied.
// Reversible: `--revert` restores Finance to CUSTOM and un-archives the three
// departments (the FINANCE_COSTING module is left in place — it holds data).
//
// Run from the repo root:
//   pnpm exec tsx scripts/migrate-department-structure.ts
//   pnpm exec tsx scripts/migrate-department-structure.ts --revert

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

const requireFromPrisma = createRequire(path.join(repoRoot, 'packages', 'prisma', 'package.json'))
const { PrismaClient } = requireFromPrisma('@prisma/client') as typeof import('@prisma/client')

if (!process.env.DATABASE_URL) {
  for (const envPath of [path.join(repoRoot, '.env'), path.join(repoRoot, 'packages', 'prisma', '.env')]) {
    if (!existsSync(envPath)) continue
    const match = readFileSync(envPath, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m)
    if (match) {
      process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, '')
      break
    }
  }
}

const prisma = new PrismaClient()

// Departments archived (hidden from nav) by this migration. Matched by name,
// case-insensitive, so naming variants like "Vendor Mgmt" all resolve.
const ARCHIVE_NAMES = ['Vendor Mgmt', 'Vendor Management', 'Sales', 'Marketing']

async function main() {
  const revert = process.argv.includes('--revert')
  console.log(`Mode: ${revert ? 'REVERT' : 'FORWARD'}\n`)

  const all = await prisma.department.findMany({ include: { modules: { select: { type: true } } } })
  const finance = all.find((d) => d.name.toLowerCase() === 'finance')

  // ── 1 + 2. Finance department type + FINANCE_COSTING module ──
  if (!finance) {
    console.log('! No "Finance" department found — skipping Finance steps.')
  } else if (revert) {
    if (finance.type === 'BUILTIN_FINANCE') {
      await prisma.department.update({ where: { id: finance.id }, data: { type: 'CUSTOM' } })
      console.log(`Finance: type BUILTIN_FINANCE -> CUSTOM`)
    } else {
      console.log(`Finance: type already ${finance.type} (no change)`)
    }
  } else {
    if (finance.type !== 'BUILTIN_FINANCE') {
      await prisma.department.update({ where: { id: finance.id }, data: { type: 'BUILTIN_FINANCE' } })
      console.log(`Finance: type ${finance.type} -> BUILTIN_FINANCE`)
    } else {
      console.log(`Finance: type already BUILTIN_FINANCE (no change)`)
    }
    const hasCosting = finance.modules.some((m) => m.type === 'FINANCE_COSTING')
    if (!hasCosting) {
      await prisma.departmentModule.create({
        data: { name: 'Costing', type: 'FINANCE_COSTING', departmentId: finance.id, sortOrder: 0 },
      })
      console.log(`Finance: created FINANCE_COSTING module`)
    } else {
      console.log(`Finance: FINANCE_COSTING module already present (no change)`)
    }
  }

  // ── 3. Archive / un-archive stub departments ──
  const targetArchived = !revert
  for (const name of ARCHIVE_NAMES) {
    const dept = all.find((d) => d.name.toLowerCase() === name.toLowerCase())
    if (!dept) continue
    if (dept.archived === targetArchived) {
      console.log(`${dept.name}: already ${targetArchived ? 'archived' : 'active'} (no change)`)
      continue
    }
    await prisma.department.update({ where: { id: dept.id }, data: { archived: targetArchived } })
    console.log(`${dept.name}: archived ${dept.archived} -> ${targetArchived}`)
  }

  // ── Summary ──
  const after = await prisma.department.findMany({ orderBy: { createdAt: 'asc' } })
  console.log('\nDepartments now:')
  for (const d of after) {
    console.log(`  - ${d.name.padEnd(18)} type ${d.type.padEnd(16)} ${d.archived ? '[archived]' : ''}`)
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    return prisma.$disconnect().then(() => process.exit(1))
  })
