# NEXUS — Department Ecosystem Platform

## Overview
NEXUS is a cross-departmental operations platform for Kareve Beauty Group. It provides real-time visibility into R&D, Operations, Warehouse, Vendor Management, and Finance activities with AI-powered briefings and collaborative workspaces.

## Architecture
- **Monorepo** managed by pnpm workspaces
- **Frontend**: React 18 + Vite + TailwindCSS + Zustand (state) + React Query (data fetching)
- **Backend**: Express + Socket.io + Prisma ORM
- **Database**: PostgreSQL (Replit-managed, host: helium)
- **Package structure**:
  - `apps/web` — React frontend (Vite dev server on port 5000)
  - `apps/api` — Express API server (port 3000)
  - `packages/prisma` — Prisma schema and seed
  - `packages/shared` — Shared TypeScript types

## Key Files
- `packages/prisma/prisma/schema.prisma` — Database schema (15 models)
- `apps/api/src/index.ts` — API entry point + WebSocket
- `apps/web/vite.config.ts` — Vite config: port 5000, allowedHosts: true, proxies /api → localhost:3000
- `apps/web/src/app/layout.tsx` — Main app layout with page routing via Zustand store
- `apps/web/src/styles/design-system.css` — CSS design system with dark/light theme

## Database
- PostgreSQL database named `nexus` on Replit's managed host
- DATABASE_URL is passed via workflow command environment
- Schema has 15+ models: Organization, Member, Department, DepartmentModule, ModuleItem, Brand, Project, CoworkSpace, Task, Activity, Document, EmailLink, Note, Integration, SyncLog, Pulse, EscalationRule

## Running (Development)
- Workflow "Start application" runs:
  1. Express API on port 3000 (background)
  2. Vite dev server on port 5000 (foreground, proxies /api and /socket.io to port 3000)
- Vite has `allowedHosts: true` and `host: '0.0.0.0'` for Replit canvas compatibility
- No build step required — Vite serves source directly with HMR
- Frontend changes appear instantly via HMR (no restart needed)
- API changes require workflow restart (uses tsx)

## Helmet Config (important for Replit)
- `contentSecurityPolicy: false` — allow inline scripts
- `frameguard: false` — allow iframe embedding
- `crossOriginOpenerPolicy: false` — allow cross-origin opener
- `crossOriginResourcePolicy: false` — allow cross-origin resources
- `crossOriginEmbedderPolicy: false` — allow cross-origin embedding

## API Routes (all under /api/v1)
- `/departments` — Department CRUD + modules + module items
- `/tasks` — Task CRUD + notes + email links
- `/cowork` — Cowork spaces + activities + shared tasks + files
- `/documents` — Document CRUD
- `/everything` — Unified view across all data sources
- `/integrations` — Integration management + OAuth + sync
- `/ai` — AI chat, briefings, quick actions (WOSR, escalation, ERP sync)
- `/pulse` — Notification feed + mark read
- `/briefs` — PIB (Project Initiation Brief) CRUD stored as moduleItems
- `/uploads` — Real file uploads to object storage: `POST /uploads/request-url` returns a presigned GCS PUT URL + objectPath; `GET /uploads/objects/*` streams/downloads the stored object

## Object Storage (file uploads)
- Replit App Storage (Google Cloud Storage backed) via `@google-cloud/storage`; env vars `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`
- Server helpers live in `apps/api/src/lib/objectStorage/` (objectStorage.ts, objectAcl.ts)
- Upload flow: client requests presigned URL (`/uploads/request-url`) → PUTs file directly to GCS → POSTs `objectPath` to `/cowork/:id/files`, which sets a public ACL and stores `storageKey` + `storageUrl` (`/api/v1/uploads/objects/...`). Falls back to plain link attachment when no `objectPath` is sent.
- Cowork Files tab (`apps/web/src/app/routes/cowork-detail.tsx`) supports both device upload and "Add Link"; file size/type captured automatically from the selected file

## API Response Shapes (important for frontend integration)
- `/tasks` returns `{ tasks, total, page, limit }` (not a plain array)
- `/pulse` returns `{ pulses, total, unread }` (not a plain array)
- `/documents` returns `{ documents, total }` (not a plain array)
- `/departments` returns a plain array
- `/integrations` returns a plain array
- `/cowork` returns a plain array
- `/everything` returns `{ records, kpis }`
- `/briefs` returns a plain array of moduleItems

## Shared UI Foundation (full-page forms)
Reusable building blocks live in `apps/web/src/components/shared/`:
- **Full-page form routing** — `appStore` holds `activeForm` plus `openForm()` / `closeForm()`. When `activeForm` is set, `layout.tsx`'s `PageContent` renders the matching form (looked up in `apps/web/src/app/formRegistry.tsx`) in place of the page; `closeForm()` returns to the originating page (sidebar/topbar stay visible).
- **`FullPageForm`** (`shared/FullPageForm.tsx`) — full-height shell: sticky header with title + Back button, single scrollable body (no nested scrolling), sticky footer action bar.
- **`ViewToggle`** (`shared/ViewToggle.tsx`) — reusable table ↔ list/line toggle returning `'table' | 'list'`.
- **`AddToCowork`** (`shared/AddToCowork.tsx`) — drop-in button/menu for any row or detail view; opens a multi-coworker tagging picker and pushes the item into a new or existing co-work space (creates a linked shared task + activity).

To add a new full-page form: build a component taking `{ form: ActiveForm }` that uses `<FullPageForm>` and persists on save (invalidate the relevant React Query key), register it in `formRegistry`, then call `openForm({ formType, mode, recordId?, context? })` from any list/row. Reference implementation: `apps/web/src/components/briefs/BriefFormPage.tsx` (New/Edit Brief), wired from `apps/web/src/app/routes/departments/rd.tsx`.

## Authentication (Microsoft only)
- Sole login is "Sign in with Microsoft" (Azure Entra ID). The old Replit OIDC login was removed.
- Secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`. Registered Entra redirect URI: `<REPLIT_DEV_DOMAIN>/api/v1/integrations/microsoft/callback` (single URI shared by login + connect).
- Session: `express-session` + `connect-pg-simple` (Postgres-backed). On successful login the OAuth callback sets `req.session.userId = member.id`; `attachMember` resolves `req.member` from it on every request.
- Auth module: `apps/api/src/auth/session.ts` (`setupAuth` wires session + `GET /api/login` + `GET /api/logout`; `attachMember`, `isAuthenticated`, `upsertMemberFromMicrosoft`). The OAuth callback itself lives in `apps/api/src/routes/microsoftGraph.ts` and branches on `msOAuth.flow` (`'login'` vs `'connect'`).
- Identity mapping: Entra object id is stored in `Member.clerkUserId`; new logins match by that id, then adopt by email, else create a member in the first Organization.
- Signing in uses the full Graph scopes (incl. `offline_access`, `Mail.Read`, `Files.Read`), so login also connects the member's Microsoft account — Outlook/OneDrive attach features work without a separate connect step.

## Features
- Dark/light theme toggle (persisted to localStorage)
- Real-time WebSocket support for activity feeds and task updates
- AI assistant with Anthropic Claude integration (falls back to rule-based briefing)
- Integration framework for ERP, Microsoft 365, Amazon, Slack
- Department modules: Briefs (PIB), CM Productivity, Tech Transfers, Formulations, SKU Pipeline, Inventory Health, Production Tracking
- Full PIB system with 6-step form, detail view, PDF export (jsPDF v2.5.1)
