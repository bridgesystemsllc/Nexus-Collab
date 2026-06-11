import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const cmRoutes: ReturnType<typeof Router> = Router()

// ─── List all contract manufacturers ────────────────────────
// CMs live as ModuleItems under DepartmentModules of type CM_PRODUCTIVITY.
// Returns a slim shape for pickers/links: { id, name, status, brands }.
cmRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const items = await prisma.moduleItem.findMany({
      where: { module: { type: 'CM_PRODUCTIVITY' } },
    })
    const cms = items
      .map((item) => {
        const data = (item.data as Record<string, unknown>) || {}
        return {
          id: item.id,
          name: typeof data.name === 'string' ? data.name : '',
          status: typeof data.status === 'string' ? data.status : null,
          brands: Array.isArray(data.brands) ? data.brands : [],
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    res.json(cms)
  } catch (error) {
    console.error('[cms] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch contract manufacturers' })
  }
})
