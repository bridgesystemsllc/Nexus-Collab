import { describe, it, expect, vi } from 'vitest'
import { ALL_PERMISSION_KEYS } from '@nexus/shared'
import { ensureRbacSeeded } from './bootstrap'

// The regression this guards: adding a permission to the catalogue after a
// workspace has been seeded once. Before this, the boot check asked "is the
// catalogue empty?", the answer was "no", and the new permission never landed.

const fakePrisma = (keys: string[]) => ({
  permission: { findMany: vi.fn(async () => keys.map((key) => ({ key }))) },
  role: { count: vi.fn(async () => 5) },
}) as any

describe('ensureRbacSeeded', () => {
  it('does nothing when the catalogue is complete', async () => {
    const result = await ensureRbacSeeded(fakePrisma([...ALL_PERMISSION_KEYS]))
    expect(result).toMatchObject({ ran: false, reason: 'already-seeded' })
  })

  it('reconciles when a catalogue permission is missing from the database', async () => {
    // Exactly the billing:read situation: seeded workspace, one new key.
    const short = ALL_PERMISSION_KEYS.filter((k) => k !== 'billing:read')
    const prisma = fakePrisma(short)
    // seedRbac would run against the fake and throw on the first unimplemented
    // model call; the assertion is that it got PAST the short-circuit.
    const result = await ensureRbacSeeded(prisma)
    expect(prisma.role.count).toHaveBeenCalled()
    expect(prisma.permission.findMany).toHaveBeenCalled()
    expect(result.reason).toBe('failed')   // it tried to seed, rather than returning 'already-seeded'
  })
})
