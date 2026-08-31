import { describe, it, expect, vi } from 'vitest'
import { ensureOorModule, OOR_MODULE_TYPE } from './bootstrap'

/** A prisma double whose $transaction hands the callback a tx with the same shape. */
function prismaDouble(opts: {
  ops?: { id: string } | null
  existing?: { id: string; _count: { items: number } }[]
}) {
  const findMany = vi.fn().mockResolvedValue(opts.existing ?? [])
  const create = vi.fn().mockResolvedValue({ id: 'mod_new' })
  const deleteMany = vi.fn().mockResolvedValue({ count: 0 })
  const executeRaw = vi.fn().mockResolvedValue(1)
  const tx = {
    $executeRaw: executeRaw,
    departmentModule: { findMany, create, deleteMany },
  }
  const prisma: any = {
    department: { findFirst: vi.fn().mockResolvedValue(opts.ops === undefined ? { id: 'dept_ops' } : opts.ops) },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  }
  return { prisma, findMany, create, deleteMany, executeRaw }
}

describe('ensureOorModule', () => {
  it('creates the module when none exists', async () => {
    const { prisma, create } = prismaDouble({})
    expect(await ensureOorModule(prisma)).toBe('mod_new')
    expect(create.mock.calls[0][0].data).toMatchObject({ type: OOR_MODULE_TYPE, departmentId: 'dept_ops' })
  })

  it('returns the existing module without creating a second one', async () => {
    const { prisma, create } = prismaDouble({ existing: [{ id: 'mod_1', _count: { items: 0 } }] })
    expect(await ensureOorModule(prisma)).toBe('mod_1')
    expect(create).not.toHaveBeenCalled()
  })

  it('takes an advisory lock so two concurrent boots cannot both create one', async () => {
    const { prisma, executeRaw } = prismaDouble({})
    await ensureOorModule(prisma)
    expect(executeRaw).toHaveBeenCalledTimes(1)
    expect(String(executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock')
  })

  it('heals duplicates left by an earlier unlocked boot, keeping the oldest', async () => {
    const { prisma, deleteMany } = prismaDouble({
      existing: [
        { id: 'mod_1', _count: { items: 0 } },
        { id: 'mod_2', _count: { items: 0 } },
      ],
    })
    expect(await ensureOorModule(prisma)).toBe('mod_1')
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['mod_2'] } } })
  })

  it('never deletes a duplicate that has items attached to it', async () => {
    const { prisma, deleteMany } = prismaDouble({
      existing: [
        { id: 'mod_1', _count: { items: 0 } },
        { id: 'mod_2', _count: { items: 3 } },
      ],
    })
    expect(await ensureOorModule(prisma)).toBe('mod_1')
    expect(deleteMany).not.toHaveBeenCalled()
  })

  it('no-ops without an Operations department rather than inventing one', async () => {
    const { prisma, create } = prismaDouble({ ops: null })
    expect(await ensureOorModule(prisma)).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })
})
