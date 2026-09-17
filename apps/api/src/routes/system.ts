import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { logger } from '../lib/logger'
import { requirePermission, type RbacRequest } from '../middleware/requirePermission'

export const systemRoutes: ReturnType<typeof Router> = Router()

interface ReadinessCheck {
  database: boolean
  session: boolean
  tokenEncryption: boolean
  sentry: boolean
  microsoftGraph: boolean
  stripe: boolean
  storage: boolean
}

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

function checkSession(): boolean {
  return !!process.env.SESSION_SECRET
}

function checkTokenEncryption(): boolean {
  return !!process.env.TOKEN_ENCRYPTION_KEY
}

function checkSentry(): boolean {
  return !!process.env.SENTRY_DSN
}

function checkMicrosoftGraph(): boolean {
  return !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  )
}

function checkStripe(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

function checkStorage(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY &&
    process.env.S3_BUCKET_NAME
  )
}

systemRoutes.get(
  '/readiness',
  requirePermission('roles:read'),
  async (req: RbacRequest, res: Response) => {
    try {
      const checks: ReadinessCheck = {
        database: await checkDatabase(),
        session: checkSession(),
        tokenEncryption: checkTokenEncryption(),
        sentry: checkSentry(),
        microsoftGraph: checkMicrosoftGraph(),
        stripe: checkStripe(),
        storage: checkStorage(),
      }

      const allReady = checks.database && checks.session && checks.tokenEncryption

      logger.info({ checks, allReady }, 'System readiness check')

      return res.json({
        data: {
          ready: allReady,
          checks,
          version: process.env.npm_package_version || '0.1.0',
          time: new Date().toISOString(),
        },
      })
    } catch (err) {
      logger.error({ err }, 'System readiness check failed')
      return res.status(500).json({
        error: { code: 'INTERNAL', message: 'Readiness check failed' },
      })
    }
  },
)
