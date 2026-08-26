import type { Request, Response, NextFunction } from 'express'
import { sendError } from './requirePermission'

// ─── Acting organization ─────────────────────────────────────
// Billing is the one module where a cross-tenant read is a financial event,
// not just a privacy one. So there is exactly one way to learn which org is
// acting, it reads the session-derived member, and it deliberately takes no
// argument a client could influence.
//
// Note what is NOT here: no orgId parameter, no override, no "for support
// purposes" hatch. A support tool that needs to act as another org gets its
// own audited path; it does not get to pass a string into this.

export class NoActingOrgError extends Error {
  constructor(message = 'NO_ACTING_ORG') {
    super(message)
    this.name = 'NoActingOrgError'
  }
}

export function getActingOrgId(req: Request): string {
  const orgId = (req as any).member?.orgId
  if (typeof orgId !== 'string' || orgId.length === 0) throw new NoActingOrgError()
  return orgId
}

/**
 * Turn a NoActingOrgError into the module's 401 rather than a 500.
 *
 * Mount this AFTER the billing router so a helper that throws deep in a
 * handler still produces the standard envelope.
 */
export function billingContextErrors(
  err: unknown, _req: Request, res: Response, next: NextFunction,
): void {
  if (err instanceof NoActingOrgError) {
    sendError(res, 'UNAUTHENTICATED', 'Sign in to continue.')
    return
  }
  next(err)
}
