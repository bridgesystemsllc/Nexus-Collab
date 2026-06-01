import * as client from 'openid-client'
import { Strategy, type VerifyFunction } from 'openid-client/passport'
import passport from 'passport'
import session from 'express-session'
import type { Express, RequestHandler, Request, Response, NextFunction } from 'express'
import memoize from 'memoizee'
import connectPg from 'connect-pg-simple'
import { prisma } from '../index'

if (!process.env.REPLIT_DOMAINS) {
  console.warn('[auth] REPLIT_DOMAINS not set — Replit Auth login flow will not work')
}

const isProd = !!process.env.REPLIT_DEPLOYMENT

// ─── OIDC discovery (cached) ────────────────────────────────
const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL || 'https://replit.com/oidc'),
      process.env.REPL_ID!,
    )
  },
  { maxAge: 3600 * 1000 },
)

// ─── PostgreSQL-backed session store ────────────────────────
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000 // 1 week
  const pgStore = connectPg(session)
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
  })
  return session({
    secret: process.env.SESSION_SECRET || 'nexus-dev-session-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Internal dev traffic reaches the API over http (via the Vite proxy),
      // so only require Secure cookies in a real deployment behind TLS.
      secure: isProd,
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  })
}

function updateUserSession(user: any, tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers) {
  user.claims = tokens.claims()
  user.access_token = tokens.access_token
  user.refresh_token = tokens.refresh_token
  user.expires_at = user.claims?.exp
}

// ─── Map an authenticated Replit identity to a NEXUS Member ──
// Links by the stable Replit user id (stored in Member.clerkUserId).
// Falls back to adopting an existing member that shares the email
// (e.g. someone who was invited before they ever logged in).
async function upsertMember(claims: any) {
  const sub: string | undefined = claims?.sub
  if (!sub) return

  const email: string = claims.email || `${sub}@replit.user`
  const first: string = claims.first_name || ''
  const last: string = claims.last_name || ''
  const name = [first, last].filter(Boolean).join(' ') || claims.email || 'Replit User'

  const existingBySub = await prisma.member.findUnique({ where: { clerkUserId: sub } }).catch(() => null)
  if (existingBySub) return

  const existingByEmail = await prisma.member.findUnique({ where: { email } }).catch(() => null)
  if (existingByEmail) {
    // Adopt the placeholder/invited member record under the real identity.
    await prisma.member.update({ where: { id: existingByEmail.id }, data: { clerkUserId: sub } })
    return
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!org) return // No workspace yet — onboarding must run first.

  const initials = name
    .split(/\s+/)
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  await prisma.member.create({
    data: { clerkUserId: sub, email, name, avatar: initials || null, role: 'MEMBER', orgId: org.id },
  })
}

// Pick the OIDC strategy for the public domain. The Vite dev proxy rewrites
// Host to localhost, so fall back to the first configured Replit domain.
function pickDomain(req: Request) {
  const domains = (process.env.REPLIT_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean)
  const match = domains.find((d) => d === req.hostname)
  return match || domains[0]
}

export async function setupAuth(app: Express) {
  app.set('trust proxy', 1)
  app.use(getSession())
  app.use(passport.initialize())
  app.use(passport.session())

  const config = await getOidcConfig()

  const verify: VerifyFunction = async (tokens: any, verified: any) => {
    const user: any = {}
    updateUserSession(user, tokens)
    try {
      await upsertMember(tokens.claims())
    } catch (err) {
      console.error('[auth] upsertMember failed:', err)
    }
    verified(null, user)
  }

  const domains = (process.env.REPLIT_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean)
  for (const domain of domains) {
    passport.use(
      new Strategy(
        {
          name: `replitauth:${domain}`,
          config,
          scope: 'openid email profile offline_access',
          callbackURL: `https://${domain}/api/callback`,
        },
        verify,
      ),
    )
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user))
  passport.deserializeUser((user: Express.User, cb) => cb(null, user))

  app.get('/api/login', (req, res, next) => {
    passport.authenticate(`replitauth:${pickDomain(req)}`, {
      prompt: 'login consent',
      scope: ['openid', 'email', 'profile', 'offline_access'],
    })(req, res, next)
  })

  app.get('/api/callback', (req, res, next) => {
    passport.authenticate(`replitauth:${pickDomain(req)}`, {
      successReturnToOrRedirect: '/',
      failureRedirect: '/api/login',
    })(req, res, next)
  })

  app.get('/api/logout', (req, res) => {
    const domain = pickDomain(req)
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `https://${domain}`,
        }).href,
      )
    })
  })
}

// ─── Require a valid (and unexpired) session, refreshing if needed ──
export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any
  if (!req.isAuthenticated?.() || !user?.expires_at) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (now <= user.expires_at) return next()

  const refreshToken = user.refresh_token
  if (!refreshToken) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const config = await getOidcConfig()
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken)
    updateUserSession(user, tokenResponse)
    return next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}

// ─── Attach the acting Member (if logged in) to every request ──
// Non-blocking: routes that require attribution check `req.member`.
export async function attachMember(req: Request, _res: Response, next: NextFunction) {
  try {
    const sub = (req.user as any)?.claims?.sub
    if (req.isAuthenticated?.() && sub) {
      const member = await prisma.member.findUnique({
        where: { clerkUserId: sub },
        include: { department: { select: { id: true, name: true } } },
      })
      if (member) (req as any).member = member
    }
  } catch (err) {
    console.error('[auth] attachMember failed:', err)
  }
  next()
}
