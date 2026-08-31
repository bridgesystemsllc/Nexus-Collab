import { Router, Request, Response } from 'express'
import multer from 'multer'
import { prisma } from '../index'
import { runGeodisImport } from '../services/inventoryImport/runImport'
import {
  ensureGeodisFeed,
  normalizeFeedConfig,
  GEODIS_FEED_TYPE,
} from '../services/inventoryImport/feedConfig'
import { UPLOAD_MAX_BYTES } from '../lib/uploadValidation'

export const inventoryImportRoutes: ReturnType<typeof Router> = Router()

// Spreadsheets are held in memory only for the duration of the parse — they
// are never persisted, since the module items are the durable artifact.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
})

// Mirrors the role gate used by the integrations routing endpoint: inventory
// is operational data, so writes require ADMIN or OPS_MANAGER. This route
// sits behind isAuthenticated, so `member` should always be resolved here;
// local development authenticates via /api/dev-login, not a bypass in this check.
function requirePrivileged(req: Request, res: Response): boolean {
  const member = (req as any).member as { role?: string } | undefined
  const role = member?.role
  const privileged = role === 'ADMIN' || role === 'OPS_MANAGER'
  if (!privileged) {
    res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    return false
  }
  return true
}

// ─── Feed status ─────────────────────────────────────────────
inventoryImportRoutes.get('/geodis/status', async (_req: Request, res: Response) => {
  try {
    const feed = await ensureGeodisFeed(prisma)
    if (!feed) {
      return res.json({ configured: false, reason: 'No organization or Operations department' })
    }

    const integration = await prisma.integration.findUnique({ where: { id: feed.integrationId } })
    const lastRun = await prisma.syncLog.findFirst({
      where: { integrationId: feed.integrationId },
      orderBy: { startedAt: 'desc' },
    })
    const itemCount = feed.config.targetModuleId
      ? await prisma.moduleItem.count({ where: { moduleId: feed.config.targetModuleId } })
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
inventoryImportRoutes.get('/geodis/logs', async (_req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: GEODIS_FEED_TYPE } })
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
inventoryImportRoutes.put('/geodis/config', async (req: Request, res: Response) => {
  if (!requirePrivileged(req, res)) return

  try {
    const feed = await ensureGeodisFeed(prisma)
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
      where: { id: feed.integrationId },
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
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!requirePrivileged(req, res)) return

    try {
      const file = (req as any).file as Express.Multer.File | undefined
      if (!file) return res.status(400).json({ error: 'A spreadsheet file is required' })

      // An operator who has reviewed a held run can force it through.
      const overrideGuard = String((req.body ?? {}).overrideGuard) === 'true'

      const result = await runGeodisImport({
        prisma,
        buffer: file.buffer,
        filename: file.originalname,
        overrideGuard,
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
