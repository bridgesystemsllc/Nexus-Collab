# R&D Cleanup + Cross-Module Linking Sprint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 10 R&D-module edits — brief status lifecycle, contact picker, CM/brief cross-module FK linking, SharePoint formulation folders with password gating, Artwork removal, Components→Operations move, full QA pass.

**Architecture:** Nexus Collab is a pnpm monorepo: Vite/React 18 web (`apps/web`), Express API (`apps/api`), Prisma/Postgres (`packages/prisma`). Briefs, CMs, NPD, Components, Artwork are all generic `ModuleItem` rows (JSON `data` + string `status`) under typed `DepartmentModule`s — so most "schema" work is zod validation + JSON data-shape changes + tsx migration scripts, NOT SQL migrations. Navigation is state-based (Zustand `appStore.currentPage` + per-page tab state), not URL routes.

**Tech Stack:** React 18, Zustand, React Query, Tailwind + design-system.css CSS vars, Express, zod, Prisma (Postgres), Microsoft Graph (client-credentials via existing `GRAPH_*` env pattern), lucide-react.

**Key existing assets (REUSE, do not duplicate):**
- `apps/web/src/components/shared/UserPicker.tsx` — keyboard-accessible member picker (`useMembers()` hook)
- `apps/web/src/components/shared/BriefAutocomplete.tsx` — brief search dropdown w/ status pills
- `apps/api/src/services/emailAgent/graphClient.ts` — Graph token acquisition (GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET)
- `apps/api/src/lib/encryption.ts` — AES-256-GCM helpers
- Brief CRUD: `apps/api/src/routes/briefs.ts` (zod `briefDataSchema`)
- AGENTS.md rules: keep FE/BE shapes in sync, zod-validate new request shapes, dark-first design-system.css patterns, lucide icons, no secrets in repo

**Branch/PR protocol (Ahmad's standing rules):** one branch + PR per task (`feat/rd-t1-start-brief-status`, etc.), never push main, merge each PR after end-to-end verification before starting the next dependent task. NewBriefModal.tsx is touched by Tasks 1, 2, 4 and rd.tsx by 1, 4, 5, 8, 9 — execute sequentially to avoid conflicts.

---

## Task 0: Local environment bootstrap (no PR)

**Files:** Create `/Users/ahmadgeorge/Nexus-Collab/.env` (gitignored — verify with `git check-ignore .env`)

- [ ] Install/start postgresql@16 via brew; `createdb nexus`
- [ ] Write `.env`: `DATABASE_URL="postgresql://<user>@localhost:5432/nexus"`, `PORT=3000`, `NODE_ENV=development`, `FRONTEND_URL=http://localhost:5173` (leave GRAPH_*/CLERK_* empty)
- [ ] `pnpm install`
- [ ] `pnpm db:generate && pnpm db:push && pnpm db:seed`
- [ ] Start `pnpm dev` (api :3000, web :5173); verify `curl localhost:3000/api/v1/briefs` returns seeded briefs and web loads
- [ ] Record baseline: `pnpm --filter @nexus/web build` passes (tsc -b + vite)

## Task 1: "Start Brief" status (branch `feat/rd-t1-start-brief-status`)

**Files:**
- Create: `apps/web/src/lib/briefStatus.ts` — single source of truth for statuses + badge colors
- Modify: `apps/web/src/components/briefs/NewBriefModal.tsx` (STATUSES const ~line 122; default `briefStatus`)
- Modify: `apps/web/src/components/briefs/BriefDetailView.tsx` (StatusBadge colorMap ~lines 49–66)
- Modify: `apps/web/src/app/routes/departments/rd.tsx` (BriefsTab list badges + any status filters)
- Modify: `apps/api/src/routes/briefs.ts` (zod enum + server-side default)

- [ ] Create `briefStatus.ts`:
```ts
export const BRIEF_STATUSES = ['Start Brief', 'Brief Submitted', 'In Formulation', 'Stability Testing', 'Formula Approved', 'Completed'] as const
export type BriefStatus = (typeof BRIEF_STATUSES)[number]
export const DEFAULT_BRIEF_STATUS: BriefStatus = 'Start Brief'
export const BRIEF_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Start Brief':       { bg: 'var(--accent-light, rgba(139,92,246,0.15))', text: '#8B5CF6' },
  'Brief Submitted':   { bg: 'var(--info-light)',    text: '#3B82F6' },
  'In Formulation':    { bg: 'var(--warning-light)', text: '#F59E0B' },
  'Stability Testing': { bg: 'var(--danger-light)',  text: '#EF4444' },
  'Formula Approved':  { bg: 'var(--success-light)', text: '#10B981' },
  Completed:           { bg: 'var(--bg-hover)',      text: '#6B7280' },
}
```
(Spec asked for Start Brief/Brief Submitted/Completed; main already ships In Formulation/Stability Testing/Formula Approved with live data — keep all six, non-destructive.)
- [ ] NewBriefModal: `options={[...BRIEF_STATUSES]}`, initial form state `briefStatus: DEFAULT_BRIEF_STATUS`
- [ ] BriefDetailView + BriefsTab: import shared colors; fallback to `Start Brief` styling for unknown
- [ ] briefs.ts: `briefStatus: z.enum(BRIEF_STATUSES).optional()` (duplicate const server-side or shared package — match repo conventions; server default `data.briefStatus ?? 'Start Brief'` on create)
- [ ] Verify: create brief via UI with default status; appears in list + detail with Start Brief badge; `curl -X POST` with invalid status → 400
- [ ] Build passes; commit; PR; merge after verify

## Task 2: Brief contact dual-mode picker (branch `feat/rd-t2-brief-contact-picker`)

**Files:**
- Modify: `apps/web/src/components/briefs/NewBriefModal.tsx` (Step 2, lines ~387–436; `BriefFormData.projectContacts`)
- Modify: `apps/web/src/components/briefs/BriefDetailView.tsx` (contacts display)
- Modify: `apps/api/src/routes/briefs.ts` (`projectContactSchema`)

- [ ] Extend contact shape: `{ name, role, email, phone?, memberId?, source: 'nexus' | 'manual' }`; zod: add `phone: z.string().optional()`, `memberId: z.string().optional()`, `source: z.enum(['nexus','manual']).optional()`
- [ ] Step 2 UI: per contact entry, segmented toggle **Select from Nexus Users** (renders existing `UserPicker`; on select auto-fill name/email/role from member record) | **Add Contact Manually** (Name, Email, Phone optional, Role/Title optional). Match existing FormField/TextInput patterns.
- [ ] Note: no Contact table exists and the codebase pattern is JSON-on-ModuleItem — contacts persist on the brief record (satisfies acceptance criteria; deviation from "create a contacts table" recorded in final report)
- [ ] BriefDetailView: render phone + a small "Nexus user" chip when `source==='nexus'`
- [ ] Verify both paths end-to-end (create → detail view shows contact); build; commit; PR; merge

## Task 3: Inline editable status on saved briefs (branch `feat/rd-t3-inline-brief-status`)

**Files:**
- Create: `apps/web/src/components/shared/Toast.tsx` ONLY IF no toast exists (search `toast|notification|snackbar` first — reuse if found)
- Create: `apps/web/src/components/briefs/BriefStatusSelect.tsx` (shared dropdown used by detail view; NewBriefModal keeps its Select fed from same `briefStatus.ts`)
- Modify: `apps/web/src/components/briefs/BriefDetailView.tsx` (replace static badge in header)
- Modify: `apps/api/src/routes/briefs.ts` (PATCH: stamp history)

- [ ] BriefStatusSelect: styled dropdown showing badge colors, all `BRIEF_STATUSES`
- [ ] On change: `PATCH /api/v1/briefs/:id` body `{ data: { briefStatus, statusUpdatedAt: <ISO> } }`; optimistic UI + React Query invalidation; success toast "Status updated"
- [ ] API PATCH: when `data.briefStatus` changes, server appends `{ from, to, at }` to `data.statusHistory` array and sets `data.statusUpdatedAt` (no schema change — JSON)
- [ ] Verify: open saved brief → change status → toast → hard refresh → persisted in list + detail; build; commit; PR; merge

## Task 4: Brief CM field → CM Productivity FK (branch `feat/rd-t4-brief-cm-link`)

**Files:**
- Create: `apps/api/src/routes/cms.ts` — `GET /api/v1/cms` returns `[{ id, name, status, brands }]` from ModuleItems where `module.type='CM_PRODUCTIVITY'` (mirror briefs.ts GET pattern); register in `apps/api/src/index.ts`
- Create: `apps/web/src/components/shared/CMPicker.tsx` — searchable dropdown (model on UserPicker), props `{ value: { cmId: string; cmName: string }, onChange, label?, placeholder? }`
- Create: `apps/web/src/hooks/useData.ts` → add `useCMs()` React Query hook
- Modify: `apps/web/src/components/briefs/NewBriefModal.tsx` (replace free-text CM Select, lines ~349–356)
- Modify: `apps/web/src/components/briefs/BriefDetailView.tsx` (CM name → clickable link)
- Modify: `apps/web/src/stores/appStore.ts` — add cross-page nav target: `navTarget: { page: string; tab?: string; itemId?: string } | null`, `setNavTarget()`; `rd.tsx` consumes on mount/effect (opens tab + item drawer, then clears). This mechanism is REUSED by Tasks 5, 7, 9.
- Modify: `apps/web/src/app/routes/departments/rd.tsx` (consume navTarget; CM profile open-by-id)
- Modify: `apps/api/src/routes/briefs.ts` (zod: `cmId: z.string().optional()`)
- Create: `scripts/migrate-cm-links.ts` — tsx script, idempotent: for every BRIEFS ModuleItem with `data.contractManufacturer` text and no `data.cmId`, case-insensitive trim-match against CM items `data.name`; matched → set `cmId`; unmatched → set `data.cmUnmatched: true`; print table of matched/unmatched. Keeps text field (reversible, non-destructive).

- [ ] Build endpoint + hook + CMPicker; wire into NewBriefModal (store `cmId` + denormalized `contractManufacturer` name for display/back-compat)
- [ ] BriefDetailView: CM rendered as link → `setNavTarget({ page: 'rd', tab: 'cm', itemId: cmId })`
- [ ] Run migration script against local seeded DB; record output for final report
- [ ] Verify: new brief shows seeded CMs (Paklab, Kolmar, ACT…) in dropdown; saved brief links to CM profile; build; commit; PR; merge

## Task 5: Tech Transfer linked-brief dropdown (branch `feat/rd-t5-tt-linked-brief`)

**Files:**
- Modify: `apps/web/src/components/shared/BriefAutocomplete.tsx` — add props `excludeStatuses?: string[]`, render `title + brand + status pill` rows (use `BRIEF_STATUS_COLORS`)
- Modify: `apps/web/src/components/rd/NewTransferModal.tsx` (lines ~379–424: replace hand-rolled dropdown with BriefAutocomplete, `excludeStatuses={['Completed']}`; persist `briefId` in transfer data)
- Modify: `apps/web/src/components/rd/TechTransferDetailDrawer.tsx` — linked brief shown as clickable link → `setNavTarget({ page: 'rd', tab: 'briefs', itemId: briefId })`

- [ ] Keep stored keys backward-compatible (`linkedBriefId`/`linkedBriefName` if that's what main persists — verify before renaming; add `briefId` alias only if needed)
- [ ] Verify: new tech transfer → dropdown lists open briefs only (Completed excluded), shows name+brand+status; select → save → detail drawer link navigates to the brief; build; commit; PR; merge

## Task 6: Formulations — SharePoint + password gate (branch `feat/rd-t6-formulations-sharepoint-gate`)

**Files:**
- Modify: `packages/prisma`/none — `data.sharepointFolderUrl` lives in formulation ModuleItem JSON
- Create: `apps/api/src/routes/sharepoint.ts` — `GET /api/v1/sharepoint/list?url=<encoded>`:
  - If `GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`/`GRAPH_CLIENT_SECRET` missing → `200 { configured: false }` (UI renders "SharePoint connection not configured" + required env list). NEVER fake file data.
  - Else: Graph shares API — `shareId = 'u!' + base64url(folderUrl)` → `GET https://graph.microsoft.com/v1.0/shares/{shareId}/driveItem/children?$select=name,file,folder,lastModifiedDateTime,webUrl` using client-credentials token (reuse/extract token logic from `services/emailAgent/graphClient.ts`); map to `{ name, type, lastModified, webUrl }`
- Create: `apps/api/src/routes/formulationsGate.ts` — `POST /api/v1/formulations-gate/unlock` `{ password }`: sha256(password) vs env `FORMULATIONS_PASSWORD_HASH` via `crypto.timingSafeEqual`; success → `{ token }` = HMAC-SHA256(`FORMULATIONS_PASSWORD_HASH`, `formulations:<expiryEpoch>`) + expiry (8h); `GET /api/v1/formulations-gate/status` → `{ locked: boolean }` (false when env unset). Export `requireFormulationsUnlock` middleware (checks `X-Formulations-Token`), apply to `formulationDetail.ts` routes and `sharepoint.ts`. If env hash unset: gate disabled + boot-time console.warn (dev-friendly).
- Create: `apps/web/src/components/rd/FormulationsGate.tsx` — wraps FormulationsTab: queries gate status; locked → centered password prompt (dark-first, lock icon); unlock → token in `sessionStorage` (`nexus_formulations_token`), attach header on formulation API calls; wrong password → inline error
- Create: `apps/web/src/components/rd/SharePointFolderModal.tsx` — center modal: "Open in SharePoint" button (`window.open`, new tab) + file table (name, type, last modified) | loading | not-configured | error states
- Modify: `apps/web/src/components/rd/FormulationDetailDrawer.tsx` — add editable "SharePoint Folder" field (URL input + save via module-items PATCH; clicking the saved link opens SharePointFolderModal)
- Modify: `.env.example` — add `FORMULATIONS_PASSWORD_HASH=""` + comment with hash-generation one-liner; document `GRAPH_*` reuse for SharePoint

- [ ] Implement API first (unlock + status + sharepoint list with configured:false path), then UI; never store plaintext password anywhere
- [ ] Local verify: set `FORMULATIONS_PASSWORD_HASH` in `.env` (sha256 of a test password) → Formulations tab prompts; wrong pw rejected; correct pw unlocks for session; new session re-prompts; formulation-detail API rejects token-less requests when locked; SharePoint modal shows not-configured state with exact env vars needed; build; commit; PR; merge

## Task 7: NPD CM field → CM module (branch `feat/rd-t7-npd-cm-link`)

**Files:**
- Modify: `apps/web/src/components/rd/npd/NewNPDProjectModal.tsx` (~line 461: replace TextInput with shared `CMPicker` from Task 4)
- Modify: `apps/web/src/components/rd/npd/NPDProjectDetail.tsx` (CM display → clickable link via navTarget)
- Modify: `scripts/migrate-cm-links.ts` — extend to NPD_PIPELINE items (`data.cm` text → `cmId`, same match/flag rules); rerun

- [ ] Store `cmId` + denormalized name; ZERO duplicated picker code
- [ ] Verify: new NPD project picks live CM; detail links to CM profile; migration output recorded; build; commit; PR; merge

## Task 8: Remove Artwork from R&D (branch `feat/rd-t8-remove-artwork`)

**Files:**
- Modify: `apps/web/src/app/routes/departments/rd.tsx` — remove `artwork` from `RDTab` type + `TABS` array (~lines 50–60), remove `ArtworkTab` import + render case, remove Palette icon import if unused
- Do NOT touch: artwork DB tables/ModuleItems, API routes, seed data

- [ ] `grep -rn "artwork" apps/web/src --include=*.tsx -i` — clean every R&D UI surface (tab, links, counts); leave Everything-page/API references intact
- [ ] If rd.tsx persists a saved tab key, add fallback: stored `'artwork'` → `'briefs'`
- [ ] Verify: R&D shows 6 tabs (then 5 after Task 9); no console errors; `pnpm --filter @nexus/web build` zero errors; artwork rows still in DB (`select count` via prisma studio/psql); commit; PR; merge

## Task 9: Move Components R&D → Operations (branch `feat/rd-t9-components-to-ops`)

**Files:**
- Modify: `apps/web/src/app/routes/departments/rd.tsx` — remove `components` tab (type, TABS, import, case); fallback stored-tab `'components'` → `setNavTarget({ page: 'ops', tab: 'components' })` (the "redirect")
- Modify: `apps/web/src/app/routes/departments/ops.tsx` — add Components tab (same `ComponentsTab` component import, Boxes icon), consume navTarget tab
- Investigate first: how `ComponentsTab` sources data (likely `useDepartment(rdDeptId)` module items). If dept-scoped: create `scripts/migrate-components-module.ts` — re-parent the COMPONENTS `DepartmentModule.departmentId` from R&D dept to Operations dept (single UPDATE, reversible, data intact). If type-scoped: no script needed.
- Check: `apps/api/src/routes/everything.ts` + seed.ts dept/module references remain valid

- [ ] All existing components data visible under Operations; nothing components-related left in R&D UI; build clean; commit; PR; merge

## Task 10: Full R&D QA pass (branch `fix/rd-t10-qa-pass`)

- [ ] Enumerate EVERY interactive element (buttons, dropdowns, links, toggles, modal triggers, form submits) across: Active Briefs, Tech Transfers, Formulations (incl. gate), NPD, CM Productivity, plus Ops→Components — via parallel code-audit agents per screen reading rd.tsx/ops.tsx + each modal/drawer component, tracing each handler to its API call
- [ ] Live verification: app running; API smoke tests (CRUD per module via curl); UI flows for every create/edit/delete path feasible from API + code-trace evidence
- [ ] Fix everything dead/broken on the QA branch (each fix small + committed separately)
- [ ] Output QA results table: | Screen | Element | Status (Pass/Fixed/Notes) |
- [ ] Build + typecheck zero errors; commit; PR; merge

## Final report (to Ahmad)
(a) per-task change summary; (b) env vars to set on Replit: `FORMULATIONS_PASSWORD_HASH`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET` (+ scopes: `Files.Read.All` application permission, admin-consented, for shares API); (c) QA table; (d) migration scripts run + their output (CM link matching results, components module re-parent); (e) deviations: no Contact table (JSON pattern), six statuses not three, state-based "redirects".
