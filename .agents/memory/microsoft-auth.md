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

## Still-true env/proxy gotchas (carried over)
- `cookie.secure` must be gated on `!!process.env.REPLIT_DEPLOYMENT` (false in
  dev): the Vite proxy → Express hop is plain http, so a Secure cookie never
  persists in dev. Also `app.set('trust proxy', 1)` + `sameSite:'lax'`.
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
