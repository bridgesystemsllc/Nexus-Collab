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
import { aiRoutes } from './routes/ai'
import { pulseRoutes } from './routes/pulse'
import { onboardingRoutes } from './routes/onboarding'
import { briefRoutes } from './routes/briefs'
import { memberRoutes } from './routes/members'
import { emailAgentRoutes } from './routes/emailAgent'
import { productRoutes } from './routes/products'
import { brandTransitionRoutes } from './routes/brandTransition'
import { taskAttachmentRoutes } from './routes/taskAttachments'
import { techTransferStageRoutes } from './routes/techTransferStages'
import { formulationDetailRoutes } from './routes/formulationDetail'

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
api.use('/departments', departmentRoutes)
api.use('/tasks', taskRoutes)
api.use('/cowork', coworkRoutes)
api.use('/documents', documentRoutes)
api.use('/everything', everythingRoutes)
api.use('/integrations', integrationRoutes)
api.use('/ai', aiRoutes)
api.use('/pulse', pulseRoutes)
api.use('/onboarding', onboardingRoutes)
api.use('/briefs', briefRoutes)
api.use('/members', memberRoutes)
api.use('/email-agent', emailAgentRoutes)
api.use('/products', productRoutes)
api.use('/brand-transition', brandTransitionRoutes)
api.use('/tasks', taskAttachmentRoutes)
api.use('/tech-transfer-stages', techTransferStageRoutes)
api.use('/formulation-detail', formulationDetailRoutes)

app.use('/api/v1', api)
app.use('/api/v1/webhooks', webhookRoutes)

// ─── Serve Frontend (Replit / Production) ───────────────────
if (isReplit || process.env.NODE_ENV === 'production') {
  const webDist = path.resolve(__dirname, '../../web/dist')
  app.use(express.static(webDist))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

// ─── WebSocket ──────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`)

  socket.on('join_space', (spaceId: string) => {
    socket.join(`space:${spaceId}`)
  })

  socket.on('leave_space', (spaceId: string) => {
    socket.leave(`space:${spaceId}`)
  })

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`)
  })
})

// ─── Start ──────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10)

httpServer.listen(PORT, () => {
  console.log(`\n⚡ NEXUS API running on http://localhost:${PORT}`)
  console.log(`📡 WebSocket ready`)
  console.log(`🔗 API base: http://localhost:${PORT}/api/v1\n`)
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
