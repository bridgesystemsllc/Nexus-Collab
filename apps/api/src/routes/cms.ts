import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const cmRoutes: ReturnType<typeof Router> = Router()

// ─── List all contract manufacturers ────────────────────────
// CMs live as ModuleItems under DepartmentModules of type CM_PRODUCTIVITY.
// Returns shape for pickers/cards: { id, name, status, brands, erpId, cmCode, legalName, cmType, vendorId, headquarters }.
// Never includes taxId.
cmRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await prisma.moduleItem.findMany({
      where: { module: { type: 'CM_PRODUCTIVITY' } },
    })
    const str = (data: Record<string, unknown>, k: string) =>
      typeof data[k] === 'string' ? (data[k] as string) : null
    const cms = items
      .map((item) => {
        const data = (item.data as Record<string, unknown>) || {}
        return {
          id: item.id,
          name: typeof data.name === 'string' ? data.name : '',
          status:
            typeof data.contractStatus === 'string'
              ? data.contractStatus
              : typeof data.status === 'string'
                ? data.status
                : null,
          brands: Array.isArray(data.brands) ? data.brands : [],
          erpId: str(data, 'erpId'),
          cmCode: str(data, 'cmCode'),
          legalName: str(data, 'legalName'),
          cmType: str(data, 'cmType'),
          vendorId: str(data, 'vendorId'),
          headquarters: data.headquarters ?? null,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json(cms)
  } catch (error) {
    console.error('[cms] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch contract manufacturers' })
  }
})
