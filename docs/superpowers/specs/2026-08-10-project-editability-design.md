# Project Editability — Design

**Date:** 2026-08-10
**Status:** Approved for planning
**Sub-project:** A of four (see *Roadmap context*)

## Problem

A project in Nexus can be created but never changed. Once the create wizard
closes, the business case, success criteria and description are frozen prose;
tasks cannot be added from the board; phases and milestones cannot be touched
at all.

This is not a missing backend. `PATCH /projects/:id` accepts every content
field, writes a field-level activity diff, and is covered by policy. The task
and timeline write endpoints are complete. The frontend simply never calls
them:

| Capability | API | Client fn | Hook | UI |
|---|---|---|---|---|
| Edit project fields | `PATCH /:id` | `updateProject` | `useUpdateProject` | **none — no caller** |
| Create task | `POST /:id/tasks` | `createTask` | `useCreateTask` | **none** |
| Phase CRUD + reorder | 4 routes | **none** | **none** | **none** |
| Milestone CRUD | 3 routes | **none** | **none** | **none** |

So the work is: widen one policy rule, stop the client guessing at
permissions, and build the missing surfaces.

## Roadmap context

Ahmad's request covered six features spanning four independent subsystems.
They were decomposed; this spec is **A** only.

- **A — Make the project editable.** *This spec.*
- **B — Deepen the task module.** Subtask line items with real fields.
- **C — SKUs on a project.** Per-SKU stage/status/dates (bilingual labeling).
- **D — Excel in Nexus.** Decided: embed Office for the web, not a native grid.

B, C and D all add surfaces to a detail view that cannot currently be edited,
which is why A goes first.

## Scope

### In

1. Widen `EDIT_PROJECT` to any non-viewer project member.
2. Tier the `PATCH /:id` body so governance fields stay PM/admin.
3. Serve real capabilities from the API; delete the client's guess.
4. Inline click-to-edit on the Overview tab.
5. Task creation from the TaskBoard.
6. Phase and milestone editing on the Timeline.

### Out

Excel embedding (D). SKU linkage (C). Richer subtask fields (B). Any change to
baselining, status transitions, reports, or check-ins.

## 1. Permission model

### 1.1 Widen EDIT_PROJECT

`apps/api/src/services/projects/policy.ts:192` currently groups four actions:

```ts
case 'EDIT_PROJECT':
case 'SET_BASELINE':
case 'ADD_DEPARTMENT':
case 'PUBLISH_REPORT':
  return admin || pm ? ALLOW : deny('Requires the project manager or an admin')
```

`EDIT_PROJECT` splits out:

```ts
case 'EDIT_PROJECT':
  if (admin || pm) return ALLOW
  if (viewerOnly) return deny('Viewers cannot edit this project')
  return isProjectParticipant(actor, project)
    ? ALLOW
    : deny('You are not a member of this project')
```

`isProjectParticipant` is a new helper mirroring how `isViewerOnly`
(`policy.ts:131`) already resolves standing — an explicit `ProjectMember`, or
membership of a participating department. It is `membership(actor, project) ||
inParticipatingDept(actor, project)`, both of which exist.

Ordering matters: the `viewerOnly` check precedes participation, so a `VIEWER`
who is also in a participating department is still denied.

The other three actions are **deliberately unchanged**. `baselineEndDate` is
frozen at approval and every slip metric and health penalty is measured
against it; letting any contributor re-baseline would launder schedule slip
out of the health score.

### 1.2 Field tiering

`patchProjectSchema` (`projects.ts:440`) derives from the create schema and so
accepts `projectManagerId`, `executiveSponsorId`, `isConfidential`,
`budgetAmount` and `currency`. A contributor must not reassign the project
manager or move a project out of confidential.

Two tiers, enforced **server-side in the route**, not merely hidden in the UI:

- **Content** — `title`, `description`, `businessCase`, `successCriteria`,
  `priority`, `startDate`, `targetEndDate`, `brands`, `retailers`, `markets`,
  `customFields`. Any non-viewer member.
- **Governance** — `projectManagerId`, `executiveSponsorId`, `isConfidential`,
  `budgetAmount`, `currency`, `checkinCadence`, `checkinDayOfWeek`,
  `projectTypeId`, `actualEndDate`, `lessonsLearned`. PM or admin.

The route splits the parsed body by tier. If a non-PM/admin sends any
governance key, respond `403` naming the rejected fields rather than silently
dropping them — a silent drop looks like a save that worked.

`status` is not in either tier: it has its own `POST /:id/status` endpoint with
transition rules, and stays there.

### 1.3 Serve capabilities

`GET /projects/:id` returns no permission information, so
`ProjectDetailView.tsx:194` guesses:

```tsx
canEdit={project.projectManager?.id === currentMemberId || !currentMemberId}
```

This is wrong in both directions. `|| !currentMemberId` **fails open** — before
the member id resolves, every viewer is handed edit affordances the server will
reject. And it omits org admins, whom the server *does* allow.

`GET /:id` gains a `capabilities` object computed from the same `can()` the
write routes use:

```ts
capabilities: {
  editProject: boolean       // content tier
  editGovernance: boolean    // governance tier
  createTask: boolean
  editTimeline: boolean      // === editProject; timeline routes gate on EDIT_PROJECT
  setBaseline: boolean
}
```

`ProjectDetail` in `types.ts` carries it; the guess at line 194 is deleted.
Defaulting is closed — an absent `capabilities` means no edit affordances.

Note every timeline write route already asserts `EDIT_PROJECT`
(`projectTimeline.ts:188` through `:448`), so widening the rule grants timeline
editing to members with no further route changes. That is intended.

## 2. Inline editing on Overview

### 2.1 The primitive

No inline-edit component exists anywhere in the codebase, so
`modules/projects/components/InlineEdit.tsx` is new.

```tsx
interface InlineEditProps<T> {
  value: T
  variant: 'text' | 'prose' | 'date' | 'select' | 'tags'
  onSave: (next: T) => Promise<unknown>
  canEdit: boolean
  placeholder?: string   // shown in read mode when empty
  maxLength?: number
  options?: { value: string; label: string }[]  // select only
}
```

Behaviour:

- **Read mode** renders a real `<button>`, not a hover-only pencil, so the
  affordance is keyboard reachable and screen-reader announced. The pencil is
  a visual hint on hover; the button is the actual control.
- **Enter/click** enters edit mode with the caret at the end.
- **Esc** cancels and restores. **Cmd/Ctrl+Enter** saves. `prose` keeps plain
  Enter for newlines; `text` saves on Enter.
- **Blur does not save.** Autosave-on-blur loses work when focus moves
  unexpectedly and gives no undo point.
- **Pending** disables the field and shows a spinner in the Save button.
- **Failure** keeps edit mode open with the user's text intact and raises the
  existing `@/components/shared/Toast`. Text is never discarded on error.
- `canEdit === false` renders exactly today's read-only output — no button, no
  hover affordance.

### 2.2 Wiring

`OverviewTab` (`ProjectDetailView.tsx:260`) already receives `canEdit` and
already forwards it to `LinkedRecords`, so the prop threading exists.

Editable: Business case, Success criteria, Description, title (header),
priority, Start, Target end, and the brands/retailers/markets tag lists.

Not editable here: Baseline (governance), health, percentComplete (rolled up
from tasks), Actual end (governance tier).

Each field issues one `PATCH` through the existing `useUpdateProject(id)`,
applied optimistically and rolled back on failure. On success invalidate the
project detail and the list query, since title/priority/dates are list columns.

### 2.3 A blocking bug in the Description panel

`ProjectDetailView.tsx:263` renders:

```tsx
{project.description && (<Panel title="Description" ...>)}
```

A project with no description has no panel, so there is nowhere to click and
the field can never be filled. The panel must render whenever
`canEdit || project.description`, with the empty state acting as the edit
target. The same pattern applies to any other conditionally-rendered editable
field.

## 3. Task creation on TaskBoard

`TaskBoard.tsx` only drags status between columns. It gains:

- a **New task** button in the board header, and
- a per-column `+` that prefills that column's status.

Both open a compact `TaskComposer` in the projects module: title, department
lane, owner, priority, due date. Deeper fields are sub-project B.

The composer defaults the department lane to the actor's own and validates it
is present before submitting, because `CREATE_TASK_OWN_LANE`
(`policy.ts:210`) denies a task with no lane and denies a lane the actor does
not hold. Defaulting and validating client-side turns a server rejection into
a field-level hint.

Built inside the projects module rather than reusing
`components/tasks/TaskDetailForm.tsx`, which is bound to the separate
`@/hooks/useData` task system and a different task shape. Sharing it would
couple two task models that are not the same model.

Uses the existing `useCreateTask(projectId)`. Rendered only when
`capabilities.createTask`.

## 4. Timeline editing

The entire gap is client-side: `projectsClient.ts` has no phase or milestone
functions at all, despite seven working endpoints.

### 4.1 Client functions

Matching the server schemas exactly (`projectTimeline.ts:175`, `:223`, `:335`):

```ts
createPhase(projectId, { name, sequence, departmentId?, startDate?, endDate?, colorHex? })
updatePhase(projectId, phaseId, partial & { status?, actualStart?, actualEnd? })
deletePhase(projectId, phaseId)
reorderPhases(projectId, orderedIds)
createMilestone(projectId, { name, description?, dueDate, phaseId?, ownerId?, departmentId?, isGate })
updateMilestone(projectId, milestoneId, partial)
deleteMilestone(projectId, milestoneId)
```

All schemas are `.strict()`, so an unknown key is a 400 — the client must not
send extra fields.

### 4.2 Hooks and UI

Seven mutation hooks in `useProjects.ts`, each invalidating the timeline query.

`TimelineGantt.tsx` gains: add/rename/recolour/delete a phase, reorder phases,
and add/move/delete milestones. `sequence` is unique per project
(`projectId_sequence`) and the create route returns `409` on a clash, so the
UI derives the next sequence rather than asking the user for a number, and
surfaces the conflict if one still occurs.

Phase create and update both reject `endDate < startDate` server-side
(`projectTimeline.ts:191`); the form validates the same rule inline.

Existing task-bar drag with `computeRipple`/`describeRipple` confirmation is
**unchanged**. Phase date edits do not trigger ripple — phases are containers,
and the existing ripple model is defined over task dependencies.

## 5. Testing

Existing infrastructure: vitest in both `@nexus/api` and `@nexus/web`
(`ganttScale.test.ts`, `ripple.test.ts`, `policy.test.ts`).

- **`policy.test.ts`** — the `it.each` at line 131 asserts contributors are
  denied `EDIT_PROJECT`; `EDIT_PROJECT` comes out of that group. New cases:
  contributor allowed, lane lead allowed, viewer denied, department-lane viewer
  denied, non-member denied, cross-org denied. The three remaining governance
  actions keep their existing assertions unchanged.
- **Route tests** — governance field sent by a contributor returns 403 naming
  the field; content field by a contributor succeeds; both tiers by a PM
  succeed.
- **`InlineEdit`** — saves on Cmd+Enter, cancels on Esc, preserves input on
  save failure, renders inert when `canEdit` is false.
- **Timeline hooks** — each mutation posts the expected body shape.

Verification before any completion claim: `pnpm install` (node_modules is 340
commits stale), then `pnpm test`, `pnpm typecheck`, `pnpm build`.

## 6. Risks

- **Widening EDIT_PROJECT widens timeline editing simultaneously**, because
  those routes share the rule. Intended, but it means the blast radius of the
  policy change is larger than the diff suggests, and the policy tests are the
  guard.
- **Field tiering is new surface area.** A field added to the create schema
  later will silently land in neither tier. The route derives the content tier
  from an explicit allowlist and rejects unknown keys, so a forgotten field
  fails closed and loudly rather than becoming editable by everyone.
- **`node_modules` is 340 commits stale.** Nothing can be verified until
  `pnpm install` runs; a green typecheck before that means nothing.

## Open questions

None. Two assumptions were raised and accepted: viewers are excluded from
editing, and governance fields remain PM/admin.
