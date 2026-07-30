---
name: Preview pane grey/blank vs app health
description: How to triage "I can't see the app" reports when the server checks out healthy
---
Rule: when the user reports a white/grey preview but curl + Screenshot show the app rendering, do NOT keep restarting or editing code — bisect with the direct $REPLIT_DEV_DOMAIN URL in a new tab.

**Why:** July 2026 session — user's preview pane was grey for several turns; app was healthy the whole time (direct URL worked in a fresh tab). The failure was the workspace preview pane's stuck connection, fixable only by the user reloading the whole workspace tab / reopening the Webview pane / checking the port selector (this app opens 3000 API + 5000 web; preview must be on 5000).

**How to apply:** verify server once (curl 200 + Screenshot), then immediately ask the user to open the direct dev URL in a new tab. If that works, it's the preview pane — instruct workspace reload; nothing to fix in code. Dev-only no-store cache headers are already in apps/web vite config.
