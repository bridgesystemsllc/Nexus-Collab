import type { Prisma, PrismaClient } from '@prisma/client'

export type Tx = Prisma.TransactionClient | PrismaClient

/**
 * Allocate the next part number for an organization.
 *
 * Safe under concurrency: the increment is a single atomic statement, and the
 * create path tolerates a competing create via a unique-violation retry.
 *
 * Part numbers start at 200001 (counter default lastValue = 200000).
 */
export async function allocatePartNumber(tx: Tx, orgId: string): Promise<number> {
  const updated = await tx.partNumberCounter.updateMany({
    where: { orgId },
    data: { lastValue: { increment: 1 } },
  })

  if (updated.count > 0) {
    const row = await tx.partNumberCounter.findUnique({
      where: { orgId },
    })
    if (!row) throw new Error(`Part number counter for ${orgId} disappeared mid-allocation`)
    return row.lastValue
  }

  try {
    const created = await tx.partNumberCounter.create({
      data: { orgId, lastValue: 200001 },
    })
    return created.lastValue
  } catch (err: any) {
    if (err?.code !== 'P2002') throw err
    const retried = await tx.partNumberCounter.update({
      where: { orgId },
      data: { lastValue: { increment: 1 } },
    })
    return retried.lastValue
  }
}
