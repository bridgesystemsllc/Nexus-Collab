# Task Detail Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 512px task drawer into a centred two-column modal and fill the new room with context the API already returns.

**Architecture:** One file changes shape — `TaskDetailDrawer.tsx` becomes `TaskDetailModal.tsx`, a centred dialog whose body is a two-column grid with independently scrolling halves. Existing content is redistributed, not rewritten: the record on the left, conversation and evidence on the right. Three already-supported fields and one already-built attachments component fill the space.

**Tech Stack:** React 18, TypeScript, Tailwind, lucide-react, TanStack Query, vitest (node env, no DOM).

## Global Constraints

- **No JavaScript toolchain on the authoring machine.** No `node`, `npm`, `npx`, `pnpm`, `tsc`, `vitest`, `vite` — only `bun`, which cannot resolve this pnpm workspace. **Never run them. Never fabricate their output.** Steps that would run them are recorded NOT RUN. Verify by reading instead: confirm every symbol exists, is exported, and has the shape you assume.
- **`TaskConversations` is moved, never modified.** It is 607 lines merged in PR #94. Changing its internals during a layout change makes a real regression indistinguishable from a move.
- **`components/shared/TaskAttachments.tsx` is used as-is.** It has eight existing consumers; it is not to be edited, forked, or wrapped.
- **`canEdit` gates every control**, exactly as today. Every input, select and button that writes must carry `disabled={!canEdit}` or be rendered only when `canEdit`.
- **Design tokens only** — `var(--text-primary)`, `var(--text-secondary)`, `var(--text-tertiary)`, `var(--bg-base)`, `var(--bg-elevated)`, `var(--bg-overlay)`, `var(--border-subtle)`, `var(--border-default)`, `var(--border-strong)`, `var(--danger)`, `var(--warning)`. Never a hex or `rgb()` literal, except the existing `rgba(...)` background washes already in this file, which are kept verbatim.
- **Icons come from the existing `lucide-react` import** in each file. Never add a second import statement from the same module.
- Branch is `feat/task-detail-modal`, already created off `main`. Commit only the files each task touches; never `git add -A`.

## File Structure

**Rename + rewrite:**
- `apps/web/src/modules/projects/components/TaskDetailDrawer.tsx` → `TaskDetailModal.tsx` — the dialog shell and layout. Keeps every existing mutation, handler and section; changes where they render.

**Modify:**
- `apps/web/src/modules/projects/views/ProjectDetailView.tsx:19,287` — import and call site.
- `apps/web/src/modules/projects/types.ts` — add `actualHours` to `ProjectTask`.

**Reused unchanged:**
- `apps/web/src/modules/projects/components/TaskConversations.tsx`
- `apps/web/src/components/shared/TaskAttachments.tsx`
- `apps/web/src/modules/projects/lib/useModalBehaviour.ts`

---

### Task 1: Convert the drawer to a two-column modal

**Files:**
- Rename: `apps/web/src/modules/projects/components/TaskDetailDrawer.tsx` → `apps/web/src/modules/projects/components/TaskDetailModal.tsx`
- Modify: `apps/web/src/modules/projects/views/ProjectDetailView.tsx:19` (import), `:287` (call site)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function TaskDetailModal(props)` with the **identical prop interface** the drawer has today — `{ task, projectId, canEdit, members?, onClose, onOpenTask? }`. Tasks 2 and 3 add content inside it.

- [ ] **Step 1: Rename the file, preserving history**

```bash
cd /Users/madig/Nexus-Collab
git mv apps/web/src/modules/projects/components/TaskDetailDrawer.tsx \
       apps/web/src/modules/projects/components/TaskDetailModal.tsx
```

- [ ] **Step 2: Rename the component and update its header comment**

In `TaskDetailModal.tsx`, change the exported function name only — leave the `Props` interface and every mutation exactly as they are:

```tsx
export function TaskDetailModal({
  task, projectId, canEdit, members = [], onClose, onOpenTask,
}: Props) {
```

Replace the block comment that begins `// ─── Task detail ───` with:

```tsx
// ─── Task detail ─────────────────────────────────────────────
// A centred two-column modal, not a side drawer. The drawer was capped at
// 512px, which was fine for five read-only rows and is not fine now that this
// screen also carries an email thread, a Teams transcript and a reply box.
//
// The two halves scroll independently. Sharing one scrollbar means paging
// through a long conversation drags the field grid off-screen, which is the
// specific failure this layout exists to prevent.
//
// Editing stays field-at-a-time against the existing PATCH route rather than a
// form with a save button. A modal someone opens to change one date should not
// make them commit a whole record.
```

- [ ] **Step 3: Replace the shell**

Replace the outer `<div>` and `<aside>` (currently lines 103-114, the elements carrying `fixed inset-0 z-50 flex justify-end` and `h-full w-full max-w-lg`) with:

```tsx
    <div
      className="projects-module fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={ref}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)]"
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
      >
```

The closing `</aside>` becomes `</div>`.

`ref` is typed `useModalBehaviour<HTMLElement>(onClose)`. A `div` is an `HTMLElement`, so that declaration still compiles unchanged — do not alter it.

- [ ] **Step 4: Make the header span both columns and stop it scrolling**

Wrap the existing header block, the error alert, and the blocked banner — everything from `{/* Header */}` down to the end of the `task.status === 'BLOCKED'` block — in a non-scrolling container. Keep every child's markup byte-identical; only the wrapper is new:

```tsx
        {/* Header — spans both columns and never scrolls, so the task you are
            editing stays identified no matter how far either side is scrolled. */}
        <div className="shrink-0 border-b border-[var(--border-subtle)] px-5 pb-4 pt-5">
          {/* ...existing header markup, error alert and blocked banner, unchanged... */}
        </div>
```

- [ ] **Step 5: Add the two-column body**

Immediately after the header container, open the grid. Everything that followed the blocked banner goes inside one of the two columns:

```tsx
        {/* Body. `min-h-0` on the grid and on each column is required: without
            it a grid child defaults to min-content height and refuses to
            shrink, so `overflow-y-auto` never engages and the whole modal
            scrolls as one instead. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <div className="min-h-0 space-y-4 overflow-y-auto p-5 lg:border-r lg:border-[var(--border-subtle)]">
            {/* LEFT: field grid, Description, Subtasks, Checklist */}
          </div>
          <div className="min-h-0 space-y-4 overflow-y-auto p-5">
            {/* RIGHT: TaskConversations, Dependencies */}
          </div>
        </div>
```

**Left column** receives, in this order and otherwise unchanged: the `grid grid-cols-2 gap-2.5` field block, `<Section title="Description">`, the `{!isSubtask && (<Section title="Subtasks" ...>)}` block, and `<Section title="Checklist" ...>`.

**Right column** receives: `<TaskConversations taskId={task.id} canEdit={canEdit} />` and the `<Section title="Dependencies" icon={GitBranch}>` block.

Do not edit the contents of any of those blocks in this task.

- [ ] **Step 6: Update the call site**

In `apps/web/src/modules/projects/views/ProjectDetailView.tsx`, line 19:

```tsx
import { TaskDetailModal } from '../components/TaskDetailModal'
```

and at line 287 change the element name only — every prop stays as it is:

```tsx
        <TaskDetailModal
```

Confirm by reading that the closing tag and all props are untouched, and that no other file imports `TaskDetailDrawer`:

```bash
grep -rn "TaskDetailDrawer" apps/web/src
```

Expected: no output. Report it verbatim if there is any.

- [ ] **Step 7: Typecheck and build — NOT RUN**

These are the commands that would verify this task:

```bash
cd apps/web && npx tsc -b --noEmit && npx vite build
```

You cannot run them; there is no toolchain. Record NOT RUN. Instead re-read the file and confirm: every JSX tag you opened is closed, the `</aside>` is gone, the two column `<div>`s are balanced, and no block was dropped when moving it.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/modules/projects/components/TaskDetailModal.tsx \
        apps/web/src/modules/projects/views/ProjectDetailView.tsx
git commit -m "feat(tasks): task detail becomes a two-column modal"
```

---

### Task 2: Surface tags, percent complete and actual hours

**Files:**
- Modify: `apps/web/src/modules/projects/types.ts` (the `ProjectTask` interface)
- Modify: `apps/web/src/modules/projects/components/TaskDetailModal.tsx` (the left column's field grid)

**Interfaces:**
- Consumes: `TaskDetailModal` from Task 1, and its existing `update` mutation — `useMutation({ mutationFn: (body: Record<string, unknown>) => client.updateTask(task.id, body) })`.
- Produces: no new exports.

- [ ] **Step 1: Add `actualHours` to the task type**

`ProjectTask` declares `estimatedHours` but not `actualHours`. The API does return it — the tasks route uses Prisma's default scalar selection, so every scalar column comes back — TypeScript simply does not know.

In `apps/web/src/modules/projects/types.ts`, directly beneath the existing `estimatedHours` line, add:

```ts
  /** Decimal on the server, so it arrives as a string. Mirrors estimatedHours. */
  actualHours?: string | number | null
```

- [ ] **Step 2: Add the three controls to the field grid**

At the end of the `grid grid-cols-2 gap-2.5` block in the left column — after the existing `Phase` `Labelled` and before the block's closing `</div>` — add:

```tsx
          <Labelled label="Actual (hours)">
            <input
              type="number" min="0" step="0.5" disabled={!canEdit} className={field}
              defaultValue={task.actualHours != null ? String(task.actualHours) : ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? undefined : Number(e.target.value)
                if (v !== (task.actualHours == null ? undefined : Number(task.actualHours))) {
                  update.mutate({ actualHours: v })
                }
              }}
            />
          </Labelled>
          <Labelled label="Progress (%)">
            <input
              type="number" min="0" max="100" step="5" disabled={!canEdit} className={field}
              defaultValue={String(task.percentComplete ?? 0)}
              onBlur={(e) => {
                if (e.target.value === '') { e.target.value = String(task.percentComplete ?? 0); return }
                // The server rejects anything outside 0-100; clamping here turns
                // a fat-fingered 1000 into a saved 100 rather than an error.
                const v = Math.min(100, Math.max(0, Math.round(Number(e.target.value))))
                e.target.value = String(v)
                if (v !== (task.percentComplete ?? 0)) update.mutate({ percentComplete: v })
              }}
            />
          </Labelled>
```

Then, immediately after the field grid's closing `</div>` and before `<Section title="Description">`, add the tags row — it needs the full width, not a grid cell:

```tsx
        <Section title="Tags">
          <input
            type="text"
            disabled={!canEdit}
            className={field}
            placeholder={canEdit ? 'comma, separated, tags' : 'No tags'}
            defaultValue={(task.tags ?? []).join(', ')}
            onBlur={(e) => {
              const next = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
              const current = task.tags ?? []
              const changed =
                next.length !== current.length || next.some((t, i) => t !== current[i])
              // `tags` is z.array(z.string()).default([]) — optional under
              // .partial() but NOT nullable. An emptied list must send [], never
              // null, or the save 422s and the user sees a validation error
              // instead of cleared tags.
              if (changed) update.mutate({ tags: next })
            }}
          />
        </Section>
```

`actualHours` uses `undefined` rather than `null` for an emptied value for the same reason: `patchTaskSchema` extends it as `z.number().nonnegative().optional()`, which is not nullable. `undefined` is dropped by `JSON.stringify`, so the key is simply omitted.

- [ ] **Step 3: Verify the field names against the server — read, do not run**

Confirm by reading `apps/api/src/routes/projectTasks.ts` that all three keys are accepted:

- `tags` — `createTaskSchema:242`, `z.array(z.string()).default([])`
- `percentComplete` — `patchTaskSchema` extend block, `z.number().int().min(0).max(100).optional()`
- `actualHours` — same extend block, `z.number().nonnegative().optional()`

The schema is `.strict()`, so a misspelled key is a 422, not a warning. Report anything that does not match rather than adjusting the server.

- [ ] **Step 4: Typecheck — NOT RUN**

```bash
cd apps/web && npx tsc -b --noEmit
```

No toolchain. Record NOT RUN. Re-read instead and confirm `task.actualHours` resolves against the type you edited in Step 1.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/projects/types.ts \
        apps/web/src/modules/projects/components/TaskDetailModal.tsx
git commit -m "feat(tasks): surface tags, progress and actual hours"
```

---

### Task 3: Wire attachments and comments into the right column

**Files:**
- Modify: `apps/web/src/modules/projects/components/TaskDetailModal.tsx` (import + right column)

**Interfaces:**
- Consumes: `TaskDetailModal` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Confirm the component's real signature before using it**

Read `apps/web/src/components/shared/TaskAttachments.tsx` and confirm the export is:

```tsx
export function TaskAttachments({ taskId, module }: TaskAttachmentsProps)
```

Check whether `module` is optional or required, and what type it is. Use exactly what you find. If it differs from the call in Step 2, report it rather than guessing — do not edit that file, it has eight other consumers.

- [ ] **Step 2: Import and mount it**

Add to the imports in `TaskDetailModal.tsx`:

```tsx
import { TaskAttachments } from '@/components/shared/TaskAttachments'
```

In the right column, between `<TaskConversations .../>` and the Dependencies section:

```tsx
          <Section title="Files & comments" icon={Paperclip}>
            <TaskAttachments taskId={task.id} module="projects" />
          </Section>
```

Add `Paperclip` to the existing `lucide-react` import at the top of the file — do not create a second import statement.

- [ ] **Step 3: Check what the component does about permissions**

`TaskAttachments` takes no `canEdit` prop. Read it and determine whether it renders write controls unconditionally. Report what you find in your report; **do not** modify the shared component and do not wrap it in a `canEdit` guard yet — whether a read-only viewer should see an upload button is a decision for the reviewer, and hiding it silently would bury the question.

- [ ] **Step 4: Typecheck and build — NOT RUN**

```bash
cd apps/web && npx tsc -b --noEmit && npx vite build
```

No toolchain. Record NOT RUN. Confirm by reading that the `@/components/shared/...` alias is used elsewhere in this module (it is — `ProjectDetailView.tsx` imports `@/hooks/useData`), so the path resolves.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/projects/components/TaskDetailModal.tsx
git commit -m "feat(tasks): attach files and comments to a project task"
```

---

### Task 4: Verification handoff

**Files:**
- Create: `docs/superpowers/plans/2026-08-19-task-detail-modal-VERIFY.md`

**Interfaces:** none.

This plan produces no unit tests, and that is deliberate, not an omission: `apps/web/vitest.config.ts` sets `environment: 'node'` with `include: ['src/**/*.test.ts']` — no DOM, no testing-library — and a modal has no pure logic worth extracting. `pnpm build` is the only automated check that touches this code. Everything else is the browser.

- [ ] **Step 1: Write the handoff**

Create `docs/superpowers/plans/2026-08-19-task-detail-modal-VERIFY.md` containing:

```markdown
# Task Detail Modal — Verification Handoff

**Status: NOT VERIFIED.** No typecheck, build or test has been run against
this branch. The authoring machine has no JavaScript toolchain.

## Run on Replit

    pnpm install && pnpm db:generate && pnpm test && pnpm typecheck && pnpm build && pnpm build:api

`pnpm build` is the check that matters here — its script is `tsc -b && vite
build`, so it is what typechecks the web app. `pnpm typecheck` covers the API
only and this branch does not touch the API.

## Click through, in the browser

1. **Open a task from the board.** It opens centred, roughly 1200px wide, not
   as a right-hand drawer.
2. **Scroll each half independently.** Page through a long email thread on the
   right; the field grid on the left must not move.
3. **Narrow the window below the `lg` breakpoint.** It collapses to one
   column, and nothing is clipped or unreachable.
4. **Escape with a picker open.** Open the attach-email picker, press Escape:
   only the picker closes, the task stays. This is the modal stack from PR #94
   and it is what a modal-over-modal layout depends on.
5. **Edit each new field.** Tags, Progress, Actual hours each save on blur.
   Empty the tag list — it must clear, not error. Type 1000 into Progress — it
   must clamp to 100 and save.
6. **Attach a file and post a comment**, then edit the comment.
7. **Open as a user without edit rights.** Every control is disabled or absent.
   Note explicitly whether the attachments panel still offers upload — see
   "Known gaps".

## Known gaps

- **The attachments read path is unguarded.** `GET /:taskId/attachments`
  filters on `attachableType: 'task'` and `attachableId` without checking the
  task exists or that the caller may see it. Any authenticated user who knows a
  task id can read its attachments and comments. Pre-existing and already
  reachable from eight other screens — not created here, but newly exposed in
  the one module built around capabilities that fail closed.
- **`TaskAttachments` takes no `canEdit`.** Whether a read-only viewer should
  see upload controls is unresolved; see the Task 3 report.
- **`milestoneId` is not surfaced.** The type carries the id but neither the
  type nor the tasks route returns a `milestone` relation, so there is no name
  to show. It needs a one-line `include` on the API, which this plan's spec put
  out of scope.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-19-task-detail-modal-VERIFY.md
git commit -m "docs: verification handoff for the task detail modal"
```

---

## Deviations from the spec

1. **`milestoneId` dropped.** The spec listed four fields to surface and said
   all four needed no API change. That holds for the PATCH route, but
   *displaying* a milestone needs a name, and neither `ProjectTask` nor the
   tasks route's `include` returns a `milestone` relation — only `phase`. The
   spec also put "any change to the task API" out of scope, so surfacing it
   properly is out of reach here. Three fields, not four.

2. **The spec said milestone would "mirror the existing phase select".** There
   is no phase select — `Phase` renders as read-only text
   (`TaskDetailModal.tsx`, the `Labelled label="Phase"` block). The spec's
   phrasing described something that does not exist.

3. **`actualHours` needed a type addition** the spec did not anticipate. The
   API returns it; `ProjectTask` never declared it. One line in `types.ts`.

4. **Empty numeric fields send `undefined`, not `null`.** `actualHours` and
   `percentComplete` are `.optional()` but not `.nullable()` in
   `patchTaskSchema`. The spec called this out for `tags`; it applies to these
   two as well.
