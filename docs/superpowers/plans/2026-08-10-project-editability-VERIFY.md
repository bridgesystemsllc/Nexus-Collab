# Project Editability — Verification Handoff

**Branch:** `feat/project-editability` · **Base:** `1f863a0` · 25 commits
**Status: NOT VERIFIED.** No test, typecheck, or build has been run against any
of this code.

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
   department; the lane now falls back to the actor's own lane on the project.
4. **Add a task from an empty board** in department grouping. The button must
   actually open a composer — it was previously a no-op.
5. **Add the first phase to a brand-new project** with no phases and no dated
   tasks. The timeline's empty state must still offer the phase editor.
6. **Fail a save while editing** (e.g. offline). The editor must stay open,
   keep your text, show the message, and keep focus in the field.
7. **Check a viewer sees no edit affordances at all** — capabilities now come
   from the server and default closed, where the old client guess failed open.

## Known deferred items

- **`tiers.unrecognised` is computed but never inspected** by the PATCH route.
  Both `fieldTiers.ts` and the design spec promise an unclassified field "fails
  closed and loudly"; the route does not deliver that. Safe today only because
  `patchProjectSchema` is `.strict()`, so `status` is the only key that can
  land there. Fix is ~3 lines, or correct the two promises.
- **A tag containing a comma splits into two tags** — brands/retailers/markets
  round-trip through `join(', ')` / `split(',')`. The plan accepted this
  trade-off explicitly; a chip editor was judged out of scope.
- **Untested no-op branches** in the inline-edit reducer: `SUBMIT`/`CANCEL`
  while saving, `BEGIN` while editing or failed. Implemented correctly by
  inspection; simply unasserted.

## If something fails

The full decision history — every defect found, who found it, and why each fix
was chosen — is in the SDD ledger at
`.superpowers/sdd/2026-08-10-project-editability/progress.md`, along with
per-task reports. That directory is git-ignored scratch; read it before
deleting it if you need the reasoning behind any change.
