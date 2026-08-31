import { describe, it, expect, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { classifyEmail } from './userService'

// ─── Cross-tenant isolation ──────────────────────────────────
// classifyEmail used to search Member and UserInvitation with no org scope.
// Two failure modes that produced:
//   A) Org B inviting an address Org A already has pending revokes Org A's
//      live invitation token (inviteUser acts on whatever this returns).
//   B) Org B gets DUPLICATE_EMAIL back carrying Org A's deactivated
//      employee's name and member id — a disclosure across the tenant
//      boundary.
// Both close once this function only ever looks inside the caller's own org.

function fakePrisma(opts: {
  member?: { id: string; name: string; lifecycleStatus: string; email: string; orgId: string } | null
  invitation?: { id: string; email: string; orgId: string } | null
} = {}): PrismaClient {
  const member = opts.member ?? null
  const invitation = opts.invitation ?? null

  return {
    member: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.orgId && where.orgId !== member?.orgId) return null
        if (!member) return null
        return { id: member.id, name: member.name, lifecycleStatus: member.lifecycleStatus }
      }),
    },
    userInvitation: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.orgId && where.orgId !== invitation?.orgId) return null
        if (!invitation) return null
        return { id: invitation.id }
      }),
    },
  } as unknown as PrismaClient
}

describe('classifyEmail — org scoping', () => {
  it('finds neither an active member nor a pending invitation belonging to a different org', async () => {
    const prisma = fakePrisma({
      member: { id: 'mem_a', name: 'Ahmad A', lifecycleStatus: 'active', email: 'x@y.com', orgId: 'org_A' },
      invitation: { id: 'inv_a', email: 'x@y.com', orgId: 'org_A' },
    })

    const result = await classifyEmail(prisma, 'x@y.com', 'org_B')

    // 'none' is this codebase's name for "no conflict" (EmailConflict's kind).
    expect(result).toEqual({ kind: 'none' })
  })

  it('still detects a genuine duplicate active member within the caller\'s own org', async () => {
    const prisma = fakePrisma({
      member: { id: 'mem_a', name: 'Ahmad A', lifecycleStatus: 'active', email: 'x@y.com', orgId: 'org_A' },
    })

    const result = await classifyEmail(prisma, 'x@y.com', 'org_A')

    expect(result).toEqual({ kind: 'active', memberId: 'mem_a' })
  })

  it('still detects a genuine deactivated member within the caller\'s own org', async () => {
    const prisma = fakePrisma({
      member: { id: 'mem_a', name: 'Ahmad A', lifecycleStatus: 'deactivated', email: 'x@y.com', orgId: 'org_A' },
    })

    const result = await classifyEmail(prisma, 'x@y.com', 'org_A')

    expect(result).toEqual({ kind: 'deactivated', memberId: 'mem_a', name: 'Ahmad A' })
  })

  it('still detects a genuine pending invitation within the caller\'s own org', async () => {
    const prisma = fakePrisma({
      invitation: { id: 'inv_a', email: 'x@y.com', orgId: 'org_A' },
    })

    const result = await classifyEmail(prisma, 'x@y.com', 'org_A')

    expect(result).toEqual({ kind: 'invited', invitationId: 'inv_a' })
  })
})
