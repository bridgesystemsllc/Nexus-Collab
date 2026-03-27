import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const everythingRoutes: ReturnType<typeof Router> = Router()

// ─── Unified view of all records ────────────────────────────
everythingRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const { type, search, dept, brand } = req.query

    // Fetch all data sources in parallel
    const [moduleItems, tasks, documents] = await Promise.all([
      prisma.moduleItem.findMany({
        include: {
          module: {
            select: { id: true, name: true, type: true, department: { select: { id: true, name: true, color: true } } },
          },
        },
      }),
      prisma.task.findMany({
        include: {
          owner: { select: { id: true, name: true, avatar: true } },
          department: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, title: true } },
        },
      }),
      prisma.document.findMany(),
    ])

    // Transform into unified records
    let records: any[] = []

    // Module items → unified records
    for (const item of moduleItems) {
      records.push({
        id: item.id,
        type: item.module.type,
        typeName: item.module.name,
        title: (item.data as any)?.name || (item.data as any)?.product || (item.data as any)?.sku || 'Untitled',
        status: item.status,
        department: item.module.department,
        data: item.data,
        source: 'module_item',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
    }

    // Tasks → unified records
    for (const task of tasks) {
      records.push({
        id: task.id,
        type: 'TASK',
        typeName: 'Task',
        title: task.title,
        status: task.status,
        department: task.department,
        data: {
          priority: task.priority,
          owner: task.owner,
          dueDate: task.dueDate,
          project: task.project,
          brandNames: task.brandNames,
        },
        source: 'task',
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })
    }

    // Documents → unified records
    for (const doc of documents) {
      records.push({
        id: doc.id,
        type: 'DOCUMENT',
        typeName: doc.type,
        title: doc.name,
        status: null,
        department: null,
        data: {
          mimeType: doc.mimeType,
          size: doc.size,
          docType: doc.type,
        },
        source: 'document',
        createdAt: doc.createdAt,
      })
    }

    // Apply filters
    if (type && type !== 'ALL') {
      records = records.filter(r => r.type === type)
    }
    if (search) {
      const s = (search as string).toLowerCase()
      records = records.filter(r => r.title.toLowerCase().includes(s))
    }
    if (dept) {
      records = records.filter(r => r.department?.id === dept)
    }
    if (brand) {
      records = records.filter(r => {
        const d = r.data
        return d?.brand === brand || d?.brandNames?.includes(brand) || false
      })
    }

    // Sort by most recent
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // KPI summary
    const kpis = {
      total: records.length,
      byType: records.reduce((acc: any, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1
        return acc
      }, {}),
      emergency: records.filter(r => r.status === 'emergency' || r.status === 'CRITICAL').length,
    }

    res.json({ records, kpis })
  } catch (error) {
    console.error('[everything] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch unified view' })
  }
})
