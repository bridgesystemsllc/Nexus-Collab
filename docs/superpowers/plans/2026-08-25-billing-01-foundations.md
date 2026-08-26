# Nexus Billing — Phase 1: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Nexus a real organization identity at login, a database-driven tier catalogue, and a single pure server-side entitlement resolver — the foundation every later billing phase depends on, none of which needs Stripe credentials.

**Architecture:** Login resolves an `Organization` from the Entra tenant id rather than "the first row in the table". Tier configuration lives in Postgres, seeded idempotently at boot from one shared data file. A pure `resolve()` function turns a subscription snapshot into an `Entitlements` object; everything above it (cache, middleware, routes) is thin wrapping around that one testable function.

**Tech Stack:** Node 20 · Express 4 · Prisma 5 + Postgres · Redis (optional, ioredis) · vitest 3 · Zod 3

**Spec:** `docs/superpowers/plans/2026-08-25-billing-00-master.md` — read its Spec Deltas and Global Constraints before starting. The original build prompt is amended by that document, not replaced by it.

## Global Constraints

Inherited verbatim from the master plan's Global Constraints section. The ones this phase touches most:

- Express 4, not Fastify. Guards are `RequestHandler`s composed like `requirePermission()`.
- **No `prisma migrate`.** Schema changes go in `schema.prisma` + `pnpm db:push`. Raw SQL invariants live in `ensureBillingSeeded()`.
- Repo naming: PascalCase models, camelCase fields, `orgId` / `org`, no `@@map`.
- `orgId` comes from `req.member.orgId` via `getActingOrgId(req)`. **Never** from a body, param, or query.
- Money is integer cents. Never floats.
- `maxSeats: null` means unlimited. Always go through `exceedsSeatCeiling()`.
- Fail closed on every error path.
- Errors use `sendError(res, CODE, message, extra)` from `middleware/requirePermission.ts`.
- Audit appends run inside the caller's transaction and may fail the mutation.
- Every task group is its own branch off `main`, its own PR. `git fetch` first — the Replit Agent pushes to `main`.

**Baseline check before starting anything:**

```bash
cd ~/Nexus-Collab && git fetch origin && git status
pnpm --filter @nexus/api test 2>&1 | tail -20      # record the passing count
pnpm --filter @nexus/api build 2>&1 | tail -30     # record the PRE-EXISTING failures
```

**Measured on this branch at `c295960` (2026-08-25):** `npx tsc --noEmit -p tsconfig.json` in `apps/api` = **0 errors**; `pnpm --filter @nexus/api build` = **0 errors**; `npx vitest run` = **572 passed / 32 files**. PR #101 ("make the pipeline green — 45 typecheck errors, all real") cleared the ioredis / `brandTransition.ts` / `cowork.ts` failures an earlier note recorded, so **the gate is zero errors with no filtering** — any error from here is ours. `pnpm --filter @nexus/web build` must also stay green.

---

## File Structure

| File | Created / Modified | Responsibility |
|---|---|---|
| `apps/api/src/middleware/billingContext.ts` | Create | `getActingOrgId(req)` — the only sanctioned way a handler learns the acting org |
| `apps/api/src/middleware/billingContext.test.ts` | Create | Its tests |
| `apps/api/src/lib/microsoftGraph.ts` | Modify | Widen `MsTokenResponse` with `id_token`; add pure `tenantIdFromIdToken()`; multi-tenant authority |
| `apps/api/src/lib/microsoftGraph.test.ts` | Create | Tests for the pure decoder |
| `apps/api/src/auth/session.ts` | Modify | `upsertMemberFromMicrosoft` resolves org by Entra tid; `findFirst()` deleted |
| `apps/api/src/routes/microsoftGraph.ts` | Modify | Pass the token response through to the upsert |
| `packages/shared/src/billing/types.ts` | Create | The shared vocabulary |
| `packages/shared/src/billing/tiers.ts` | Create | Tier catalogue as data (seed + boot ensure read the same copy) |
| `packages/shared/src/billing/seats.ts` | Create | `exceedsSeatCeiling`, `seatsAvailable` — pure |
| `packages/shared/src/billing/seats.test.ts` | Create | Its tests, including the `null` ceiling |
| `packages/shared/src/index.ts` | Modify | Re-export the billing barrel |
| `packages/shared/src/rbac/catalogue.ts` | Modify | Add `billing:read` |
| `packages/prisma/prisma/schema.prisma` | Modify | 7 new models + `AuditLog.orgId` + `Organization.entraTenantId` + `Member` unique change |
| `apps/api/src/services/billing/bootstrap.ts` | Create | `ensureBillingSeeded` — tiers, partial unique index, seat trigger |
| `apps/api/src/services/billing/bootstrap.integration.test.ts` | Create | Live-DB test that the trigger actually refuses overselling |
| `apps/api/src/services/billing/catalogue.ts` | Create | DB-driven tier reads, memoised |
| `apps/api/src/services/billing/resolve.ts` | Create | **Pure.** The status→access matrix |
| `apps/api/src/services/billing/resolve.test.ts` | Create | Exhaustive matrix coverage |
| `apps/api/src/services/billing/entitlementCache.ts` | Create | Redis 60s TTL + in-process fallback |
| `apps/api/src/services/billing/entitlementCache.test.ts` | Create | Its tests |
| `apps/api/src/services/billing/entitlements.ts` | Create | `resolveEntitlements(orgId)` |
| `apps/api/src/services/billing/billingAudit.ts` | Create | Billing action vocabulary over `auditService.append` |
| `apps/api/src/middleware/requireEntitlement.ts` | Create | `requireFeature`, `requireSeatAvailable`, `requireWriteAccess` |
| `apps/api/src/middleware/requireEntitlement.test.ts` | Create | Its tests |
| `apps/api/src/routes/billing.ts` | Create | `GET /entitlements` only in this phase |
| `apps/api/src/index.ts` | Modify | Mount `/billing`; call `ensureBillingSeeded` in `start()` |
| `apps/api/src/services/users/auditService.ts` | Modify | Add billing actions and entity types to the unions |

---

# PR B1 — `feat/billing-tenancy`

**Why this is first:** every billing row is scoped by org, and today the org is "whichever row was created first". Building billing on top of that would bake the bug in permanently.

```bash
cd ~/Nexus-Collab && git fetch origin && git checkout -b feat/billing-tenancy origin/main
```

---

### Task 1: `getActingOrgId` — the single sanctioned org lookup

**Files:**
- Create: `apps/api/src/middleware/billingContext.ts`
- Test: `apps/api/src/middleware/billingContext.test.ts`

**Interfaces:**
- Consumes: `req.member` as attached by `attachMember` in `apps/api/src/auth/session.ts`.
- Produces: `getActingOrgId(req: Request): string` and `class NoActingOrgError extends Error`. Every billing route in PR B8 calls this and nothing else.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/middleware/billingContext.test.ts
import { describe, it, expect } from 'vitest'
import { getActingOrgId, NoActingOrgError } from './billingContext'

// The whole point of this helper is that there is exactly one way to learn the
// acting org, and it is not the request body. A route that reads an org id a
// client supplied is a cross-tenant read waiting to happen, so the tests below
// assert the helper ignores every client-controllable surface.

const req = (over: Record<string, unknown> = {}) => ({ body: {}, params: {}, query: {}, ...over }) as any

describe('getActingOrgId', () => {
  it('returns the org of the attached member', () => {
    expect(getActingOrgId(req({ member: { id: 'm1', orgId: 'org_A' } }))).toBe('org_A')
  })

  it('throws when no member is attached', () => {
    expect(() => getActingOrgId(req())).toThrow(NoActingOrgError)
  })

  it('throws when the attached member has no org', () => {
    expect(() => getActingOrgId(req({ member: { id: 'm1' } }))).toThrow(NoActingOrgError)
  })

  it('ignores an orgId in the body', () => {
    const r = req({ member: { id: 'm1', orgId: 'org_A' }, body: { orgId: 'org_B' } })
    expect(getActingOrgId(r)).toBe('org_A')
  })

  it('ignores an orgId in params and query', () => {
    const r = req({
      member: { id: 'm1', orgId: 'org_A' },
      params: { orgId: 'org_B' },
      query: { orgId: 'org_C' },
    })
    expect(getActingOrgId(r)).toBe('org_A')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/middleware/billingContext.test.ts`
Expected: FAIL — `Failed to resolve import "./billingContext"`

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/middleware/billingContext.ts
import type { Request, Response, NextFunction } from 'express'
import { sendError } from './requirePermission'

// ─── Acting organization ─────────────────────────────────────
// Billing is the one module where a cross-tenant read is a financial event,
// not just a privacy one. So there is exactly one way to learn which org is
// acting, it reads the session-derived member, and it deliberately takes no
// argument a client could influence.
//
// Note what is NOT here: no orgId parameter, no override, no "for support
// purposes" hatch. A support tool that needs to act as another org gets its
// own audited path; it does not get to pass a string into this.

export class NoActingOrgError extends Error {
  constructor(message = 'NO_ACTING_ORG') {
    super(message)
    this.name = 'NoActingOrgError'
  }
}

export function getActingOrgId(req: Request): string {
  const orgId = (req as any).member?.orgId
  if (typeof orgId !== 'string' || orgId.length === 0) throw new NoActingOrgError()
  return orgId
}

/**
 * Turn a NoActingOrgError into the module's 401 rather than a 500.
 *
 * Mount this AFTER the billing router so a helper that throws deep in a
 * handler still produces the standard envelope.
 */
export function billingContextErrors(
  err: unknown, _req: Request, res: Response, next: NextFunction,
): void {
  if (err instanceof NoActingOrgError) {
    sendError(res, 'UNAUTHENTICATED', 'Sign in to continue.')
    return
  }
  next(err)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/middleware/billingContext.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/middleware/billingContext.ts apps/api/src/middleware/billingContext.test.ts
git commit -m "feat(billing): add getActingOrgId, the single sanctioned org lookup"
```

---

### Task 2: Read the Entra tenant id from the login token

**Files:**
- Modify: `apps/api/src/lib/microsoftGraph.ts:107-112` (`MsTokenResponse`) and add the decoder near it
- Test: `apps/api/src/lib/microsoftGraph.test.ts`

**Interfaces:**
- Consumes: `exchangeCode()`'s return value, which already requests the `openid` scope (`MS_SCOPES`, `microsoftGraph.ts:24`) and therefore already receives an `id_token` — the type just never declared it.
- Produces: `tenantIdFromIdToken(idToken: string | undefined): string | null`, and `MsTokenResponse.id_token?: string`. Task 4 consumes both.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/microsoftGraph.test.ts
import { describe, it, expect } from 'vitest'
import { tenantIdFromIdToken } from './microsoftGraph'

// Builds a JWT-shaped string. The signature is garbage on purpose: this
// decoder must never be mistaken for a verifier, and a test that fed it a
// real signature would imply otherwise.
function idToken(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.not-a-signature`
}

describe('tenantIdFromIdToken', () => {
  it('reads the tid claim', () => {
    expect(tenantIdFromIdToken(idToken({ tid: 'f8c0-tenant', oid: 'user-1' })))
      .toBe('f8c0-tenant')
  })

  it('returns null when the token is absent', () => {
    expect(tenantIdFromIdToken(undefined)).toBeNull()
  })

  it('returns null when there is no tid claim', () => {
    expect(tenantIdFromIdToken(idToken({ oid: 'user-1' }))).toBeNull()
  })

  it('returns null for an empty tid rather than an empty-string org key', () => {
    expect(tenantIdFromIdToken(idToken({ tid: '' }))).toBeNull()
  })

  it('returns null when tid is not a string', () => {
    expect(tenantIdFromIdToken(idToken({ tid: 42 }))).toBeNull()
  })

  it('returns null for a malformed token instead of throwing', () => {
    // A throw here would turn a bad token into a 500 during login.
    expect(tenantIdFromIdToken('not.a.jwt')).toBeNull()
    expect(tenantIdFromIdToken('only-one-segment')).toBeNull()
    expect(tenantIdFromIdToken('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/lib/microsoftGraph.test.ts`
Expected: FAIL — `tenantIdFromIdToken is not a function`

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/lib/microsoftGraph.ts`, widen the interface at line ~107:

```ts
interface MsTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  /// Present because MS_SCOPES requests `openid`. Never declared before this
  /// because nothing read it.
  id_token?: string
}
```

And add, directly below `tokenRequest`:

```ts
// ─── Tenant identity ─────────────────────────────────────────
// The org a person belongs to is their Entra tenant, and the tenant id rides
// in the `tid` claim of the id_token. Graph /me does not return it, so this is
// the only place it is available without a second network call.
//
// This DECODES, it does not VERIFY. That is sound here and nowhere else: the
// token came back on the TLS response to our own client-secret-authenticated
// code exchange, so there is no untrusted party between Microsoft and this
// line. Never call this on a token that arrived from a browser.
export function tenantIdFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const tid = claims?.tid
    return typeof tid === 'string' && tid.length > 0 ? tid : null
  } catch {
    // A malformed token must degrade to "unknown tenant", never to a 500 in
    // the middle of somebody's login.
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/lib/microsoftGraph.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 5: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/lib/microsoftGraph.ts apps/api/src/lib/microsoftGraph.test.ts
git commit -m "feat(auth): read the Entra tenant id from the login id_token"
```

---

### Task 3: `Organization.entraTenantId` + per-org email uniqueness in the schema

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma` — `model Organization` (line 11), `model Member` (line 77)

**Interfaces:**
- Produces: `Organization.entraTenantId String? @unique` and `@@unique([orgId, email])` on `Member`. Task 4 queries the former; Task 5 guards the latter.

- [ ] **Step 1: Check the current drift baseline**

Run:
```bash
cd ~/Nexus-Collab/packages/prisma && npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script | head -40
```
Expected: only the known pre-existing `TransitionSku` drift. Write down what it prints — anything new after the edits below is yours.

- [ ] **Step 2: Edit `model Organization`**

Add to `model Organization` (after `slug`):

```prisma
  /// The Entra (Azure AD) tenant this organization signs in from. This is the
  /// org key at login — it replaces picking the oldest Organization row, which
  /// silently put every new customer into the first workspace ever created.
  /// Nullable because the founding workspace predates it and is backfilled by
  /// ensureOrgTenantBackfill().
  entraTenantId      String?              @unique
```

**Do not add the billing back-relations here.** `BillingSubscription`, `SeatAssignment`, `BillingPaymentMethod` and `BillingInvoice` do not exist until Task 7, and `prisma validate` in Step 4 fails on a relation to a model that is not defined. Task 7 adds them alongside the models themselves.

- [ ] **Step 3: Edit `model Member`**

Change `email` at line ~80 from:

```prisma
  email            String               @unique
```

to:

```prisma
  /// Unique WITHIN an organization, not globally. Two customers may each
  /// employ an ahmad@example.com and neither can be told the other exists.
  /// Case-insensitivity is still carried by every write normalising through
  /// normaliseEmail() — Prisma 5 cannot express a functional unique index.
  email            String
```

Add to the `@@index` block at the end of the model:

```prisma
  @@unique([orgId, email])
```

The `SeatAssignment` back-relations on `Member` belong to Task 7 for the same reason as the `Organization` ones: the model does not exist yet.

- [ ] **Step 4: Verify the schema parses and shows only the intended change**

Run:
```bash
cd ~/Nexus-Collab/packages/prisma && npx prisma validate && npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script
```
Expected: `The schema at prisma/schema.prisma is valid`, and a diff containing `DROP INDEX "Member_email_key"`, `CREATE UNIQUE INDEX "Member_orgId_email_key"`, `ALTER TABLE "Organization" ADD COLUMN "entraTenantId"`, plus the known `TransitionSku` drift and nothing else.

**Do not push yet** — Task 5's collision guard must exist first, or `db push` fails on a real duplicate.

- [ ] **Step 5: Commit**

```bash
cd ~/Nexus-Collab
git add packages/prisma/prisma/schema.prisma
git commit -m "feat(tenancy): org keyed by Entra tenant, member email unique per org"
```

---

### Task 4: Resolve the org at login instead of `findFirst()`

**Files:**
- Modify: `apps/api/src/auth/session.ts:60-105` (`upsertMemberFromMicrosoft`)
- Modify: `apps/api/src/routes/microsoftGraph.ts:132-137` (pass the token through)
- Test: `apps/api/src/auth/orgResolution.test.ts` (create)

**Interfaces:**
- Consumes: `tenantIdFromIdToken` (Task 2), `Organization.entraTenantId` (Task 3).
- Produces: `resolveOrgForLogin(prisma, { tenantId, email }): Promise<{ id: string } | null>` exported from `auth/session.ts`, and `upsertMemberFromMicrosoft(profile, tokens)` — note the **new second argument**. `routes/microsoftGraph.ts` is the only caller.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/auth/orgResolution.test.ts
import { describe, it, expect, vi } from 'vitest'
import { resolveOrgForLogin } from './session'

// The bug this replaces: organization.findFirst({ orderBy: { createdAt: 'asc' } }).
// Every person who ever signed in landed in the oldest workspace, whoever they
// worked for. These tests exist to make that behaviour unreachable.

function fakePrisma(orgs: Array<{ id: string; entraTenantId: string | null }>) {
  return {
    organization: {
      findUnique: vi.fn(async ({ where }: any) =>
        orgs.find((o) => o.entraTenantId === where.entraTenantId) ?? null),
      findFirst: vi.fn(async () => orgs[0] ?? null),
    },
  } as any
}

describe('resolveOrgForLogin', () => {
  it('matches the org registered to the Entra tenant', async () => {
    const prisma = fakePrisma([
      { id: 'org_old', entraTenantId: 'tenant-1' },
      { id: 'org_new', entraTenantId: 'tenant-2' },
    ])
    const org = await resolveOrgForLogin(prisma, { tenantId: 'tenant-2', email: 'a@b.com' })
    expect(org?.id).toBe('org_new')
  })

  it('returns null for an unregistered tenant rather than the oldest org', async () => {
    // The old code returned org_old here. That is the whole defect.
    const prisma = fakePrisma([{ id: 'org_old', entraTenantId: 'tenant-1' }])
    const org = await resolveOrgForLogin(prisma, { tenantId: 'tenant-999', email: 'a@b.com' })
    expect(org).toBeNull()
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
  })

  it('returns null when the token carried no tenant id', async () => {
    const prisma = fakePrisma([{ id: 'org_old', entraTenantId: 'tenant-1' }])
    expect(await resolveOrgForLogin(prisma, { tenantId: null, email: 'a@b.com' })).toBeNull()
  })

  it('never falls back to findFirst even when exactly one org exists', async () => {
    // A single-org install is the tempting case to special-case. Doing so is
    // how the defect comes back the day a second customer is created.
    const prisma = fakePrisma([{ id: 'only', entraTenantId: null }])
    expect(await resolveOrgForLogin(prisma, { tenantId: 'tenant-1', email: 'a@b.com' })).toBeNull()
    expect(prisma.organization.findFirst).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/auth/orgResolution.test.ts`
Expected: FAIL — `resolveOrgForLogin is not a function`

- [ ] **Step 3: Write the implementation**

In `apps/api/src/auth/session.ts`, add the import and the resolver, then rewrite the upsert:

```ts
import { tenantIdFromIdToken } from '../lib/microsoftGraph'

/// Thrown when a valid Microsoft identity belongs to a tenant no Organization
/// claims. Distinguished from a generic failure so the callback can send the
/// person somewhere useful rather than to a blank error page.
export class UnknownTenantError extends Error {
  constructor(public readonly tenantId: string | null) {
    super('UNKNOWN_TENANT')
    this.name = 'UnknownTenantError'
  }
}

/**
 * Which Organization is this person signing in to?
 *
 * Exactly one answer: the org registered to their Entra tenant. There is no
 * fallback. The previous implementation answered `findFirst({ orderBy:
 * { createdAt: 'asc' } })`, which put every user of every customer into the
 * oldest workspace — invisible while Nexus had one customer, a cross-tenant
 * data breach the moment it had two.
 */
export async function resolveOrgForLogin(
  db: { organization: { findUnique: (a: any) => Promise<{ id: string } | null> } },
  { tenantId }: { tenantId: string | null; email: string },
): Promise<{ id: string } | null> {
  if (!tenantId) return null
  return db.organization.findUnique({ where: { entraTenantId: tenantId } })
}
```

Then replace the org lookup inside `upsertMemberFromMicrosoft`. The signature gains a second parameter, and the email lookups become org-scoped:

```ts
export async function upsertMemberFromMicrosoft(
  profile: MsProfile,
  tokens: { id_token?: string },
) {
  const sub = profile.id
  if (!sub) throw new Error('Microsoft profile missing id')

  const email = normaliseEmail(
    profile.mail || profile.userPrincipalName || `${sub}@microsoft.user`,
  )
  const name = profile.displayName || email || 'Microsoft User'

  const bySub = await prisma.member.findUnique({ where: { clerkUserId: sub } }).catch(() => null)
  if (bySub) return bySub

  // The org must be settled BEFORE the email lookup: email is unique per org
  // now, so an unscoped search would adopt a member belonging to a different
  // customer who happens to share an address.
  const tenantId = tenantIdFromIdToken(tokens.id_token)
  const org = await resolveOrgForLogin(prisma, { tenantId, email })
  if (!org) throw new UnknownTenantError(tenantId)

  const byEmail = await prisma.member
    .findFirst({ where: { orgId: org.id, email: { equals: email, mode: 'insensitive' } } })
    .catch(() => null)
  if (byEmail) {
    return prisma.member.update({
      where: { id: byEmail.id },
      data: { clerkUserId: sub, ...(byEmail.email !== email ? { email } : {}) },
    })
  }

  const initials = name
    .split(/\s+/).map((p: string) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return prisma.member.create({
    data: { clerkUserId: sub, email, name, avatar: initials || null, role: 'MEMBER', orgId: org.id },
  })
}
```

- [ ] **Step 4: Update the only caller**

In `apps/api/src/routes/microsoftGraph.ts` at line ~137, pass the tokens through and handle the new error:

```ts
    const tokens = await exchangeCode(code, redirectUri)
    const profile = await fetchProfile(tokens.access_token)
    // ...
      let loggedInMember
      try {
        loggedInMember = await upsertMemberFromMicrosoft(profile, tokens)
      } catch (err) {
        if (err instanceof UnknownTenantError) {
          // A real identity from an organization Nexus does not know. This is
          // the normal path for someone whose company has not been onboarded,
          // so it gets its own reason rather than looking like a broken login.
          console.warn(`[auth] sign-in from unregistered tenant ${err.tenantId ?? '(none)'}`)
          return res.redirect('/?ms=error&reason=unknown_tenant')
        }
        throw err
      }
```

Add `UnknownTenantError` to the existing import from `'../auth/session'` at line 17.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/auth/orgResolution.test.ts`
Expected: PASS — 4 passed

Run: `cd ~/Nexus-Collab/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output. The baseline is zero errors, so anything printed here is yours.

- [ ] **Step 6: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/auth/session.ts apps/api/src/auth/orgResolution.test.ts apps/api/src/routes/microsoftGraph.ts
git commit -m "fix(tenancy): resolve the login org from the Entra tenant, never findFirst"
```

---

### Task 5: Backfill and collision guard, then push the schema

**Files:**
- Create: `apps/api/src/services/rbac/ensureOrgTenant.ts`
- Test: `apps/api/src/services/rbac/ensureOrgTenant.test.ts`
- Modify: `apps/api/src/index.ts` — call it in `start()` alongside `ensureEmailsNormalised`

**Interfaces:**
- Consumes: Task 3's schema fields.
- Produces: `ensureOrgTenantBackfill(prisma): Promise<BackfillResult>` and `findCrossOrgEmailCollisions(prisma): Promise<Collision[]>`.

**Why:** the founding KarEve workspace has `entraTenantId = null`, so after Task 4 nobody can sign in to it. And `db push` will fail outright if two members in the same org share an address. Both must be handled before the schema lands.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/rbac/ensureOrgTenant.test.ts
import { describe, it, expect, vi } from 'vitest'
import { planBackfill } from './ensureOrgTenant'

// planBackfill is the decision; ensureOrgTenantBackfill is the I/O around it.
// Splitting them is what makes "refuses to guess" testable without a database.

describe('planBackfill', () => {
  it('claims the configured tenant for a lone unclaimed org', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: null }], 'tenant-1'))
      .toEqual({ action: 'claim', orgId: 'org_a', tenantId: 'tenant-1' })
  })

  it('does nothing when the org already has a tenant', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: 'tenant-1' }], 'tenant-1'))
      .toEqual({ action: 'noop', reason: 'already-claimed' })
  })

  it('refuses rather than guessing when several orgs are unclaimed', () => {
    // Picking one here would recreate the exact defect Task 4 removed.
    expect(planBackfill(
      [{ id: 'org_a', entraTenantId: null }, { id: 'org_b', entraTenantId: null }], 'tenant-1',
    )).toEqual({ action: 'refuse', reason: 'ambiguous' })
  })

  it('does nothing when no tenant is configured', () => {
    expect(planBackfill([{ id: 'org_a', entraTenantId: null }], ''))
      .toEqual({ action: 'noop', reason: 'no-tenant-configured' })
  })

  it('does nothing when there are no orgs at all', () => {
    expect(planBackfill([], 'tenant-1')).toEqual({ action: 'noop', reason: 'no-orgs' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/rbac/ensureOrgTenant.test.ts`
Expected: FAIL — cannot resolve `./ensureOrgTenant`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/rbac/ensureOrgTenant.ts
import type { PrismaClient } from '@prisma/client'
import { getMsConfig } from '../../lib/microsoftGraph'

// ─── Organization ↔ Entra tenant backfill ────────────────────
// Sign-in now keys on Organization.entraTenantId. The founding workspace was
// created long before that column existed, so without this nobody can sign in
// to it the moment the new resolver ships.
//
// It claims a tenant only in the one case where the answer is not a guess: a
// single organization, a single configured tenant. Anything else refuses and
// says so, because a wrong claim here silently merges two customers.

export interface OrgRow { id: string; entraTenantId: string | null }

export type BackfillPlan =
  | { action: 'claim'; orgId: string; tenantId: string }
  | { action: 'noop'; reason: 'already-claimed' | 'no-tenant-configured' | 'no-orgs' }
  | { action: 'refuse'; reason: 'ambiguous' }

/** Pure. The whole decision, testable without a database. */
export function planBackfill(orgs: OrgRow[], configuredTenantId: string): BackfillPlan {
  if (orgs.length === 0) return { action: 'noop', reason: 'no-orgs' }
  if (!configuredTenantId) return { action: 'noop', reason: 'no-tenant-configured' }
  if (orgs.some((o) => o.entraTenantId === configuredTenantId)) {
    return { action: 'noop', reason: 'already-claimed' }
  }
  const unclaimed = orgs.filter((o) => o.entraTenantId === null)
  if (unclaimed.length !== 1) return { action: 'refuse', reason: 'ambiguous' }
  return { action: 'claim', orgId: unclaimed[0].id, tenantId: configuredTenantId }
}

export async function ensureOrgTenantBackfill(prisma: PrismaClient): Promise<BackfillPlan> {
  const orgs = await prisma.organization.findMany({ select: { id: true, entraTenantId: true } })
  const plan = planBackfill(orgs, getMsConfig().tenantId)
  if (plan.action === 'claim') {
    await prisma.organization.update({
      where: { id: plan.orgId },
      data: { entraTenantId: plan.tenantId },
    })
    console.log(`[tenancy] claimed Entra tenant ${plan.tenantId} for org ${plan.orgId}`)
  } else if (plan.action === 'refuse') {
    console.warn('[tenancy] several unclaimed organizations — set entraTenantId by hand')
  }
  return plan
}

export interface Collision { orgId: string; email: string; memberIds: string[] }

/**
 * Members sharing an address inside one org.
 *
 * `@@unique([orgId, email])` cannot be created while one exists, and `db push`
 * reports that as an opaque constraint failure. Running this first turns it
 * into a list of rows somebody can actually fix.
 */
export async function findCrossOrgEmailCollisions(prisma: PrismaClient): Promise<Collision[]> {
  const rows = await prisma.$queryRaw<Array<{ orgId: string; email: string; ids: string[] }>>`
    SELECT "orgId", lower("email") AS email, array_agg("id") AS ids
    FROM "Member" GROUP BY "orgId", lower("email") HAVING count(*) > 1
  `
  return rows.map((r) => ({ orgId: r.orgId, email: r.email, memberIds: r.ids }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/rbac/ensureOrgTenant.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Check for collisions on the live database, then push**

Run:
```bash
cd ~/Nexus-Collab && set -a && source .env && set +a && npx tsx -e '
const { PrismaClient } = require("@prisma/client")
const p = new PrismaClient()
p.$queryRaw`SELECT "orgId", lower(email) AS email, count(*) FROM "Member" GROUP BY 1,2 HAVING count(*) > 1`
 .then((r) => { console.log(r.length ? r : "no collisions"); return p.$disconnect() })
'
```
Expected: `no collisions`. **If it prints rows, stop and resolve them by hand** — merging member records is a data decision, not something this plan should automate.

Then:
```bash
cd ~/Nexus-Collab && pnpm db:push && pnpm db:generate
```
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Wire the backfill into boot**

In `apps/api/src/index.ts`, import it and call it in `start()` immediately after `ensureEmailsNormalised(prisma)`:

```ts
  // Sign-in keys on Organization.entraTenantId as of the tenancy change. The
  // founding workspace predates the column, so claim it once, and refuse
  // rather than guess if the answer is not unambiguous.
  await ensureOrgTenantBackfill(prisma)
```

- [ ] **Step 7: Verify the API still boots and login still works**

Run:
```bash
cd ~/Nexus-Collab && set -a && source .env && set +a && pnpm --filter @nexus/api dev &
sleep 6 && curl -s -c /tmp/jar -o /dev/null -w '%{http_code}\n' localhost:3000/api/dev-login
curl -s -b /tmp/jar localhost:3000/api/v1/auth/me
```
Expected: `302`, then a member JSON body with an `orgId`. Also expect `[tenancy] claimed Entra tenant ...` (or `no-tenant-configured` locally) in the boot log.

- [ ] **Step 8: Commit and open the PR**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/rbac/ensureOrgTenant.ts apps/api/src/services/rbac/ensureOrgTenant.test.ts apps/api/src/index.ts
git commit -m "feat(tenancy): backfill org tenant claim and guard email collisions"
git push -u origin feat/billing-tenancy
gh pr create --base main --title "feat(tenancy): resolve the login org from the Entra tenant" --body "$(cat <<'BODY'
Login resolved the organization with `organization.findFirst({ orderBy: { createdAt: 'asc' } })` — every user of every customer landed in the oldest workspace. Invisible with one customer; a cross-tenant breach with two.

- Org is now keyed on `Organization.entraTenantId`, read from the `tid` claim of the login `id_token`. No fallback: an unregistered tenant is refused, not guessed.
- `Member.email` is unique per org rather than globally, so two customers may each employ the same address.
- `ensureOrgTenantBackfill` claims the founding workspace's tenant once, and refuses when the answer is ambiguous.
- `getActingOrgId(req)` is now the only sanctioned way a handler learns the acting org.

**Known limitation, deliberately out of scope.** This fixes org *identity*. It does not sweep the ~40 existing route files that still read org implicitly, and it does not change the Entra authority URL, which is still pinned to a single configured `AZURE_TENANT_ID` — so a second organization cannot actually sign in yet. Onboarding a second customer is unsafe until that follow-on PR set lands; the inventory ships in `docs/billing.md` §Tenancy in phase 7.

Plan: `docs/superpowers/plans/2026-08-25-billing-01-foundations.md`
BODY
)"
```

---

# PR B2 — `feat/billing-schema`

```bash
cd ~/Nexus-Collab && git fetch origin && git checkout -b feat/billing-schema origin/main
```

**Note:** based on `main`, not on `feat/billing-tenancy`. If B1 has not merged, the `Organization` back-relations in Task 7 will conflict — resolve by taking both sides.

---

### Task 6: The shared billing vocabulary and tier data

**Files:**
- Create: `packages/shared/src/billing/types.ts`, `packages/shared/src/billing/tiers.ts`, `packages/shared/src/billing/seats.ts`
- Test: `packages/shared/src/billing/seats.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: every type in the master plan's Interfaces section, plus `TIER_CATALOGUE: TierSpec[]`, `exceedsSeatCeiling(seats, maxSeats)`, `seatsAvailable(purchased, consumed)`. Tasks 8, 9, 10 and every UI task consume these.

**Why one file for the catalogue:** exactly the reasoning in `packages/shared/src/rbac/catalogue.ts` — the seed script, the boot-time ensure, and the UI all need the tier list, and a second copy is how a tier means $59 in one place and $99 in another.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/billing/seats.test.ts
import { describe, it, expect } from 'vitest'
import { exceedsSeatCeiling, seatsAvailable } from './seats'
import { TIER_CATALOGUE } from './tiers'

// Edge case 14 in the spec: Enterprise has no seat ceiling, expressed as null.
// A bare `seats > tier.maxSeats` is `false` for null, which reads as "no
// ceiling" by accident and as "ceiling of zero" if anyone ever coerces it.
// These tests exist so nobody writes that comparison inline.

describe('exceedsSeatCeiling', () => {
  it('is false below the ceiling', () => expect(exceedsSeatCeiling(14, 15)).toBe(false))
  it('is false exactly at the ceiling', () => expect(exceedsSeatCeiling(15, 15)).toBe(false))
  it('is true above the ceiling', () => expect(exceedsSeatCeiling(16, 15)).toBe(true))

  it('is never true when the ceiling is null (unlimited)', () => {
    expect(exceedsSeatCeiling(1, null)).toBe(false)
    expect(exceedsSeatCeiling(1_000_000, null)).toBe(false)
  })
})

describe('seatsAvailable', () => {
  it('is the difference', () => expect(seatsAvailable(15, 12)).toBe(3))
  it('is zero when full', () => expect(seatsAvailable(15, 15)).toBe(0))

  it('clamps at zero when oversold', () => {
    // Should be unreachable — the DB trigger forbids it — but a negative
    // "available" would render as "-2 seats available" in the UI, and a bug
    // that shows a wrong number is worse than one that shows none.
    expect(seatsAvailable(15, 17)).toBe(0)
  })
})

describe('TIER_CATALOGUE', () => {
  it('has the four tiers in rank order', () => {
    expect(TIER_CATALOGUE.map((t) => t.key))
      .toEqual(['starter', 'growth', 'professional', 'enterprise'])
    expect(TIER_CATALOGUE.map((t) => t.rank)).toEqual([...TIER_CATALOGUE.map((t) => t.rank)].sort((a, b) => a - b))
  })

  it('prices the annual plan at ten months, matching the "save ~17%" claim', () => {
    for (const t of TIER_CATALOGUE.filter((t) => !t.isCustomQuote)) {
      expect(t.unitAmountAnnualCents).toBe(t.unitAmountMonthlyCents * 10)
    }
  })

  it('gives every non-quote tier a seat ceiling above its floor', () => {
    for (const t of TIER_CATALOGUE) {
      expect(t.minSeats).toBeGreaterThan(0)
      if (t.maxSeats !== null) expect(t.maxSeats).toBeGreaterThanOrEqual(t.minSeats)
    }
  })

  it('makes each tier a superset of the one below it', () => {
    // The comparison table in the Plans screen renders as a ladder. A tier
    // that dropped a feature the tier below it has would render as a downgrade
    // dressed as an upgrade.
    for (let i = 1; i < TIER_CATALOGUE.length; i++) {
      const lower = TIER_CATALOGUE[i - 1].features.filter((f) => f.isEnabled).map((f) => f.featureKey)
      const upper = new Set(TIER_CATALOGUE[i].features.filter((f) => f.isEnabled).map((f) => f.featureKey))
      for (const key of lower) expect(upper.has(key)).toBe(true)
    }
  })

  it('marks only Enterprise as quote-driven, with no ceiling', () => {
    const quoted = TIER_CATALOGUE.filter((t) => t.isCustomQuote)
    expect(quoted.map((t) => t.key)).toEqual(['enterprise'])
    expect(quoted[0].maxSeats).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/packages/shared && npx vitest run src/billing/seats.test.ts`
Expected: FAIL — cannot resolve `./seats`

- [ ] **Step 3: Write `types.ts`**

Copy the full `types.ts` block from the master plan's **Interfaces** section verbatim into `packages/shared/src/billing/types.ts`, then append:

```ts
export interface TierFeatureSpec {
  featureKey: FeatureKey
  isEnabled: boolean
  /// null means "enabled, no numeric cap". Only meaningful when isEnabled.
  limitValue: number | null
}

export interface TierSpec {
  key: TierKey
  displayName: string
  description: string
  sortOrder: number
  /// Lower is cheaper. This — not sortOrder — is what makes a change an
  /// upgrade or a downgrade, and sortOrder is presentation only.
  rank: number
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  /// null means unlimited. Always compare through exceedsSeatCeiling().
  maxSeats: number | null
  isCustomQuote: boolean
  features: TierFeatureSpec[]
}
```

- [ ] **Step 4: Write `seats.ts`**

```ts
// packages/shared/src/billing/seats.ts

/**
 * Would `seats` exceed the tier's ceiling?
 *
 * The only sanctioned way to ask. A bare `seats > maxSeats` is `false` when
 * maxSeats is null, which happens to be right for Enterprise and is right by
 * accident — the moment someone writes `maxSeats ?? 0` nearby it becomes a
 * ceiling of zero and Enterprise can hold no users at all.
 */
export function exceedsSeatCeiling(seats: number, maxSeats: number | null): boolean {
  if (maxSeats === null) return false
  return seats > maxSeats
}

/** Purchased minus consumed, never negative. */
export function seatsAvailable(purchased: number, consumed: number): number {
  return Math.max(0, purchased - consumed)
}
```

- [ ] **Step 5: Write `tiers.ts`**

```ts
// packages/shared/src/billing/tiers.ts
import type { TierSpec } from './types'

// ─── The tier catalogue ──────────────────────────────────────
// The four plans as data. This is the seed source AND what
// ensureBillingSeeded() reconciles against — same reasoning as
// rbac/catalogue.ts: three consumers, one copy, or they drift.
//
// The DB rows are authoritative at runtime (an admin may edit a price without
// a deploy). This file is what a brand new database is filled with, and what
// a missing tier is restored from.
//
// stripePriceId* are deliberately absent: they are environment-specific, set
// per install once the Stripe products exist, and a value committed here would
// be a test-mode id charging a production customer.

import type { FeatureKey, TierFeatureSpec } from './types'

const f = (featureKey: FeatureKey, limitValue: number | null = null): TierFeatureSpec =>
  ({ featureKey, isEnabled: true, limitValue })

export const TIER_CATALOGUE: TierSpec[] = [
  {
    key: 'starter',
    displayName: 'Starter',
    description: 'Core Projects & Initiatives, 5 active briefs, basic reporting',
    sortOrder: 10, rank: 10,
    unitAmountMonthlyCents: 2_900, unitAmountAnnualCents: 29_000,
    minSeats: 3, maxSeats: 15, isCustomQuote: false,
    features: [f('projects_core'), f('reporting_basic'), f('active_briefs', 5)],
  },
  {
    key: 'growth',
    displayName: 'Growth',
    description: 'Everything in Starter, plus NPD stage-gate, Artwork Tracker, Component Sourcing and read-only API',
    sortOrder: 20, rank: 20,
    unitAmountMonthlyCents: 5_900, unitAmountAnnualCents: 59_000,
    minSeats: 5, maxSeats: 50, isCustomQuote: false,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', 50),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', 10_000),
    ],
  },
  {
    key: 'professional',
    displayName: 'Professional',
    description: 'Everything in Growth, plus Tech Transfers, Formulations, Meeting Agent, read/write API and SSO',
    sortOrder: 30, rank: 30,
    unitAmountMonthlyCents: 9_900, unitAmountAnnualCents: 99_000,
    minSeats: 10, maxSeats: 250, isCustomQuote: false,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', null),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', 100_000),
      f('tech_transfers'), f('formulations'), f('meeting_agent'), f('api_write'), f('sso'),
    ],
  },
  {
    key: 'enterprise',
    displayName: 'Enterprise',
    description: 'Everything in Professional, plus custom SLAs, audit exports, a dedicated environment and SCIM',
    sortOrder: 40, rank: 40,
    // Quote-driven. These are the floor a sales conversation starts from, and
    // nothing self-serve may ever charge them — the Enterprise CTA opens
    // contact-sales, never a checkout.
    unitAmountMonthlyCents: 0, unitAmountAnnualCents: 0,
    minSeats: 25, maxSeats: null, isCustomQuote: true,
    features: [
      f('projects_core'), f('reporting_basic'), f('active_briefs', null),
      f('npd_stage_gate'), f('artwork_tracker'), f('component_sourcing'), f('api_read', null),
      f('tech_transfers'), f('formulations'), f('meeting_agent'), f('api_write'), f('sso'),
      f('custom_sla'), f('audit_export'), f('dedicated_env'), f('scim'),
    ],
  },
]
```

The spec's numeric caps (5 active briefs on Starter, API call volumes) ride on the **feature rows** via `limitValue`, not as columns on the tier. That is why `f()` takes a second argument, and why `active_briefs` and `api_read` are the two keys `resolve()` reads limits from in Task 10.

- [ ] **Step 6: Export the barrel**

Create `packages/shared/src/billing/index.ts`:

```ts
export * from './types'
export * from './tiers'
export * from './seats'
```

And add to `packages/shared/src/index.ts`:

```ts
export * from './billing'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd ~/Nexus-Collab/packages/shared && npx vitest run src/billing/seats.test.ts`
Expected: PASS — all green

Run: `cd ~/Nexus-Collab && pnpm build:shared`
Expected: clean build

- [ ] **Step 8: Commit**

```bash
cd ~/Nexus-Collab
git add packages/shared/src/billing packages/shared/src/index.ts
git commit -m "feat(billing): shared tier catalogue, entitlement types and seat helpers"
```

---

### Task 7: The billing schema

**Files:**
- Modify: `packages/prisma/prisma/schema.prisma`

**Interfaces:**
- Produces: `BillingTier`, `BillingTierFeature`, `BillingSubscription`, `SeatAssignment`, `BillingPaymentMethod`, `BillingInvoice`, `BillingEvent`; `AuditLog.orgId`. Tasks 8–13 and every later phase read these.

- [ ] **Step 1: Append the models to `schema.prisma`**

```prisma
// ─── Billing ─────────────────────────────────────────────────
// Stripe is authoritative for subscription state. Everything below except the
// tier catalogue is a MIRROR, written only by the webhook processor. A route
// handler that writes BillingSubscription directly is a bug: it creates a
// local truth that Stripe does not share, and the next webhook silently
// reverts it.

model BillingTier {
  id                     String   @id @default(cuid())
  /// starter | growth | professional | enterprise
  key                    String   @unique
  displayName            String
  description            String?
  sortOrder              Int      @default(0)
  /// Lower is cheaper. This is what makes a change an upgrade or a downgrade.
  /// sortOrder is presentation and must never be used for that comparison.
  rank                   Int
  /// Environment-specific, set per install once the Stripe products exist.
  /// Null on a quote-driven tier, which has no self-serve price.
  stripePriceIdMonthly   String?
  stripePriceIdAnnual    String?
  unitAmountMonthlyCents Int
  unitAmountAnnualCents  Int
  minSeats               Int
  /// null means unlimited. Always compare through exceedsSeatCeiling().
  maxSeats               Int?
  isCustomQuote          Boolean  @default(false)
  isActive               Boolean  @default(true)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  features               BillingTierFeature[]
  subscriptions          BillingSubscription[] @relation("SubscriptionTier")
  pendingSubscriptions   BillingSubscription[] @relation("SubscriptionPendingTier")

  @@index([rank])
}

model BillingTierFeature {
  id         String      @id @default(cuid())
  tierId     String
  tier       BillingTier @relation(fields: [tierId], references: [id], onDelete: Cascade)
  featureKey String
  isEnabled  Boolean     @default(true)
  /// null means "enabled, no numeric cap". Only meaningful when isEnabled.
  limitValue Int?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@unique([tierId, featureKey])
  @@index([featureKey])
}

model BillingSubscription {
  id                       String       @id @default(cuid())
  orgId                    String       @unique
  org                      Organization @relation(fields: [orgId], references: [id])
  tierId                   String
  tier                     BillingTier  @relation("SubscriptionTier", fields: [tierId], references: [id])

  stripeCustomerId         String
  stripeSubscriptionId     String?      @unique
  stripeSubscriptionItemId String?

  /// trialing | active | past_due | canceled | incomplete | incomplete_expired | paused
  status                   String
  /// monthly | annual
  billingInterval          String
  seatsPurchased           Int

  currentPeriodStart       DateTime?
  currentPeriodEnd         DateTime?
  cancelAtPeriodEnd        Boolean      @default(false)
  trialEndsAt              DateTime?
  canceledAt               DateTime?

  /// Scheduled, not yet effective. A downgrade or seat reduction lands here
  /// and takes effect at pendingChangeEffectiveAt. Entitlements are resolved
  /// from tierId/seatsPurchased, never from these — that is what makes a
  /// scheduled downgrade keep its features until the period actually ends.
  pendingTierId            String?
  pendingTier              BillingTier? @relation("SubscriptionPendingTier", fields: [pendingTierId], references: [id])
  pendingSeats             Int?
  pendingChangeEffectiveAt DateTime?

  /// Set when a payment fails. Full access until it passes, read-only after.
  gracePeriodEndsAt        DateTime?

  /// High-water mark for webhook ordering. Stripe delivers out of order and
  /// its objects carry no monotonic version, so an event created before this
  /// is stale and must be discarded rather than applied.
  lastStripeEventAt        DateTime?

  createdAt                DateTime     @default(now())
  updatedAt                DateTime     @updatedAt

  @@index([status])
  @@index([stripeCustomerId])
}

model SeatAssignment {
  id                  String       @id @default(cuid())
  orgId               String
  org                 Organization @relation(fields: [orgId], references: [id])
  memberId            String
  member              Member       @relation(fields: [memberId], references: [id])
  assignedAt          DateTime     @default(now())
  assignedByMemberId  String?
  assignedBy          Member?      @relation("SeatAssigner", fields: [assignedByMemberId], references: [id])
  /// Null means the seat is currently held. Releases are soft so the trail
  /// survives — who held which seat and when is a billing question.
  releasedAt          DateTime?
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt

  // The real guarantee — one ACTIVE assignment per member per org — is a
  // partial unique index, which Prisma 5 cannot express. It is created in
  // ensureBillingSeeded(). This index is only for lookup speed.
  @@index([orgId, releasedAt])
  @@index([memberId])
}

model BillingPaymentMethod {
  id                    String       @id @default(cuid())
  orgId                 String
  org                   Organization @relation(fields: [orgId], references: [id])
  stripePaymentMethodId String       @unique
  brand                 String
  last4                 String
  expMonth              Int
  expYear               Int
  isDefault             Boolean      @default(false)
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  @@index([orgId, isDefault])
}

model BillingInvoice {
  id                   String       @id @default(cuid())
  orgId                String
  org                  Organization @relation(fields: [orgId], references: [id])
  stripeInvoiceId      String       @unique
  number               String?
  status               String
  amountDueCents       Int
  amountPaidCents      Int
  currency             String       @default("usd")
  periodStart          DateTime?
  periodEnd            DateTime?
  hostedInvoiceUrl     String?
  invoicePdfUrl        String?
  attemptCount         Int          @default(0)
  nextPaymentAttemptAt DateTime?
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  @@index([orgId, createdAt(sort: Desc)])
  @@index([status])
}

model BillingEvent {
  id              String    @id @default(cuid())
  /// The idempotency key. Stripe redelivers on any non-2xx, and a replayed
  /// invoice.paid that applied twice is a double credit.
  stripeEventId   String    @unique
  eventType       String
  orgId           String?
  payload         Json
  /// Null until it has been applied. Set means "already done, return 200".
  processedAt     DateTime?
  processingError String?
  retryCount      Int       @default(0)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([eventType, createdAt(sort: Desc)])
  @@index([processedAt])
}
```

- [ ] **Step 2: Add the back-relations Task 3 deferred**

`Organization` and `Member` cannot declare these until the models above exist, which is why they land here rather than in Task 3.

Add to `model Organization`:

```prisma
  subscription       BillingSubscription?
  seatAssignments    SeatAssignment[]
  paymentMethods     BillingPaymentMethod[]
  invoices           BillingInvoice[]
```

Add to `model Member`, with the other relation fields and above its block attributes:

```prisma
  seatAssignments  SeatAssignment[]
  seatsAssigned    SeatAssignment[]     @relation("SeatAssigner")
```

- [ ] **Step 3: Add `orgId` to `AuditLog`**

In `model AuditLog` (line ~1426) add the field and index:

```prisma
  /// Which organization this entry belongs to. Nullable because entries
  /// written before billing existed have no org, and backfilling them would
  /// be a guess written into an append-only trail.
  orgId              String?
```

```prisma
  @@index([orgId, createdAt(sort: Desc)])
```

- [ ] **Step 4: Validate and inspect the diff**

Run:
```bash
cd ~/Nexus-Collab/packages/prisma && npx prisma validate && npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script | grep -E 'DROP|ALTER TABLE.*DROP'
```
Expected: **no `DROP TABLE` and no `DROP COLUMN`.** Anything destructive here is a mistake — stop and re-read the diff in full. (`DROP INDEX "Member_email_key"` from B1 is expected if B1 has merged.)

- [ ] **Step 5: Push and generate**

Run: `cd ~/Nexus-Collab && pnpm db:push && pnpm db:generate`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 6: Commit**

```bash
cd ~/Nexus-Collab
git add packages/prisma/prisma/schema.prisma
git commit -m "feat(billing): tier catalogue, subscription mirror, seats, invoices and event log"
```

---

### Task 8: `ensureBillingSeeded` — tier rows, partial unique index, seat trigger

**Files:**
- Create: `apps/api/src/services/billing/bootstrap.ts`
- Test: `apps/api/src/services/billing/bootstrap.integration.test.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: `TIER_CATALOGUE` (Task 6), the models from Task 7.
- Produces: `ensureBillingSeeded(prisma): Promise<BillingBootstrapResult>`. Called from `start()`.

**Why a trigger:** the seat invariant is `seatsPurchased >= count(active SeatAssignment)`. A Postgres `CHECK` cannot contain a subquery, so it must be a **deferrable constraint trigger**, checked at commit rather than per-statement — otherwise the legitimate "assign the seat and expand the subscription in one transaction" ordering fails on the intermediate state.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/api/src/services/billing/bootstrap.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ensureBillingSeeded } from './bootstrap'
import { TIER_CATALOGUE } from '@nexus/shared'

// Needs a live database — run with `pnpm test:integration`, not `pnpm test`.
// The trigger is the single most important line in the whole module: it is
// what makes "seats purchased can never fall below seats assigned" true under
// ANY sequence of operations, including ones no application code performs.

const prisma = new PrismaClient()
let orgId = ''
let tierId = ''

beforeAll(async () => {
  await ensureBillingSeeded(prisma)
  const org = await prisma.organization.create({
    data: { name: 'Seat Trigger Test Co', slug: `seat-trigger-${Date.now()}` },
  })
  orgId = org.id
  tierId = (await prisma.billingTier.findUniqueOrThrow({ where: { key: 'growth' } })).id
})

afterAll(async () => {
  await prisma.seatAssignment.deleteMany({ where: { orgId } })
  await prisma.billingSubscription.deleteMany({ where: { orgId } })
  await prisma.member.deleteMany({ where: { orgId } })
  await prisma.organization.deleteMany({ where: { id: orgId } })
  await prisma.$disconnect()
})

async function member(email: string) {
  return prisma.member.create({
    data: { clerkUserId: `seat-${email}-${Date.now()}`, email, name: email, orgId },
  })
}

describe('ensureBillingSeeded', () => {
  it('seeds every tier in the catalogue', async () => {
    const rows = await prisma.billingTier.findMany()
    expect(rows.map((r) => r.key).sort()).toEqual(TIER_CATALOGUE.map((t) => t.key).sort())
  })

  it('seeds the feature matrix for each tier', async () => {
    const growth = await prisma.billingTier.findUniqueOrThrow({
      where: { key: 'growth' }, include: { features: true },
    })
    const spec = TIER_CATALOGUE.find((t) => t.key === 'growth')!
    expect(growth.features).toHaveLength(spec.features.length)
    expect(growth.features.map((f) => f.featureKey).sort())
      .toEqual(spec.features.map((f) => f.featureKey).sort())
  })

  it('is idempotent — a second run changes nothing', async () => {
    const before = await prisma.billingTier.count()
    const beforeFeatures = await prisma.billingTierFeature.count()
    await ensureBillingSeeded(prisma)
    expect(await prisma.billingTier.count()).toBe(before)
    expect(await prisma.billingTierFeature.count()).toBe(beforeFeatures)
  })
})

describe('the seat invariant trigger', () => {
  it('allows assignments up to the purchased count', async () => {
    await prisma.billingSubscription.create({
      data: { orgId, tierId, stripeCustomerId: 'cus_test', status: 'active',
              billingInterval: 'monthly', seatsPurchased: 2 },
    })
    const a = await member(`a-${Date.now()}@t.co`)
    const b = await member(`b-${Date.now()}@t.co`)
    await prisma.seatAssignment.create({ data: { orgId, memberId: a.id } })
    await prisma.seatAssignment.create({ data: { orgId, memberId: b.id } })
    expect(await prisma.seatAssignment.count({ where: { orgId, releasedAt: null } })).toBe(2)
  })

  it('refuses the assignment that would oversell', async () => {
    const c = await member(`c-${Date.now()}@t.co`)
    await expect(
      prisma.seatAssignment.create({ data: { orgId, memberId: c.id } }),
    ).rejects.toThrow(/seat_invariant_violated/)
  })

  it('refuses shrinking the subscription below the assigned count', async () => {
    await expect(
      prisma.billingSubscription.update({ where: { orgId }, data: { seatsPurchased: 1 } }),
    ).rejects.toThrow(/seat_invariant_violated/)
  })

  it('permits assign-and-expand in one transaction, because the check is deferred', async () => {
    // The whole reason the trigger is DEFERRABLE INITIALLY DEFERRED. Mid
    // transaction there are 3 assignments against 2 purchased seats; at
    // COMMIT there are 3 against 3.
    const d = await member(`d-${Date.now()}@t.co`)
    await prisma.$transaction([
      prisma.seatAssignment.create({ data: { orgId, memberId: d.id } }),
      prisma.billingSubscription.update({ where: { orgId }, data: { seatsPurchased: 3 } }),
    ])
    expect((await prisma.billingSubscription.findUniqueOrThrow({ where: { orgId } })).seatsPurchased).toBe(3)
  })

  it('refuses a second active assignment for the same member', async () => {
    const held = await prisma.seatAssignment.findFirstOrThrow({ where: { orgId, releasedAt: null } })
    await expect(
      prisma.seatAssignment.create({ data: { orgId, memberId: held.memberId } }),
    ).rejects.toThrow()
  })

  it('allows reassignment after release', async () => {
    const held = await prisma.seatAssignment.findFirstOrThrow({ where: { orgId, releasedAt: null } })
    await prisma.seatAssignment.update({ where: { id: held.id }, data: { releasedAt: new Date() } })
    const again = await prisma.seatAssignment.create({ data: { orgId, memberId: held.memberId } })
    expect(again.releasedAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd ~/Nexus-Collab && set -a && source .env && set +a && \
  pnpm --filter @nexus/api test:integration -- src/services/billing/bootstrap.integration.test.ts
```
Expected: FAIL — cannot resolve `./bootstrap`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/bootstrap.ts
import type { PrismaClient } from '@prisma/client'
import { TIER_CATALOGUE } from '@nexus/shared'

// ─── Billing bootstrap ───────────────────────────────────────
// Two things the application cannot function without and that `prisma db push`
// cannot create: the tier catalogue, and the seat invariant.
//
// Nexus has no `prisma migrate` history — the schema is applied with db push
// and structural invariants live in idempotent boot-time ensures. This follows
// ensureRbacSeeded exactly, for the same reason: a seed script somebody has to
// remember to run is a seed script that did not run in production.

export interface BillingBootstrapResult {
  ran: boolean
  tiersSeeded: number
  featuresSeeded: number
  constraintsApplied: boolean
  error?: string
}

/**
 * seatsPurchased >= count(active SeatAssignment), enforced by the database.
 *
 * A CHECK constraint cannot contain a subquery, so this is a constraint
 * trigger. DEFERRABLE INITIALLY DEFERRED matters: assigning a seat and
 * expanding the subscription is one transaction that is legitimately in
 * violation between its two statements, and a per-statement check would refuse
 * the very operation the product is built around.
 *
 * The application checks this too, under a row lock. The trigger is the
 * backstop, not the error path — it cannot produce a message a user should
 * read, and it cannot audit.
 */
const SEAT_INVARIANT_SQL = [
  `CREATE OR REPLACE FUNCTION billing_assert_seat_invariant() RETURNS TRIGGER AS $fn$
   DECLARE target_org TEXT; consumed INT; purchased INT;
   BEGIN
     target_org := COALESCE(NEW."orgId", OLD."orgId");
     SELECT count(*) INTO consumed FROM "SeatAssignment"
       WHERE "orgId" = target_org AND "releasedAt" IS NULL;
     SELECT "seatsPurchased" INTO purchased FROM "BillingSubscription"
       WHERE "orgId" = target_org;
     -- No subscription means nothing to oversell. Seats assigned without one
     -- are a separate problem and not this trigger's to refuse.
     IF purchased IS NULL THEN RETURN NULL; END IF;
     IF consumed > purchased THEN
       RAISE EXCEPTION 'seat_invariant_violated: org % holds % assigned seats against % purchased',
         target_org, consumed, purchased;
     END IF;
     RETURN NULL;
   END;
   $fn$ LANGUAGE plpgsql;`,

  // CREATE CONSTRAINT TRIGGER has no OR REPLACE, so drop first to stay idempotent.
  `DROP TRIGGER IF EXISTS billing_seat_invariant_assign ON "SeatAssignment";`,
  `CREATE CONSTRAINT TRIGGER billing_seat_invariant_assign
     AFTER INSERT OR UPDATE OR DELETE ON "SeatAssignment"
     DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION billing_assert_seat_invariant();`,

  `DROP TRIGGER IF EXISTS billing_seat_invariant_subscription ON "BillingSubscription";`,
  `CREATE CONSTRAINT TRIGGER billing_seat_invariant_subscription
     AFTER UPDATE ON "BillingSubscription"
     DEFERRABLE INITIALLY DEFERRED
     FOR EACH ROW EXECUTE FUNCTION billing_assert_seat_invariant();`,

  // One ACTIVE assignment per member per org. Prisma 5 cannot express a
  // partial unique index, and a plain unique on (orgId, memberId) would make
  // a released seat unreassignable forever.
  `CREATE UNIQUE INDEX IF NOT EXISTS "SeatAssignment_active_unique"
     ON "SeatAssignment" ("orgId", "memberId") WHERE "releasedAt" IS NULL;`,
]

export async function ensureBillingSeeded(prisma: PrismaClient): Promise<BillingBootstrapResult> {
  const result: BillingBootstrapResult = {
    ran: false, tiersSeeded: 0, featuresSeeded: 0, constraintsApplied: false,
  }
  try {
    for (const statement of SEAT_INVARIANT_SQL) {
      await prisma.$executeRawUnsafe(statement)
    }
    result.constraintsApplied = true

    for (const spec of TIER_CATALOGUE) {
      // Upsert the row but do NOT overwrite the Stripe price ids or the
      // amounts: those are install-specific and an admin may have edited them.
      // Restoring a missing tier is the job; resetting a configured one is not.
      const tier = await prisma.billingTier.upsert({
        where: { key: spec.key },
        update: {
          displayName: spec.displayName, description: spec.description,
          sortOrder: spec.sortOrder, rank: spec.rank,
          minSeats: spec.minSeats, maxSeats: spec.maxSeats,
          isCustomQuote: spec.isCustomQuote,
        },
        create: {
          key: spec.key, displayName: spec.displayName, description: spec.description,
          sortOrder: spec.sortOrder, rank: spec.rank,
          unitAmountMonthlyCents: spec.unitAmountMonthlyCents,
          unitAmountAnnualCents: spec.unitAmountAnnualCents,
          minSeats: spec.minSeats, maxSeats: spec.maxSeats,
          isCustomQuote: spec.isCustomQuote, isActive: true,
        },
      })
      result.tiersSeeded++

      for (const feature of spec.features) {
        await prisma.billingTierFeature.upsert({
          where: { tierId_featureKey: { tierId: tier.id, featureKey: feature.featureKey } },
          update: { isEnabled: feature.isEnabled, limitValue: feature.limitValue },
          create: {
            tierId: tier.id, featureKey: feature.featureKey,
            isEnabled: feature.isEnabled, limitValue: feature.limitValue,
          },
        })
        result.featuresSeeded++
      }
    }

    result.ran = true
    return result
  } catch (err) {
    // Same posture as ensureRbacSeeded: never throw. A workspace that cannot
    // seed its tiers is a serious problem; taking the API down with it turns
    // "the billing page is empty" into "Nexus is offline", which is worse.
    const message = err instanceof Error ? err.message : String(err)
    console.error('[billing] bootstrap failed:', message)
    return { ...result, error: message }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd ~/Nexus-Collab && set -a && source .env && set +a && \
  pnpm --filter @nexus/api test:integration -- src/services/billing/bootstrap.integration.test.ts
```
Expected: PASS — 9 passed. If "refuses the assignment that would oversell" fails, the trigger did not install: check the boot log for `[billing] bootstrap failed`.

- [ ] **Step 5: Wire it into boot**

In `apps/api/src/index.ts`, import `ensureBillingSeeded` and call it in `start()` after `ensureRbacSeeded(prisma)`:

```ts
  // The tier catalogue and the seat invariant. Same reasoning as the RBAC
  // bootstrap: db push cannot create a constraint trigger, and a seed script
  // somebody has to remember to run is one that did not run in production.
  await ensureBillingSeeded(prisma)
```

- [ ] **Step 6: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/billing/bootstrap.ts apps/api/src/services/billing/bootstrap.integration.test.ts apps/api/src/index.ts
git commit -m "feat(billing): seed the tier catalogue and enforce the seat invariant in the database"
```

---

### Task 9: The catalogue service

**Files:**
- Create: `apps/api/src/services/billing/catalogue.ts`
- Test: `apps/api/src/services/billing/catalogue.test.ts`

**Interfaces:**
- Consumes: `BillingTier`, `BillingTierFeature`.
- Produces: `loadCatalogue(prisma): Promise<TierRecord[]>`, `toTierSnapshot(row)`, `invalidateCatalogue()`, and `interface TierRecord`. Tasks 10–12 and route B8 consume these.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/catalogue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCatalogue, invalidateCatalogue } from './catalogue'

const rows = [
  { id: 't2', key: 'growth', displayName: 'Growth', description: null, sortOrder: 20, rank: 20,
    stripePriceIdMonthly: 'price_m', stripePriceIdAnnual: 'price_a',
    unitAmountMonthlyCents: 5900, unitAmountAnnualCents: 59000,
    minSeats: 5, maxSeats: 50, isCustomQuote: false, isActive: true,
    features: [{ featureKey: 'api_read', isEnabled: true, limitValue: null }] },
  { id: 't1', key: 'starter', displayName: 'Starter', description: null, sortOrder: 10, rank: 10,
    stripePriceIdMonthly: null, stripePriceIdAnnual: null,
    unitAmountMonthlyCents: 2900, unitAmountAnnualCents: 29000,
    minSeats: 3, maxSeats: 15, isCustomQuote: false, isActive: true,
    features: [] },
  { id: 't0', key: 'retired', displayName: 'Retired', description: null, sortOrder: 5, rank: 5,
    stripePriceIdMonthly: null, stripePriceIdAnnual: null,
    unitAmountMonthlyCents: 100, unitAmountAnnualCents: 1000,
    minSeats: 1, maxSeats: 2, isCustomQuote: false, isActive: false,
    features: [] },
]

const fakePrisma = () => ({ billingTier: { findMany: vi.fn(async () => rows) } }) as any

beforeEach(() => invalidateCatalogue())

describe('loadCatalogue', () => {
  it('returns active tiers in rank order', async () => {
    const tiers = await loadCatalogue(fakePrisma())
    expect(tiers.map((t) => t.key)).toEqual(['starter', 'growth'])
  })

  it('excludes inactive tiers — a retired plan must not be sellable', async () => {
    const tiers = await loadCatalogue(fakePrisma())
    expect(tiers.find((t) => t.key === 'retired')).toBeUndefined()
  })

  it('memoises within the TTL', async () => {
    const prisma = fakePrisma()
    await loadCatalogue(prisma)
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(1)
  })

  it('re-reads after invalidateCatalogue', async () => {
    const prisma = fakePrisma()
    await loadCatalogue(prisma)
    invalidateCatalogue()
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(2)
  })

  it('re-reads once the TTL has elapsed', async () => {
    const prisma = fakePrisma()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    await loadCatalogue(prisma)
    now.mockReturnValue(1_000 + 61_000)
    await loadCatalogue(prisma)
    expect(prisma.billingTier.findMany).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/catalogue.test.ts`
Expected: FAIL — cannot resolve `./catalogue`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/catalogue.ts
import type { PrismaClient } from '@prisma/client'
import type { FeatureKey, TierKey } from '@nexus/shared'

// ─── Tier catalogue ──────────────────────────────────────────
// The DB rows are authoritative at runtime — an admin may change a price
// without a deploy, and TIER_CATALOGUE in @nexus/shared is only what a fresh
// database is filled with.
//
// Memoised for 60s. Reading four rows on every entitlement resolution would
// make the catalogue the hottest query in the system for data that changes
// perhaps twice a year.

export interface TierFeatureRecord {
  featureKey: FeatureKey
  isEnabled: boolean
  limitValue: number | null
}

export interface TierRecord {
  id: string
  key: TierKey
  displayName: string
  description: string | null
  sortOrder: number
  rank: number
  stripePriceIdMonthly: string | null
  stripePriceIdAnnual: string | null
  unitAmountMonthlyCents: number
  unitAmountAnnualCents: number
  minSeats: number
  /// null means unlimited. Always compare through exceedsSeatCeiling().
  maxSeats: number | null
  isCustomQuote: boolean
  features: TierFeatureRecord[]
}

const TTL_MS = 60_000
let cache: { at: number; tiers: TierRecord[] } | null = null

/** Drop the memo. Called by the webhook processor and by any catalogue edit. */
export function invalidateCatalogue(): void {
  cache = null
}

export async function loadCatalogue(prisma: PrismaClient): Promise<TierRecord[]> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.tiers

  const rows = await prisma.billingTier.findMany({
    where: { isActive: true },
    orderBy: { rank: 'asc' },
    include: { features: true },
  })

  const tiers = rows.map((r: any): TierRecord => ({
    id: r.id, key: r.key, displayName: r.displayName, description: r.description,
    sortOrder: r.sortOrder, rank: r.rank,
    stripePriceIdMonthly: r.stripePriceIdMonthly, stripePriceIdAnnual: r.stripePriceIdAnnual,
    unitAmountMonthlyCents: r.unitAmountMonthlyCents,
    unitAmountAnnualCents: r.unitAmountAnnualCents,
    minSeats: r.minSeats, maxSeats: r.maxSeats, isCustomQuote: r.isCustomQuote,
    features: r.features.map((f: any) => ({
      featureKey: f.featureKey, isEnabled: f.isEnabled, limitValue: f.limitValue,
    })),
  }))

  cache = { at: now, tiers }
  return tiers
}

/** The active tier for a key, or null. Used by the change-tier route in B8. */
export async function findTier(prisma: PrismaClient, key: string): Promise<TierRecord | null> {
  return (await loadCatalogue(prisma)).find((t) => t.key === key) ?? null
}
```

Note the test's rank ordering is applied by the query (`orderBy: { rank: 'asc' }`) — the fake returns rows out of order deliberately, so if the test passes with an unordered fake, add an explicit `.sort((a, b) => a.rank - b.rank)` after the map and re-run.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/catalogue.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit and open the PR**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/billing/catalogue.ts apps/api/src/services/billing/catalogue.test.ts
git commit -m "feat(billing): database-driven tier catalogue with a 60s memo"
git push -u origin feat/billing-schema
gh pr create --base main --title "feat(billing): schema, tier catalogue and the seat invariant" --body "$(cat <<'BODY'
Data foundation for the billing module. No Stripe code, no routes, no UI.

- Seven new Prisma models. Everything except `BillingTier`/`BillingTierFeature` is a mirror of Stripe, written only by the webhook processor in a later PR.
- `AuditLog` gains `orgId` — billing mutations go in the existing append-only trail rather than a second one, so they appear in Settings → Audit for free.
- `ensureBillingSeeded()` runs at boot: seeds the catalogue from `@nexus/shared`, and installs the two things `db push` cannot create — a partial unique index for one active seat per member, and a **deferrable constraint trigger** enforcing `seatsPurchased >= count(active assignments)`.

The trigger is deferred to commit on purpose: "assign the seat and expand the subscription" is one transaction that is legitimately in violation between its statements. There is an integration test for exactly that, plus tests that it refuses overselling from both directions.

Applied with `pnpm db:push` — this repo has no `prisma migrate` history and introducing one would be its own project. See the master plan's delta D2.

Plan: `docs/superpowers/plans/2026-08-25-billing-01-foundations.md`
BODY
)"
```

---

# PR B3 — `feat/billing-entitlements`

```bash
cd ~/Nexus-Collab && git fetch origin && git checkout -b feat/billing-entitlements origin/main
```

---

### Task 10: The pure entitlement resolver

**Files:**
- Create: `apps/api/src/services/billing/resolve.ts`
- Test: `apps/api/src/services/billing/resolve.test.ts`

**Interfaces:**
- Consumes: `Entitlements`, `FeatureKey`, `AccessLevel`, `SubscriptionStatus` from `@nexus/shared`; `TierRecord` from `./catalogue`.
- Produces: `resolve(input: ResolverInput): Entitlements`, `interface SubscriptionSnapshot`, `interface ResolverInput`. Task 12 is the only caller.

**This is the most important file in the module.** Every access decision in Nexus eventually reduces to it, and it has no I/O at all, so it can be tested exhaustively.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/resolve.test.ts
import { describe, it, expect } from 'vitest'
import { resolve, type SubscriptionSnapshot } from './resolve'
import type { TierRecord } from './catalogue'

const NOW = new Date('2026-08-25T12:00:00Z')
const PAST = new Date('2026-08-20T12:00:00Z')
const FUTURE = new Date('2026-09-20T12:00:00Z')

const GROWTH: TierRecord = {
  id: 't_growth', key: 'growth', displayName: 'Growth', description: null,
  sortOrder: 20, rank: 20, stripePriceIdMonthly: 'price_m', stripePriceIdAnnual: 'price_a',
  unitAmountMonthlyCents: 5900, unitAmountAnnualCents: 59000,
  minSeats: 5, maxSeats: 50, isCustomQuote: false,
  features: [
    { featureKey: 'projects_core', isEnabled: true, limitValue: null },
    { featureKey: 'api_read', isEnabled: true, limitValue: 10_000 },
    { featureKey: 'active_briefs', isEnabled: true, limitValue: 25 },
    { featureKey: 'formulations', isEnabled: false, limitValue: null },
  ],
}

const sub = (over: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot => ({
  status: 'active', seatsPurchased: 10, gracePeriodEndsAt: null,
  currentPeriodEnd: FUTURE, cancelAtPeriodEnd: false, ...over,
})

const run = (s: SubscriptionSnapshot | null, seatsConsumed = 4, tier: TierRecord | null = GROWTH) =>
  resolve({ subscription: s, tier, features: tier?.features ?? [], seatsConsumed, now: NOW })

describe('resolve — no subscription', () => {
  it('locks everything', () => {
    const e = run(null, 0, null)
    expect(e.tier).toBeNull()
    expect(e.status).toBeNull()
    expect(e.accessLevel).toBe('locked')
    expect(Object.values(e.features).every((v) => v === false)).toBe(true)
  })

  it('reports zero seats rather than undefined', () => {
    expect(run(null, 0, null).limits.seats).toEqual({ purchased: 0, consumed: 0, available: 0 })
  })
})

describe('resolve — the status matrix', () => {
  it('grants full access while trialing', () => expect(run(sub({ status: 'trialing' })).accessLevel).toBe('full'))
  it('grants full access while active', () => expect(run(sub()).accessLevel).toBe('full'))

  it('grants full access while past_due inside the grace period', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: FUTURE }))
    expect(e.accessLevel).toBe('full')
    expect(e.inGracePeriod).toBe(true)
    expect(e.features.api_read).toBe(true)
  })

  it('drops to read-only when the grace period has expired', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: PAST }))
    expect(e.accessLevel).toBe('read_only')
    expect(e.inGracePeriod).toBe(false)
    // Read-only refuses writes. It does not hide or delete anything — the spec
    // is explicit that lockout is never data loss.
    expect(e.features.api_read).toBe(true)
  })

  it('treats past_due with no grace period set as read-only', () => {
    expect(run(sub({ status: 'past_due', gracePeriodEndsAt: null })).accessLevel).toBe('read_only')
  })

  it('locks an incomplete subscription and grants nothing', () => {
    // Edge case 3: payment failed on upgrade. No new entitlements until paid.
    const e = run(sub({ status: 'incomplete' }))
    expect(e.accessLevel).toBe('locked')
    expect(Object.values(e.features).every((v) => v === false)).toBe(true)
  })

  it('locks an incomplete_expired subscription', () => {
    expect(run(sub({ status: 'incomplete_expired' })).accessLevel).toBe('locked')
  })

  it('makes a paused subscription read-only', () => {
    expect(run(sub({ status: 'paused' })).accessLevel).toBe('read_only')
  })

  it('keeps full access after cancellation until the period actually ends', () => {
    // Edge case 9 depends on this: cancel then reactivate before period end
    // must never have cost anyone access in between.
    expect(run(sub({ status: 'canceled', currentPeriodEnd: FUTURE })).accessLevel).toBe('full')
  })

  it('drops to read-only once a canceled period has ended', () => {
    expect(run(sub({ status: 'canceled', currentPeriodEnd: PAST })).accessLevel).toBe('read_only')
  })

  it('treats a canceled subscription with no period end as read-only', () => {
    expect(run(sub({ status: 'canceled', currentPeriodEnd: null })).accessLevel).toBe('read_only')
  })
})

describe('resolve — features', () => {
  it('enables what the tier enables', () => {
    expect(run(sub()).features.projects_core).toBe(true)
    expect(run(sub()).features.api_read).toBe(true)
  })

  it('disables what the tier disables', () => {
    expect(run(sub()).features.formulations).toBe(false)
  })

  it('defaults an unlisted feature to false, never undefined', () => {
    // A missing key must read as "no", not as undefined — `if (!features.x)`
    // and `if (features.x === false)` have to agree.
    expect(run(sub()).features.scim).toBe(false)
    expect(run(sub()).features).toHaveProperty('scim')
  })
})

describe('resolve — limits', () => {
  it('reports seat purchased, consumed and available', () => {
    expect(run(sub({ seatsPurchased: 10 }), 4).limits.seats)
      .toEqual({ purchased: 10, consumed: 4, available: 6 })
  })

  it('clamps available at zero when oversold', () => {
    expect(run(sub({ seatsPurchased: 10 }), 12).limits.seats.available).toBe(0)
  })

  it('carries numeric limits from the feature rows', () => {
    const e = run(sub())
    expect(e.limits.apiCallsPerMonth).toBe(10_000)
    expect(e.limits.activeBriefs).toBe(25)
  })

  it('reports null for an absent limit, meaning unlimited', () => {
    const noLimits: TierRecord = { ...GROWTH, features: [{ featureKey: 'projects_core', isEnabled: true, limitValue: null }] }
    const e = resolve({ subscription: sub(), tier: noLimits, features: noLimits.features, seatsConsumed: 1, now: NOW })
    expect(e.limits.activeBriefs).toBeNull()
    expect(e.limits.apiCallsPerMonth).toBeNull()
  })

  it('reports no limits at all when locked', () => {
    const e = run(sub({ status: 'incomplete' }))
    expect(e.limits.activeBriefs).toBe(0)
    expect(e.limits.apiCallsPerMonth).toBe(0)
  })
})

describe('resolve — grace period reporting', () => {
  it('exposes the end date as ISO 8601', () => {
    const e = run(sub({ status: 'past_due', gracePeriodEndsAt: FUTURE }))
    expect(e.gracePeriodEndsAt).toBe(FUTURE.toISOString())
  })

  it('is null when not in grace', () => {
    expect(run(sub()).gracePeriodEndsAt).toBeNull()
    expect(run(sub()).inGracePeriod).toBe(false)
  })

  it('only reports grace for past_due, never for an active subscription', () => {
    // A stale gracePeriodEndsAt left behind by a recovered payment must not
    // make an active subscription render a dunning banner.
    const e = run(sub({ status: 'active', gracePeriodEndsAt: FUTURE }))
    expect(e.inGracePeriod).toBe(false)
    expect(e.gracePeriodEndsAt).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/resolve.ts
import {
  seatsAvailable,
  type AccessLevel, type Entitlements, type FeatureKey,
  type SubscriptionStatus, type TierKey,
} from '@nexus/shared'
import type { TierFeatureRecord, TierRecord } from './catalogue'

// ─── Entitlement resolution ──────────────────────────────────
// The single place that answers "what may this organization do?".
//
// Deliberately pure: no Prisma, no Redis, no clock of its own. Everything it
// needs arrives as an argument, which is what lets the status matrix below be
// tested exhaustively rather than sampled. The I/O lives in entitlements.ts.
//
// The frontend receives this object so it can RENDER correctly. It never
// decides anything with it — every gated endpoint re-resolves server-side.

export interface SubscriptionSnapshot {
  status: SubscriptionStatus
  seatsPurchased: number
  gracePeriodEndsAt: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
}

export interface ResolverInput {
  subscription: SubscriptionSnapshot | null
  tier: TierRecord | null
  features: TierFeatureRecord[]
  seatsConsumed: number
  now: Date
}

/// Every key that exists, so a lookup never returns undefined. `if (!f.x)` and
/// `if (f.x === false)` must agree, and an undefined third state is how they
/// stop agreeing.
const ALL_FEATURES: FeatureKey[] = [
  'projects_core', 'reporting_basic', 'active_briefs',
  'npd_stage_gate', 'artwork_tracker', 'component_sourcing', 'api_read',
  'tech_transfers', 'formulations', 'meeting_agent', 'api_write', 'sso',
  'custom_sla', 'audit_export', 'dedicated_env', 'scim',
]

function emptyFeatures(): Record<FeatureKey, boolean> {
  return Object.fromEntries(ALL_FEATURES.map((k) => [k, false])) as Record<FeatureKey, boolean>
}

const LOCKED_LIMITS = { activeBriefs: 0, apiCallsPerMonth: 0 }

/**
 * The status → access matrix.
 *
 * Separated from resolve() so it reads as the table it is. Every branch has a
 * test; adding a status without adding a row here fails the exhaustiveness
 * check below rather than defaulting to "allowed".
 */
function accessFor(sub: SubscriptionSnapshot, now: Date): AccessLevel {
  switch (sub.status) {
    case 'trialing':
    case 'active':
      return 'full'

    case 'past_due':
      // Seven days of full access after a failed payment, then read-only.
      // Never deletion — the spec is explicit that lockout loses no data.
      return sub.gracePeriodEndsAt && now <= sub.gracePeriodEndsAt ? 'full' : 'read_only'

    case 'canceled':
      // Access is retained through the period already paid for. Edge case 9
      // (cancel, then reactivate before period end) depends on this being
      // full, not read_only.
      return sub.currentPeriodEnd && now < sub.currentPeriodEnd ? 'full' : 'read_only'

    case 'paused':
      return 'read_only'

    case 'incomplete':
    case 'incomplete_expired':
      // Edge case 3: the upgrade's payment has not succeeded. Granting the new
      // tier here is exactly the unpaid-access bug.
      return 'locked'

    default: {
      // An unrecognised status is a Stripe change we have not modelled. Fail
      // closed — an unknown state must never be a permissive one.
      const _exhaustive: never = sub.status
      void _exhaustive
      return 'locked'
    }
  }
}

export function resolve(input: ResolverInput): Entitlements {
  const { subscription, tier, features, seatsConsumed, now } = input

  if (!subscription || !tier) {
    return {
      tier: null, status: null, accessLevel: 'locked',
      features: emptyFeatures(),
      limits: { seats: { purchased: 0, consumed: 0, available: 0 }, ...LOCKED_LIMITS },
      inGracePeriod: false, gracePeriodEndsAt: null,
    }
  }

  const accessLevel = accessFor(subscription, now)
  const locked = accessLevel === 'locked'

  const resolved = emptyFeatures()
  if (!locked) {
    for (const f of features) {
      if (f.isEnabled) resolved[f.featureKey] = true
    }
  }

  const limitOf = (key: string): number | null => {
    if (locked) return 0
    const row = features.find((f) => f.featureKey === key)
    return row?.isEnabled ? row.limitValue : null
  }

  // Grace is a property of being past_due, not of the column. A stale
  // gracePeriodEndsAt left behind by a recovered payment must not make an
  // active subscription render a dunning banner.
  const inGracePeriod =
    subscription.status === 'past_due' &&
    !!subscription.gracePeriodEndsAt &&
    now <= subscription.gracePeriodEndsAt

  return {
    tier: tier.key as TierKey,
    status: subscription.status,
    accessLevel,
    features: resolved,
    limits: {
      seats: {
        purchased: subscription.seatsPurchased,
        consumed: seatsConsumed,
        available: seatsAvailable(subscription.seatsPurchased, seatsConsumed),
      },
      activeBriefs: limitOf('active_briefs'),
      apiCallsPerMonth: limitOf('api_read'),
    },
    inGracePeriod,
    gracePeriodEndsAt: inGracePeriod ? subscription.gracePeriodEndsAt!.toISOString() : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/resolve.test.ts`
Expected: PASS — 24 passed

- [ ] **Step 5: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/billing/resolve.ts apps/api/src/services/billing/resolve.test.ts
git commit -m "feat(billing): pure entitlement resolver with an exhaustive status matrix"
```

---

### Task 11: The entitlement cache

**Files:**
- Create: `apps/api/src/services/billing/entitlementCache.ts`
- Test: `apps/api/src/services/billing/entitlementCache.test.ts`

**Interfaces:**
- Produces: `getCached(orgId)`, `setCached(orgId, value)`, `invalidateEntitlements(orgId)`, `resetCacheForTests()`. Task 12 and the webhook processor (B6) are the callers.

**Why an in-process fallback:** `REDIS_URL` is optional in this deployment (`.env.example` says Redis is only needed by the BullMQ worker). A cache that hard-requires Redis would take billing down wherever Redis is absent.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/services/billing/entitlementCache.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCached, setCached, invalidateEntitlements, resetCacheForTests } from './entitlementCache'
import type { Entitlements } from '@nexus/shared'

const ent = (tier: string): Entitlements => ({
  tier: tier as any, status: 'active', accessLevel: 'full',
  features: {} as any,
  limits: { seats: { purchased: 5, consumed: 2, available: 3 }, activeBriefs: null, apiCallsPerMonth: null },
  inGracePeriod: false, gracePeriodEndsAt: null,
})

beforeEach(() => resetCacheForTests())

describe('entitlementCache (in-process fallback)', () => {
  it('returns null on a miss', async () => {
    expect(await getCached('org_a')).toBeNull()
  })

  it('round-trips a value', async () => {
    await setCached('org_a', ent('growth'))
    expect((await getCached('org_a'))?.tier).toBe('growth')
  })

  it('keeps organizations separate', async () => {
    await setCached('org_a', ent('growth'))
    await setCached('org_b', ent('starter'))
    expect((await getCached('org_a'))?.tier).toBe('growth')
    expect((await getCached('org_b'))?.tier).toBe('starter')
  })

  it('invalidates one org without touching another', async () => {
    await setCached('org_a', ent('growth'))
    await setCached('org_b', ent('starter'))
    await invalidateEntitlements('org_a')
    expect(await getCached('org_a')).toBeNull()
    expect((await getCached('org_b'))?.tier).toBe('starter')
  })

  it('expires after the 60s TTL', async () => {
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000)
    await setCached('org_a', ent('growth'))
    now.mockReturnValue(1_000 + 59_000)
    expect(await getCached('org_a')).not.toBeNull()
    now.mockReturnValue(1_000 + 61_000)
    expect(await getCached('org_a')).toBeNull()
    now.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/entitlementCache.test.ts`
Expected: FAIL — cannot resolve `./entitlementCache`

- [ ] **Step 3: Write the implementation**

```ts
// apps/api/src/services/billing/entitlementCache.ts
import Redis from 'ioredis'
import type { Entitlements } from '@nexus/shared'

// ─── Entitlement cache ───────────────────────────────────────
// 60s TTL, hard-invalidated by every webhook that touches the org. The TTL is
// a backstop for an invalidation we missed, not the primary mechanism — a
// customer who has just paid should not wait a minute for their features.
//
// Redis when REDIS_URL is set, an in-process map otherwise. Redis is optional
// in this deployment (only the BullMQ worker requires it), and a cache that
// hard-required it would take billing offline wherever it is absent.
//
// The in-process variant is per-instance, so on a multi-instance deploy one
// instance can serve up to 60s of stale entitlements after another instance
// invalidates. Acceptable for a read cache whose miss path is correct and
// whose worst case is a feature appearing a minute late. NOT acceptable if
// anything ever starts making a money decision from it — that must re-read.

const TTL_MS = 60_000
const TTL_S = 60

const key = (orgId: string) => `nexus:entitlements:${orgId}`

let redis: Redis | null = null
let redisTried = false

function getRedis(): Redis | null {
  if (redisTried) return redis
  redisTried = true
  const url = process.env.REDIS_URL
  if (!url) return null
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })
    redis.on('error', (err) => console.error('[billing] entitlement cache redis error:', err.message))
  } catch (err) {
    console.error('[billing] could not open the entitlement cache:', err)
    redis = null
  }
  return redis
}

const local = new Map<string, { at: number; value: Entitlements }>()

export async function getCached(orgId: string): Promise<Entitlements | null> {
  const client = getRedis()
  if (client) {
    try {
      const raw = await client.get(key(orgId))
      return raw ? (JSON.parse(raw) as Entitlements) : null
    } catch (err) {
      // A cache read that fails is a miss, never an error. The caller then
      // resolves from the database, which is always correct.
      console.error('[billing] entitlement cache read failed:', err)
      return null
    }
  }
  const hit = local.get(orgId)
  if (!hit) return null
  if (Date.now() - hit.at >= TTL_MS) {
    local.delete(orgId)
    return null
  }
  return hit.value
}

export async function setCached(orgId: string, value: Entitlements): Promise<void> {
  const client = getRedis()
  if (client) {
    try {
      await client.set(key(orgId), JSON.stringify(value), 'EX', TTL_S)
      return
    } catch (err) {
      console.error('[billing] entitlement cache write failed:', err)
      return
    }
  }
  local.set(orgId, { at: Date.now(), value })
}

/** Called by every webhook that touches the org, as its last step. */
export async function invalidateEntitlements(orgId: string): Promise<void> {
  local.delete(orgId)
  const client = getRedis()
  if (!client) return
  try {
    await client.del(key(orgId))
  } catch (err) {
    // A failed invalidation is the one cache error that matters: it leaves
    // stale entitlements for up to the TTL. Loud, but not fatal — the TTL
    // bounds the damage, which is exactly why the TTL exists.
    console.error(`[billing] could not invalidate entitlements for ${orgId}:`, err)
  }
}

/** Test hook. Never call this from application code. */
export function resetCacheForTests(): void {
  local.clear()
  redis = null
  redisTried = true
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/services/billing/entitlementCache.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 5: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/billing/entitlementCache.ts apps/api/src/services/billing/entitlementCache.test.ts
git commit -m "feat(billing): entitlement cache with a redis-optional fallback"
```

---

### Task 12: `resolveEntitlements` and the enforcement middleware

**Files:**
- Create: `apps/api/src/services/billing/entitlements.ts`
- Create: `apps/api/src/middleware/requireEntitlement.ts`
- Test: `apps/api/src/middleware/requireEntitlement.test.ts`

**Interfaces:**
- Consumes: `resolve` (Task 10), `loadCatalogue` (Task 9), the cache (Task 11), `getActingOrgId` (Task 1).
- Produces: `resolveEntitlements(prisma, orgId): Promise<Entitlements>`, and the guards `requireFeature(key)`, `requireSeatAvailable()`, `requireWriteAccess()`. Every gated route in every later phase composes these.

- [ ] **Step 1: Write `entitlements.ts`**

```ts
// apps/api/src/services/billing/entitlements.ts
import type { PrismaClient } from '@prisma/client'
import type { Entitlements, SubscriptionStatus } from '@nexus/shared'
import { loadCatalogue } from './catalogue'
import { resolve } from './resolve'
import { getCached, setCached } from './entitlementCache'

// The one function any code calls to learn what an org may do. Everything
// interesting is in resolve(); this is the I/O around it.

export async function resolveEntitlements(
  prisma: PrismaClient, orgId: string, now = new Date(),
): Promise<Entitlements> {
  const cached = await getCached(orgId)
  if (cached) return cached

  const [row, seatsConsumed, tiers] = await Promise.all([
    prisma.billingSubscription.findUnique({ where: { orgId } }),
    prisma.seatAssignment.count({ where: { orgId, releasedAt: null } }),
    loadCatalogue(prisma),
  ])

  const tier = row ? tiers.find((t) => t.id === row.tierId) ?? null : null

  const entitlements = resolve({
    subscription: row && {
      status: row.status as SubscriptionStatus,
      seatsPurchased: row.seatsPurchased,
      gracePeriodEndsAt: row.gracePeriodEndsAt,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    },
    tier,
    features: tier?.features ?? [],
    seatsConsumed,
    now,
  })

  await setCached(orgId, entitlements)
  return entitlements
}
```

- [ ] **Step 2: Write the failing middleware test**

```ts
// apps/api/src/middleware/requireEntitlement.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Entitlements } from '@nexus/shared'

const resolveEntitlements = vi.fn()
vi.mock('../services/billing/entitlements', () => ({ resolveEntitlements }))

const { requireFeature, requireSeatAvailable, requireWriteAccess } =
  await import('./requireEntitlement')

const ent = (over: Partial<Entitlements> = {}): Entitlements => ({
  tier: 'growth', status: 'active', accessLevel: 'full',
  features: { formulations: true, scim: false } as any,
  limits: { seats: { purchased: 5, consumed: 2, available: 3 }, activeBriefs: null, apiCallsPerMonth: null },
  inGracePeriod: false, gracePeriodEndsAt: null, ...over,
})

function ctx(member: unknown = { id: 'm1', orgId: 'org_a' }) {
  const res: any = {
    statusCode: 0, body: null as any, req: { headers: {} },
    status(c: number) { this.statusCode = c; return this },
    json(b: unknown) { this.body = b; return this },
  }
  return { req: { member, body: {}, params: {}, query: {}, headers: {} } as any, res, next: vi.fn() }
}

beforeEach(() => { resolveEntitlements.mockReset() })

describe('requireFeature', () => {
  it('passes when the feature is enabled', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireFeature('formulations')(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses with 402 when the feature is not on the plan', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireFeature('scim')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(402)
    expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED')
    // The refusal names what is needed so the UI can offer the upgrade.
    expect(res.body.error.requiredFeature).toBe('scim')
  })

  it('refuses when resolution throws — fails closed', async () => {
    resolveEntitlements.mockRejectedValue(new Error('db down'))
    const { req, res, next } = ctx()
    await requireFeature('formulations')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(500)
  })

  it('refuses when nobody is signed in', async () => {
    const { req, res, next } = ctx(undefined)
    await requireFeature('formulations')(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(resolveEntitlements).not.toHaveBeenCalled()
  })
})

describe('requireWriteAccess', () => {
  it('passes on full access', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses a write in read-only lockout', async () => {
    resolveEntitlements.mockResolvedValue(ent({ accessLevel: 'read_only' }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(res.statusCode).toBe(402)
    expect(res.body.error.code).toBe('SUBSCRIPTION_READ_ONLY')
  })

  it('refuses a write when locked', async () => {
    resolveEntitlements.mockResolvedValue(ent({ accessLevel: 'locked' }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(res.statusCode).toBe(402)
  })

  it('passes while past_due inside the grace period', async () => {
    resolveEntitlements.mockResolvedValue(ent({ status: 'past_due', accessLevel: 'full', inGracePeriod: true }))
    const { req, res, next } = ctx()
    await requireWriteAccess()(req, res, next)
    expect(next).toHaveBeenCalled()
  })
})

describe('requireSeatAvailable', () => {
  it('passes when a seat is free', async () => {
    resolveEntitlements.mockResolvedValue(ent())
    const { req, res, next } = ctx()
    await requireSeatAvailable()(req, res, next)
    expect(next).toHaveBeenCalled()
  })

  it('refuses with 409 when every seat is taken', async () => {
    resolveEntitlements.mockResolvedValue(ent({
      limits: { seats: { purchased: 5, consumed: 5, available: 0 }, activeBriefs: null, apiCallsPerMonth: null },
    }))
    const { req, res, next } = ctx()
    await requireSeatAvailable()(req, res, next)
    expect(res.statusCode).toBe(409)
    expect(res.body.error.code).toBe('NO_SEATS_AVAILABLE')
    // The UI turns this into "adding this user requires 1 additional seat",
    // so the numbers have to travel with the refusal.
    expect(res.body.error.seats).toEqual({ purchased: 5, consumed: 5, available: 0 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/middleware/requireEntitlement.test.ts`
Expected: FAIL — cannot resolve `./requireEntitlement`

- [ ] **Step 4: Write the middleware**

```ts
// apps/api/src/middleware/requireEntitlement.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express'
import type { Entitlements, FeatureKey } from '@nexus/shared'
import { prisma } from '../lib/prisma'
import { resolveEntitlements } from '../services/billing/entitlements'
import { requestIdOf } from './requirePermission'

// ─── Entitlement guards ──────────────────────────────────────
// The server-side half of the plan. The frontend gets entitlements so it can
// render an upgrade prompt instead of a broken button; these are what make
// flipping that client-side flag worth nothing.
//
// Same posture as requirePermission: every failure path refuses. A database
// error resolving entitlements produces a 500, never a pass.
//
// 402 Payment Required is used deliberately for both plan refusals. It is the
// one status that means "this is a billing problem, not a permission problem",
// which is what lets one client interceptor route these to the upgrade flow
// while leaving 403s alone.

export interface EntitledRequest extends Request {
  entitlements?: Entitlements
}

function billingError(
  res: Response, status: number, code: string, message: string,
  extra: Record<string, unknown> = {},
): void {
  res.status(status).json({
    error: { code, message, ...extra, requestId: requestIdOf(res.req as Request) },
  })
}

/** Resolve once per request and memoise on it. */
async function load(req: EntitledRequest, res: Response): Promise<Entitlements | null> {
  if (req.entitlements) return req.entitlements

  const orgId = (req as any).member?.orgId
  if (typeof orgId !== 'string' || !orgId) {
    billingError(res, 401, 'UNAUTHENTICATED', 'Sign in to continue.')
    return null
  }

  try {
    const entitlements = await resolveEntitlements(prisma, orgId)
    req.entitlements = entitlements
    return entitlements
  } catch (err) {
    console.error('[billing] could not resolve entitlements:', err)
    // Fail closed. An outage must not become an open door to paid features.
    billingError(res, 500, 'INTERNAL', 'Something went wrong.')
    return null
  }
}

/** The plan must include this feature. */
export function requireFeature(feature: FeatureKey): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.features[feature]) return next()
    billingError(res, 402, 'PLAN_UPGRADE_REQUIRED',
      'Your plan does not include this feature.',
      { requiredFeature: feature, currentTier: e.tier })
  }
}

/** The subscription must currently permit writes. */
export function requireWriteAccess(): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.accessLevel === 'full') return next()
    billingError(res, 402,
      e.accessLevel === 'read_only' ? 'SUBSCRIPTION_READ_ONLY' : 'SUBSCRIPTION_INACTIVE',
      e.accessLevel === 'read_only'
        ? 'Your workspace is read-only until the outstanding invoice is paid.'
        : 'Your workspace does not have an active subscription.',
      { status: e.status, accessLevel: e.accessLevel })
  }
}

/**
 * At least one seat must be free.
 *
 * A guard, not the assignment path: the real check happens under a row lock in
 * seatManager (PR B7), because this reads a cache that may be up to 60s stale
 * and two concurrent adds could both pass it. This exists so the common case
 * gets a good error before doing any work.
 */
export function requireSeatAvailable(): RequestHandler {
  return async (req: EntitledRequest, res: Response, next: NextFunction) => {
    const e = await load(req, res)
    if (!e) return
    if (e.limits.seats.available > 0) return next()
    billingError(res, 409, 'NO_SEATS_AVAILABLE',
      'Every purchased seat is assigned.',
      { seats: e.limits.seats, currentTier: e.tier })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ~/Nexus-Collab/apps/api && npx vitest run src/middleware/requireEntitlement.test.ts`
Expected: PASS — 10 passed

- [ ] **Step 6: Commit**

```bash
cd ~/Nexus-Collab
git add apps/api/src/services/billing/entitlements.ts apps/api/src/middleware/requireEntitlement.ts apps/api/src/middleware/requireEntitlement.test.ts
git commit -m "feat(billing): resolveEntitlements and the server-side enforcement guards"
```

---

### Task 13: `billing:read`, billing audit actions, and `GET /billing/entitlements`

**Files:**
- Modify: `packages/shared/src/rbac/catalogue.ts:61-62` and the `admin` role's permission list
- Modify: `apps/api/src/services/users/auditService.ts` — the `AuditAction` and `entityType` unions
- Create: `apps/api/src/services/billing/billingAudit.ts`
- Create: `apps/api/src/routes/billing.ts`
- Modify: `apps/api/src/index.ts` — mount the router

**Interfaces:**
- Consumes: `resolveEntitlements` (Task 12), `requirePermission` from `middleware/requirePermission.ts`.
- Produces: `billingRoutes` (Express Router), `appendBillingAudit(tx, input)`, permission key `billing:read`. PR B8 extends this router; every later mutation calls `appendBillingAudit`.

- [ ] **Step 1: Add `billing:read` to the catalogue**

In `packages/shared/src/rbac/catalogue.ts`, replace the billing group at line 61:

```ts
  {
    resource: 'billing',
    items: [
      { key: 'billing:read', label: 'View billing', description: 'See the plan, seats, invoices and payment methods' },
      { key: 'billing:manage', label: 'Manage billing', description: 'Change the plan, seats and payment details' },
    ],
  },
```

The `admin` role at line ~94 currently takes every permission except `billing:manage`, which now correctly gives it `billing:read` with no edit — that is the intended split and needs no change. **Verify it**, because the filter is written as an exclusion and a second excluded key would change the meaning:

```ts
    permissions: ALL_PERMISSION_KEYS.filter((k) => k !== 'billing:manage'),
```

`ensureRbacSeeded` upserts the catalogue on boot, so the new permission appears without a manual step.

- [ ] **Step 2: Extend the audit vocabulary**

In `apps/api/src/services/users/auditService.ts`, add to the `AuditAction` union:

```ts
  | 'billing.tier_upgraded' | 'billing.tier_downgrade_scheduled' | 'billing.tier_change_canceled'
  | 'billing.seats_added' | 'billing.seats_removal_scheduled'
  | 'billing.seat_assigned' | 'billing.seat_released'
  | 'billing.payment_method_added' | 'billing.payment_method_removed' | 'billing.payment_method_default_changed'
  | 'billing.subscription_created' | 'billing.subscription_canceled' | 'billing.subscription_reactivated'
  | 'billing.invoice_paid' | 'billing.invoice_failed'
```

And to the `entityType` union in `AppendInput`:

```ts
  entityType: 'user' | 'role' | 'settings' | 'preferences' | 'notifications' | 'invitation'
    | 'subscription' | 'seat' | 'payment_method' | 'invoice'
```

Add `orgId` to `AppendInput` and to the `create` call inside `append` — the field exists on the model as of Task 7:

```ts
export interface AppendInput {
  // ... existing fields
  /// Which organization this entry belongs to. Required for billing entries;
  /// the user-management callers may leave it undefined.
  orgId?: string | null
}
```

- [ ] **Step 3: Write the billing audit wrapper**

```ts
// apps/api/src/services/billing/billingAudit.ts
import type { Request } from 'express'
import { append, type AuditAction, type Tx } from '../users/auditService'
import { requestIdOf } from '../../middleware/requirePermission'

// ─── Billing audit ───────────────────────────────────────────
// A thin shape over auditService so every billing mutation records the same
// things and nobody has to remember which. It is deliberately not a second
// audit system: entries land in the one append-only trail, which means they
// show up in Settings → Audit with no extra UI.
//
// Like auditService.append, this runs inside the caller's transaction and is
// allowed to fail it. An unaudited billing change is worse than no change.

export type BillingAuditAction = Extract<AuditAction, `billing.${string}`>

export interface BillingAuditInput {
  tx: Tx
  req: Request
  orgId: string
  action: BillingAuditAction
  entityType: 'subscription' | 'seat' | 'payment_method' | 'invoice'
  entityId: string | null
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

export async function appendBillingAudit(input: BillingAuditInput): Promise<void> {
  const member = (input.req as any).member as { id: string; email: string } | undefined

  // before/after arrive as whole-state objects (what the spec calls
  // before_state/after_state); the trail stores per-field { from, to }, so
  // they are folded here rather than at every call site.
  const keys = new Set([...Object.keys(input.before ?? {}), ...Object.keys(input.after ?? {})])
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const k of keys) {
    const from = input.before?.[k]
    const to = input.after?.[k]
    if (from !== to) changes[k] = { from: from ?? null, to: to ?? null }
  }

  await append(input.tx, {
    actorId: member?.id ?? null,
    actorEmailSnapshot: member?.email ?? null,
    orgId: input.orgId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: Object.keys(changes).length ? changes : null,
    metadata: {
      ip: input.req.ip ?? null,
      userAgent: input.req.get('user-agent') ?? null,
      requestId: requestIdOf(input.req),
    },
  })
}

/**
 * The same, for a change Stripe made that no user initiated — a renewal, a
 * failed retry, a refund issued from the dashboard.
 *
 * actorId is null and actorType is carried in metadata, so the trail can still
 * answer "who did this" with "Stripe, on event evt_…" rather than a blank.
 */
export async function appendWebhookAudit(input: {
  tx: Tx
  orgId: string
  action: BillingAuditAction
  entityType: BillingAuditInput['entityType']
  entityId: string | null
  stripeEventId: string
  changes?: Record<string, { from: unknown; to: unknown }> | null
}): Promise<void> {
  await append(input.tx, {
    actorId: null,
    actorEmailSnapshot: null,
    orgId: input.orgId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: input.changes ?? null,
    metadata: { actorType: 'stripe_webhook', stripeEventId: input.stripeEventId },
  })
}
```

- [ ] **Step 4: Write the route**

```ts
// apps/api/src/routes/billing.ts
import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { isAuthenticated } from '../auth/session'
import { requirePermission, sendError } from '../middleware/requirePermission'
import { getActingOrgId } from '../middleware/billingContext'
import { resolveEntitlements } from '../services/billing/entitlements'

// ─── Billing ─────────────────────────────────────────────────
// Phase 1 ships one route. The remaining seventeen arrive in PR B8, on this
// same router and with these same guards.
//
// Note what every handler does first and identically: getActingOrgId(req).
// There is no route in this module where a client names its own organization.

export const billingRoutes = Router()

billingRoutes.use(isAuthenticated)

/**
 * The resolved entitlements for the acting organization.
 *
 * The frontend uses this to RENDER — to show the right tier, grey out the
 * right buttons, put up the right banner. It decides nothing: every gated
 * endpoint re-resolves server-side through requireFeature/requireWriteAccess,
 * so turning a flag off in devtools grants exactly nothing.
 */
billingRoutes.get('/entitlements', requirePermission('billing:read'), async (req, res) => {
  try {
    const entitlements = await resolveEntitlements(prisma, getActingOrgId(req))
    res.json(entitlements)
  } catch (err) {
    console.error('[billing] GET /entitlements failed:', err)
    sendError(res, 'INTERNAL', 'Something went wrong.')
  }
})
```

- [ ] **Step 5: Mount it**

In `apps/api/src/index.ts`, add the import and mount it beside the other settings-adjacent routers, after `api.use('/audit', auditRoutes)`:

```ts
api.use('/billing', billingRoutes)
```

- [ ] **Step 6: Verify end to end**

Run:
```bash
cd ~/Nexus-Collab && pnpm build:shared && pnpm --filter @nexus/api test
```
Expected: all suites pass; the count is higher than the baseline and nothing that passed before now fails.

Run:
```bash
cd ~/Nexus-Collab && set -a && source .env && set +a && pnpm --filter @nexus/api dev &
sleep 6
curl -s -c /tmp/jar -o /dev/null localhost:3000/api/dev-login
curl -s -b /tmp/jar localhost:3000/api/v1/billing/entitlements | python3 -m json.tool
```
Expected: a JSON body with `"tier": null`, `"accessLevel": "locked"`, all features `false`, and seats `{0,0,0}` — the correct answer for an org with no subscription row yet. If it returns 403, the dev-login member's role lacks `billing:read`: confirm `ensureRbacSeeded` re-ran and re-check the `admin` filter from Step 1.

- [ ] **Step 7: Commit and open the PR**

```bash
cd ~/Nexus-Collab
git add packages/shared/src/rbac/catalogue.ts apps/api/src/services/users/auditService.ts \
        apps/api/src/services/billing/billingAudit.ts apps/api/src/routes/billing.ts apps/api/src/index.ts
git commit -m "feat(billing): billing:read permission, audit vocabulary and GET /entitlements"
git push -u origin feat/billing-entitlements
gh pr create --base main --title "feat(billing): server-side entitlement resolution and enforcement" --body "$(cat <<'BODY'
The half of the plan that the client cannot lie about.

- `resolve()` is pure — no Prisma, no Redis, no clock of its own — so the status→access matrix is tested exhaustively rather than sampled. 24 tests cover every status, including the two the spec's own edge cases turn on: `incomplete` grants nothing (payment failed on upgrade), and `canceled` keeps full access until the period actually ends (so cancel-then-reactivate never costs anyone access).
- `read_only` is a third access level the spec's type did not have. §5.4 and §5.8 both require a state that is neither "has the feature" nor "does not", and `inGracePeriod` alone cannot express it. Read-only refuses writes; it never hides or deletes anything.
- The entitlement cache is Redis when `REDIS_URL` is set and an in-process map otherwise, because Redis is optional in this deployment. Documented tradeoff in the file: a multi-instance deploy can serve up to 60s of stale entitlements after another instance invalidates. Fine for rendering; anything making a money decision must re-read.
- `billing:read` is new; `billing:manage` already existed and already excluded `admin`. So admins can see the plan and owners can change it, with no new roles.
- Billing audit entries go in the existing append-only `AuditLog` and appear in Settings → Audit with no new UI.

`GET /api/v1/billing/entitlements` is the only route in this PR. The other seventeen land in B8.

Plan: `docs/superpowers/plans/2026-08-25-billing-01-foundations.md`
BODY
)"
```

---

## Phase 1 Exit Criteria

Do not begin Phase 2 until every one of these holds:

- [ ] `pnpm --filter @nexus/api test` passes, with more tests than the recorded baseline and none newly failing.
- [ ] `pnpm --filter @nexus/api test:integration` passes, including all six seat-trigger tests.
- [ ] `pnpm --filter @nexus/web build` is green.
- [ ] `npx tsc --noEmit` in `apps/api` produces **zero** errors.
- [ ] The API boots and logs `[billing]` bootstrap success and the tenancy backfill result.
- [ ] `GET /api/v1/billing/entitlements` answers with a correct locked-state object for an org with no subscription.
- [ ] `grep -rn "findFirst" apps/api/src/auth/` returns no organization lookup.
- [ ] `grep -rn "req.body.orgId\|params.orgId" apps/api/src/routes/billing.ts` returns nothing.
- [ ] All three PRs are merged to `main`.

## Self-Review Notes

Checked against the master plan and the original spec:

- **Spec §1.3 entitlement resolver** — Task 10, with `accessLevel` added and justified.
- **Spec §2 data model** — Task 7. Field-for-field, minus the separate `billing_audit_log` (delta D5) and plus `rank` and `lastStripeEventAt`, both justified inline.
- **Spec §2 seat constraint** — Task 8, in both the application (PR B7) and the database (the deferred trigger here).
- **Spec §6 security** — org from session only (Task 1), permission-gated (Task 13), audited (Task 13), fail-closed (Tasks 10, 12). Rate limiting lands with the mutations in B8, since there are none in this phase.
- **`active_briefs`** is a first-class `FeatureKey`, declared in the master plan's union and carried through Task 6 (`tiers.ts`), Task 10 (`ALL_FEATURES`, `limitOf`) and the test fixtures. No casts anywhere.
- **Type consistency check:** `TierRecord` (Task 9) is what `resolve()` (Task 10) and `resolveEntitlements()` (Task 12) both consume; `TierSpec` (Task 6) is seed-shaped and only `ensureBillingSeeded` (Task 8) reads it. They are deliberately different types — one has an `id`, the other does not — and nothing converts between them.
- **Not in this phase, by design:** Stripe (Phase 2), the other seventeen routes (B8), all UI (Phases 4–5).
