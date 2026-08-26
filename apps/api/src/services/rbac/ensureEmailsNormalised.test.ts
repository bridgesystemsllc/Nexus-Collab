import { describe, it, expect } from 'vitest'
import { ensureEmailsNormalised } from './bootstrap'

// Member.email moved from a global @unique to @@unique([orgId, email]) — two
// customers legitimately holding the same address is now expected. The
// collision check has to be scoped to the row's own org, or Org B's address
// gets refused forever because it collides with an unrelated Org A member.

interface FakeMember {
  id: string
  orgId: string
  email: string
}

function fakePrisma(mixedCaseRows: FakeMember[], lowercasedRows: FakeMember[]) {
  const members = [...lowercasedRows]
  const updates: { id: string; email: string }[] = []

  const prisma = {
    $queryRaw: async () => mixedCaseRows.map((r) => ({ id: r.id, orgId: r.orgId, email: r.email })),
    member: {
      findFirst: async ({ where }: any) => {
        const hit = members.find(
          (m) => m.orgId === where.orgId && m.email === where.email && m.id !== where.NOT.id,
        )
        return hit ? { id: hit.id } : null
      },
      update: async ({ where, data }: any) => {
        updates.push({ id: where.id, email: data.email })
        const m = members.find((x) => x.id === where.id) ?? mixedCaseRows.find((x) => x.id === where.id)
        if (m) m.email = data.email
        return m
      },
    },
  }

  return { prisma: prisma as any, updates }
}

describe('ensureEmailsNormalised', () => {
  it('normalises both members when the case-insensitive match is in a DIFFERENT org', async () => {
    // Org A already holds the lowercase address; Org B's mixed-case row must
    // still normalise — it is two different customers, not a collision.
    const { prisma, updates } = fakePrisma(
      [{ id: 'mem_b', orgId: 'org_b', email: 'Ahmad@x.com' }],
      [{ id: 'mem_a', orgId: 'org_a', email: 'ahmad@x.com' }],
    )

    const result = await ensureEmailsNormalised(prisma)

    expect(result).toEqual({ normalised: 1, collisions: [] })
    expect(updates).toEqual([{ id: 'mem_b', email: 'ahmad@x.com' }])
  })

  it('refuses and reports a collision when the match is in the SAME org', async () => {
    const { prisma, updates } = fakePrisma(
      [{ id: 'mem_b', orgId: 'org_a', email: 'Ahmad@x.com' }],
      [{ id: 'mem_a', orgId: 'org_a', email: 'ahmad@x.com' }],
    )

    const result = await ensureEmailsNormalised(prisma)

    expect(result).toEqual({ normalised: 0, collisions: ['Ahmad@x.com'] })
    expect(updates).toEqual([])
  })

  it('normalises two mixed-case rows in different orgs that both lowercase to the same address', async () => {
    const { prisma, updates } = fakePrisma(
      [
        { id: 'mem_a', orgId: 'org_a', email: 'Ahmad@x.com' },
        { id: 'mem_b', orgId: 'org_b', email: 'AHMAD@x.com' },
      ],
      [],
    )

    const result = await ensureEmailsNormalised(prisma)

    expect(result.collisions).toEqual([])
    expect(result.normalised).toBe(2)
    expect(updates.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: 'mem_a', email: 'ahmad@x.com' },
      { id: 'mem_b', email: 'ahmad@x.com' },
    ])
  })
})
