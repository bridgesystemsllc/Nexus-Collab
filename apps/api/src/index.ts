import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import compression from 'compression'
import { createServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import { PrismaClient } from '@prisma/client'
import path from 'path'

import { departmentRoutes } from './routes/departments'
import { taskRoutes } from './routes/tasks'
import { coworkRoutes } from './routes/cowork'
import { documentRoutes } from './routes/documents'
import { everythingRoutes } from './routes/everything'
import { integrationRoutes, webhookRoutes } from './routes/integrations'
import { microsoftGraphRoutes } from './routes/microsoftGraph'
import { aiRoutes } from './routes/ai'
import { pulseRoutes } from './routes/pulse'
import { onboardingRoutes } from './routes/onboarding'
import { briefRoutes } from './routes/briefs'
import { cmRoutes } from './routes/cms'
import { memberRoutes } from './routes/members'
import { emailAgentRoutes } from './routes/emailAgent'
import { productRoutes } from './routes/products'
import { brandTransitionRoutes } from './routes/brandTransition'
import { taskAttachmentRoutes } from './routes/taskAttachments'
import { techTransferStageRoutes } from './routes/techTransferStages'
import { formulationDetailRoutes } from './routes/formulationDetail'
import { formulationsGateRoutes, requireFormulationsUnlock } from './routes/formulationsGate'
import { sharepointRoutes } from './routes/sharepoint'
import { uploadRoutes } from './routes/uploads'
import { authRoutes } from './routes/auth'
import { setupAuth, attachMember } from './auth/session'

export const prisma = new PrismaClient()

const isReplit = !!process.env.REPL_SLUG || !!process.env.REPLIT_DEPLOYMENT
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

const app = express()
const httpServer = createServer(app)

export const io = new SocketServer(httpServer, {
  cors: {
    origin: isReplit ? '*' : frontendUrl,
    methods: ['GET', 'POST'],
  },
})

// ─── Middleware ──────────────────────────────────────────────
// On Replit the public edge is always HTTPS, but the internal Vite-proxy hop
// reaches us over plain HTTP and doesn't forward the original proto. Trust the
// proxy and assert https so express-session will actually emit Secure /
// SameSite=None session cookies — required for the app to stay logged in inside
// the cross-site preview iframe.
if (isReplit) {
  app.set('trust proxy', 1)
  app.use((req, _res, next) => {
    req.headers['x-forwarded-proto'] = 'https'
    next()
  })
}
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginEmbedderPolicy: false,
}))
app.use(cors({ origin: isReplit ? '*' : frontendUrl, credentials: !isReplit }))
app.use(compression())
app.use(morgan('dev'))
app.use(express.json({ limit: '10mb' }))

// ─── Health Check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ─── API Routes ─────────────────────────────────────────────
const api = express.Router()
// Resolve the acting Member (if logged in) for every API request.
api.use(attachMember)
api.use('/auth', authRoutes)
api.use('/departments', departmentRoutes)
api.use('/tasks', taskRoutes)
api.use('/cowork', coworkRoutes)
api.use('/documents', documentRoutes)
api.use('/everything', everythingRoutes)
// Per-user Microsoft Graph routes must be mounted BEFORE the org-level
// integrations router so the specific /microsoft paths take precedence.
api.use('/integrations/microsoft', microsoftGraphRoutes)
api.use('/integrations', integrationRoutes)
api.use('/ai', aiRoutes)
api.use('/pulse', pulseRoutes)
api.use('/onboarding', onboardingRoutes)
api.use('/briefs', briefRoutes)
api.use('/cms', cmRoutes)
api.use('/members', memberRoutes)
api.use('/email-agent', emailAgentRoutes)
api.use('/products', productRoutes)
api.use('/brand-transition', brandTransitionRoutes)
api.use('/tasks', taskAttachmentRoutes)
api.use('/tech-transfer-stages', techTransferStageRoutes)
// Formulations are password-gated per session when FORMULATIONS_PASSWORD_HASH
// is set; the gate routes themselves stay open so the UI can prompt.
api.use('/formulations-gate', formulationsGateRoutes)
api.use('/formulation-detail', requireFormulationsUnlock, formulationDetailRoutes)
api.use('/sharepoint', requireFormulationsUnlock, sharepointRoutes)
api.use('/uploads', uploadRoutes)

// ─── WebSocket ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`)

  socket.on('join_space', (spaceId: string) => {
    socket.join(`space:${spaceId}`)
  })

  socket.on('leave_space', (spaceId: string) => {
    socket.leave(`space:${spaceId}`)
  })

  // Per-user room so we can push personal notifications (e.g. tag Pulses) live.
  socket.on('join_user', (userId: string) => {
    if (userId) socket.join(`user:${userId}`)
  })

  socket.on('leave_user', (userId: string) => {
    if (userId) socket.leave(`user:${userId}`)
  })

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`)
  })
})

// ─── Start ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10)

async function start() {
  // Auth (session + /api/login,/api/logout) must be wired before the API router
  // so the session cookie is available. The Microsoft OAuth callback lives in
  // the /api/v1/integrations/microsoft router and sets req.session.userId.
  await setupAuth(app)

  app.use('/api/v1', api)
  app.use('/api/v1/webhooks', webhookRoutes)

  // ─── Serve Frontend (Replit / Production) ─────────────────
  if (isReplit || process.env.NODE_ENV === 'production') {
    const webDist = path.resolve(__dirname, '../../web/dist')
    app.use(express.static(webDist))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'))
    })
  }

  httpServer.listen(PORT, () => {
    console.log(`\n⚡ NEXUS API running on http://localhost:${PORT}`)
    console.log(`📡 WebSocket ready`)
    console.log(`🔗 API base: http://localhost:${PORT}/api/v1\n`)
  })
}

start().catch((err) => {
  console.error('[NEXUS] Failed to start API:', err)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...')
  await prisma.$disconnect()
  httpServer.close()
  process.exit(0)
})

// Prevent unhandled errors from crashing the process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[NEXUS] Unhandled promise rejection:', reason)
  console.error('[NEXUS] Promise:', promise)
})

process.on('uncaughtException', (error) => {
  console.error('[NEXUS] Uncaught exception:', error)
})
