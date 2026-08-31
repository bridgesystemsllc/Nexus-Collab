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
import { financeRoutes } from './routes/finance'
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
import { inventoryImportRoutes } from './routes/inventoryImport'
import { oorRoutes } from './routes/oor'
import { projectRoutes } from './routes/projects'
import { projectTaskRoutes } from './routes/projectTasks'
import { projectTimelineRoutes } from './routes/projectTimeline'
import { projectCheckinRoutes } from './routes/projectCheckins'
import { projectReportRoutes } from './routes/projectReports'
import { collabProjectRoutes, projectCollabRoutes } from './routes/collabProjects'
import { projectAnalyticsRoutes } from './routes/projectAnalytics'
import { taskConversationRoutes } from './routes/taskConversations'
import { rbacRoutes } from './routes/rbac'
import { userRoutes } from './routes/users'
import { auditRoutes } from './routes/audit'
import { billingRoutes } from './routes/billing'
import { meRoutes } from './routes/me'
import { jobRoutes } from './routes/jobs'
import { emailRoutes } from './routes/emails'
import { authRoutes } from './routes/auth'
import { setupAuth, attachMember, isAuthenticated } from './auth/session'
import { isLocalDevelopment } from './lib/devOnly'
import { ensureDepartmentStructure } from './lib/ensureDepartmentStructure'
import { ensureOorModule } from './services/oor/bootstrap'
import { ensureRbacSeeded, ensureEmailsNormalised } from './services/rbac/bootstrap'
import { billingContextErrors } from './middleware/billingContext'
import { ensureOrgTenantBackfill } from './services/rbac/ensureOrgTenant'
import { ensureBillingSeeded } from './services/billing/bootstrap'
import {
  ensureSubscription,
  isSubscriptionConfigured,
} from './services/emailAgent/subscription'

// Re-exported for the route modules that import it from here. The client
// itself lives in lib/prisma so a worker or script can get a database
// connection without booting this server — see the note in that file.
export { prisma } from './lib/prisma'
import { prisma } from './lib/prisma'

const isReplit = !!process.env.REPL_SLUG || !!process.env.REPLIT_DEV_DOMAIN || !!process.env.REPLIT_DEPLOYMENT
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
// Resolve the acting Member (if logged in) for every API request, gated or
// not — the allowlisted routes below still need req.member when a session
// happens to be present (e.g. the Microsoft /me and /connect routes).
api.use(attachMember)

// ─── Public allowlist ──────────────────────────────────────
// Everything in this block is reachable with NO session, on purpose. Each
// entry is a deliberate exception — see the reasoning on its own line — and
// nothing else should be added here without the same kind of justification.
api.use('/auth', authRoutes)
// The Entra OAuth callback (GET /integrations/microsoft/callback) is the
// registered redirect URI — Microsoft hits it with no Nexus session, so the
// whole router must stay open. Its other routes (/me, /connect) each check
// req.member themselves and 401 without a session, so this does not actually
// expose per-user Microsoft data.
api.use('/integrations/microsoft', microsoftGraphRoutes)
// The Formulations password prompt itself. If this were gated, nobody could
// ever unlock the module in the first place. /status and /unlock are the
// only two routes here and neither leaks formulation content.
api.use('/formulations-gate', formulationsGateRoutes)
// Scheduled background jobs, driven by an external cron. Bearer-token auth of
// its own (JOBS_TRIGGER_SECRET) — it must work without a user session, and it
// is not part of the authenticated app surface.
api.use('/jobs', jobRoutes)

// ─── Everything below requires a session ───────────────────
// The API authenticates by default. Anything mounted above this line is a
// deliberate, individually-justified exception; anything mounted below it
// gets a 401 with no session. When adding a new router, put it below this
// line unless it has a documented reason — matching one of the comments
// above — to be public.
api.use(isAuthenticated)

api.use('/departments', departmentRoutes)
api.use('/tasks', taskRoutes)
// Collab ↔ project bridge. Mounted on both bases: /collabs is what the spec
// names, /cowork is what the existing workspace UI already calls. Registered
// before coworkRoutes so /:id/projects/* is not swallowed by /:id.
api.use('/collabs', collabProjectRoutes)
api.use('/cowork', collabProjectRoutes)
api.use('/cowork', coworkRoutes)
api.use('/documents', documentRoutes)
api.use('/everything', everythingRoutes)
// Org-level integrations. The per-user Microsoft routes are mounted in the
// public allowlist above (and before this one, so /microsoft still takes
// precedence over this base's own paths).
api.use('/integrations', integrationRoutes)
api.use('/ai', aiRoutes)
api.use('/pulse', pulseRoutes)
// OnboardingGuard (the only consumer of /onboarding/status) renders inside
// AuthGate, so it is only ever called with a session already established —
// gating it costs nothing and stops it leaking an org id to anonymous callers.
api.use('/onboarding', onboardingRoutes)
api.use('/briefs', briefRoutes)
api.use('/cms', cmRoutes)
api.use('/finance', financeRoutes)
api.use('/members', memberRoutes)
api.use('/email-agent', emailAgentRoutes)
api.use('/products', productRoutes)
api.use('/brand-transition', brandTransitionRoutes)
api.use('/tasks', taskAttachmentRoutes)
api.use('/tech-transfer-stages', techTransferStageRoutes)
// The gate-unlock routes themselves live in the public allowlist above; a
// session is required to even reach the unlock check for these two.
api.use('/formulation-detail', requireFormulationsUnlock, formulationDetailRoutes)
api.use('/sharepoint', requireFormulationsUnlock, sharepointRoutes)
api.use('/uploads', uploadRoutes)
// Supplier inventory feeds (Geodis 3PL stock imports).
api.use('/inventory-import', inventoryImportRoutes)
api.use('/operations/oor', oorRoutes)
// Projects & Initiatives. The task router mounts on the same base so its
// /tasks/* paths sit alongside /projects/:id/*; it is registered first because
// its specific paths (/tasks/my, /tasks/bulk) must win over /:id.
// Email and Teams conversations attached to a task. Mounted under /projects
// so it shares the module's base; its own paths all start /tasks/.
// Roles and permissions. Its own base — this is workspace authority, not a
// projects concern.
api.use('/rbac', rbacRoutes)
// User management. `/users` is the new admin directory; the older
// `/members` routes are left alone for the screens that still use them.
api.use('/users', userRoutes)
// Self-service settings. Separate from /users on purpose: nothing mounted here
// can change authority, and keeping them apart makes that checkable.
api.use('/me', meRoutes)
api.use('/audit', auditRoutes)
api.use('/billing', billingRoutes)
// Turns a getActingOrgId() throw (no session-derived org) into the module's
// 401 envelope instead of Express's default 500. Must be mounted immediately
// after billingRoutes — an Express error handler only catches errors from
// routers registered before it.
api.use(billingContextErrors)
api.use('/projects/tasks', taskConversationRoutes)
api.use('/projects', projectAnalyticsRoutes)
api.use('/projects', projectCollabRoutes)
api.use('/projects', projectTaskRoutes)
api.use('/projects', projectReportRoutes)
api.use('/projects', projectCheckinRoutes)
api.use('/projects', projectTimelineRoutes)
api.use('/projects', projectRoutes)
// Internal team production-update emails (any authenticated member).
api.use('/emails', emailRoutes)

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
  // A deployment with no encryption key would otherwise discover that the
  // first time someone connects Outlook — at which point encryption.ts's
  // getKey() falls back to a key published in this repository and silently
  // encrypts Microsoft OAuth tokens and ERP credentials with it. Refuse to
  // start instead. Local development is unaffected: isLocalDevelopment() is
  // true there, so this check is skipped.
  if (!isLocalDevelopment() && !process.env.TOKEN_ENCRYPTION_KEY) {
    console.error(
      '[NEXUS] TOKEN_ENCRYPTION_KEY environment variable is required outside local development. Refusing to start.',
    )
    process.exit(1)
  }

  // Self-heal the department structure (Finance hub + retired stubs) on boot so
  // a deployed instance reflects the latest structure without a manual migration.
  await ensureDepartmentStructure(prisma)
  await ensureOorModule(prisma)

  // Same reasoning, higher stakes: every permission check fails closed, so a
  // workspace with no permission catalogue is one where nobody can open the
  // People directory or Settings' admin sections. Does nothing once seeded.
  await ensureRbacSeeded(prisma)

  // The tier catalogue and the seat invariant. Same reasoning as the RBAC
  // bootstrap: db push cannot create a constraint trigger, and a seed script
  // somebody has to remember to run is one that did not run in production.
  await ensureBillingSeeded(prisma)

  // Case-insensitive email uniqueness has no database-level enforcement —
  // Prisma 5 cannot express a functional unique index — so it depends on every
  // row being stored lowercased. This converges the ones written before that
  // rule, and refuses rather than guessing when two rows would collide.
  await ensureEmailsNormalised(prisma)

  // Sign-in keys on Organization.entraTenantId as of the tenancy change. The
  // founding workspace predates the column, so claim it once, and refuse
  // rather than guess if the answer is not unambiguous.
  await ensureOrgTenantBackfill(prisma)

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

    // An unmatched /api path is a 404, not the SPA shell. Without this the
    // catch-all below answers every mistyped or removed endpoint with
    // index.html and a 200 — so a broken frontend call looks like it worked
    // until `.json()` chokes on HTML, and monitoring records a healthy 200.
    // Only shows up in production, because the catch-all only exists there.
    app.use('/api', (_req, res) => {
      res.status(404).json({ error: { code: 'NotFound', message: 'No such endpoint' } })
    })

    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'))
    })
  }

  httpServer.listen(PORT, () => {
    console.log(`\n⚡ NEXUS API running on http://localhost:${PORT}`)
    console.log(`📡 WebSocket ready`)
    console.log(`🔗 API base: http://localhost:${PORT}/api/v1\n`)
  })

  // Establish the Graph mail subscription that drives the email agent and the
  // supplier inventory feeds. Microsoft expires these after ~3 days silently,
  // so boot-time ensure plus the worker's 12h renewal are what keep inbound
  // mail alive. No-ops when Graph is unconfigured (i.e. local development),
  // and never blocks startup — a Graph outage must not stop the API booting.
  if (isSubscriptionConfigured()) {
    ensureSubscription()
      .then((state) => {
        if (state.action === 'failed') {
          console.error(`[EmailAgent] Graph subscription failed: ${state.reason}`)
        } else {
          console.log(
            `[EmailAgent] Graph subscription ${state.action}` +
              (state.expiresAt ? ` — expires ${state.expiresAt}` : ''),
          )
        }
      })
      .catch((err) => console.error('[EmailAgent] Graph subscription error:', err?.message))
  }
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
