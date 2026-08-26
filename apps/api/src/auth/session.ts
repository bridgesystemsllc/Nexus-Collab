import session from 'express-session'
import connectPg from 'connect-pg-simple'
import type { Express, RequestHandler, Request, Response, NextFunction } from 'express'
import { normaliseEmail } from '@nexus/shared'
import { prisma } from '../lib/prisma'
import {
  isMicrosoftConfigured,
  getRedirectUri,
  buildAuthUrl,
  createStateNonce,
  tenantIdFromIdToken,
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

/// Thrown when a valid Microsoft identity belongs to a tenant no Organization
/// claims. Distinguished from a generic failure so the callback can send the
/// person somewhere useful rather than to a blank error page.
export class UnknownTenantError extends Error {
  constructor(public readonly tenantId: string | null) {
    super('UNKNOWN_TENANT')
    this.name = 'UnknownTenantError'
  }
}

/**
 * Which Organization is this person signing in to?
 *
 * Exactly one answer: the org registered to their Entra tenant. There is no
 * fallback. The previous implementation answered `findFirst({ orderBy:
 * { createdAt: 'asc' } })`, which put every user of every customer into the
 * oldest workspace — invisible while Nexus had one customer, a cross-tenant
 * data breach the moment it had two.
 */
export async function resolveOrgForLogin(
  db: { organization: { findUnique: (a: any) => Promise<{ id: string } | null> } },
  { tenantId }: { tenantId: string | null; email: string },
): Promise<{ id: string } | null> {
  if (!tenantId) return null
  return db.organization.findUnique({ where: { entraTenantId: tenantId } })
}

// ─── Map an authenticated Microsoft identity to a NEXUS Member ──
// Links by the stable Entra object id (stored in Member.clerkUserId). Falls
// back to adopting an existing member that shares the email (e.g. someone who
// was invited before they ever logged in), otherwise creates a fresh member.
export async function upsertMemberFromMicrosoft(
  profile: MsProfile,
  tokens: { id_token?: string },
) {
  const sub = profile.id
  if (!sub) throw new Error('Microsoft profile missing id')

  // Entra returns whatever case the address was registered in, and it is not
  // stable — the same person can come back as Ahmad@x.com having been
  // ahmad@x.com. Unnormalised, the lookup below misses their existing row and
  // the create that follows hits the unique index, so signing in fails outright.
  const email = normaliseEmail(
    profile.mail || profile.userPrincipalName || `${sub}@microsoft.user`,
  )
  const name = profile.displayName || email || 'Microsoft User'

  const bySub = await prisma.member.findUnique({ where: { clerkUserId: sub } }).catch(() => null)
  if (bySub) return bySub

  // The org must be settled BEFORE the email lookup: email is unique per org
  // now, so an unscoped search would adopt a member belonging to a different
  // customer who happens to share an address.
  const tenantId = tenantIdFromIdToken(tokens.id_token)
  const org = await resolveOrgForLogin(prisma, { tenantId, email })
  if (!org) throw new UnknownTenantError(tenantId)

  const byEmail = await prisma.member
    .findFirst({ where: { orgId: org.id, email: { equals: email, mode: 'insensitive' } } })
    .catch(() => null)
  if (byEmail) {
    // Adopt the placeholder/invited member record under the real identity, and
    // take the opportunity to normalise an address written before this rule.
    return prisma.member.update({
      where: { id: byEmail.id },
      data: { clerkUserId: sub, ...(byEmail.email !== email ? { email } : {}) },
    })
  }

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

// ─── Last sign-in ───────────────────────────────────────────
// The People directory sorts and filters on this, so a column nobody writes
// reads as "everyone has never signed in" rather than as missing data.
//
// Deliberately not awaited by the caller and never allowed to throw: a failed
// bookkeeping write must not cost someone their login.
export function stampLastLogin(memberId: string): void {
  prisma.member
    .update({ where: { id: memberId }, data: { lastLoginAt: new Date() } })
    .catch((err) => console.error('[auth] could not stamp lastLoginAt:', err))
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

  // ── Development-only sign-in ────────────────────────────────
  // Browsers frequently block the login cookie inside Replit's embedded preview
  // iframe (third-party cookie restrictions), which leaves the preview stuck on
  // the Microsoft login screen. This shortcut signs in as the first member so
  // the app is usable in the preview while building.
  //
  // This is a privileged, unauthenticated bypass, so it is double-gated and the
  // route is NEVER REGISTERED in production: it requires BOTH a non-production
  // NODE_ENV AND the absence of REPLIT_DEPLOYMENT. Either signal alone is enough
  // to keep it off, so a single misconfiguration cannot expose it.
  const devLoginAllowed =
    process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEPLOYMENT
  if (devLoginAllowed) {
    app.get('/api/dev-login', async (req: Request, res: Response) => {
      try {
        // Prefer signing in as a privileged member so the preview can exercise
        // admin features (e.g. ERP data-routing); fall back to the first member.
        const member =
          (await prisma.member.findFirst({ where: { role: { in: ['ADMIN', 'OPS_MANAGER'] } }, orderBy: { createdAt: 'asc' } })) ||
          (await prisma.member.findFirst({ orderBy: { createdAt: 'asc' } }))
        if (!member) return res.redirect('/?ms=error&reason=no_workspace')
        req.session.regenerate((regenErr) => {
          if (regenErr) return res.redirect('/?ms=error&reason=session_persist_failed')
          ;(req.session as any).userId = member.id
          req.session.save((err) => {
            if (err) return res.redirect('/?ms=error&reason=session_persist_failed')
            stampLastLogin(member.id)
            res.redirect('/')
          })
        })
      } catch (err) {
        console.error('[auth] dev-login failed:', err)
        res.redirect('/?ms=error&reason=exchange_failed')
      }
    })
  }
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
