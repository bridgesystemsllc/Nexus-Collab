import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../index'
import { encrypt, decrypt, encryptJson, decryptJson } from '../lib/encryption'
import {
  generateState,
  validateState,
  exchangeMicrosoftToken,
  exchangeGoogleToken,
} from '../lib/oauth'

export const integrationRoutes: ReturnType<typeof Router> = Router()
export const webhookRoutes: ReturnType<typeof Router> = Router()

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173'

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

    // ── Microsoft OAuth ──────────────────────────────────────
    if (type.startsWith('MICROSOFT_')) {
      const clientId = process.env.MICROSOFT_CLIENT_ID
      const tenantId = process.env.MICROSOFT_TENANT_ID
      const redirectUri = process.env.MICROSOFT_REDIRECT_URI
      const state = generateState('microsoft')
      const scopes =
        'openid profile offline_access Mail.Read Mail.Send Mail.ReadWrite Files.ReadWrite.All ChannelMessage.Send Chat.ReadWrite User.Read'

      const params = new URLSearchParams({
        client_id: clientId || '',
        response_type: 'code',
        redirect_uri: redirectUri || '',
        scope: scopes,
        response_mode: 'query',
        state,
      })

      const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
      return res.json({ authUrl })
    }

    // ── Google OAuth ─────────────────────────────────────────
    if (type.startsWith('GOOGLE_')) {
      const state = generateState('google')

      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
        response_type: 'code',
        scope: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
        ].join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
      })

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
      return res.json({ authUrl })
    }

    // ── Zapier Webhook ───────────────────────────────────────
    if (type === 'ZAPIER') {
      const webhookId = crypto.randomUUID()
      const webhookUrl = `${req.protocol}://${req.get('host')}/api/v1/webhooks/zapier/${webhookId}`
      const encryptedConfig = encryptJson({ webhookId })

      await prisma.integration.updateMany({
        where: { type },
        data: {
          status: 'CONNECTED',
          config: encryptedConfig,
        },
      })

      return res.json({ webhookUrl })
    }

    // ── ERP KarEve Sync ──────────────────────────────────────
    if (type === 'ERP_KAREVE_SYNC') {
      const { apiUrl, apiKey } = req.body

      if (!apiUrl || !apiKey) {
        return res.status(400).json({ error: 'apiUrl and apiKey are required' })
      }

      let testResult: 'success' | 'skipped' = 'skipped'

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        let response = await fetch(`${apiUrl}/ping`, {
          headers: { 'X-API-Key': apiKey },
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (response.ok) {
          testResult = 'success'
        } else {
          // Fallback to /health
          const controller2 = new AbortController()
          const timeout2 = setTimeout(() => controller2.abort(), 5000)

          response = await fetch(`${apiUrl}/health`, {
            headers: { 'X-API-Key': apiKey },
            signal: controller2.signal,
          })

          clearTimeout(timeout2)

          if (response.ok) {
            testResult = 'success'
          }
        }
      } catch {
        // Connection test failed — still allow connection
        testResult = 'skipped'
      }

      const encryptedConfig = encryptJson({ apiUrl, apiKey })

      await prisma.integration.updateMany({
        where: { type },
        data: {
          status: 'CONNECTED',
          config: encryptedConfig,
        },
      })

      return res.json({ connected: true, testResult })
    }

    // ── Default: generic connect ─────────────────────────────
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

// ─── Microsoft OAuth callback ───────────────────────────────
integrationRoutes.get('/microsoft/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    if (!validateState(state, 'microsoft')) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    const tokens = await exchangeMicrosoftToken(code)

    const encryptedTokens = encryptJson({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })

    await prisma.integration.updateMany({
      where: { type: { startsWith: 'MICROSOFT_' } },
      data: {
        status: 'CONNECTED',
        config: encryptedTokens,
        lastSyncAt: new Date(),
      },
    })

    res.redirect(`${FRONTEND_URL()}/integrations?connected=microsoft`)
  } catch (error) {
    console.error('[integrations] Microsoft callback error:', error)
    res.redirect(`${FRONTEND_URL()}/integrations?error=microsoft_auth_failed`)
  }
})

// ─── Google OAuth callback ──────────────────────────────────
integrationRoutes.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string | undefined
    const state = req.query.state as string | undefined

    if (!code || !state) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    if (!validateState(state, 'google')) {
      return res.redirect(`${FRONTEND_URL()}/integrations?error=invalid_state`)
    }

    const tokens = await exchangeGoogleToken(code)

    const encryptedTokens = encryptJson({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })

    await prisma.integration.updateMany({
      where: { type: { in: ['GOOGLE_GMAIL', 'GOOGLE_SHEETS'] } },
      data: {
        status: 'CONNECTED',
        config: encryptedTokens,
        lastSyncAt: new Date(),
      },
    })

    res.redirect(`${FRONTEND_URL()}/integrations?connected=google`)
  } catch (error) {
    console.error('[integrations] Google callback error:', error)
    res.redirect(`${FRONTEND_URL()}/integrations?error=google_auth_failed`)
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

// ─── Zapier Webhook Receiver (separate router) ──────────────
webhookRoutes.post('/zapier/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params

    // Find the Zapier integration whose encrypted config contains this webhookId
    const integrations = await prisma.integration.findMany({
      where: { type: 'ZAPIER', status: 'CONNECTED' },
    })

    let matchedIntegration: typeof integrations[0] | null = null

    for (const integration of integrations) {
      try {
        const config = integration.config as { iv: string; encrypted: string; tag: string }
        if (!config?.iv || !config?.encrypted || !config?.tag) continue
        const decrypted = decryptJson<{ webhookId: string }>(config)
        if (decrypted.webhookId === webhookId) {
          matchedIntegration = integration
          break
        }
      } catch {
        // Decryption failed for this record — skip it
        continue
      }
    }

    if (!matchedIntegration) {
      return res.status(404).json({ error: 'Webhook not found' })
    }

    // Log the incoming webhook
    await prisma.syncLog.create({
      data: {
        integrationId: matchedIntegration.id,
        status: 'COMPLETE',
        completedAt: new Date(),
        recordsProcessed: 1,
      },
    })

    // Update integration stats
    await prisma.integration.update({
      where: { id: matchedIntegration.id },
      data: {
        lastSyncAt: new Date(),
        syncCount: { increment: 1 },
      },
    })

    res.json({ received: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('[webhooks] POST /zapier/:webhookId error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})
