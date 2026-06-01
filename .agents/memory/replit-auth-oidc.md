---
name: Replit Auth (OIDC) behind the Vite dev proxy
description: Non-obvious gotchas wiring passport OIDC + sessions when /api is proxied by Vite with changeOrigin
---

# Replit Auth (OIDC) in NEXUS

The app uses Replit Auth (OIDC via openid-client + passport), NOT Clerk. Clerk has
no Replit integration and would need external keys; Replit Auth is zero-config
(env already provides REPL_ID, REPLIT_DOMAINS, SESSION_SECRET, ISSUER_URL default
https://replit.com/oidc). The Member model's `clerkUserId` column is reused to
store the Replit `sub` (column name kept to avoid a migration).

## Gotcha 1 — pick the OIDC strategy by REPLIT_DOMAINS, not req.hostname
**Why:** The Vite dev server proxies `/api` → localhost:3000 with
`changeOrigin: true`, which rewrites the Host header to `localhost`. So inside
Express `req.hostname === 'localhost'`, and a passport strategy registered as
`replitauth:<public-domain>` is not found if selected by req.hostname.
**How to apply:** Select the strategy by matching req.hostname against the
configured REPLIT_DOMAINS list and falling back to the first domain. The
callbackURL / redirect_uri must be the public `https://<replit-domain>/api/callback`,
otherwise the OIDC provider rejects the redirect.

## Gotcha 2 — session cookie must be Secure:false in dev
**Why:** The browser talks to the app over https, but the internal hop (Vite
proxy → Express) is plain http and does not forward X-Forwarded-Proto=https. With
`cookie.secure: true`, express-session refuses to set the cookie over that http
hop, so login never persists.
**How to apply:** Gate `cookie.secure` on `!!process.env.REPLIT_DEPLOYMENT`
(true only in a real TLS deployment), set `app.set('trust proxy', 1)`, and use
`sameSite: 'lax'`. Browsers accept a non-Secure cookie over https fine.

## Gotcha 3 — connect-pg-simple session table
Use `createTableIfMissing: true` and the DEFAULT table name (omit `tableName`).
The bundled table.sql hardcodes the table name `session`, so a custom tableName
won't be auto-created.

## tsc vs runtime
`openid-client/passport` only resolves under moduleResolution node16/nodenext/
bundler; the API tsconfig is commonjs+classic-node so `tsc` reports it cannot
resolve. This is harmless — the project runs via tsx/esbuild (which resolves the
package `exports` field correctly). The API already does not pass `tsc` (many
pre-existing errors); the working path is tsx, not tsc.
