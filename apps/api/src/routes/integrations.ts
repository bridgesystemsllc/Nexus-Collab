import { Router, Request, Response } from 'express'
import { prisma } from '../index'

export const integrationRoutes: ReturnType<typeof Router> = Router()

// ─── List all integrations ──────────────────────────────────
integrationRoutes.get('/', async (_req: Request, res: Response) => {
  try {
    const integrations = await prisma.integration.findMany({
      orderBy: { createdAt: 'asc' },
    })
    res.json(integrations)
  } catch (error) {
    console.error('[integrations] GET / error:', error)
    res.status(500).json({ error: 'Failed to fetch integrations' })
  }
})

// ─── Connect integration ────────────────────────────────────
integrationRoutes.post('/:type/connect', async (req: Request, res: Response) => {
  try {
    const type = req.params.type as string

    // For Microsoft integrations, return OAuth URL
    if (type.startsWith('MICROSOFT_')) {
      const clientId = process.env.MICROSOFT_CLIENT_ID
      const tenantId = process.env.MICROSOFT_TENANT_ID
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI
      const scopes = 'Mail.Read Mail.Send Mail.ReadWrite Files.ReadWrite.All ChannelMessage.Send User.Read'

      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}&response_mode=query`

      return res.json({ authUrl })
    }

    // For other integrations, update status
    const integration = await prisma.integration.updateMany({
      where: { type },
      data: { status: 'CONNECTED', config: req.body.config || {} },
    })
    res.json({ success: true, integration })
  } catch (error) {
    console.error('[integrations] POST /:type/connect error:', error)
    res.status(500).json({ error: 'Failed to connect integration' })
  }
})

// ─── Disconnect integration ─────────────────────────────────
integrationRoutes.post('/:type/disconnect', async (req: Request, res: Response) => {
  try {
    await prisma.integration.updateMany({
      where: { type: req.params.type as string },
      data: { status: 'DISCONNECTED', config: {} },
    })
    res.json({ success: true })
  } catch (error) {
    console.error('[integrations] POST /:type/disconnect error:', error)
    res.status(500).json({ error: 'Failed to disconnect integration' })
  }
})

// ─── Manual sync trigger ────────────────────────────────────
integrationRoutes.post('/:type/sync', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    // Create sync log
    const syncLog = await prisma.syncLog.create({
      data: {
        integrationId: integration.id,
        status: 'RUNNING',
      },
    })

    // Update integration status
    await prisma.integration.update({
      where: { id: integration.id },
      data: { status: 'SYNCING' },
    })

    // Simulate sync completion (in production, this triggers the actual adapter)
    setTimeout(async () => {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: { status: 'COMPLETE', completedAt: new Date(), recordsProcessed: Math.floor(Math.random() * 100) },
      })
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: 'CONNECTED',
          lastSyncAt: new Date(),
          syncCount: { increment: 1 },
        },
      })
    }, 2000)

    res.json({ success: true, syncLogId: syncLog.id })
  } catch (error) {
    console.error('[integrations] POST /:type/sync error:', error)
    res.status(500).json({ error: 'Failed to trigger sync' })
  }
})

// ─── Get sync status ────────────────────────────────────────
integrationRoutes.get('/:type/status', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })
    res.json({ status: integration.status, lastSyncAt: integration.lastSyncAt, syncCount: integration.syncCount })
  } catch (error) {
    console.error('[integrations] GET /:type/status error:', error)
    res.status(500).json({ error: 'Failed to get integration status' })
  }
})

// ─── Get sync logs ──────────────────────────────────────────
integrationRoutes.get('/:type/logs', async (req: Request, res: Response) => {
  try {
    const integration = await prisma.integration.findFirst({ where: { type: req.params.type as string } })
    if (!integration) return res.status(404).json({ error: 'Integration not found' })

    const logs = await prisma.syncLog.findMany({
      where: { integrationId: integration.id },
      orderBy: { startedAt: 'desc' },
      take: 20,
    })
    res.json(logs)
  } catch (error) {
    console.error('[integrations] GET /:type/logs error:', error)
    res.status(500).json({ error: 'Failed to fetch sync logs' })
  }
})

// ─── Microsoft OAuth callback ───────────────────────────────
integrationRoutes.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query
    if (!code) return res.status(400).json({ error: 'Authorization code required' })

    // Exchange code for token (in production, use MSAL)
    // For now, mark integrations as connected
    await prisma.integration.updateMany({
      where: { type: { startsWith: 'MICROSOFT_' } },
      data: { status: 'CONNECTED' },
    })

    // Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations?connected=microsoft`)
  } catch (error) {
    console.error('[integrations] Microsoft callback error:', error)
    res.status(500).json({ error: 'OAuth callback failed' })
  }
})
