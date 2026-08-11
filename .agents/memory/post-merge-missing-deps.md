---
name: Post-merge missing deps kill the API silently
description: Diagnosing "login broken / can't see app" when the API process died at boot but vite still serves
---
Rule: when login or any /api call returns 500 and the page still loads, suspect the API process crashed at startup — check the current workflow log for `Cannot find module` before blaming the browser/preview.

**Why:** August 2026 — a task merge added code importing `papaparse` without installing it; the API died at boot while vite kept serving the frontend, so the app *looked* healthy (page rendered) but every /api call failed via `ECONNREFUSED 127.0.0.1:3000` proxy errors. Earlier "user can't see app" complaints were browser-side, so it was easy to miss when a real server failure appeared later.

**How to apply:** on any 500 from auth/dev-login, refresh logs and grep the newest workflow log for `Cannot find module` / `ECONNREFUSED 127.0.0.1:3000`. Fix = `pnpm add <pkg>` in apps/api + workflow restart. Note: /tmp log files from previous workflow runs get replaced — always RefreshAllLogs to get the current file.
