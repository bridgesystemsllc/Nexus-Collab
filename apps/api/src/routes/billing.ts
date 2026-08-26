import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { isAuthenticated } from '../auth/session'
import { requirePermission, sendError } from '../middleware/requirePermission'
import { getActingOrgId } from '../middleware/billingContext'
import { resolveEntitlements } from '../services/billing/entitlements'

// ─── Billing ─────────────────────────────────────────────────
// Phase 1 ships one route. The remaining seventeen arrive in PR B8, on this
// same router and with these same guards.
//
// Note what every handler does first and identically: getActingOrgId(req).
// There is no route in this module where a client names its own organization.

export const billingRoutes: ReturnType<typeof Router> = Router()

billingRoutes.use(isAuthenticated)

/**
 * The resolved entitlements for the acting organization.
 *
 * The frontend uses this to RENDER — to show the right tier, grey out the
 * right buttons, put up the right banner. It decides nothing: every gated
 * endpoint re-resolves server-side through requireFeature/requireWriteAccess,
 * so turning a flag off in devtools grants exactly nothing.
 */
billingRoutes.get('/entitlements', requirePermission('billing:read'), async (req, res) => {
  try {
    const entitlements = await resolveEntitlements(prisma, getActingOrgId(req))
    res.json(entitlements)
  } catch (err) {
    console.error('[billing] GET /entitlements failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})
