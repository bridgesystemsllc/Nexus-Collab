# Project Editability — Verification Handoff

**Branch:** `feat/project-editability` · **Base:** `1f863a0` · 25 commits
**Status: VERIFIED 2026-08-18**, after the branch had already been merged (#90).

All five commands below pass. The four predicted failure sites — the
`useReducer` generic, the ref union, `project: any` threading, Prisma drift —
produced no type errors. All seven hand-tested behaviours hold, except one that
did not and has been fixed:

> **`capabilities.defaultTaskLaneId` returned a lane the server rejects.** It
> was `actor.departmentId` unconditionally. The policy is satisfied by the
> actor's own department, but the create route *additionally* refuses a
> department that is not participating in the project — so an admin opening
> another department's project got an "Add task" button that 422'd on save
> ("That department is not participating in this project"). Reachable from the
> Projects page, whose default scope is the whole portfolio. It now resolves to
> a lane that exists on the project, and returns null rather than an unusable
> one. Nine regression tests in `capabilities.test.ts`.

Evidence for each path is in the section "Behaviour worth exercising by hand"
below; every item there was exercised against a running app on 2026-08-18.

## Why this document exists

The machine this was implemented on has no JavaScript toolchain — no `node`,
`npm`, `npx`, `pnpm`, `yarn`, `corepack` or Homebrew, only `bun`, which cannot
resolve this pnpm workspace (`package.json` has no `workspaces` key; the
monorepo is defined by `pnpm-workspace.yaml`). Root `node_modules` was empty.

Ahmad was told this before implementation began and decided to write all twelve
tasks anyway and verify on Replit, whose `replit.nix` provides `nodejs_20` and
`pnpm`. This file is Task 12 of the plan, converted from "run the commands" to
"here are the commands, in order, with what to expect."

Every task was still reviewed — 11 defects were found and fixed by an
adversarial read-only review pass. But review by reading is not verification.

## Run these in order

```bash
# 1. Install. Nothing below means anything until this succeeds.
pnpm install

# 2. Generate the Prisma client. The API typecheck reads generated types;
#    a stale client produces errors unrelated to this branch.
pnpm db:generate

# 3. Tests.
pnpm test

# 4. Typecheck the API.
pnpm typecheck

# 5. Build both apps.
pnpm build && pnpm build:api
```

### What step 3 covers

Four test files carry this branch's logic:

| File | Covers |
|---|---|
| `apps/api/src/services/projects/policy.test.ts` | the widened `EDIT_PROJECT` rule — contributor and lane lead allowed, both viewer forms denied, governance actions unchanged |
| `apps/api/src/services/projects/fieldTiers.test.ts` | content vs governance field split, `null` preserved / `undefined` dropped, tiers disjoint, `status` unrecognised |
| `apps/api/src/services/projects/capabilities.test.ts` | all seven capabilities for PM, contributor and viewer |
| `apps/web/src/modules/projects/lib/inlineEdit.test.ts` | the inline-edit state machine, including that a rejected save preserves the draft |

`inlineEdit.test.ts` has **14** `it` blocks. An earlier draft of the plan said
15; the plan text was wrong, not the file. Do not go hunting for a missing test.

The pre-existing `ganttScale.test.ts` and `ripple.test.ts` must still pass —
they are the guard that the Gantt's drag/ripple behaviour was not disturbed.

## Where failures are most likely

Nothing here was compiled, so the compiler's entire class of findings is
outstanding. In rough order of likelihood:

1. **`useReducer` generic instantiation** — `InlineEdit.tsx:28-31`. Two reviewers
   independently reasoned it typechecks, but neither could run `tsc`. If it is
   rejected, the fallback is
   `useReducer<React.Reducer<InlineEditState<T>, InlineEditEvent<T>>>(inlineEditReducer, INITIAL as InlineEditState<T>)`,
   plus importing `InlineEditEvent`.
2. **Ref union typing** — `InlineEdit.tsx:32`, one ref shared across
   `textarea` / `input` / `select` with per-branch casts.
3. **`project: any` prop threading** in `ProjectDetailView.tsx` — the new
   helpers are typed, but `OverviewTab` still takes `project: any`, so a
   mismatched field name would surface at runtime, not compile time.
4. **Prisma client drift** — if `pnpm db:generate` is skipped, expect type
   errors in `apps/api` that have nothing to do with this work.

## Behaviour worth exercising by hand

The review pass found several defects that no compiler or unit test would have
caught, because they were data-contract or empty-state problems. These are the
paths to click through once it builds:

1. **Clear a field.** Empty the business case on an existing project and save.
   It must clear, not error. (`.partial()` does not imply nullable — four
   content fields were made explicitly nullable to fix this.)
2. **Empty the title.** It must be *refused* with "Project title cannot be
   empty", not cleared — the column is non-null.
3. **Add a task from a collab or portfolio view.** Both scopes have no scope
   department. The lane now comes from the server as
   `capabilities.defaultTaskLaneId` (the actor's own department, which is what
   `CREATE_TASK_OWN_LANE` is evaluated against). An earlier attempt derived it
   client-side from `currentMemberId` — which no route ever passes, so it was
   always `null` and this path was dead. Worth testing from the Projects page
   specifically, since portfolio scope is the default there.
4. **Add a task from an empty board** in department grouping. The button must
   actually open a composer — it was previously a no-op.
5. **Add the first phase to a brand-new project** with no phases and no dated
   tasks. The timeline's empty state must still offer the phase editor.
6. **Fail a save while editing** (e.g. offline). The editor must stay open,
   keep your text, show the message, and keep focus in the field.
7. **Check a viewer sees no edit affordances at all** — capabilities now come
   from the server and default closed, where the old client guess failed open.

## What the review pass caught

Seventeen defects were found and fixed by adversarial review; none were caught
by a compiler, because none ran. The ones worth knowing about, because they
shape how this code behaves:

| Where | Defect |
|---|---|
| `capabilities.ts` | probe used `ownerId: null`, so `editTaskOwnLane` was false for **every** contributor |
| `ProjectDetailView.tsx` | the fail-open permission guess existed at **four** call sites, not one |
| `projects.ts` | `.partial()` does not imply nullable — clearing any content field 422'd |
| `TaskBoard.tsx` | task creation dead in collab/portfolio scope; empty board's buttons were literal no-ops |
| `TimelineGantt.tsx` | phase editor unreachable on an empty timeline — the state every new project starts in |
| `ProjectDetailView.tsx` | `currentMemberId` is declared but **never passed by any route**, so the lane fallback was always null |
| `projectCheckins.ts` | widening `EDIT_PROJECT` silently let contributors change check-in cadence |

That last-but-one item is worth dwelling on: because `currentMemberId` is
always undefined, the *old* guess `project.projectManager?.id === currentMemberId || !currentMemberId`
evaluated to `true` for everyone. Before this branch, every user saw every edit
affordance on every project. The server refused the writes, so it presented as
confusing 403s rather than a data breach — but the UI was telling everyone they
could edit.

## Known deferred items

- **A tag containing a comma splits into two tags** — brands/retailers/markets
  round-trip through `join(', ')` / `split(',')`. The plan accepted this
  trade-off explicitly; a chip editor was judged out of scope.
- **Untested no-op branches** in the inline-edit reducer: `SUBMIT`/`CANCEL`
  while saving, `BEGIN` while editing or failed. Implemented correctly by
  inspection; simply unasserted.
- **No optimistic update.** Design spec §2.2 asked for saves to apply
  optimistically and roll back on failure. `useUpdateProject` has no
  `onMutate`, so a saved field briefly shows its old value until the
  invalidation refetch lands. Implementing this blind — with no way to run a
  test — was judged riskier than the flicker. Left as a deliberate deviation.
- **Keyboard tab-away does not disarm the phase-delete confirm.** Escape and
  clicking elsewhere both clear it; tabbing away leaves it armed. It still
  takes a second deliberate click to delete, so nothing is destroyed by
  accident.
- **`editGovernance` and `setBaseline` capabilities are unconsumed** by any UI.
  Forward capacity, not dead code — but nothing exercises them yet.

## If something fails

The full decision history — every defect, who found it, and the reasoning
behind each fix — is in the SDD ledger at
`.superpowers/sdd/2026-08-10-project-editability/progress.md`, with per-task
reports beside it. **That directory is git-ignored, so it exists only on the
machine this was built on and will not appear on Replit.** The table above is
the portable summary; if you need more than that, pull it from the build
machine before it is cleaned up.
