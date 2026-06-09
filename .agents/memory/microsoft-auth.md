---
name: Microsoft-only auth (session-based)
description: How NEXUS login works after replacing Replit OIDC with Microsoft Entra sign-in
---

# Microsoft-only authentication in NEXUS

The SOLE login is "Sign in with Microsoft" (Azure Entra ID). Replit OIDC
(passport + openid-client) was removed. There is no other login method.

## Shape of the system
- Auth module: `apps/api/src/auth/session.ts`. Plain `express-session` +
  `connect-pg-simple` — **no passport, no req.user**. `setupAuth` wires the
  session and `GET /api/login` (redirect to Entra) + `GET /api/logout` (destroy
  session). `attachMember` resolves `req.member` from `req.session.userId`.
- The OAuth callback is NOT in the auth module — it lives in
  `apps/api/src/routes/microsoftGraph.ts` at
  `/api/v1/integrations/microsoft/callback` and is SHARED by two flows,
  distinguished by `req.session.msOAuth.flow`: `'login'` (primary sign-in, no
  prior member) vs `'connect'` (member-bound Graph re-consent). One registered
  Entra redirect URI serves both — don't add a second.
- Login reuses the manual OAuth helpers in `lib/microsoftGraph.ts`
  (`buildAuthUrl`/`exchangeCode`/`fetchProfile`), NOT openid-client. **Why:**
  avoids OIDC issuer-validation pitfalls (multi-tenant authority) and reuses the
  already-working connect-flow code path.
- Identity mapping: Entra object id (`profile.id`) is stored in
  `Member.clerkUserId` (column name kept to avoid a migration). New logins match
  by that id → adopt by email → else create a member in the first Organization
  (`upsertMemberFromMicrosoft`).
- Login uses the full Graph scopes (incl. `offline_access Mail.Read Files.Read`),
  so signing in ALSO saves a `MicrosoftAccount` — login = Graph connection in one
  step; the separate "connect" prompt rarely shows.

## Security rules (do not regress)
- `SESSION_SECRET` is **required** — never fall back to a hardcoded default
  (forgeable sessions = account takeover for a sole-login app). Startup throws if
  it's missing.
- The login callback calls `req.session.regenerate()` BEFORE setting
  `userId` (defeats session fixation).
- OAuth state is a server-side single-use nonce (TTL + constant-time compare),
  consumed (`delete req.session.msOAuth`) before any processing. The connect flow
  additionally requires `req.member.id === stored.memberId`.

## Cookie must be SameSite=None+Secure to survive the Replit preview iframe
The Replit workspace embeds the running app as a CROSS-SITE iframe (top = replit.com,
frame = *.replit.dev). Browsers refuse to send a `SameSite=lax` cookie in that
context, so the app looks "logged out" in the preview even after a successful
login (the new tab where OAuth completed shows logged-in; the iframe doesn't).
**Fix:** session cookie must be `sameSite:'none'` + `secure:true` on Replit (both
dev preview AND deployment — gate on `REPL_SLUG||REPLIT_DEV_DOMAIN||REPLIT_DEPLOYMENT`,
not just `REPLIT_DEPLOYMENT`).
**Catch:** the internal Vite-proxy→Express hop is plain http and doesn't forward
the proto, so express-session won't emit a Secure cookie. The public edge is
ALWAYS https on Replit, so in index.ts (Replit only) `app.set('trust proxy',1)`
and a middleware that sets `req.headers['x-forwarded-proto']='https'` before the
session middleware. Then express-session sees req.secure=true and issues the
cookie. Verify with `curl -sD- https://$REPLIT_DEV_DOMAIN/api/login` → Set-Cookie
should read `HttpOnly; Secure; SameSite=None`.
**Why this supersedes the old "secure must be false in dev" rule:** that rule kept
login working in a full tab but left the preview iframe logged-out; the proto shim
gets both. Microsoft's own login page still can't be framed (X-Frame-Options), so
the sign-in CLICK must still break out to a top-level tab (LandingPage opens
`/api/login` via `window.open(..,'_blank')` when `window.self!==window.top`); once
the SameSite=None cookie is set, the preview reflects login on refresh.
- `connect-pg-simple`: use `createTableIfMissing:true` and the DEFAULT table name
  (`session`); a custom `tableName` won't be auto-created.
- The public redirect URI comes from `REPLIT_DOMAINS` (request host is localhost
  behind the proxy), via `getRedirectUri(req)` in `lib/microsoftGraph.ts`.

## Config gotcha that wasted a lot of time
`AZURE_TENANT_ID` / `AZURE_CLIENT_SECRET` are user-supplied secrets and are easy
to fill with the WRONG thing. Sanity-check shapes WITHOUT printing values: tenant
id must be a GUID (not a URL), client secret is a ~40-char opaque value (NOT a
GUID — a GUID there is the secret's *ID*, not its *value*). A malformed tenant
shows up as `login.microsoftonline.com/<garbage>/oauth2/...` in the `/api/login`
redirect. This is a config problem, not a code bug.
