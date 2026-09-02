// ─── Automations API routes ──────────────────────────────────
// All routes are org-scoped via getActingOrgId. Mutating operations
// require ADMIN or OPS_MANAGER role. §5.2 compliant.

import { Router, Request, Response } from 'express'
import { prisma } from '../index'
import { getActingOrgId, NoActingOrgError } from '../middleware/billingContext'
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  pauseAutomation,
  resumeAutomation,
  activateAutomation,
  listAutomationRuns,
  getAutomationRun,
  getConnectorWebhookUrl,
} from '../services/automations/automationService'
import { executeAutomationNow } from '../services/automations/runner'

export const automationRoutes: ReturnType<typeof Router> = Router()

function requirePrivileged(req: Request, res: Response): boolean {
  const member = (req as any).member as { role?: string } | undefined
  const role = member?.role
  if (role !== 'ADMIN' && role !== 'OPS_MANAGER') {
    res.status(403).json({ error: 'Forbidden: requires ADMIN or OPS_MANAGER' })
    return false
  }
  return true
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof NoActingOrgError) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const svcError = error as { code: string; message: string; status: number }
    res.status(svcError.status).json({ error: svcError.message, code: svcError.code })
    return
  }
  console.error('[automations] error:', error)
  res.status(500).json({ error: 'Internal server error' })
}

// GET / - List automations (optionally filtered by connectorId)
automationRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const connectorId = req.query.connectorId as string | undefined
    const automations = await listAutomations(prisma, orgId, connectorId)
    res.json(automations)
  } catch (error) {
    handleError(res, error)
  }
})

// GET /:id - Get single automation
automationRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const automation = await getAutomation(prisma, orgId, req.params.id)
    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

// POST / - Create automation (saves as DRAFT)
// §5.2: triggerType + triggerConfig, actionType + actionConfig
automationRoutes.post('/', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const {
      connectorId,
      name,
      description,
      triggerType,
      triggerConfig,
      actionType,
      actionConfig,
      retryPolicy,
    } = req.body

    if (!connectorId || !name || !triggerType) {
      return res.status(400).json({
        error: 'connectorId, name, and triggerType are required',
      })
    }

    if (!['SCHEDULE', 'WEBHOOK', 'MANUAL'].includes(triggerType)) {
      return res.status(400).json({
        error: 'triggerType must be SCHEDULE, WEBHOOK, or MANUAL',
      })
    }

    if (triggerType === 'SCHEDULE' && !triggerConfig?.everyMinutes) {
      return res.status(400).json({
        error: 'triggerConfig.everyMinutes is required for SCHEDULE trigger',
      })
    }

    const automation = await createAutomation(prisma, orgId, {
      connectorId,
      name,
      description,
      triggerType,
      triggerConfig,
      actionType,
      actionConfig,
      retryPolicy,
    })

    // For WEBHOOK triggers, include the webhook URL
    let webhookUrl: string | null = null
    if (triggerType === 'WEBHOOK') {
      const baseUrl = `${req.protocol}://${req.get('host')}`
      webhookUrl = await getConnectorWebhookUrl(prisma, orgId, connectorId, baseUrl)
    }

    res.status(201).json({ ...automation, webhookUrl })
  } catch (error) {
    handleError(res, error)
  }
})

// PATCH /:id - Update automation
automationRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const { name, description, triggerConfig, actionConfig, retryPolicy, status } = req.body

    const automation = await updateAutomation(prisma, orgId, req.params.id, {
      name,
      description,
      triggerConfig,
      actionConfig,
      retryPolicy,
      status,
    })

    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

// DELETE /:id - Delete automation
automationRoutes.delete('/:id', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    await deleteAutomation(prisma, orgId, req.params.id)
    res.status(204).send()
  } catch (error) {
    handleError(res, error)
  }
})

// POST /:id/pause - Pause automation
automationRoutes.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const automation = await pauseAutomation(prisma, orgId, req.params.id)
    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

// POST /:id/resume - Resume automation
automationRoutes.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const automation = await resumeAutomation(prisma, orgId, req.params.id)
    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

// POST /:id/activate - Activate a DRAFT automation
automationRoutes.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const automation = await activateAutomation(prisma, orgId, req.params.id)
    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

// POST /:id/run - Execute automation immediately
automationRoutes.post('/:id/run', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)

    // Get the automation and its connector
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, orgId },
      include: { connector: true },
    })

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found', code: 'NOT_FOUND' })
    }

    if (!automation.connector) {
      return res.status(400).json({ error: 'Connector not found', code: 'CONNECTOR_NOT_FOUND' })
    }

    // Execute immediately via the executor
    const result = await executeAutomationNow(prisma, automation, automation.connector)
    res.json(result)
  } catch (error) {
    handleError(res, error)
  }
})

// GET /:id/runs - List automation runs
automationRoutes.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const runs = await listAutomationRuns(prisma, orgId, req.params.id, limit)
    res.json(runs)
  } catch (error) {
    handleError(res, error)
  }
})

// GET /:id/runs/:runId - Get single automation run
automationRoutes.get('/:id/runs/:runId', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const run = await getAutomationRun(prisma, orgId, req.params.runId)
    res.json(run)
  } catch (error) {
    handleError(res, error)
  }
})
