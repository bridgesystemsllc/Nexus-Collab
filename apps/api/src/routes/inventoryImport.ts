import { Router, Response } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { runGeodisImport } from '../services/inventoryImport/runImport'
import {
  ensureGeodisFeed,
  normalizeFeedConfig,
  GEODIS_FEED_TYPE,
} from '../services/inventoryImport/feedConfig'
import { UPLOAD_MAX_BYTES } from '../lib/uploadValidation'
import { getActingOrgId } from '../middleware/billingContext'
import { requirePermission, type RbacRequest } from '../middleware/requirePermission'

export const inventoryImportRoutes: ReturnType<typeof Router> = Router()

// Spreadsheets are held in memory only for the duration of the parse — they
// are never persisted, since the module items are the durable artifact.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
})

// ─── Feed status ─────────────────────────────────────────────
inventoryImportRoutes.get('/geodis/status', requirePermission('settings:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const feed = await ensureGeodisFeed(prisma, orgId)
    if (!feed) {
      return res.json({ configured: false, reason: 'No organization or Operations department' })
    }

    const integration = await prisma.integration.findFirst({
      where: { id: feed.integrationId, orgId },
    })
    const lastRun = await prisma.syncLog.findFirst({
      where: { integrationId: feed.integrationId },
      orderBy: { startedAt: 'desc' },
    })
    const itemCount = feed.config.targetModuleId
      ? await prisma.moduleItem.count({
          where: {
            moduleId: feed.config.targetModuleId,
            module: { department: { orgId } },
          },
        })
      : 0

    res.json({
      configured: true,
      integrationId: feed.integrationId,
      moduleId: feed.config.targetModuleId,
      status: integration?.status ?? 'DISCONNECTED',
      lastSyncAt: integration?.lastSyncAt ?? null,
      syncCount: integration?.syncCount ?? 0,
      itemCount,
      config: feed.config,
      lastRun: lastRun
        ? {
            id: lastRun.id,
            status: lastRun.status,
            recordsProcessed: lastRun.recordsProcessed,
            errors: lastRun.errors,
            startedAt: lastRun.startedAt,
            completedAt: lastRun.completedAt,
          }
        : null,
    })
  } catch (error) {
    console.error('[inventoryImport] status error:', error)
    res.status(500).json({ error: 'Failed to load Geodis feed status' })
  }
})

// ─── Run history ─────────────────────────────────────────────
inventoryImportRoutes.get('/geodis/logs', requirePermission('settings:read'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const integration = await prisma.integration.findFirst({
      where: { type: GEODIS_FEED_TYPE, orgId },
    })
    if (!integration) return res.json([])

    const logs = await prisma.syncLog.findMany({
      where: { integrationId: integration.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    })
    res.json(logs)
  } catch (error) {
    console.error('[inventoryImport] logs error:', error)
    res.status(500).json({ error: 'Failed to load import history' })
  }
})

// ─── Update feed configuration (column map, guard, matching) ─
inventoryImportRoutes.put('/geodis/config', requirePermission('settings:manage'), async (req: RbacRequest, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const feed = await ensureGeodisFeed(prisma, orgId)
    if (!feed) return res.status(409).json({ error: 'Geodis feed is not configured' })

    // Merge over the resolved config so a partial update cannot blank fields,
    // then re-normalize so anything invalid falls back to a sane default.
    const merged = normalizeFeedConfig({
      ...feed.config,
      ...(req.body ?? {}),
      // The target module is resolved by the server, never client-supplied.
      targetModuleId: feed.config.targetModuleId,
    })

    await prisma.integration.update({
      where: { id: feed.integrationId, orgId },
      data: { config: merged as unknown as object },
    })
    res.json({ success: true, config: merged })
  } catch (error) {
    console.error('[inventoryImport] config error:', error)
    res.status(500).json({ error: 'Failed to update feed configuration' })
  }
})

// ─── Manual upload ───────────────────────────────────────────
// The same import path the email feed uses, driven by hand. This is how a
// backfill or a one-off correction is applied, and how the column mapping is
// validated against a real file before the automated feed is trusted.
inventoryImportRoutes.post(
  '/geodis/upload',
  requirePermission('settings:manage'),
  upload.single('file'),
  async (req: RbacRequest, res: Response) => {
    try {
      const orgId = getActingOrgId(req)
      const file = (req as any).file as Express.Multer.File | undefined
      if (!file) return res.status(400).json({ error: 'A spreadsheet file is required' })

      // An operator who has reviewed a held run can force it through.
      const overrideGuard = String((req.body ?? {}).overrideGuard) === 'true'

      const result = await runGeodisImport({
        prisma,
        buffer: file.buffer,
        filename: file.originalname,
        overrideGuard,
        orgId,
      })

      // A held import is a deliberate refusal to write, not a server fault —
      // 409 lets the UI offer "apply anyway" without treating it as an error.
      const httpStatus = result.ok ? 200 : result.status === 'held' ? 409 : 400
      res.status(httpStatus).json(result)
    } catch (error) {
      console.error('[inventoryImport] upload error:', error)
      res.status(500).json({ error: 'Failed to import inventory file' })
    }
  },
)

export default inventoryImportRoutes
