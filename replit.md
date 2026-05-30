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

## API Response Shapes (important for frontend integration)
- `/tasks` returns `{ tasks, total, page, limit }` (not a plain array)
- `/pulse` returns `{ pulses, total, unread }` (not a plain array)
- `/documents` returns `{ documents, total }` (not a plain array)
- `/departments` returns a plain array
- `/integrations` returns a plain array
- `/cowork` returns a plain array
- `/everything` returns `{ records, kpis }`
- `/briefs` returns a plain array of moduleItems

## Features
- Dark/light theme toggle (persisted to localStorage)
- Real-time WebSocket support for activity feeds and task updates
- AI assistant with Anthropic Claude integration (falls back to rule-based briefing)
- Integration framework for ERP, Microsoft 365, Amazon, Slack
- Department modules: Briefs (PIB), CM Productivity, Tech Transfers, Formulations, SKU Pipeline, Inventory Health, Production Tracking
- Full PIB system with 6-step form, detail view, PDF export (jsPDF v2.5.1)
