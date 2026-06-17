---
name: Microsoft Graph OAuth scopes & re-consent
description: Adding a Graph scope requires existing connected users to re-consent; 403 ErrorAccessDenied means missing scope, not "not connected".
---

# Microsoft Graph scopes & re-consent

`MS_SCOPES` (apps/api/src/lib/microsoftGraph.ts) is the single source of truth for delegated permissions, used in the auth URL + token exchange/refresh. Reading mail needs `Mail.Read`; **sending/replying** (`POST /me/messages/{id}/reply|replyAll|sendMail`) needs `Mail.Send`. Missing `Mail.Send` was the cause of in-app email reply failing.

**Why this is tricky:**
- Graph returns **403 `ErrorAccessDenied`** when the token is valid but lacks a scope — distinct from 401 (token rejected) and from never-connected.
- Adding a new scope does NOT retroactively upgrade already-connected members. Their stored refresh token was minted under the old scope set; the refresh grant keeps the old scopes. They must **re-consent (sign out/in or reconnect Microsoft)** — Azure incremental consent then prompts for the new permission automatically because the auth request now includes it.

**How to apply:**
- When adding any Graph feature, add its scope to `MS_SCOPES` AND warn that existing users must reconnect once.
- `graphGet`/`graphPost` map `403 ErrorAccessDenied` → `MicrosoftNotConnectedError` so routes return 412 and the UI shows the reconnect prompt instead of a dead-end generic 500. Keep that mapping when touching those helpers.
- Stored token blob (StoredTokens) does NOT persist the granted scope list, so you can't detect stale-scope accounts by inspection — rely on the 403→reconnect path at call time.
