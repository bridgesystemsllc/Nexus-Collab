# Task Detail as a Wide Modal — Design

**Date:** 2026-08-19
**Status:** Approved for planning
**Depends on:** #93 (expanded task detail + subtasks) and #94 (email/Teams
conversations), both merged.

## Problem

The task detail is a right-hand drawer capped at `max-w-lg` — 512px
(`TaskDetailDrawer.tsx:112`, panel; `:104`, shell). Into that column it renders
457 lines of its own content plus a 607-line conversations panel
(`TaskConversations`, mounted at `:402`).

That was tolerable when the drawer showed five read-only rows. It is not
tolerable now: an email thread, a Teams transcript, a reply box, a field grid,
subtasks, a checklist and dependencies are all stacked in one 512px scroll.
The content outgrew the container.

## Scope

### In

1. Convert the drawer to a centred two-column modal.
2. Move the conversations panel into the second column, unchanged.
3. Surface four fields the API already accepts but the UI never showed.
4. Wire in the existing task attachments/comments component.

### Out

- Any change to `TaskConversations`' internals.
- `effort` and `brandNames` — real columns on `Task`, but absent from
  `createTaskSchema`, so they need API work. Not worth it for this change.
- Any change to the task API. Everything below uses routes that already exist.

## 1. Shape

`TaskDetailDrawer` becomes `TaskDetailModal`:

- Centred, not edge-anchored. `max-w-[1200px]`, `max-h-[85vh]`.
- Two columns on a CSS grid, collapsing to one below the `lg` breakpoint.
- **Each column scrolls independently.** One shared scrollbar means paging
  through an email thread drags the field grid off-screen; that is the specific
  failure this layout exists to prevent.
- The backdrop, z-index and click-outside behaviour carry over unchanged.

It keeps `useModalBehaviour`. PR #94 taught that hook to track a stack of open
modals so Escape closes only the topmost — without it, Escape inside the email
picker also closed the task beneath it. A modal-over-modal design depends on
that fix, which is why this work sits on top of #94 rather than beside it.

Single call site: `ProjectDetailView.tsx:287`. Blast radius is one import and
one JSX element.

## 2. Column allocation

**Left — the record.** Identity header (task number, cross-department
acceptance banner, editable title), the field grid, description, subtasks,
checklist.

**Right — conversation and evidence.** `TaskConversations`, then attachments
and comments, then dependencies.

`TaskConversations` is mounted as-is. Only its position changes. It is 607
lines that landed the same day as this design; editing its internals during a
layout change is how working code gets lost in a diff nobody can compile.

## 3. Fields to surface

All four are already accepted by `patchTaskSchema`
(`apps/api/src/routes/projectTasks.ts:369`), which is `createTaskSchema`
partialled and extended. **No API change is required for any of them.**

| Field | Source | Control |
|---|---|---|
| `tags` | `createTaskSchema:242` (`string[]`) | comma-separated text, split on save — same treatment the project brand/retailer/market lists use |
| `percentComplete` | extended, `int 0-100` | number input, clamped |
| `actualHours` | extended, `number >= 0` | number input beside the existing estimate |
| `milestoneId` | `createTaskSchema:235` | select, mirroring the existing phase select |

`percentComplete` and `actualHours` pair naturally with fields already on
screen — progress next to status, actual next to estimate.

### One trap, already paid for once

`tags` is `z.array(z.string()).default([])` (`createTaskSchema:242`). Under
`.partial()` that becomes optional but **not nullable**. An emptied tag list
must therefore send `[]`, never `null` — a `null` is rejected and the user sees
a validation error instead of a cleared field.

This is the identical mistake the project editability branch shipped and had to
fix: `.partial()` does not imply nullable, and no typechecker catches it because
it is a data-contract mismatch rather than a type error. The project fields use
a dedicated `saveList` helper for exactly this reason; task tags need the same
treatment, not the generic save path.

## 4. Attachments and comments

Mount the existing shared component in the right column:

```tsx
<TaskAttachments taskId={task.id} module="projects" />
```

`apps/web/src/components/shared/TaskAttachments.tsx:678` already takes exactly
`{ taskId, module }`. It is used in eight other surfaces — Ops production,
R&D formulations, CM detail, tech transfer, open orders — and never in the
projects task. It provides file upload, attach-file-by-URL, and an editable
comment thread, against routes that already exist:

```
GET    /:taskId/attachments
POST   /:taskId/attachments/email | /file | /file/url | /comment
PATCH  /attachments/:id       (comments only)
DELETE /attachments/:id
```

This is a one-line wiring of a component with eight existing consumers, not new
surface area.

### The caveat that comes with it

`Attachment` is polymorphic: rows are keyed by `attachableType: 'task'` and
`attachableId`, and `GET /:taskId/attachments` filters on those two values
without checking that the task exists or that the caller may see it. Any
authenticated user who knows or guesses a task id can read its attachments and
comments.

This is pre-existing and already reachable from eight other screens, so wiring
it here does not create the hole. But the projects module is the one area just
rebuilt around server-computed capabilities that fail closed, and this is a
read path that fails open. The honest position: wire it, and record the gap as
a known issue rather than let it disappear into a UI change.

## 5. What this does not change

The task API. The conversations feature. The board. The capability model —
`canEdit` continues to gate every control exactly as it does today, and the
modal passes the same prop to the same children.

## 6. Testing and verification

`apps/web/vitest.config.ts` is `environment: 'node'` with `include:
['src/**/*.test.ts']` — no DOM, no testing-library, deliberately. A modal is
presentational and has no pure logic worth extracting, so **this change gets no
unit test**, and pretending otherwise would be worse than saying so.

What must hold instead:

- `pnpm build` (`tsc -b && vite build`) — the only automated check that touches
  this code.
- Existing suites stay green; nothing here should affect them.
- Browser checks: both columns scroll independently; Escape closes a picker
  without closing the task; the modal collapses to one column below `lg`; every
  control stays disabled for a user without `canEdit`.

Note CI (#95) is open but not merged, so none of this runs automatically yet.

## 7. Risks

- **Layout regressions are invisible to every check available.** No test can
  catch a broken grid; only the browser can.
- **#94 landed hours ago.** Everything in the right column is new code. A
  layout change that also edits it would make a genuine regression there
  indistinguishable from a move.
- **The polymorphic attachment read path**, above.

## Open questions

None. Two were raised and settled: `TaskConversations` moves unmodified, and
`effort`/`brandNames` are out of scope because they require API changes.
