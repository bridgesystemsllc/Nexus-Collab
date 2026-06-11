// scripts/migrate-cm-links.ts
//
// Backfills CM links on R&D items: for every BRIEFS / NPD_PIPELINE ModuleItem
// that carries a free-text contract-manufacturer name but no `cmId`, find the
// matching CM_PRODUCTIVITY profile (case-insensitive, trimmed name match, with
// a conservative unique-prefix fallback, e.g. "ACT" -> "ACT Labs") and store
// its id as `data.cmId`. Items with no match are flagged `data.cmUnmatched`
// instead, so nothing breaks. Existing text fields are never deleted or
// overwritten, and the script is idempotent — items that already have a
// `cmId` are skipped.
//
// Run from the repo root:
//   pnpm exec tsx scripts/migrate-cm-links.ts

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

type Row = {
  type: string
  name: string
  cmText: string
  result: string
}

const norm = (s: string) => s.trim().toLowerCase()

function buildMatcher(cms: { id: string; name: string }[]) {
  const exact = new Map<string, { id: string; name: string }>()
  for (const cm of cms) exact.set(norm(cm.name), cm)

  return (text: string): { id: string; name: string; via: 'exact' | 'prefix' } | null => {
    const q = norm(text)
    if (!q) return null
    const hit = exact.get(q)
    if (hit) return { ...hit, via: 'exact' }
    // Conservative fallback: unique prefix match either direction
    // (e.g. NPD items store "ACT" for the "ACT Labs" profile).
    if (q.length >= 3) {
      const candidates = cms.filter((cm) => {
        const n = norm(cm.name)
        return n.startsWith(q) || q.startsWith(n)
      })
      if (candidates.length === 1) return { ...candidates[0], via: 'prefix' }
    }
    return null
  }
}

/** Pull the free-text CM name off an item's data, wherever it lives. */
function cmTextOf(data: Record<string, unknown>): string {
  for (const key of ['contractManufacturer', 'cm', 'contractManufacturerId'] as const) {
    const v = data[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

async function main() {
  const cmItems = await prisma.moduleItem.findMany({
    where: { module: { type: 'CM_PRODUCTIVITY' } },
  })
  const cms = cmItems
    .map((item) => {
      const data = (item.data as Record<string, unknown>) || {}
      return { id: item.id, name: typeof data.name === 'string' ? data.name : '' }
    })
    .filter((cm) => cm.name)
  const matchCm = buildMatcher(cms)

  console.log(`Found ${cms.length} CM profiles: ${cms.map((c) => c.name).join(', ')}\n`)

  const targets = await prisma.moduleItem.findMany({
    where: { module: { type: { in: ['BRIEFS', 'NPD_PIPELINE'] } } },
    include: { module: true },
  })

  const rows: Row[] = []
  let matched = 0
  let unmatched = 0
  let skipped = 0

  for (const item of targets) {
    const data = (item.data as Record<string, unknown>) || {}
    const type = item.module.type
    const itemName =
      (typeof data.projectName === 'string' && data.projectName) ||
      (typeof data.name === 'string' && data.name) ||
      item.id
    const cmText = cmTextOf(data)

    if (typeof data.cmId === 'string' && data.cmId) {
      skipped++
      rows.push({ type, name: itemName, cmText: cmText || '—', result: 'already linked (skipped)' })
      continue
    }
    if (!cmText) continue // no CM text at all — nothing to migrate

    const match = matchCm(cmText)
    if (match) {
      const nextData: Record<string, unknown> = { ...data, cmId: match.id }
      delete nextData.cmUnmatched // clear any stale flag
      await prisma.moduleItem.update({ where: { id: item.id }, data: { data: nextData as object } })
      matched++
      rows.push({
        type,
        name: itemName,
        cmText,
        result: `-> ${match.id} (${match.name}${match.via === 'prefix' ? ', prefix match' : ''})`,
      })
    } else {
      await prisma.moduleItem.update({
        where: { id: item.id },
        data: { data: { ...data, cmUnmatched: true } as object },
      })
      unmatched++
      rows.push({ type, name: itemName, cmText, result: 'UNMATCHED (flagged cmUnmatched)' })
    }
  }

  // ─── Result table ──────────────────────────────────────────
  const headers = { type: 'Type', name: 'Item', cmText: 'CM Text', result: 'Result' }
  const w = (key: keyof Row) => Math.max(headers[key].length, ...rows.map((r) => r[key].length))
  const widths = { type: w('type'), name: w('name'), cmText: w('cmText'), result: w('result') }
  const line = (r: { type: string; name: string; cmText: string; result: string }) =>
    `| ${r.type.padEnd(widths.type)} | ${r.name.padEnd(widths.name)} | ${r.cmText.padEnd(widths.cmText)} | ${r.result.padEnd(widths.result)} |`

  console.log(line(headers))
  console.log(line({ type: '-'.repeat(widths.type), name: '-'.repeat(widths.name), cmText: '-'.repeat(widths.cmText), result: '-'.repeat(widths.result) }))
  for (const row of rows) console.log(line(row))

  console.log(`\nDone: ${matched} matched, ${unmatched} unmatched, ${skipped} already linked.`)
}

main()
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
