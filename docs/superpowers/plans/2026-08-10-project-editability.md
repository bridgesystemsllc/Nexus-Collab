# Project Editability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an existing project editable — its content fields, its tasks, and its timeline — by any non-viewer project member.

**Architecture:** The backend already implements almost all of this. `PATCH /projects/:id` and the full task and timeline write APIs exist and are policy-guarded; the frontend never calls them. So the work is one widened policy rule, a new field-tier guard so governance fields stay restricted, a real capabilities payload replacing a fail-open client guess, and the three missing UI surfaces. All new backend logic goes in `services/projects/` as pure functions with unit tests, because that is where every existing API test lives.

**Tech Stack:** TypeScript, Express, Prisma, Zod, React 18, TanStack Query v5, Tailwind, lucide-react, vitest.

## Global Constraints

- **Package manager is pnpm.** There is no `node_modules` state you can trust — the checkout was 340 commits stale. Run `pnpm install` from the repo root before the first task.
- **Test environments are `node` only.** `apps/web/vitest.config.ts` sets `environment: 'node'` and `include: ['src/**/*.test.ts']` — note `.ts`, not `.tsx`. There is no jsdom and no `@testing-library/react`. **Do not add them.** Component behaviour is tested by extracting the logic into a pure `.ts` lib, which is the existing pattern (`lib/ganttScale.ts`, `lib/ripple.ts`).
- **Error classes and their HTTP statuses** (`services/projects/context.ts`): `UnauthenticatedError` 401, `NotFoundError` 404, `ConflictError` 409, `ValidationError` 422. `PolicyError` (`services/projects/policy.ts:273`) is 403 and takes a message only — no details argument.
- **All Zod request schemas are `.strict()`.** An unknown key throws `ValidationError` → **422**, not 400.
- **Design language:** dark-first, dense, operational. Use CSS variables already in use (`var(--text-primary)`, `var(--text-secondary)`, `var(--text-tertiary)`, `var(--bg-surface)`, `var(--bg-elevated)`, `var(--border-subtle)`, `var(--accent)`, `var(--accent-secondary)`, `var(--danger)`, `var(--success)`, `var(--warning)`). Icons come from `lucide-react`. Never introduce a new colour literal.
- **Commit after every task.** Branch is `feat/project-editability`, already created off `main`.
- **Do not touch** `SET_BASELINE`, `ADD_DEPARTMENT`, `PUBLISH_REPORT`, status transitions, reports, or check-ins.

## File Structure

**Create:**
- `apps/api/src/services/projects/fieldTiers.ts` — which patch fields are content vs governance; pure.
- `apps/api/src/services/projects/fieldTiers.test.ts`
- `apps/api/src/services/projects/capabilities.ts` — actor capabilities for a project; pure.
- `apps/api/src/services/projects/capabilities.test.ts`
- `apps/web/src/modules/projects/lib/inlineEdit.ts` — inline-edit state machine; pure.
- `apps/web/src/modules/projects/lib/inlineEdit.test.ts`
- `apps/web/src/modules/projects/components/InlineEdit.tsx` — thin view over the reducer.
- `apps/web/src/modules/projects/components/TaskComposer.tsx` — compact create-task form.
- `apps/web/src/modules/projects/components/PhaseEditor.tsx` — phase and milestone editing controls.

**Modify:**
- `apps/api/src/services/projects/policy.ts` — split `EDIT_PROJECT` out of the PM/admin group; export `isProjectParticipant`.
- `apps/api/src/services/projects/policy.test.ts` — the `it.each` at line 131.
- `apps/api/src/routes/projects.ts` — `GET /:id` gains capabilities; `PATCH /:id` gains the tier guard.
- `apps/web/src/modules/projects/types.ts` — `ProjectCapabilities`, added to `ProjectDetail`.
- `apps/web/src/modules/projects/api/projectsClient.ts` — seven timeline functions.
- `apps/web/src/modules/projects/hooks/useProjects.ts` — seven timeline hooks.
- `apps/web/src/modules/projects/views/ProjectDetailView.tsx` — delete the `canEdit` guess; wire InlineEdit; fix the Description panel.
- `apps/web/src/modules/projects/components/TaskBoard.tsx` — create affordances.
- `apps/web/src/modules/projects/components/TimelineGantt.tsx` — mount `PhaseEditor`.

---

### Task 1: Widen EDIT_PROJECT to any non-viewer member

**Files:**
- Modify: `apps/api/src/services/projects/policy.ts:121-128` (add helper), `:191-196` (split the case)
- Test: `apps/api/src/services/projects/policy.test.ts:130-140`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function isProjectParticipant(actor: PolicyActor, project: PolicyProject): boolean`. Task 4 calls `can(actor, 'EDIT_PROJECT', project)` and relies on this widened behaviour.

- [ ] **Step 1: Write the failing tests**

In `policy.test.ts`, replace the `describe('project administration is PM/admin only', ...)` block (starts line 130) with these two blocks. The fixtures `PM`, `ADMIN`, `RD_LEAD`, `RD_CONTRIB`, `OUTSIDER`, `actor()`, `project()` already exist at the top of the file — do not redefine them.

```ts
describe('project governance stays PM/admin only', () => {
  it.each(['SET_BASELINE', 'ADD_DEPARTMENT', 'PUBLISH_REPORT'] as const)(
    '%s allows PM and admin, denies lane lead and contributor',
    (action) => {
      expect(can(PM, action, project()).allowed).toBe(true)
      expect(can(ADMIN, action, project()).allowed).toBe(true)
      expect(can(RD_LEAD, action, project()).allowed).toBe(false)
      expect(can(RD_CONTRIB, action, project()).allowed).toBe(false)
    },
  )
})

describe('EDIT_PROJECT extends to any non-viewer participant', () => {
  it('allows the PM and an org admin', () => {
    expect(can(PM, 'EDIT_PROJECT', project()).allowed).toBe(true)
    expect(can(ADMIN, 'EDIT_PROJECT', project()).allowed).toBe(true)
  })

  it('allows a lane lead and a contributor in a participating department', () => {
    expect(can(RD_LEAD, 'EDIT_PROJECT', project()).allowed).toBe(true)
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', project()).allowed).toBe(true)
  })

  it('denies an explicit VIEWER member', () => {
    const p = project({
      members: [{ memberId: RD_CONTRIB.id, role: 'VIEWER', departmentId: RD }],
    })
    const d = can(RD_CONTRIB, 'EDIT_PROJECT', p)
    expect(d.allowed).toBe(false)
    expect(d.reason).toContain('Viewers')
  })

  it('denies a department participating only as VIEWER', () => {
    const p = project({
      departments: [{ departmentId: RD, role: 'VIEWER', laneLeadId: null }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(false)
  })

  it('prefers an explicit CONTRIBUTOR membership over a VIEWER department lane', () => {
    const p = project({
      departments: [{ departmentId: RD, role: 'VIEWER', laneLeadId: null }],
      members: [{ memberId: RD_CONTRIB.id, role: 'CONTRIBUTOR', departmentId: RD }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(true)
  })

  it('denies someone whose department is not participating', () => {
    expect(can(OUTSIDER, 'EDIT_PROJECT', project()).allowed).toBe(false)
  })

  it('recognises a PROJECT_MANAGER membership as well as the header field', () => {
    const p = project({
      projectManagerId: null,
      members: [{ memberId: RD_CONTRIB.id, role: 'PROJECT_MANAGER', departmentId: RD }],
    })
    expect(can(RD_CONTRIB, 'EDIT_PROJECT', p).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/projects/policy.test.ts
```

Expected: FAIL. The "lane lead and contributor" case fails with `expected false to be true` — the current rule denies both.

- [ ] **Step 3: Add the participation helper**

In `policy.ts`, immediately after `inParticipatingDept` (which ends at line 128), add:

```ts
// Anyone with standing on this project: an explicit member, or a member of a
// participating department. Distinct from canView, which also admits the
// owning department. Callers must check isViewerOnly first — a VIEWER is a
// participant.
export function isProjectParticipant(actor: PolicyActor, project: PolicyProject): boolean {
  return !!membership(actor, project) || inParticipatingDept(actor, project)
}
```

- [ ] **Step 4: Split the EDIT_PROJECT case**

In `policy.ts`, the switch at line 191 currently reads:

```ts
    case 'EDIT_PROJECT':
    case 'SET_BASELINE':
    case 'ADD_DEPARTMENT':
    case 'PUBLISH_REPORT':
      return admin || pm ? ALLOW : deny('Requires the project manager or an admin')
```

Replace with:

```ts
    // Editing project content is open to anyone working on the project.
    // Baselining and the three below are not: baselineEndDate is frozen at
    // approval and every slip metric is measured against it.
    case 'EDIT_PROJECT':
      if (admin || pm) return ALLOW
      if (viewerOnly) return deny('Viewers cannot edit this project')
      return isProjectParticipant(actor, project)
        ? ALLOW
        : deny('You are not a member of this project')

    case 'SET_BASELINE':
    case 'ADD_DEPARTMENT':
    case 'PUBLISH_REPORT':
      return admin || pm ? ALLOW : deny('Requires the project manager or an admin')
```

The `viewerOnly` check must precede the participation check: a VIEWER is a participant, and order is what denies them.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/projects/policy.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 6: Run the whole API suite for regressions**

```bash
cd apps/api && npx vitest run
```

Expected: PASS. Other suites call `can(...)`; if one breaks, the widened rule reached further than intended — read the failure before changing anything.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/projects/policy.ts apps/api/src/services/projects/policy.test.ts
git commit -m "feat(policy): allow any non-viewer project member to edit a project"
```

---

### Task 2: Field-tier service

**Files:**
- Create: `apps/api/src/services/projects/fieldTiers.ts`
- Test: `apps/api/src/services/projects/fieldTiers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `splitByTier(body: Record<string, unknown>): TierSplit` where `TierSplit = { content: Record<string, unknown>; governance: Record<string, unknown>; unrecognised: string[] }`. Task 3 consumes it.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/projects/fieldTiers.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { splitByTier, CONTENT_FIELDS, GOVERNANCE_FIELDS } from './fieldTiers'

describe('splitByTier', () => {
  it('routes content fields to the content tier', () => {
    const out = splitByTier({ title: 'New title', businessCase: 'Because' })
    expect(out.content).toEqual({ title: 'New title', businessCase: 'Because' })
    expect(out.governance).toEqual({})
    expect(out.unrecognised).toEqual([])
  })

  it('routes governance fields to the governance tier', () => {
    const out = splitByTier({ projectManagerId: 'u-2', isConfidential: true })
    expect(out.governance).toEqual({ projectManagerId: 'u-2', isConfidential: true })
    expect(out.content).toEqual({})
  })

  it('splits a mixed body across both tiers', () => {
    const out = splitByTier({ title: 'T', budgetAmount: 500 })
    expect(out.content).toEqual({ title: 'T' })
    expect(out.governance).toEqual({ budgetAmount: 500 })
  })

  it('reports unrecognised keys instead of silently dropping them', () => {
    const out = splitByTier({ title: 'T', wibble: 1 })
    expect(out.unrecognised).toEqual(['wibble'])
    expect(out.content).toEqual({ title: 'T' })
  })

  it('preserves an explicit null, which clears a field', () => {
    const out = splitByTier({ targetEndDate: null })
    expect(out.content).toEqual({ targetEndDate: null })
  })

  it('ignores a key whose value is undefined', () => {
    const out = splitByTier({ title: 'T', description: undefined })
    expect(out.content).toEqual({ title: 'T' })
  })

  it('keeps the two tiers disjoint', () => {
    const overlap = CONTENT_FIELDS.filter((f) => (GOVERNANCE_FIELDS as readonly string[]).includes(f))
    expect(overlap).toEqual([])
  })

  it('does not accept status, which has its own transition endpoint', () => {
    const out = splitByTier({ status: 'ACTIVE' })
    expect(out.unrecognised).toEqual(['status'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/projects/fieldTiers.test.ts
```

Expected: FAIL with "Failed to resolve import ./fieldTiers".

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/services/projects/fieldTiers.ts`:

```ts
// Which fields of a project patch each tier of actor may write.
//
// EDIT_PROJECT is open to any non-viewer participant, but that must not mean a
// contributor can reassign the project manager or move a project out of
// confidential. The policy answers "may this person edit at all"; this module
// answers "which fields".
//
// Both lists are explicit allowlists. A field added to the create schema later
// lands in neither and is reported as unrecognised, so it fails closed and
// loudly rather than silently becoming editable by everyone.

export const CONTENT_FIELDS = [
  'title',
  'description',
  'businessCase',
  'successCriteria',
  'priority',
  'startDate',
  'targetEndDate',
  'brands',
  'retailers',
  'markets',
  'customFields',
] as const

export const GOVERNANCE_FIELDS = [
  'projectTypeId',
  'projectManagerId',
  'executiveSponsorId',
  'isConfidential',
  'budgetAmount',
  'currency',
  'checkinCadence',
  'checkinDayOfWeek',
  'actualEndDate',
  'lessonsLearned',
] as const

export type ContentField = (typeof CONTENT_FIELDS)[number]
export type GovernanceField = (typeof GOVERNANCE_FIELDS)[number]

export interface TierSplit {
  content: Record<string, unknown>
  governance: Record<string, unknown>
  /** Keys in neither tier. `status` lands here on purpose. */
  unrecognised: string[]
}

const CONTENT = new Set<string>(CONTENT_FIELDS)
const GOVERNANCE = new Set<string>(GOVERNANCE_FIELDS)

export function splitByTier(body: Record<string, unknown>): TierSplit {
  const out: TierSplit = { content: {}, governance: {}, unrecognised: [] }

  for (const [key, value] of Object.entries(body)) {
    // An explicit null clears a field and must survive; undefined is absence.
    if (value === undefined) continue
    if (CONTENT.has(key)) out.content[key] = value
    else if (GOVERNANCE.has(key)) out.governance[key] = value
    else out.unrecognised.push(key)
  }

  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && npx vitest run src/services/projects/fieldTiers.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/projects/fieldTiers.ts apps/api/src/services/projects/fieldTiers.test.ts
git commit -m "feat(projects): add content/governance field tiers for project patches"
```

---

### Task 3: Enforce field tiers in PATCH /projects/:id

**Files:**
- Modify: `apps/api/src/routes/projects.ts:451-492`

**Interfaces:**
- Consumes: `splitByTier` from Task 2; the widened `EDIT_PROJECT` from Task 1.
- Produces: no new exports. `PATCH /:id` now returns 403 when a non-PM/admin sends a governance field.

- [ ] **Step 1: Import the tier helper and the policy check**

At the top of `apps/api/src/routes/projects.ts`, the policy import on line 4 currently reads:

```ts
import { assertCan, type PolicyActor, type PolicyProject } from '../services/projects/policy'
```

Change it to also bring in `can` and `PolicyError`:

```ts
import { assertCan, can, PolicyError, type PolicyActor, type PolicyProject } from '../services/projects/policy'
```

Then add below the other service imports:

```ts
import { splitByTier } from '../services/projects/fieldTiers'
```

- [ ] **Step 2: Add the tier guard to the handler**

In `projectRoutes.patch('/:id', ...)`, the body currently begins:

```ts
    const body = parseOrThrow(patchProjectSchema, req.body)

    const before = await prisma.project.findUnique({ where: { id: policyProject.id } })
```

Insert the guard between those two statements:

```ts
    const body = parseOrThrow(patchProjectSchema, req.body)

    // EDIT_PROJECT is open to any non-viewer participant, but governance
    // fields are not. Reject the whole request naming the offending fields —
    // dropping them silently looks like a save that worked.
    const tiers = splitByTier(body as Record<string, unknown>)
    if (Object.keys(tiers.governance).length > 0) {
      if (!can(actor, 'SET_BASELINE', policyProject).allowed) {
        throw new PolicyError(
          `Only the project manager or an admin can change: ${Object.keys(tiers.governance).sort().join(', ')}`,
        )
      }
    }

    const before = await prisma.project.findUnique({ where: { id: policyProject.id } })
```

`SET_BASELINE` is the probe because Task 1 deliberately left it as exactly "PM or admin" — reusing it keeps one definition of that tier instead of re-deriving `admin || pm` here.

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Run the API suite**

```bash
cd apps/api && npx vitest run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/projects.ts
git commit -m "feat(api): restrict governance fields on PATCH /projects/:id to PM and admin"
```

---

### Task 4: Serve capabilities from GET /projects/:id

**Files:**
- Create: `apps/api/src/services/projects/capabilities.ts`
- Test: `apps/api/src/services/projects/capabilities.test.ts`
- Modify: `apps/api/src/routes/projects.ts:256-258`

**Interfaces:**
- Consumes: `can` from `policy.ts`, widened by Task 1.
- Produces: `projectCapabilities(actor: PolicyActor, project: PolicyProject): ProjectCapabilities`, where

```ts
interface ProjectCapabilities {
  editProject: boolean
  editGovernance: boolean
  createTask: boolean
  editTaskOwnLane: boolean
  editTimeline: boolean
  setBaseline: boolean
  publishReport: boolean
}
```

Task 5 mirrors this shape in the web `types.ts`. Keep the key names identical.

`publishReport` was added during execution: Task 5's grep found two further
fail-open call sites this plan had missed — `canRequest` on `CheckInPanel` and
`canGenerate` on `ReportsPanel`. The first maps to `editProject`
(`projectCheckins.ts:215`), but report generation asserts `PUBLISH_REPORT`
(`projectReports.ts:259`), which had no capability. It currently equals
`editGovernance` in value, but is kept separate because the two answer
different questions and will diverge if either rule changes.

`editTaskOwnLane` exists because the Gantt's task-bar drag calls
`PATCH /tasks/:taskId`, which asserts `assertCanEditTask` — a per-task lane
rule, not `EDIT_PROJECT`. A single project-level boolean cannot express it
exactly, so this probes the actor's own lane. It is an approximation for
other-lane tasks, but it is server-derived and fails closed, and the server
stays the enforcement point.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/projects/capabilities.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { projectCapabilities } from './capabilities'
import type { PolicyActor, PolicyProject } from './policy'

const ORG = 'org-1'
const RD = 'dept-rd'

const actor = (over: Partial<PolicyActor> = {}): PolicyActor => ({
  id: 'u-contributor', role: 'MEMBER', orgId: ORG, departmentId: RD, ...over,
})

const project = (over: Partial<PolicyProject> = {}): PolicyProject => ({
  id: 'p-1', orgId: ORG,
  projectManagerId: 'u-pm',
  executiveSponsorId: 'u-sponsor',
  ownerDepartmentId: RD,
  isConfidential: false,
  deletedAt: null,
  departments: [{ departmentId: RD, role: 'OWNER', laneLeadId: 'u-rd-lead' }],
  members: [],
  ...over,
})

const PM = actor({ id: 'u-pm', role: 'PROJECT_LEAD' })
const CONTRIB = actor({ id: 'u-rd-contrib' })

describe('projectCapabilities', () => {
  it('gives the PM everything', () => {
    expect(projectCapabilities(PM, project())).toEqual({
      editProject: true,
      editGovernance: true,
      createTask: true,
      editTaskOwnLane: true,
      editTimeline: true,
      setBaseline: true,
    })
  })

  it('gives a contributor content editing but not governance', () => {
    const caps = projectCapabilities(CONTRIB, project())
    expect(caps.editProject).toBe(true)
    expect(caps.editTimeline).toBe(true)
    expect(caps.createTask).toBe(true)
    expect(caps.editTaskOwnLane).toBe(true)
    expect(caps.editGovernance).toBe(false)
    expect(caps.setBaseline).toBe(false)
  })

  it('gives a viewer nothing', () => {
    const p = project({ members: [{ memberId: CONTRIB.id, role: 'VIEWER', departmentId: RD }] })
    const caps = projectCapabilities(CONTRIB, p)
    expect(caps.editProject).toBe(false)
    expect(caps.editTimeline).toBe(false)
    expect(caps.createTask).toBe(false)
    expect(caps.editGovernance).toBe(false)
  })

  it('keeps editTimeline in lockstep with editProject', () => {
    for (const a of [PM, CONTRIB]) {
      const caps = projectCapabilities(a, project())
      expect(caps.editTimeline).toBe(caps.editProject)
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/api && npx vitest run src/services/projects/capabilities.test.ts
```

Expected: FAIL with "Failed to resolve import ./capabilities".

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/services/projects/capabilities.ts`:

```ts
import { can, type PolicyActor, type PolicyProject, type PolicyTask } from './policy'

// What the current actor may do to this project, computed from the same
// policy the write routes enforce.
//
// This exists because the client used to guess. A guess drifts: the old one
// both failed open before the member id resolved and omitted org admins. The
// server already knows the answer, so it says so.

export interface ProjectCapabilities {
  editProject: boolean
  editGovernance: boolean
  createTask: boolean
  /** Task dates on the Gantt go through per-task lane rules, not EDIT_PROJECT. */
  editTaskOwnLane: boolean
  /** Every timeline write route asserts EDIT_PROJECT, so this tracks it. */
  editTimeline: boolean
  setBaseline: boolean
}

export function projectCapabilities(
  actor: PolicyActor,
  project: PolicyProject,
): ProjectCapabilities {
  const editProject = can(actor, 'EDIT_PROJECT', project).allowed
  const governance = can(actor, 'SET_BASELINE', project).allowed

  // Lane-scoped task actions need a task to judge. Probe with a task in the
  // actor's own lane AND assigned to them: EDIT_TASK_OWN_LANE falls through to
  // `task.ownerId === actor.id` for a plain contributor (policy.ts:258), so a
  // null-owner probe would report false for every contributor — the exact
  // users the capability exists to serve.
  const ownLaneProbe: PolicyTask = {
    id: 'probe',
    departmentId: actor.departmentId ?? null,
    ownerId: actor.id,
    acceptanceStatus: null,
  }

  return {
    editProject,
    editGovernance: governance,
    createTask: can(actor, 'CREATE_TASK_OWN_LANE', project, ownLaneProbe).allowed,
    editTaskOwnLane: can(actor, 'EDIT_TASK_OWN_LANE', project, ownLaneProbe).allowed,
    editTimeline: editProject,
    setBaseline: governance,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/api && npx vitest run src/services/projects/capabilities.test.ts
```

Expected: PASS, 4 tests. If `createTask` fails for the contributor, read `policy.ts:210` — `CREATE_TASK_OWN_LANE` needs a task with a `departmentId` the actor holds, which is what the probe supplies.

- [ ] **Step 5: Attach capabilities to the detail response**

In `apps/api/src/routes/projects.ts`, add the import:

```ts
import { projectCapabilities } from '../services/projects/capabilities'
```

In `projectRoutes.get('/:id', ...)`, the handler currently ends:

```ts
    return ok(res, project)
```

Replace with:

```ts
    return ok(res, project && { ...project, capabilities: projectCapabilities(actor, policyProject) })
```

- [ ] **Step 6: Typecheck and run the suite**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx vitest run
```

Expected: no type errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/projects/capabilities.ts apps/api/src/services/projects/capabilities.test.ts apps/api/src/routes/projects.ts
git commit -m "feat(api): return actor capabilities from GET /projects/:id"
```

---

### Task 5: Consume capabilities on the client, delete the guess

**Files:**
- Modify: `apps/web/src/modules/projects/types.ts:83-107`
- Modify: `apps/web/src/modules/projects/views/ProjectDetailView.tsx:194`

**Interfaces:**
- Consumes: the `capabilities` payload from Task 4.
- Produces: `ProjectCapabilities` type and `project.capabilities` on `ProjectDetail`. Tasks 8, 9 and 11 gate their affordances on it.

- [ ] **Step 1: Add the type**

In `apps/web/src/modules/projects/types.ts`, immediately before `export interface ProjectDetail`:

```ts
/** Mirrors ProjectCapabilities in apps/api/src/services/projects/capabilities.ts. */
export interface ProjectCapabilities {
  editProject: boolean
  editGovernance: boolean
  createTask: boolean
  editTaskOwnLane: boolean
  editTimeline: boolean
  setBaseline: boolean
}

/** Deny everything when the server sent nothing — never fail open. */
export const NO_CAPABILITIES: ProjectCapabilities = {
  editProject: false,
  editGovernance: false,
  createTask: false,
  editTaskOwnLane: false,
  editTimeline: false,
  setBaseline: false,
}
```

Then add to the `ProjectDetail` interface body, after `customFields`:

```ts
  capabilities?: ProjectCapabilities
```

It is optional because a cached response from before this deploy will not have it, and the `NO_CAPABILITIES` default is what makes that safe.

- [ ] **Step 2: Replace the guess in ProjectDetailView**

Add to the imports from `../types`:

```ts
import { NO_CAPABILITIES } from '../types'
```

Inside `ProjectDetailView`, after `project` is available and before the `return`, add:

```ts
  // The server computes this from the same policy the write routes enforce.
  const caps = project?.capabilities ?? NO_CAPABILITIES
```

Then line 194, which reads:

```tsx
            canEdit={project.projectManager?.id === currentMemberId || !currentMemberId}
```

becomes:

```tsx
            canEdit={caps.editProject}
```

- [ ] **Step 3: Fix the same bug at the second call site**

The identical fail-open expression appears again at line 217, on the Gantt:

```tsx
            canReschedule={project.projectManager?.id === currentMemberId || !currentMemberId}
```

Replace it with:

```tsx
            canReschedule={caps.editTaskOwnLane}
```

Keep the existing comment above it — "the server enforces it either way, this
just avoids offering a drag that will 403" — which is still exactly right, and
is now actually true rather than aspirational.

Grep the module for any third instance before moving on:

```bash
grep -rn "currentMemberId ||" apps/web/src/modules/projects
```

Expected: no results.

- [ ] **Step 4: Typecheck**

```bash
cd apps/web && npx tsc -b --noEmit
```

Expected: no errors. If `caps` is flagged as used before assignment, move the declaration above the early-return branches for loading and error states.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/projects/types.ts apps/web/src/modules/projects/views/ProjectDetailView.tsx
git commit -m "fix(projects): use server capabilities instead of a fail-open client guess"
```

---

### Task 6: Inline-edit state machine

**Files:**
- Create: `apps/web/src/modules/projects/lib/inlineEdit.ts`
- Test: `apps/web/src/modules/projects/lib/inlineEdit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
type InlineEditState<T> =
  | { phase: 'read' }
  | { phase: 'editing'; draft: T }
  | { phase: 'saving'; draft: T }
  | { phase: 'failed'; draft: T; message: string }

type InlineEditEvent<T> =
  | { type: 'BEGIN'; value: T }
  | { type: 'CHANGE'; draft: T }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT' }
  | { type: 'RESOLVED' }
  | { type: 'REJECTED'; message: string }

const INITIAL: InlineEditState<never>
function inlineEditReducer<T>(state: InlineEditState<T>, event: InlineEditEvent<T>): InlineEditState<T>
function currentDraft<T>(state: InlineEditState<T>, fallback: T): T
```

Task 7 renders this.

This is the pattern the module already uses — `lib/ganttScale.ts` and `lib/ripple.ts` are pure and unit-tested, and their components consume them. It is also the only way to test this behaviour, because the web vitest environment is `node` with no DOM.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/modules/projects/lib/inlineEdit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { inlineEditReducer, currentDraft, INITIAL, type InlineEditState } from './inlineEdit'

const reduce = (state: InlineEditState<string>, ...events: Parameters<typeof inlineEditReducer<string>>[1][]) =>
  events.reduce((s, e) => inlineEditReducer(s, e), state)

describe('inlineEditReducer', () => {
  it('starts in read mode', () => {
    expect(INITIAL).toEqual({ phase: 'read' })
  })

  it('BEGIN seeds the draft from the current value', () => {
    expect(reduce(INITIAL, { type: 'BEGIN', value: 'hello' }))
      .toEqual({ phase: 'editing', draft: 'hello' })
  })

  it('CHANGE updates the draft', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' })
    expect(s).toEqual({ phase: 'editing', draft: 'ab' })
  })

  it('CANCEL discards the draft and returns to read', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' }, { type: 'CANCEL' })
    expect(s).toEqual({ phase: 'read' })
  })

  it('SUBMIT moves to saving, carrying the draft', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'CHANGE', draft: 'ab' }, { type: 'SUBMIT' })
    expect(s).toEqual({ phase: 'saving', draft: 'ab' })
  })

  it('RESOLVED returns to read', () => {
    const s = reduce(INITIAL, { type: 'BEGIN', value: 'a' }, { type: 'SUBMIT' }, { type: 'RESOLVED' })
    expect(s).toEqual({ phase: 'read' })
  })

  it('REJECTED preserves the draft — typed text is never discarded', () => {
    const s = reduce(
      INITIAL,
      { type: 'BEGIN', value: 'a' },
      { type: 'CHANGE', draft: 'a long edit' },
      { type: 'SUBMIT' },
      { type: 'REJECTED', message: 'Server said no' },
    )
    expect(s).toEqual({ phase: 'failed', draft: 'a long edit', message: 'Server said no' })
  })

  it('CHANGE after a failure clears the message and resumes editing', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'CHANGE', draft: 'xy' }))
      .toEqual({ phase: 'editing', draft: 'xy' })
  })

  it('SUBMIT retries directly from a failure', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'SUBMIT' })).toEqual({ phase: 'saving', draft: 'x' })
  })

  it('CANCEL from a failure returns to read', () => {
    const failed: InlineEditState<string> = { phase: 'failed', draft: 'x', message: 'nope' }
    expect(inlineEditReducer(failed, { type: 'CANCEL' })).toEqual({ phase: 'read' })
  })

  it('ignores CHANGE and BEGIN while saving, so an in-flight save is not corrupted', () => {
    const saving: InlineEditState<string> = { phase: 'saving', draft: 'x' }
    expect(inlineEditReducer(saving, { type: 'CHANGE', draft: 'y' })).toBe(saving)
    expect(inlineEditReducer(saving, { type: 'BEGIN', value: 'z' })).toBe(saving)
  })

  it('ignores SUBMIT in read mode', () => {
    expect(inlineEditReducer(INITIAL, { type: 'SUBMIT' })).toBe(INITIAL)
  })
})

describe('currentDraft', () => {
  it('returns the fallback in read mode', () => {
    expect(currentDraft(INITIAL as InlineEditState<string>, 'saved')).toBe('saved')
  })

  it('returns the draft in every other phase', () => {
    expect(currentDraft({ phase: 'editing', draft: 'd' }, 'saved')).toBe('d')
    expect(currentDraft({ phase: 'saving', draft: 'd' }, 'saved')).toBe('d')
    expect(currentDraft({ phase: 'failed', draft: 'd', message: 'm' }, 'saved')).toBe('d')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run src/modules/projects/lib/inlineEdit.test.ts
```

Expected: FAIL with "Failed to resolve import ./inlineEdit".

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/modules/projects/lib/inlineEdit.ts`:

```ts
// State machine behind InlineEdit.
//
// Extracted from the component because the web vitest environment is `node`
// with no DOM — the same reason ganttScale and ripple are pure modules. The
// behaviour worth protecting is here and unit tested; the component is a thin
// view over it.
//
// The rule that matters: a rejected save keeps the draft. Discarding what
// someone typed because the server was briefly unhappy is the failure mode
// this machine exists to prevent.

export type InlineEditState<T> =
  | { phase: 'read' }
  | { phase: 'editing'; draft: T }
  | { phase: 'saving'; draft: T }
  | { phase: 'failed'; draft: T; message: string }

export type InlineEditEvent<T> =
  | { type: 'BEGIN'; value: T }
  | { type: 'CHANGE'; draft: T }
  | { type: 'CANCEL' }
  | { type: 'SUBMIT' }
  | { type: 'RESOLVED' }
  | { type: 'REJECTED'; message: string }

export const INITIAL: InlineEditState<never> = { phase: 'read' }

export function inlineEditReducer<T>(
  state: InlineEditState<T>,
  event: InlineEditEvent<T>,
): InlineEditState<T> {
  switch (state.phase) {
    case 'read':
      return event.type === 'BEGIN' ? { phase: 'editing', draft: event.value } : state

    case 'editing':
      switch (event.type) {
        case 'CHANGE': return { phase: 'editing', draft: event.draft }
        case 'SUBMIT': return { phase: 'saving', draft: state.draft }
        case 'CANCEL': return { phase: 'read' }
        default: return state
      }

    // A save is in flight; nothing may mutate the draft under it.
    case 'saving':
      switch (event.type) {
        case 'RESOLVED': return { phase: 'read' }
        case 'REJECTED': return { phase: 'failed', draft: state.draft, message: event.message }
        default: return state
      }

    case 'failed':
      switch (event.type) {
        case 'CHANGE': return { phase: 'editing', draft: event.draft }
        case 'SUBMIT': return { phase: 'saving', draft: state.draft }
        case 'CANCEL': return { phase: 'read' }
        default: return state
      }
  }
}

/** The value the input should show: the draft if there is one, else what is saved. */
export function currentDraft<T>(state: InlineEditState<T>, fallback: T): T {
  return state.phase === 'read' ? fallback : state.draft
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/web && npx vitest run src/modules/projects/lib/inlineEdit.test.ts
```

Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/projects/lib/inlineEdit.ts apps/web/src/modules/projects/lib/inlineEdit.test.ts
git commit -m "feat(projects): add inline-edit state machine"
```

---

### Task 7: InlineEdit component

**Files:**
- Create: `apps/web/src/modules/projects/components/InlineEdit.tsx`

**Interfaces:**
- Consumes: `inlineEditReducer`, `currentDraft`, `INITIAL`, `InlineEditState` from Task 6.
- Produces:

```tsx
function InlineEdit<T extends string | string[] | null>(props: {
  value: T
  variant: 'text' | 'prose' | 'date' | 'select'
  onSave: (next: T) => Promise<unknown>
  canEdit: boolean
  label: string
  placeholder?: string
  maxLength?: number
  options?: { value: string; label: string }[]
}): JSX.Element
```

Task 8 renders it.

- [ ] **Step 1: Write the component**

Create `apps/web/src/modules/projects/components/InlineEdit.tsx`:

```tsx
import { useReducer, useRef, useEffect } from 'react'
import { Pencil, Loader2 } from 'lucide-react'
import { inlineEditReducer, currentDraft, INITIAL, type InlineEditState } from '../lib/inlineEdit'

// Click-to-edit for a single project field.
//
// Read mode is a real <button>, not a hover-only pencil, so the affordance is
// keyboard reachable and announced. The pencil is decoration on top of it.
//
// Blur deliberately does not save. Autosave-on-blur loses work when focus
// moves somewhere unexpected and leaves no undo point.

interface Props<T> {
  value: T
  variant: 'text' | 'prose' | 'date' | 'select'
  onSave: (next: T) => Promise<unknown>
  canEdit: boolean
  /** Announced to screen readers on the edit affordance, e.g. "Business case". */
  label: string
  placeholder?: string
  maxLength?: number
  options?: { value: string; label: string }[]
}

export function InlineEdit<T extends string | string[] | null>({
  value, variant, onSave, canEdit, label, placeholder = 'Not set', maxLength, options = [],
}: Props<T>) {
  const [state, dispatch] = useReducer(
    inlineEditReducer<T>,
    INITIAL as InlineEditState<T>,
  )
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => {
    // 'failed' is included deliberately: disabling the focused input while the
    // save is in flight blurs it, so the editor must take focus back when it
    // re-enables — otherwise a rejected save silently ejects keyboard users
    // from the field they were editing.
    if (state.phase === 'editing' || state.phase === 'failed') inputRef.current?.focus()
  }, [state.phase])

  const draft = currentDraft(state, value)

  const submit = async () => {
    dispatch({ type: 'SUBMIT' })
    try {
      await onSave(draft)
      dispatch({ type: 'RESOLVED' })
    } catch (err: any) {
      dispatch({ type: 'REJECTED', message: err?.message ?? 'Could not save' })
    }
  }

  if (!canEdit || state.phase === 'read') {
    const isEmpty = value === null || value === '' || (Array.isArray(value) && value.length === 0)
    const shown = isEmpty ? placeholder : Array.isArray(value) ? value.join(', ') : String(value)

    if (!canEdit) {
      return (
        <p className={`text-sm whitespace-pre-wrap ${isEmpty ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}>
          {shown}
        </p>
      )
    }

    return (
      <button
        type="button"
        onClick={() => dispatch({ type: 'BEGIN', value })}
        aria-label={`Edit ${label}`}
        className={`group w-full text-left flex items-start gap-2 rounded-md -mx-1 px-1 py-0.5
          hover:bg-[var(--bg-elevated)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]
          ${isEmpty ? 'text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}
      >
        <span className="flex-1 text-sm whitespace-pre-wrap">{shown}</span>
        <Pencil
          size={13}
          className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-[var(--text-tertiary)]"
        />
      </button>
    )
  }

  const busy = state.phase === 'saving'
  const shared = `w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1.5 text-sm text-[var(--text-primary)]
    focus:outline-none focus:border-[var(--accent)] disabled:opacity-60`

  // Cmd/Ctrl+Enter saves everywhere. Plain Enter saves single-line variants
  // but must stay a newline in prose.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'CANCEL' }); return }
    if (e.key !== 'Enter') return
    if (e.metaKey || e.ctrlKey || variant !== 'prose') { e.preventDefault(); void submit() }
  }

  return (
    <div className="space-y-1.5">
      {variant === 'prose' ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={(draft as string) ?? ''}
          rows={5}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={`${shared} resize-y leading-relaxed`}
        />
      ) : variant === 'select' ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={(draft as string) ?? ''}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={shared}
        >
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={variant === 'date' ? 'date' : 'text'}
          value={(draft as string) ?? ''}
          maxLength={maxLength}
          disabled={busy}
          onChange={(e) => dispatch({ type: 'CHANGE', draft: e.target.value as T })}
          onKeyDown={onKeyDown}
          className={shared}
        />
      )}

      {state.phase === 'failed' && (
        <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'CANCEL' })}
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'var(--accent-secondary)' }}
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {busy ? 'Saving' : 'Save'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/web && npx tsc -b --noEmit
```

Expected: no errors. If the `useReducer` generic is rejected, annotate explicitly:
`useReducer<React.Reducer<InlineEditState<T>, InlineEditEvent<T>>>(inlineEditReducer, INITIAL as InlineEditState<T>)`
and add `InlineEditEvent` to the import.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/modules/projects/components/InlineEdit.tsx
git commit -m "feat(projects): add InlineEdit component"
```

---

### Task 8: Wire inline editing into the Overview tab

**Files:**
- Modify: `apps/web/src/modules/projects/views/ProjectDetailView.tsx:122-124` (title), `:188-200` (pass the mutations down), `:260-278` (the three prose panels), `:322-332` (Key dates)

**Interfaces:**
- Consumes: `InlineEdit` (Task 7), `caps` (Task 5), the existing `useUpdateProject` hook.
- Produces: nothing new.

- [ ] **Step 1: Pass a save function into OverviewTab**

In `ProjectDetailView.tsx`, add the hook import:

```ts
import { useUpdateProject } from '../hooks/useProjects'
```

and the component import:

```ts
import { InlineEdit } from '../components/InlineEdit'
```

Inside `ProjectDetailView`: `useUpdateProject` is a **hook**, so it must be
called unconditionally — place it with the other data hooks, ABOVE the
`isLoading` / `isError` early returns. Calling it alongside `caps` (which sits
below those returns) would be a conditional hook call and React would throw
"Rendered fewer hooks than expected" on first load. The three plain helper
functions below are not hooks and do belong next to `caps`.

```ts
  const update = useUpdateProject(projectId)   // ← above the early returns

  const saveField = (field: string) => async (next: unknown) => {
    await update.mutateAsync({ [field]: next === '' ? null : next })
  }

  // brands/retailers/markets are text[] on the server and reject null, so an
  // emptied list must become [] rather than following the saveField path.
  const saveList = (field: string) => async (next: unknown) => {
    const items = String(next ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    await update.mutateAsync({ [field]: items })
  }

  /** Project dates arrive as ISO strings; <input type="date"> wants YYYY-MM-DD. */
  const toDateInput = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')
```

Empty string maps to `null` so clearing a field actually clears it rather than storing `''`.

Then extend the `OverviewTab` call site (line 191) to forward it:

```tsx
          <OverviewTab
            project={project}
            health={health}
            canEdit={caps.editProject}
            saveField={saveField}
            saveList={saveList}
            toDateInput={toDateInput}
          />
```

- [ ] **Step 2: Update the OverviewTab signature**

At line 260, the signature currently reads:

```tsx
function OverviewTab({
  project, health, canEdit,
}: { project: any; health: any; canEdit: boolean }) {
```

Replace with:

```tsx
function OverviewTab({
  project, health, canEdit, saveField, saveList, toDateInput,
}: {
  project: any
  health: any
  canEdit: boolean
  saveField: (field: string) => (next: unknown) => Promise<void>
  saveList: (field: string) => (next: unknown) => Promise<void>
  toDateInput: (v: string | null | undefined) => string
}) {
```

- [ ] **Step 3: Make the three prose panels editable**

Replace the whole left-hand column (the three `Panel` blocks currently at lines 266-277) with:

```tsx
        <Panel title="Business case" icon={FileText}>
          <InlineEdit
            value={project.businessCase ?? ''}
            variant="prose"
            canEdit={canEdit}
            label="business case"
            placeholder="No business case recorded yet."
            maxLength={10000}
            onSave={saveField('businessCase')}
          />
        </Panel>
        <Panel title="Success criteria" icon={Target}>
          <InlineEdit
            value={project.successCriteria ?? ''}
            variant="prose"
            canEdit={canEdit}
            label="success criteria"
            placeholder="No success criteria recorded yet."
            maxLength={10000}
            onSave={saveField('successCriteria')}
          />
        </Panel>
        {/* Rendered whenever it can be edited: the old `project.description &&`
            guard meant a project without a description had no panel, and so no
            way to ever add one. */}
        {(canEdit || project.description) && (
          <Panel title="Description" icon={FileText}>
            <InlineEdit
              value={project.description ?? ''}
              variant="prose"
              canEdit={canEdit}
              label="description"
              placeholder="No description yet."
              maxLength={10000}
              onSave={saveField('description')}
            />
          </Panel>
        )}
```

- [ ] **Step 4: Make the title editable in the header**

The title at line 122 is a static heading:

```tsx
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-snug">
              {project.title}
            </h1>
```

Replace with:

```tsx
            <div className="text-lg font-semibold tracking-tight text-[var(--text-primary)] leading-snug">
              <InlineEdit
                value={project.title}
                variant="text"
                canEdit={caps.editProject}
                label="project title"
                maxLength={300}
                onSave={saveField('title')}
              />
            </div>
```

`<h1>` becomes a `<div>` because the read affordance is itself a `<button>`,
and a button inside a heading is not valid. The visual weight is unchanged.

- [ ] **Step 5: Make Start and Target end editable**

The Key dates panel at line 322 uses a read-only `Row` helper. Replace the
first two rows, leaving Baseline and Actual end read-only — both are
governance-tier and a contributor's patch of them would 403:

```tsx
        <Panel title="Key dates" icon={CalendarDays}>
          <dl className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)] shrink-0">Start</dt>
              <dd className="flex-1 max-w-[60%]">
                <InlineEdit
                  value={toDateInput(project.startDate)}
                  variant="date"
                  canEdit={canEdit}
                  label="start date"
                  placeholder="Not set"
                  onSave={saveField('startDate')}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)] shrink-0">Target end</dt>
              <dd className="flex-1 max-w-[60%]">
                <InlineEdit
                  value={toDateInput(project.targetEndDate)}
                  variant="date"
                  canEdit={canEdit}
                  label="target end date"
                  placeholder="Not set"
                  onSave={saveField('targetEndDate')}
                />
              </dd>
            </div>
            <Row
              label="Baseline"
              value={project.baselineEndDate ? formatDate(project.baselineEndDate) : 'Not baselined'}
            />
            {project.actualEndDate && <Row label="Actual end" value={formatDate(project.actualEndDate)} />}
          </dl>
        </Panel>
```

- [ ] **Step 6: Add an editable priority and the tag lists**

Add a new panel to the right-hand column, directly after the Key dates panel
and before the closing `</div>` of that column. `Tag` must be added to the
existing `lucide-react` import at the top of the file:

```tsx
        <Panel title="Classification" icon={Tag}>
          <dl className="space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-[var(--text-tertiary)] shrink-0">Priority</dt>
              <dd className="flex-1 max-w-[60%]">
                <InlineEdit
                  value={project.priority ?? 'MEDIUM'}
                  variant="select"
                  canEdit={canEdit}
                  label="priority"
                  options={[
                    { value: 'CRITICAL', label: 'Critical' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'LOW', label: 'Low' },
                  ]}
                  onSave={saveField('priority')}
                />
              </dd>
            </div>
            {([
              ['brands', 'Brands'],
              ['retailers', 'Retailers'],
              ['markets', 'Markets'],
            ] as const).map(([field, label]) => (
              <div key={field}>
                <dt className="text-[var(--text-tertiary)] mb-0.5">{label}</dt>
                <dd>
                  <InlineEdit
                    value={(project[field] ?? []).join(', ')}
                    variant="text"
                    canEdit={canEdit}
                    label={label.toLowerCase()}
                    placeholder="None"
                    onSave={saveList(field)}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </Panel>
```

Tag lists are edited as a comma-separated string and split on save by
`saveList`. A dedicated chip editor is more than this slice needs, and the
server takes a plain `string[]` either way.

- [ ] **Step 7: Typecheck**

```bash
cd apps/web && npx tsc -b --noEmit
```

Expected: no errors. If `Prose` is now unused, delete it; if it is still used elsewhere in the file, leave it.

- [ ] **Step 8: Build**

```bash
cd apps/web && npx vite build
```

Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/modules/projects/views/ProjectDetailView.tsx
git commit -m "feat(projects): inline-edit project content fields on the Overview tab"
```

---

### Task 9: Create tasks from the board

**Files:**
- Create: `apps/web/src/modules/projects/components/TaskComposer.tsx`
- Modify: `apps/web/src/modules/projects/components/TaskBoard.tsx:28-42` (props and state), `:141-143` (header button), `:160-168` (empty state and column headers)

**Interfaces:**
- Consumes: the existing `useCreateTask(projectId)` hook; `caps.createTask` from Task 5.
- Produces: `TaskComposer` with props

```tsx
{
  projectId: string
  defaultStatus: string
  defaultDepartmentId: string | null
  onClose: () => void
  onCreated: () => void
}
```

- [ ] **Step 1: Write the composer**

Create `apps/web/src/modules/projects/components/TaskComposer.tsx`:

```tsx
import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { useCreateTask } from '../hooks/useProjects'

// Compact create-task form. Deeper fields (subtask line items, richer
// metadata) are sub-project B — this exists so you can add a task without
// leaving the board.
//
// The department lane is defaulted and validated here because
// CREATE_TASK_OWN_LANE denies a task with no lane, and denies a lane the
// actor does not hold. Catching it client-side turns a 403 into a hint.

const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

interface Props {
  projectId: string
  defaultStatus: string
  defaultDepartmentId: string | null
  onClose: () => void
  onCreated: () => void
}

export function TaskComposer({
  projectId, defaultStatus, defaultDepartmentId, onClose, onCreated,
}: Props) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<string>('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useCreateTask(projectId)

  const submit = async () => {
    if (!title.trim()) { setError('A title is required'); return }
    if (!defaultDepartmentId) {
      setError('You must belong to a department lane on this project to add a task')
      return
    }
    setError(null)
    try {
      await create.mutateAsync({
        title: title.trim(),
        status: defaultStatus,
        departmentId: defaultDepartmentId,
        priority,
        ...(dueDate ? { dueDate } : {}),
      })
      onCreated()
    } catch (err: any) {
      setError(err?.message ?? 'Could not create the task')
    }
  }

  const field = `w-full rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]`

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">New task</span>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={14} />
        </button>
      </div>

      <input
        autoFocus
        value={title}
        placeholder="What needs doing?"
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
        }}
        className={field}
      />

      <div className="flex gap-2">
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
          ))}
        </select>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={field} />
      </div>

      {error && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-2.5 py-1 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={create.isPending}
          className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
          style={{ background: 'var(--accent-secondary)' }}
        >
          {create.isPending && <Loader2 size={12} className="animate-spin" />}
          Add task
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add a canCreate prop to TaskBoard**

In `TaskBoard.tsx`, the props interface ends at line 26 with `currentMemberId?: string | null`. Add:

```ts
  canCreate: boolean
```

and destructure it in the signature at line 28:

```tsx
export function TaskBoard({ projectId, tasks, onOpenTask, currentMemberId, canCreate }: Props) {
```

Add state below the existing `useState` calls:

```ts
  // Which column's composer is open, or null. One at a time.
  const [composerFor, setComposerFor] = useState<string | null>(null)
```

Add the imports:

```ts
import { Plus } from 'lucide-react'
import { TaskComposer } from './TaskComposer'
```

`Plus` joins the existing `lucide-react` import on line 2 rather than becoming a second import statement.

- [ ] **Step 3: Add the header button**

In the header row, immediately after the "My tasks only" button block (which closes at line 142), add:

```tsx
        {canCreate && (
          <button
            type="button"
            onClick={() => setComposerFor(columns[0]?.key ?? null)}
            className="ml-auto px-3 py-1.5 rounded-full text-xs font-medium text-white inline-flex items-center gap-1.5"
            style={{ background: 'var(--accent-secondary)' }}
          >
            <Plus size={13} />
            New task
          </button>
        )}
```

- [ ] **Step 4: Add a per-column composer and plus button**

Inside the `columns.map((col) => ...)` render, at the top of each column's content — directly after the column header element and before the task list — add:

```tsx
              {canCreate && composerFor === col.key ? (
                <TaskComposer
                  projectId={projectId}
                  defaultStatus={col.droppableStatus ?? 'NOT_STARTED'}
                  defaultDepartmentId={scopeDeptId ?? null}
                  onClose={() => setComposerFor(null)}
                  onCreated={() => setComposerFor(null)}
                />
              ) : canCreate ? (
                <button
                  type="button"
                  onClick={() => setComposerFor(col.key)}
                  aria-label={`Add a task to ${col.label}`}
                  className="w-full rounded-lg border border-dashed border-[var(--border-subtle)] py-1.5
                    text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]
                    hover:border-[var(--accent)] transition-colors inline-flex items-center justify-center gap-1"
                >
                  <Plus size={12} />
                  Add
                </button>
              ) : null}
```

Both grouping branches build columns with a `label`, so `col.label` is always
present. `droppableStatus` is set only under status grouping, which is why the
composer falls back to `'NOT_STARTED'` under department grouping.

- [ ] **Step 5: Offer creation from the empty board**

The empty state at line 160 renders `<EmptyBoard mineOnly={mineOnly} />`. A board with a create affordance should not dead-end. Change that branch to:

```tsx
      {visible.length === 0 ? (
        <div className="space-y-3">
          <EmptyBoard mineOnly={mineOnly} />
          {canCreate && composerFor === null && (
            <div className="max-w-sm mx-auto">
              <button
                type="button"
                onClick={() => setComposerFor(columns[0]?.key ?? null)}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium text-white inline-flex items-center justify-center gap-1.5"
                style={{ background: 'var(--accent-secondary)' }}
              >
                <Plus size={13} />
                Add the first task
              </button>
            </div>
          )}
          {canCreate && composerFor !== null && (
            <div className="max-w-sm mx-auto">
              <TaskComposer
                projectId={projectId}
                defaultStatus="NOT_STARTED"
                defaultDepartmentId={scopeDeptId ?? null}
                onClose={() => setComposerFor(null)}
                onCreated={() => setComposerFor(null)}
              />
            </div>
          )}
        </div>
      ) : (
```

- [ ] **Step 6: Pass canCreate from the detail view**

In `ProjectDetailView.tsx`, the `<TaskBoard ...>` call site around line 197 gains:

```tsx
            canCreate={caps.createTask}
```

- [ ] **Step 7: Typecheck and build**

```bash
cd apps/web && npx tsc -b --noEmit && npx vite build
```

Expected: no errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/modules/projects/components/TaskComposer.tsx apps/web/src/modules/projects/components/TaskBoard.tsx apps/web/src/modules/projects/views/ProjectDetailView.tsx
git commit -m "feat(projects): create tasks from the project board"
```

---

### Task 10: Timeline client functions and hooks

**Files:**
- Modify: `apps/web/src/modules/projects/api/projectsClient.ts` (append near the other project functions, before the collab section at line 243)
- Modify: `apps/web/src/modules/projects/hooks/useProjects.ts` (append after `useProjectTimeline`, line 85)

**Interfaces:**
- Consumes: the existing private `send` helper and `qk` query keys.
- Produces the client functions and hooks below. Task 11 consumes the hooks.

Every server schema is `.strict()`, so sending an unknown key is a 422. Send only the keys listed.

- [ ] **Step 1: Add the client functions**

In `projectsClient.ts`, add:

```ts
// ─── Timeline: phases and milestones ─────────────────────────
// Bodies mirror the zod schemas in apps/api/src/routes/projectTimeline.ts
// exactly. All are .strict(): an extra key is a 422, not a warning.

export interface PhaseBody {
  name: string
  sequence: number
  departmentId?: string
  startDate?: string
  endDate?: string
  colorHex?: string
}

export interface MilestoneBody {
  name: string
  description?: string
  dueDate: string
  phaseId?: string
  ownerId?: string
  departmentId?: string
  isGate?: boolean
}

export const createPhase = (projectId: string, body: PhaseBody) =>
  send<any>('post', `/${projectId}/phases`, body)

export const updatePhase = (
  projectId: string,
  phaseId: string,
  body: Partial<PhaseBody> & {
    status?: string
    actualStart?: string | null
    actualEnd?: string | null
  },
) => send<any>('patch', `/${projectId}/phases/${phaseId}`, body)

export const deletePhase = (projectId: string, phaseId: string) =>
  send<null>('delete', `/${projectId}/phases/${phaseId}`)

export const reorderPhases = (projectId: string, orderedIds: string[]) =>
  send<any>('post', `/${projectId}/phases/reorder`, { orderedIds })

export const createMilestone = (projectId: string, body: MilestoneBody) =>
  send<any>('post', `/${projectId}/milestones`, body)

export const updateMilestone = (projectId: string, milestoneId: string, body: Partial<MilestoneBody>) =>
  send<any>('patch', `/${projectId}/milestones/${milestoneId}`, body)

export const deleteMilestone = (projectId: string, milestoneId: string) =>
  send<null>('delete', `/${projectId}/milestones/${milestoneId}`)
```

- [ ] **Step 2: Add the hooks**

In `useProjects.ts`, add after `useProjectTimeline`:

```ts
// ─── Timeline mutations ──────────────────────────────────────
// Each invalidates the timeline and the project detail: phase and milestone
// changes move the health score and the project's percent complete.

function useTimelineMutation<TArgs>(
  projectId: string,
  fn: (args: TArgs) => Promise<unknown>,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.timeline(projectId) })
      qc.invalidateQueries({ queryKey: qk.detail(projectId) })
      qc.invalidateQueries({ queryKey: qk.health(projectId) })
    },
  })
}

export function useCreatePhase(projectId: string) {
  return useTimelineMutation(projectId, (body: client.PhaseBody) =>
    client.createPhase(projectId, body))
}

export function useUpdatePhase(projectId: string) {
  return useTimelineMutation(
    projectId,
    ({ phaseId, ...body }: { phaseId: string } & Partial<client.PhaseBody>) =>
      client.updatePhase(projectId, phaseId, body),
  )
}

export function useDeletePhase(projectId: string) {
  return useTimelineMutation(projectId, (phaseId: string) =>
    client.deletePhase(projectId, phaseId))
}

export function useReorderPhases(projectId: string) {
  return useTimelineMutation(projectId, (orderedIds: string[]) =>
    client.reorderPhases(projectId, orderedIds))
}

export function useCreateMilestone(projectId: string) {
  return useTimelineMutation(projectId, (body: client.MilestoneBody) =>
    client.createMilestone(projectId, body))
}

export function useUpdateMilestone(projectId: string) {
  return useTimelineMutation(
    projectId,
    ({ milestoneId, ...body }: { milestoneId: string } & Partial<client.MilestoneBody>) =>
      client.updateMilestone(projectId, milestoneId, body),
  )
}

export function useDeleteMilestone(projectId: string) {
  return useTimelineMutation(projectId, (milestoneId: string) =>
    client.deleteMilestone(projectId, milestoneId))
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/web && npx tsc -b --noEmit
```

Expected: no errors. `client.PhaseBody` resolves because the file already does `import * as client from '../api/projectsClient'`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/modules/projects/api/projectsClient.ts apps/web/src/modules/projects/hooks/useProjects.ts
git commit -m "feat(projects): add phase and milestone client functions and hooks"
```

---

### Task 11: Phase and milestone editing on the timeline

**Files:**
- Create: `apps/web/src/modules/projects/components/PhaseEditor.tsx`
- Modify: `apps/web/src/modules/projects/components/TimelineGantt.tsx` (props and mount)

**Interfaces:**
- Consumes: the seven hooks from Task 10; `caps.editTimeline` from Task 5.
- Produces: `PhaseEditor` with props `{ projectId: string; phases: { id: string; name: string; sequence: number; startDate?: string | null; endDate?: string | null }[]; canEdit: boolean }`.

- [ ] **Step 1: Write the editor**

Create `apps/web/src/modules/projects/components/PhaseEditor.tsx`:

```tsx
import { useState } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import {
  useCreatePhase, useUpdatePhase, useDeletePhase, useReorderPhases,
} from '../hooks/useProjects'

// Phase management for the Gantt.
//
// `sequence` is unique per project (@@unique([projectId, sequence])) and the
// create route returns 409 on a clash, so the next sequence is derived here
// rather than asked for. If a concurrent create still wins the race, the
// server's message is surfaced verbatim.

interface Phase {
  id: string
  name: string
  sequence: number
  startDate?: string | null
  endDate?: string | null
}

export function PhaseEditor({
  projectId, phases, canEdit,
}: { projectId: string; phases: Phase[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)

  const create = useCreatePhase(projectId)
  const update = useUpdatePhase(projectId)
  const remove = useDeletePhase(projectId)
  const reorder = useReorderPhases(projectId)

  if (!canEdit) return null

  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence)
  const nextSequence = ordered.length ? Math.max(...ordered.map((p) => p.sequence)) + 1 : 1

  const submit = async () => {
    if (!name.trim()) { setError('A phase name is required'); return }
    // The server rejects this too (projectTimeline.ts:191); checking here
    // turns a round trip into an immediate hint.
    if (start && end && end < start) { setError('A phase cannot end before it starts'); return }
    setError(null)
    try {
      await create.mutateAsync({
        name: name.trim(),
        sequence: nextSequence,
        ...(start ? { startDate: start } : {}),
        ...(end ? { endDate: end } : {}),
      })
      setName(''); setStart(''); setEnd(''); setAdding(false)
    } catch (err: any) {
      setError(err?.message ?? 'Could not add the phase')
    }
  }

  const move = async (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    const ids = ordered.map((p) => p.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setError(null)
    try {
      await reorder.mutateAsync(ids)
    } catch (err: any) {
      setError(err?.message ?? 'Could not reorder the phases')
    }
  }

  const field = `rounded-md bg-[var(--bg-surface)] border border-[var(--border-subtle)]
    px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]`

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)]">Phases</span>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-xs text-[var(--accent)] inline-flex items-center gap-1 hover:underline"
          >
            <Plus size={12} />
            Add phase
          </button>
        )}
      </div>

      <ul className="space-y-1">
        {ordered.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 text-xs group">
            <span className="tabular-nums text-[var(--text-tertiary)] w-5">{p.sequence}</span>
            <input
              defaultValue={p.name}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next && next !== p.name) {
                  update.mutateAsync({ phaseId: p.id, name: next }).catch((err) =>
                    setError(err?.message ?? 'Could not rename the phase'))
                }
              }}
              className={`${field} flex-1`}
            />
            <button type="button" onClick={() => void move(i, -1)} disabled={i === 0}
              aria-label={`Move ${p.name} earlier`}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
              <ChevronUp size={13} />
            </button>
            <button type="button" onClick={() => void move(i, 1)} disabled={i === ordered.length - 1}
              aria-label={`Move ${p.name} later`}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-30">
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                setError(null)
                remove.mutateAsync(p.id).catch((err) =>
                  setError(err?.message ?? 'Could not delete the phase'))
              }}
              className="text-[var(--text-tertiary)] hover:text-[var(--danger)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input autoFocus value={name} placeholder="Phase name" maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setAdding(false); setError(null) }
              if (e.key === 'Enter') { e.preventDefault(); void submit() }
            }}
            className={`${field} flex-1 min-w-[10rem]`} />
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={field} />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={field} />
          <button type="button" onClick={() => void submit()} disabled={create.isPending}
            className="px-2.5 py-1 rounded-md text-xs font-medium text-white inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ background: 'var(--accent-secondary)' }}>
            {create.isPending && <Loader2 size={12} className="animate-spin" />}
            Add
          </button>
          <button type="button" onClick={() => { setAdding(false); setError(null) }}
            className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            Cancel
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Mount it in the Gantt**

`TimelineGantt`'s signature is currently:

```tsx
export function TimelineGantt({
  data, canReschedule, isLoading,
}: { data?: TimelineData; canReschedule: boolean; isLoading?: boolean }) {
```

It takes no `projectId`, so add one along with `canEdit`:

```tsx
export function TimelineGantt({
  data, canReschedule, isLoading, projectId, canEdit,
}: {
  data?: TimelineData
  canReschedule: boolean
  isLoading?: boolean
  projectId: string
  canEdit: boolean
}) {
```

Add the import:

```ts
import { PhaseEditor } from './PhaseEditor'
```

`phases` is already derived inside the component (`const phases = data?.phases ?? []`, line 62). Render the editor directly above the chart body, inside the component's outermost element:

```tsx
      <PhaseEditor projectId={projectId} phases={phases} canEdit={canEdit} />
```

Leave the existing task-bar drag and `computeRipple` confirmation untouched — `canReschedule` still governs those, and Task 5 already rebound it.

- [ ] **Step 3: Pass canEdit from the detail view**

At the `<TimelineGantt ...>` call site in `ProjectDetailView.tsx` (line 212), add both new props:

```tsx
            projectId={projectId}
            canEdit={caps.editTimeline}
```

- [ ] **Step 4: Typecheck and build**

```bash
cd apps/web && npx tsc -b --noEmit && npx vite build
```

Expected: no errors, build succeeds.

- [ ] **Step 5: Run the web test suite for regressions**

```bash
cd apps/web && npx vitest run
```

Expected: PASS. `ganttScale.test.ts` and `ripple.test.ts` must be untouched by this change — if either fails, the drag behaviour was altered and should be reverted.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/projects/components/PhaseEditor.tsx apps/web/src/modules/projects/components/TimelineGantt.tsx apps/web/src/modules/projects/views/ProjectDetailView.tsx
git commit -m "feat(projects): add phase management to the project timeline"
```

---

### Task 12: Full verification

**Files:** none modified unless a failure is found.

- [ ] **Step 1: Install from a clean state**

```bash
cd /Users/madig/Nexus-Collab && pnpm install
```

- [ ] **Step 2: Generate the Prisma client**

```bash
pnpm db:generate
```

The API typecheck reads generated Prisma types; a stale client produces errors that have nothing to do with this work.

- [ ] **Step 3: Run every test**

```bash
pnpm test
```

Expected: PASS across `@nexus/api`, `@nexus/web`, and `@nexus/shared`.

- [ ] **Step 4: Typecheck the API**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Build both apps**

```bash
pnpm build && pnpm build:api
```

Expected: both succeed.

- [ ] **Step 6: Report results honestly**

Paste the actual output of steps 3-5. If anything fails, say so with the output rather than describing the work as complete. No success claim without the command output that supports it.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/project-editability
```

---

## Deviations from the spec

Recorded here so review has them in one place.

1. **Spec §5 asked for `InlineEdit` component tests.** The web vitest environment is `node` with no jsdom and no `@testing-library/react`, and `apps/web/vitest.config.ts` says that is deliberate. Rather than add a DOM test stack, Task 6 extracts the behaviour into a pure state machine and tests it there — matching `ganttScale` and `ripple`, which are pure libs with tests consumed by components. The specific requirement "preserves input on save failure" is covered by an explicit test.

2. **Spec §5 asked for route-level tests of field tiering.** Every existing API test is service-layer; the only route test, `projects.integration.test.ts`, needs a live database and is excluded from the default run. So tiering lives in `services/projects/fieldTiers.ts` and is unit tested there (Task 2), with the route as a thin caller (Task 3).

3. **Spec §4.1 said an unknown key yields 400.** It is **422** — `parseOrThrow` raises `ValidationError`, whose status is 422 (`context.ts:27`).

4. **Spec §1.2 listed `projectTypeId` as governance without comment.** Task 2 keeps it there. It is worth knowing that changing a project's type can change which template-derived fields make sense, which is why it is not content.

5. **The spec identified one fail-open permission guess; there are two.** The
   identical expression appears at `ProjectDetailView.tsx:194` (`canEdit`) and
   `:217` (`canReschedule`). Task 5 fixes both and greps for a third.

6. **`canReschedule` needed its own capability.** The Gantt's task-bar drag
   calls `PATCH /tasks/:taskId`, which asserts `assertCanEditTask` — per-task
   lane rules, not `EDIT_PROJECT`. Binding it to `editProject` would have been
   wrong in a new way, so Task 4 adds `editTaskOwnLane`, probed against the
   actor's own lane.

7. **Task title length.** `createTaskSchema` allows `title` up to **500**
   characters, not 300; the composer matches the server.
