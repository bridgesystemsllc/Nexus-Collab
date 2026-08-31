# Track A — Make the Tenant Boundary Real

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every org-scoped read and write resolve the *acting* organization, so a second paying customer cannot see the first one's data. Prerequisite for charging anyone who is not KarEve.

**Architecture:** `getActingOrgId(req)` already exists and reads only the session-derived member. This plan routes every implicit org lookup through it, scopes three cross-tenant email lookups, gives `Task` a real org column, and adds a CI guard so none of it regresses.

**Tech Stack:** Node 20 · Express 4 · Prisma 5 + Postgres · vitest 3

**Spec:** `docs/superpowers/specs/2026-08-30-subscriptions-phase0-plan.md` (Track A). Follows #104-#106.

## The property that makes this safe

Measured on the live database at `22edbbd`:

```
organizations: 1
distinct orgIds across members: 1
(SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1) = (SELECT DISTINCT "orgId" FROM "Member")  ->  true
```

**`organization.findFirst()` returns exactly the org every member already belongs to.** So replacing it with `getActingOrgId(req)` is a *no-op on this install* — same rows, same responses — while being correct the moment a second organization exists. This is a behaviour-preserving refactor today and a breach-prevention fix tomorrow.

Any change that alters a response on the current data is therefore a **bug in the change**, not an intended effect. That is the strongest test available and the plan leans on it.

## Global Constraints

- **`getActingOrgId(req)` is the only sanctioned way a handler learns the org.** It reads `req.member.orgId` and deliberately accepts nothing a client can influence. Reading an org from a body, param, query or header is a defect.
- **Fail closed.** No org on the request means 401, never "fall back to the first org".
- **No behaviour change on the current single-org install.** Every route touched must return byte-identical responses before and after.
- **Typecheck gate is zero errors.** Baseline at `22edbbd`: `apps/api` tsc = 0, `npx vitest run` = 651 in api / 97 in web, integration 25.
- No `pnpm db:push` except where a step explicitly says so, and **never** `--accept-data-loss` or `--force-reset` without asking.
- Every task group is its own branch off `main`; `git fetch` first — the Replit Agent pushes to `main`.

---

## PR A1 — `feat/tenancy-scoping`

### Task 1: Sweep the implicit org lookups

**Files (11 call sites across 7 files):**

| File | Lines |
|---|---|
| `apps/api/src/routes/products.ts` | 30, 74, 120 |
| `apps/api/src/routes/members.ts` | 63, 198 |
| `apps/api/src/routes/brandTransition.ts` | 103, 301 |
| `apps/api/src/routes/documents.ts` | 57 |
| `apps/api/src/routes/cowork.ts` | 606 |
| `apps/api/src/routes/onboarding.ts` | 193 |
| `apps/api/src/services/inventoryImport/feedConfig.ts` | 125 |

Each currently reads:
```ts
const org = await prisma.organization.findFirst()
```
and then uses `org.id` (or `org` itself) to scope a query. Replace with:
```ts
const orgId = getActingOrgId(req)
```
importing from `../middleware/billingContext`.

**Two call sites need different treatment:**

- `routes/onboarding.ts:193` uses `findFirst({ ... })` **with arguments** — read it before changing anything. Onboarding may legitimately run before a member has an org. If the handler is genuinely pre-membership, `getActingOrgId` will throw; that is the wrong tool. Leave it, and record why in the report.
- `services/inventoryImport/feedConfig.ts:125` is **not a request handler** — it runs from the email-agent worker, which has no `req`. It must take an `orgId` parameter from its caller instead. Trace the call chain and thread the org through; if the worker genuinely has no org context, that is a finding to report, not a thing to paper over with `findFirst`.

- [ ] **Step 1: Capture the before-state, so "no behaviour change" is checkable**

```bash
cd ~/Nexus-Collab && set -a && source .env && set +a
curl -s -c /tmp/tj -o /dev/null localhost:3000/api/dev-login
for p in /api/v1/products /api/v1/members /api/v1/documents; do
  echo "== $p"; curl -s -b /tmp/tj "localhost:3000$p" | head -c 400; echo
done > /tmp/before.txt 2>&1
wc -l /tmp/before.txt
```
Keep `/tmp/before.txt`. Step 4 diffs against it.

- [ ] **Step 2: Make the change, one file at a time**, running `npx tsc --noEmit -p tsconfig.json` after each so a mistake is attributed to the file that caused it.

- [ ] **Step 3: Run the suites**

`cd apps/api && npx vitest run` — expect 651, nothing newly failing.

- [ ] **Step 4: Prove no behaviour changed**

Restart the API against the branch, re-run the Step-1 capture into `/tmp/after.txt`, and `diff /tmp/before.txt /tmp/after.txt`. **Expected: empty.** A non-empty diff means the change altered behaviour on single-org data, which it must not.

- [ ] **Step 5: Commit** — `fix(tenancy): resolve the acting org from the session, not the oldest row`

---

### Task 2: Scope the cross-tenant email lookups

**Files:** `apps/api/src/services/users/userService.ts` (`classifyEmail`, ~line 103), `apps/api/src/services/users/meService.ts:338`, `apps/api/src/services/emailAgent/processor.ts:184`

**`classifyEmail` is the highest-exposure item in this plan.** It searches `Member` *and* `UserInvitation` with no org scope, and `inviteUser` acts on the result:

- Org A has a pending invite for `ahmad@x.com`. Org B's admin invites the same address. `classifyEmail` returns Org A's invitation, and `userService` **revokes Org A's outstanding invite token**. One customer silently cancels another customer's invitation.
- Org A has a deactivated member of that address. Org B's admin gets a `DUPLICATE_EMAIL` error whose payload carries Org A's employee **name** and **member id**, plus a "reactivate" affordance pointing at them.

- [ ] **Step 1: Write failing tests** in `apps/api/src/services/users/classifyEmail.test.ts` — a fake prisma holding a member and an invitation in org A; `classifyEmail(prisma, 'x@y.com', 'org_B')` must return `{ kind: 'new' }`, and must not see either row. Add a same-org test proving it still detects a genuine duplicate.
- [ ] **Step 2:** run, confirm they fail.
- [ ] **Step 3:** add an `orgId` parameter to `classifyEmail` and scope both queries. Update `inviteUser` and every other caller.
- [ ] **Step 4:** same for `meService.ts:338` (email-change availability — currently fail-closed so no breach, but it falsely refuses an address another org holds) and `processor.ts:184` (inbound mail resolves a member by email across all orgs, granting that identity to the agent — scope it to the feed's org, or report if the worker has no org context).
- [ ] **Step 5:** full suite + tsc, then commit — `fix(tenancy): scope member and invitation lookups to the acting org`

---

### Task 3: A guard so this cannot regress

**File:** `scripts/tenancy-audit.mjs`

Greps `apps/api/src` for the patterns this PR removes and exits non-zero on any hit:
- `organization.findFirst(` outside `*.test.ts` and outside `auth/session.ts`'s doc comment
- `member.findFirst(` / `member.findUnique(` whose `where` mentions `email` without `orgId` in the same object literal

A regex guard is crude and will need an allowlist; that is fine. The point is that the next person who reaches for `findFirst()` gets told, rather than shipping it and finding out from a customer.

Wire it into `package.json` as `"tenancy:audit"`, and into CI beside the existing typecheck step if one exists.

- [ ] Write it, prove it fails on `main` (which still has the 11 call sites) and passes on this branch, then commit — `chore(tenancy): fail the build on an unscoped org or member lookup`

---

## PR A2 — `feat/task-org-scope`

### Task 4: Give `Task` a real org column

`Task` has `projectId` (nullable) and `departmentId`; both `Project` and `Department` carry `orgId`, so a task's org is reachable transitively but not queryable or indexable. Every task list is therefore either an unscoped read or a join away from one.

Measured backfill reachability: **107 via project, 1 via department, 0 orphaned.**

- [ ] **Step 1:** add to `model Task` in `packages/prisma/prisma/schema.prisma`:
```prisma
  orgId        String
  org          Organization  @relation(fields: [orgId], references: [id])
```
plus `@@index([orgId])`, and the `tasks Task[]` back-relation on `Organization`.

**Add it nullable first** (`String?`), push, backfill, then tighten to required in a second push. A required column on a table with existing rows fails outright.

- [ ] **Step 2: backfill**
```sql
UPDATE "Task" t SET "orgId" = p."orgId" FROM "Project" p WHERE t."projectId" = p.id AND t."orgId" IS NULL;
UPDATE "Task" t SET "orgId" = d."orgId" FROM "Department" d WHERE t."departmentId" = d.id AND t."orgId" IS NULL;
SELECT count(*) FROM "Task" WHERE "orgId" IS NULL;  -- must be 0 before tightening
```
- [ ] **Step 3:** tighten to `String`, `pnpm db:push && pnpm db:generate`. If `db:push` warns about data loss, **stop and report** — this migration adds a column and must never need `--accept-data-loss`.
- [ ] **Step 4:** scope the task-list queries in `routes/tasks.ts` and `routes/projectTasks.ts` by `getActingOrgId(req)`, with the same before/after response diff as Task 1.
- [ ] **Step 5:** commit — `feat(tenancy): scope tasks to an organization`

---

## Exit criteria

- [ ] `grep -rn "organization.findFirst" apps/api/src --include='*.ts' | grep -v test` returns only documented exceptions.
- [ ] `pnpm tenancy:audit` passes on the branch and fails on `main`.
- [ ] Every `Task` row has an `orgId`; the column is `NOT NULL`.
- [ ] Before/after response diffs are **empty** for every touched route on single-org data.
- [ ] `apps/api` tsc zero errors; unit suite ≥651; integration 25; `pnpm --filter @nexus/web build` green.
- [ ] `classifyEmail` cannot see another org's member or invitation — proven by test, not by inspection.
