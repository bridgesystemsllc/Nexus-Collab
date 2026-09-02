// ─── Automations API routes ──────────────────────────────────
// All routes are org-scoped via getActingOrgId. Mutating operations
// require ADMIN or OPS_MANAGER role.

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
  triggerAutomation,
  listAutomationRuns,
  getAutomationRun,
  getAutomationWebhookUrl,
} from '../services/automations/automationService'

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

automationRoutes.get('/', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const integrationId = req.query.integrationId as string | undefined
    const automations = await listAutomations(prisma, orgId, integrationId)
    res.json(automations)
  } catch (error) {
    handleError(res, error)
  }
})

automationRoutes.get('/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const automation = await getAutomation(prisma, orgId, req.params.id)
    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

automationRoutes.post('/', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const { integrationId, name, description, trigger, schedule, config, retryPolicy } = req.body

    if (!integrationId || !name || !trigger) {
      return res.status(400).json({
        error: 'integrationId, name, and trigger are required',
      })
    }

    if (!['SCHEDULE', 'WEBHOOK', 'MANUAL'].includes(trigger)) {
      return res.status(400).json({
        error: 'trigger must be SCHEDULE, WEBHOOK, or MANUAL',
      })
    }

    if (trigger === 'SCHEDULE' && !schedule) {
      return res.status(400).json({
        error: 'schedule is required for SCHEDULE trigger',
      })
    }

    const automation = await createAutomation(prisma, orgId, {
      integrationId,
      name,
      description,
      trigger,
      schedule,
      config,
      retryPolicy,
    })

    let webhookUrl: string | null = null
    if (trigger === 'WEBHOOK') {
      const baseUrl = `${req.protocol}://${req.get('host')}`
      webhookUrl = await getAutomationWebhookUrl(prisma, orgId, automation.id, baseUrl)
    }

    res.status(201).json({ ...automation, webhookUrl })
  } catch (error) {
    handleError(res, error)
  }
})

automationRoutes.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const { name, description, schedule, config, retryPolicy, status } = req.body

    const automation = await updateAutomation(prisma, orgId, req.params.id, {
      name,
      description,
      schedule,
      config,
      retryPolicy,
      status,
    })

    res.json(automation)
  } catch (error) {
    handleError(res, error)
  }
})

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

automationRoutes.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    if (!requirePrivileged(req, res)) return
    const orgId = getActingOrgId(req)
    const result = await triggerAutomation(prisma, orgId, req.params.id)
    res.json(result)
  } catch (error) {
    handleError(res, error)
  }
})

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

automationRoutes.get('/:id/runs/:runId', async (req: Request, res: Response) => {
  try {
    const orgId = getActingOrgId(req)
    const run = await getAutomationRun(prisma, orgId, req.params.runId)
    res.json(run)
  } catch (error) {
    handleError(res, error)
  }
})
