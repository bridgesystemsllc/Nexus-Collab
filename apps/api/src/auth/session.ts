import session from 'express-session'
import connectPg from 'connect-pg-simple'
import type { Express, RequestHandler, Request, Response, NextFunction } from 'express'
import { prisma } from '../index'
import {
  isMicrosoftConfigured,
  getRedirectUri,
  buildAuthUrl,
  createStateNonce,
  type MsProfile,
} from '../lib/microsoftGraph'

// True for both the Replit dev preview and a real deployment — in both the
// public edge is HTTPS and the app is embedded as a cross-site iframe.
const onReplit = !!(process.env.REPL_SLUG || process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DEPLOYMENT)

// Sessions are the only thing standing between an attacker and a forged login,
// so a real secret is mandatory — never silently fall back to a known value.
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET is required. Set it as a secret before starting the server.')
  }
  return secret
}

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
    secret: getSessionSecret(),
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // The Replit preview embeds the app as a cross-site iframe; browsers only
      // send cookies into that context when they are SameSite=None + Secure.
      // index.ts shims x-forwarded-proto=https on Replit so this Secure cookie
      // is actually issued over the (always-https) public edge.
      secure: onReplit,
      sameSite: (onReplit ? 'none' : 'lax') as 'none' | 'lax',
      maxAge: sessionTtl,
    },
  })
}

// ─── Map an authenticated Microsoft identity to a NEXUS Member ──
// Links by the stable Entra object id (stored in Member.clerkUserId). Falls
// back to adopting an existing member that shares the email (e.g. someone who
// was invited before they ever logged in), otherwise creates a fresh member.
export async function upsertMemberFromMicrosoft(profile: MsProfile) {
  const sub = profile.id
  if (!sub) throw new Error('Microsoft profile missing id')

  const email = profile.mail || profile.userPrincipalName || `${sub}@microsoft.user`
  const name = profile.displayName || email || 'Microsoft User'

  const bySub = await prisma.member.findUnique({ where: { clerkUserId: sub } }).catch(() => null)
  if (bySub) return bySub

  const byEmail = await prisma.member.findUnique({ where: { email } }).catch(() => null)
  if (byEmail) {
    // Adopt the placeholder/invited member record under the real identity.
    return prisma.member.update({ where: { id: byEmail.id }, data: { clerkUserId: sub } })
  }

  const org = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!org) throw new Error('NO_ORGANIZATION')

  const initials = name
    .split(/\s+/)
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return prisma.member.create({
    data: { clerkUserId: sub, email, name, avatar: initials || null, role: 'MEMBER', orgId: org.id },
  })
}

// ─── Session wiring + login/logout routes ───────────────────
// Identity is established by signing in with Microsoft (Entra). The OAuth
// callback itself lives in routes/microsoftGraph.ts (it is the registered Entra
// redirect URI and is shared with the per-user "connect" flow); on a successful
// login it sets req.session.userId. These routes only kick off and tear down
// the session.
export async function setupAuth(app: Express) {
  app.set('trust proxy', 1)
  app.use(getSession())

  app.get('/api/login', (req: Request, res: Response) => {
    if (!isMicrosoftConfigured()) {
      return res.redirect('/?ms=error&reason=not_configured')
    }
    if (!req.session) {
      return res.status(500).json({ error: 'Session unavailable' })
    }
    const nonce = createStateNonce()
    // Mark this as a primary-login flow (vs. the per-user "connect" flow).
    ;(req.session as any).msOAuth = { nonce, flow: 'login', createdAt: Date.now() }
    req.session.save((err) => {
      if (err) {
        console.error('[auth] failed to persist login state:', err)
        return res.redirect('/?ms=error&reason=state_persist_failed')
      }
      res.redirect(buildAuthUrl(getRedirectUri(req), nonce))
    })
  })

  app.get('/api/logout', (req: Request, res: Response) => {
    req.session?.destroy(() => {
      res.clearCookie('connect.sid')
      res.redirect('/')
    })
  })
}

// ─── Attach the acting Member (if logged in) to every request ──
// Non-blocking: routes that require attribution check `req.member`.
export async function attachMember(req: Request, _res: Response, next: NextFunction) {
  try {
    const userId = (req.session as any)?.userId as string | undefined
    if (userId) {
      const member = await prisma.member.findUnique({
        where: { id: userId },
        include: { department: { select: { id: true, name: true } } },
      })
      if (member) (req as any).member = member
    }
  } catch (err) {
    console.error('[auth] attachMember failed:', err)
  }
  next()
}

// ─── Require a valid session ─────────────────────────────────
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if ((req.session as any)?.userId) return next()
  return res.status(401).json({ error: 'Unauthorized' })
}
