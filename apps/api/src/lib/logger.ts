import pino from 'pino'
import * as Sentry from '@sentry/node'
import { isLocalDevelopment } from './devOnly'

const isDev = isLocalDevelopment()

const pinoOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'id_token',
      'access_token',
      'refresh_token',
      'secret',
      'apiKey',
      'api_key',
      'TOKEN_ENCRYPTION_KEY',
      'SESSION_SECRET',
      'SENTRY_DSN',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    remove: true,
  },
}

export const logger = pino(pinoOptions)

let sentryInitialized = false

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    logger.info('[sentry] SENTRY_DSN not set — Sentry disabled')
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version,
    tracesSampleRate: isDev ? 1.0 : 0.1,
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.authorization
        delete event.request.headers.cookie
      }
      return event
    },
  })

  sentryInitialized = true
  logger.info('[sentry] Sentry initialized')
}

export function captureException(error: Error, context?: Record<string, unknown>): void {
  logger.error({ err: error, ...context }, error.message)

  if (sentryInitialized) {
    Sentry.captureException(error, { extra: context })
  }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  context?: Record<string, unknown>,
): void {
  logger[level === 'warning' ? 'warn' : level]({ ...context }, message)

  if (sentryInitialized) {
    Sentry.captureMessage(message, { level, extra: context })
  }
}
