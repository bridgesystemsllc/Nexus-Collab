# SPEC-NX-001 — Status transition demo tests

## 1. Meta

| Field | Value |
|---|---|
| Spec ID | NX-001 |
| Slug | status-transition-demo-tests |
| Author | Spec Leader |
| Version | 1.0 |
| Repo | bridgesystemsllc/Nexus-Collab |
| Branch | `main` (API already on main). PR 110 is UI-only and is not this packet. |
| Status | Ready |
| Estimated agent sessions | 1 |
| Blast radius | Contained |
| Reversibility | Trivial |
| Tracker | Task Trackers → Nexus Collab tab has **no** Status UI row. ATLAS locked remaining v1 as Status UI + one-tenant KarEve demo. This packet is the testable remainder after PR 110. |
| Related PR | https://github.com/bridgesystemsllc/Nexus-Collab/pull/110 (draft, CI green, mergeable_state clean). **Not new work.** Do not rewrite `StatusSelect`. Ahmad merges in GitHub UI. |

## 2. Goal

A KarEve editor's Draft→Proposed and Approved→Active status changes persist through `POST /projects/:id/status`, and archiving with empty `lessonsLearned` is rejected with HTTP 409 and message `Record lessons learned before archiving this project`, proven by integration tests that fail if either contract breaks.

## 3. User-observable behavior

Accepted demo script (runtime UNVERIFIED; this packet proves the server half):

1. **Given** a project in `DRAFT` owned by an actor with `EDIT_PROJECT`, **when** `POST /projects/:id/status` body `{ "status": "PROPOSED" }`, **then** HTTP 200 and `GET /projects/:id` returns `status: "PROPOSED"`.
2. **Given** a project in `APPROVED`, **when** `{ "status": "ACTIVE" }`, **then** HTTP 200 and persisted `ACTIVE`.
3. **Given** a project whose `lessonsLearned` is null or whitespace, **when** `{ "status": "ARCHIVED" }`, **then** HTTP 409, body `{ "error": { "code": "ConflictError", "message": "Record lessons learned before archiving this project" } }`, and `status` is unchanged.
4. **Given** the same project after `PATCH` sets `lessonsLearned` to a non-empty string, **when** `{ "status": "ARCHIVED" }` as PM/admin, **then** HTTP 200 and persisted `ARCHIVED`.
5. **Edge — viewer:** **Given** `capabilities.editProject === false`, **when** the UI renders `StatusSelect`, **then** a static badge (PR 110). HTTP viewer-403 is **not** in this session: `pnpm test:integration` authenticates via `/api/dev-login` as admin. Viewer denial stays in `policy.test.ts` (`EDIT_PROJECT` / `ARCHIVE_PROJECT`) plus the human demo.

## 4. Context the agent must read first (order)

1. `apps/api/src/routes/projects.ts` — `PROJECT_STATUSES`, `POST /:id/status` (approx. lines 580–638), `createProjectSchema.status` enum, `fail`/`ok` helpers.
2. `apps/api/src/services/projects/context.ts` — `ConflictError.status === 409`, `ValidationError.status === 422`, `errorResponse` envelope `{ error: { code, message, details? } }`.
3. `apps/api/src/services/projects/policy.ts` — `ProjectAction`, `EDIT_PROJECT` (non-viewer participant), `ARCHIVE_PROJECT` (admin or PM only), `PolicyError.status === 403`.
4. `apps/web/src/modules/projects/api/projectsClient.ts` — `setProjectStatus(id, status, reason?)` posts `{ status, ...(reason ? { reason } : {}) }` to `/${id}/status`; `ProjectsApiError` reads `error.message`.
5. `apps/web/src/modules/projects/hooks/useProjects.ts` — `useSetProjectStatus(id)` mutationFn `{ status: string; reason?: string }`.
6. `apps/web/src/modules/projects/types.ts` — `ProjectStatus`, `STATUS_LABELS`, `ProjectCapabilities.editProject`.
7. PR 110 files (do not rewrite): `apps/web/src/modules/projects/components/StatusSelect.tsx`, `apps/web/src/modules/projects/views/ProjectDetailView.tsx`.
8. `apps/api/src/services/projects/projects.integration.test.ts` — existing `call`/`makeProject`/`sweep`/`TAG`/`maybe`/`describe.skipIf(!serverUp)` patterns. Append here; do not start a second suite.
9. `apps/api/vitest.integration.config.ts` — serial, `src/**/*.integration.test.ts`, 30s timeouts.
10. `docs/superpowers/specs/2026-08-10-project-editability-design.md` — status is **not** PATCH; it stays on `POST /:id/status`.

## 5. Data model

No schema change.

`Project.status` is already `ProjectStatus`:

`DRAFT | PROPOSED | APPROVED | ACTIVE | ON_HOLD | AT_RISK | BLOCKED | COMPLETED | CANCELLED | ARCHIVED`

`Project.lessonsLearned`: `string | null`. Archive requires `before.lessonsLearned?.trim()` truthy.

On `COMPLETED` with no `actualEndDate`, the route sets `actualEndDate` to `now`. This packet does not require a COMPLETED test.

Activity: `entityType: 'PROJECT'`, `action: 'STATUS_CHANGED'`, `fieldChanges: { status: { from, to } }`.

## 6. Interfaces and contracts

```ts
// POST /api/v1/projects/:id/status
// Content-Type: application/json
// Cookie: session (integration uses /api/dev-login)

type ProjectStatus =
  | 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'ACTIVE' | 'ON_HOLD'
  | 'AT_RISK' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED'

interface SetProjectStatusBody {
  status: ProjectStatus
  reason?: string  // max 2000; optional; omit key when unused
}

// 200
interface OkEnvelope {
  data: { id: string; status: ProjectStatus; lessonsLearned: string | null; actualEndDate: string | Date | null }
  meta: Record<string, unknown>
}

// 4xx
interface ErrEnvelope {
  error: { code: string; message: string; details?: unknown }
}
```

Route body schema (strict):

```ts
z.object({
  status: z.enum(PROJECT_STATUSES),
  reason: z.string().max(2000).optional(),
}).strict()
```

Action selection:

```ts
const action = body.status === 'ARCHIVED' || body.status === 'CANCELLED'
  ? 'ARCHIVE_PROJECT'
  : 'EDIT_PROJECT'
```

Client (already shipped; do not change unless a test proves it drops `error.message`):

```ts
export const setProjectStatus = (id: string, status: string, reason?: string) =>
  send<ProjectDetail>('post', `/${id}/status`, { status, ...(reason ? { reason } : {}) })
```

`StatusSelect` (PR 110; do not change):

```ts
export function StatusSelect(props: {
  projectId: string
  currentStatus: ProjectStatus
  canEdit: boolean
}): JSX.Element
```

Unknown keys → 422 `ValidationError`. Missing `status` → 422. `reason` length > 2000 → 422.

## 7. Out of scope

- Rework module / Ambi Sync private repo (403; ATLAS locked out of v1).
- Stripe, billing, second-org tenancy.
- Dark-first restyle or any Ahmad Design System amendment.
- Rewriting or restyling `StatusSelect` / `ProjectDetailView`.
- Undrafting or merging PR 110 (Ahmad, GitHub UI).
- Adding Playwright, jsdom, `@testing-library/react`, or changing `apps/web/vitest.config.ts` (`environment: 'node'`, `include: ['src/**/*.test.ts']` is prior art).
- Viewer HTTP 403 via a second session (dev-login is admin). Human demo covers the static badge.
- Contacting KarEve. Using Ahmad's KarEve identity.
- Sponsor-approval extra gate (policy.ts comment mentions it; the route as of main SHA 22edbbd97de3055fd1fd6d43466d9c2c0dab4d68 does **not** enforce it). Do not add it.
- New GitHub Projects boards.

## 8. Edge cases

| Category | Case | Expected |
|---|---|---|
| Empty / single / max-size | `lessonsLearned` null or `"   "` then ARCHIVED | 409, status unchanged |
| Empty / single / max-size | One successful DRAFT→PROPOSED | 200, persisted |
| Empty / single / max-size | `reason` of 2000 chars | 200; `reason` of 2001 → 422 |
| Null upstream | Body `{}` or `{ "status": null }` | 422 ValidationError |
| Null upstream | Unknown project id | 404 `Project not found` |
| Partial mid-batch | ARCHIVED 409 must not write `STATUS_CHANGED` activity or change `status` | assert both |
| Concurrent | Two parallel PROPOSED posts on the same DRAFT id | both 200 or one 200 and persisted PROPOSED; never 500 |
| External timeout | API down at collection | existing skipIf(!serverUp); do not fail default `pnpm test` |
| 4xx / 5xx | `"status": "NOPE"` | 422 |
| 4xx / 5xx | extra key `{ status: "ACTIVE", foo: 1 }` | 422 |
| 4xx / 5xx | ARCHIVED empty lessons | 409 ConflictError, exact message above |
| 4xx / 5xx | CANCELLED as non-PM | 403 PolicyError **if** a non-admin cookie exists; otherwise omit this `it` and note UNVERIFIED |

## 9. Acceptance criteria

Each line must be able to fail.

1. `projects.integration.test.ts` contains a `describe('project status transitions')` using existing `call`, `makeProject`, `TAG`, `sweep`.
2. DRAFT→PROPOSED returns 200 and GET shows `PROPOSED`.
3. APPROVED→ACTIVE returns 200 and GET shows `ACTIVE`.
4. ARCHIVED with empty lessons returns **409** and `error.message === 'Record lessons learned before archiving this project'` and GET still shows the previous status.
5. After PATCH `{ lessonsLearned: 'Shipped. Keep the vendor pack.' }`, ARCHIVED returns 200 and GET shows `ARCHIVED`.
6. Invalid enum and extra keys return 422.
7. A successful transition writes `projectActivity` with `action: 'STATUS_CHANGED'` and `fieldChanges.status.from/to`.
8. A rejected archive writes **no** `STATUS_CHANGED` row for that attempt.
9. Default `pnpm --filter @nexus/api test` (non-integration) still exits 0 without a live server.
10. `pnpm --filter @nexus/api test:integration` exits 0 with API+DB up; if API is down, tests skip (not fail) as today.
11. Diff does not modify `StatusSelect.tsx`, `ProjectDetailView.tsx`, billing, or Prisma schema.

## 10. Verification steps

```bash
pnpm --filter @nexus/api test
pnpm --filter @nexus/api exec tsc --noEmit -p tsconfig.json
# live API + DB required (same as existing suite):
INTEGRATION_API_URL=http://localhost:3000 pnpm --filter @nexus/api test:integration
```

Pass/fail walk of §9: print each criterion as PASS or FAIL. A skip-all because the server is down is **not** a pass of 2–8.

Human demo (not this agent session; Ahmad / ATLAS after 110 merge): MS login KarEve tenant with `editProject` → Projects list → open project → Draft→Proposed or Approved→Active persist. Archive with empty lessons → inline error from `error.message`. Viewer → static badge. Runtime UNVERIFIED until that run.

## 11. Definition of done

- All §8 rows have an `it` or an explicit UNVERIFIED + how to confirm.
- Every §9 criterion executed; §10 commands exit as specified.
- No silent `catch`. No magic status strings outside `ProjectStatus`.
- Matches §4 prior art (`call`/`makeProject`/`sweep`, envelope, 409 message).
- PR 110 UI files untouched.
