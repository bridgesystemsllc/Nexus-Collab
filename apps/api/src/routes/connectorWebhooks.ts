// ─── Connector webhook receiver ──────────────────────────────
// Public endpoint for receiving webhooks from external services.
// §5.8: GENERIC_WEBHOOK receiver on /api/v1/webhooks/connectors/{webhookId}
// Follows verify-then-process pattern like billingWebhooks.ts.

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import {
  verifyWebhookSignature,
  generateRequestId,
} from '../lib/connectors/idempotency'
import {
  getDecryptedSecrets,
  parseIntegrationConfig,
} from '../lib/connectors/secrets'
import { runWebhookAutomation } from '../services/automations/runner'

export const connectorWebhookRoutes: ReturnType<typeof Router> = Router()

// §5.8: Lookup integration by webhookId in Integration.config.webhookId
connectorWebhookRoutes.post('/:webhookId', async (req: Request, res: Response) => {
  const { webhookId } = req.params
  const requestId = generateRequestId()

  try {
    // §5.8: Find connector by webhookId in its config
    const connectors = await prisma.integration.findMany({
      where: { type: 'GENERIC_WEBHOOK' },
    })

    let matchingConnector = null
    for (const c of connectors) {
      const config = c.config as Record<string, unknown>
      if (config?.webhookId === webhookId) {
        matchingConnector = c
        break
      }
    }

    if (!matchingConnector) {
      return res.status(404).json({ error: 'Webhook not found' })
    }

    // Check org still exists (§6: ORG_DELETED skip)
    const org = await prisma.organization.findUnique({
      where: { id: matchingConnector.orgId },
    })
    if (!org) {
      return res.status(410).json({
        error: 'Organization deleted',
        received: false,
      })
    }

    // Verify webhook signature if configured
    const parsed = parseIntegrationConfig(matchingConnector.config)
    const secrets = getDecryptedSecrets(matchingConnector.config)
    const webhookSecret = secrets.webhookSecret

    const signatureHeader = parsed.signatureHeader || 'X-Webhook-Signature'
    const signatureAlgorithm =
      (parsed.signatureAlgorithm as 'hmac-sha256' | 'hmac-sha1' | 'none') || 'hmac-sha256'

    if (webhookSecret && signatureAlgorithm !== 'none') {
      const signature = req.headers[signatureHeader.toLowerCase()] as string
      if (!signature) {
        return res.status(401).json({
          error: `Missing signature header: ${signatureHeader}`,
          received: false,
        })
      }

      const rawBody =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
      const valid = verifyWebhookSignature(
        rawBody,
        signature,
        webhookSecret,
        signatureAlgorithm
      )

      if (!valid) {
        return res.status(401).json({
          error: 'Invalid webhook signature',
          received: false,
        })
      }
    }

    // §5.8: Execute via runWebhookAutomation
    const result = await runWebhookAutomation(prisma, webhookId, req.body)

    // §5.8: duplicate returns 200 {duplicate:true, runId}
    if (result.duplicate) {
      return res.json({
        received: true,
        duplicate: true,
        runId: result.runId,
        requestId,
        timestamp: new Date().toISOString(),
      })
    }

    if (result.status === 'SUCCESS' || result.status === 'PARTIAL') {
      return res.json({
        received: true,
        requestId,
        runId: result.runId,
        status: result.status,
        recordsProcessed: result.recordsProcessed,
        timestamp: new Date().toISOString(),
      })
    }

    if (result.status === 'SKIPPED') {
      return res.status(200).json({
        received: true,
        skipped: true,
        reason: result.error?.message,
        requestId,
        timestamp: new Date().toISOString(),
      })
    }

    // FAILED
    return res.status(502).json({
      received: true,
      error: result.error?.message,
      code: result.error?.code,
      requestId,
      runId: result.runId,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[connectorWebhooks] POST /:webhookId error:', error)
    return res.status(500).json({
      error: 'Webhook processing failed',
      requestId,
    })
  }
})
