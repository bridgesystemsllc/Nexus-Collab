import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import crypto from 'crypto'

// ─── Formulations password gate ──────────────────────────────
// The R&D Formulations module can be locked behind a shared password. The
// password itself is NEVER stored — only its sha256 hex digest, supplied via
// the FORMULATIONS_PASSWORD_HASH env var. Unlocking is session-scoped: a new
// session (new browser, expired cookie) re-prompts.

function getGateHash(): Buffer | null {
  const raw = process.env.FORMULATIONS_PASSWORD_HASH?.trim().toLowerCase()
  if (!raw) return null
  // sha256 hex is exactly 64 hex chars; anything else is a misconfiguration.
  if (!/^[0-9a-f]{64}$/.test(raw)) return null
  return Buffer.from(raw, 'hex')
}

// Boot-time visibility: make it obvious when the gate is not enforcing.
if (!process.env.FORMULATIONS_PASSWORD_HASH?.trim()) {
  console.warn('[formulations-gate] FORMULATIONS_PASSWORD_HASH is not set — the Formulations password gate is DISABLED.')
} else if (!getGateHash()) {
  console.warn('[formulations-gate] FORMULATIONS_PASSWORD_HASH is set but is not a valid sha256 hex digest — the gate is DISABLED. Generate one with: node -e "console.log(require(\'crypto\').createHash(\'sha256\').update(\'yourpassword\').digest(\'hex\'))"')
}

export const formulationsGateRoutes: ReturnType<typeof Router> = Router()

// ─── GET /status ─────────────────────────────────────────────
// locked  → the gate is enabled (a valid hash is configured)
// unlocked → this session has already provided the correct password
formulationsGateRoutes.get('/status', (req: Request, res: Response) => {
  const enabled = !!getGateHash()
  res.json({
    locked: enabled,
    unlocked: (req.session as any)?.formulationsUnlocked === true,
  })
})

// ─── POST /unlock ────────────────────────────────────────────
const unlockSchema = z.object({ password: z.string().min(1) })

formulationsGateRoutes.post('/unlock', (req: Request, res: Response) => {
  const expected = getGateHash()
  if (!expected) {
    // Gate disabled — nothing to unlock.
    return res.json({ unlocked: true })
  }

  const parsed = unlockSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'password is required' })
  }

  // Constant-time comparison of digests; the plaintext is hashed immediately
  // and never logged or persisted.
  const candidate = crypto.createHash('sha256').update(parsed.data.password).digest()
  const ok = candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
  if (!ok) {
    return res.status(401).json({ error: 'invalid_password' })
  }

  ;(req.session as any).formulationsUnlocked = true
  req.session.save((err) => {
    if (err) {
      console.error('[formulations-gate] failed to persist unlock:', err)
      return res.status(500).json({ error: 'session_persist_failed' })
    }
    res.json({ unlocked: true })
  })
})

// ─── Middleware: require an unlocked session ─────────────────
// No-op while the gate is disabled. Applied to formulation-detail and
// sharepoint routes so locked sessions cannot read gated data via the API.
export function requireFormulationsUnlock(req: Request, res: Response, next: NextFunction) {
  if (!getGateHash()) return next()
  if ((req.session as any)?.formulationsUnlocked === true) return next()
  return res.status(403).json({ error: 'formulations_locked' })
}
