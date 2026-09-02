// ─── Connector webhook receiver ──────────────────────────────
// Public endpoint for receiving webhooks from external services.
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

connectorWebhookRoutes.post('/:webhookId', async (req: Request, res: Response) => {
  const { webhookId } = req.params
  const requestId = generateRequestId()

  try {
    const automation = await prisma.automation.findFirst({
      where: { webhookId, trigger: 'WEBHOOK' },
      include: { integration: true },
    })

    if (!automation) {
      return res.status(404).json({ error: 'Webhook not found' })
    }

    if (automation.status !== 'ACTIVE') {
      return res.status(400).json({
        error: `Automation is ${automation.status.toLowerCase()}`,
        received: false,
      })
    }

    if (!automation.integration) {
      return res.status(500).json({ error: 'Integration not found' })
    }

    const org = await prisma.organization.findUnique({
      where: { id: automation.orgId },
    })
    if (!org) {
      return res.status(410).json({
        error: 'Organization deleted',
        received: false,
      })
    }

    const parsed = parseIntegrationConfig(automation.integration.config)
    const signatureHeader = parsed.signatureHeader || 'X-Webhook-Signature'
    const signatureAlgorithm =
      (parsed.signatureAlgorithm as 'hmac-sha256' | 'hmac-sha1' | 'none') || 'hmac-sha256'

    if (automation.webhookSecret && signatureAlgorithm !== 'none') {
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
        automation.webhookSecret,
        signatureAlgorithm
      )

      if (!valid) {
        return res.status(401).json({
          error: 'Invalid webhook signature',
          received: false,
        })
      }
    }

    const result = await runWebhookAutomation(prisma, webhookId, req.body)

    if (result.status === 'SUCCESS') {
      return res.json({
        received: true,
        requestId,
        runId: result.runId,
        timestamp: new Date().toISOString(),
      })
    }

    if (result.status === 'SKIPPED') {
      return res.status(200).json({
        received: true,
        skipped: true,
        reason: result.error,
        requestId,
        timestamp: new Date().toISOString(),
      })
    }

    return res.status(502).json({
      received: true,
      error: result.error,
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
