// scripts/migrate-components-module.ts
//
// Re-parents the COMPONENTS DepartmentModule(s) from the built-in R&D
// department (type BUILTIN_RD) to the built-in Operations department
// (type BUILTIN_OPS). ModuleItems reference moduleId only, so all rows
// ride along untouched — this is a non-destructive ownership change.
//
// The script is idempotent (modules already under Operations are skipped)
// and reversible: pass `--revert` to move COMPONENTS modules back from
// Operations to R&D.
//
// Run from the repo root:
//   pnpm exec tsx scripts/migrate-components-module.ts
//   pnpm exec tsx scripts/migrate-components-module.ts --revert

import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(__dirname, '..')

// Resolve the generated Prisma client from @nexus/prisma (same client seed.ts
// uses) so this script needs no dependencies of its own.
const requireFromPrisma = createRequire(path.join(repoRoot, 'packages', 'prisma', 'package.json'))
const { PrismaClient } = requireFromPrisma('@prisma/client') as typeof import('@prisma/client')

// Prisma reads DATABASE_URL from the environment; when run standalone, pull it
// from the repo's .env files (root first, then packages/prisma).
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

async function main() {
  const revert = process.argv.includes('--revert')

  const rd = await prisma.department.findFirst({ where: { type: 'BUILTIN_RD' } })
  const ops = await prisma.department.findFirst({ where: { type: 'BUILTIN_OPS' } })
  if (!rd) throw new Error('No BUILTIN_RD department found')
  if (!ops) throw new Error('No BUILTIN_OPS department found')

  // Forward: R&D -> Operations. Revert: Operations -> R&D.
  const from = revert ? ops : rd
  const to = revert ? rd : ops

  console.log(`Mode: ${revert ? 'REVERT (Operations -> R&D)' : 'FORWARD (R&D -> Operations)'}`)
  console.log(`From: ${from.name} (${from.id}, ${from.type})`)
  console.log(`To:   ${to.name} (${to.id}, ${to.type})`)

  const allComponents = await prisma.departmentModule.findMany({
    where: { type: 'COMPONENTS' },
    include: { _count: { select: { items: true } }, department: { select: { name: true, type: true } } },
  })

  console.log('\nBefore:')
  for (const mod of allComponents) {
    console.log(`  - ${mod.name} (${mod.id}) under ${mod.department?.name} [${mod.department?.type}] — ${mod._count.items} items, sortOrder ${mod.sortOrder}`)
  }
  if (allComponents.length === 0) {
    console.log('  (no COMPONENTS modules found — nothing to do)')
    return
  }

  const toMove = allComponents.filter((m) => m.departmentId === from.id)
  const alreadyThere = allComponents.filter((m) => m.departmentId === to.id)
  if (alreadyThere.length) {
    console.log(`\nSkipping ${alreadyThere.length} module(s) already under ${to.name} (idempotent).`)
  }
  if (toMove.length === 0) {
    console.log(`No COMPONENTS modules under ${from.name} — nothing to move.`)
    return
  }

  // Place moved modules after the destination department's existing modules.
  const maxSort = await prisma.departmentModule.aggregate({
    where: { departmentId: to.id },
    _max: { sortOrder: true },
  })
  let nextSort = (maxSort._max.sortOrder ?? -1) + 1

  for (const mod of toMove) {
    await prisma.departmentModule.update({
      where: { id: mod.id },
      data: { departmentId: to.id, sortOrder: nextSort++ },
    })
    console.log(`\nMoved "${mod.name}" (${mod.id}) -> ${to.name}. All ${mod._count.items} items untouched (they reference moduleId).`)
  }

  const after = await prisma.departmentModule.findMany({
    where: { type: 'COMPONENTS' },
    include: { _count: { select: { items: true } }, department: { select: { name: true, type: true } } },
  })
  console.log('\nAfter:')
  for (const mod of after) {
    console.log(`  - ${mod.name} (${mod.id}) under ${mod.department?.name} [${mod.department?.type}] — ${mod._count.items} items, sortOrder ${mod.sortOrder}`)
  }
  console.log('\nDone.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
