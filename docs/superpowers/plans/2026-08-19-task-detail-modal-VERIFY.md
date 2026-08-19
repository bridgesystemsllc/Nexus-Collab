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
7. **Open as a user without edit rights.** Every control is disabled or absent
   — except attachments. The attachments panel will still show upload, attach
   and delete buttons regardless of edit rights; this is known and documented
   below under "Known gaps," not a regression in this branch. Note whether the
   server accepts such a write — it does.
8. **Check the footer.** A one-line strip below both columns reads either
   `Completed <date>` or `Created in <lane>`. It must stay visible while either
   column scrolls. It was a trailing paragraph in the drawer and became a
   spanning footer here; confirm it did not get lost.

## Known gaps

### The attachments API has no authorization at all

`apps/api/src/routes/taskAttachments.ts` applies **no permission check on any
route**. This is pre-existing and reaches 13+ screens; it is not introduced by
this branch, but this branch is the first time it appears in the projects
module, which was rebuilt around capabilities that fail closed.

- `DELETE /attachments/:id` (`:242-257`) finds the row, confirms it exists, and
  soft-deletes it. There is no actor resolution, no ownership check, and no
  capability check. **Any authenticated user can delete any attachment on any
  entity, given its id.**
- The `POST` routes for email, file, file-by-URL and comment are equally
  unguarded.
- `createdBy` is read from `req.body`, so attribution is client-supplied.
- The router sits behind `attachMember` (`apps/api/src/index.ts:131`), which
  `apps/api/src/auth/session.ts:164-176` documents as explicitly
  **non-blocking** — it never rejects a request.
- `GET /:taskId/attachments` filters on `attachableType`/`attachableId` without
  checking the caller may see the task.

The UI half matches: `TaskAttachments` takes no `canEdit` prop and renders four
unconditional write controls — attach email, attach file, add comment, and a
per-row delete. Every other control in this modal is gated on `canEdit`.

**This was deliberately not fixed here.** `TaskAttachments.tsx` has many
consumers, and gating only this one mount would hide *read* access from viewers
too — a worse bug than the one it fixes. The real fix is cross-cutting: an
optional `canEdit` prop rolled out to every consumer, plus server-side
authorization on the routes. The missing DELETE ownership check is the urgent
half and is independent of any UI work.

### Clearing the Estimate field returns a 422

`TaskDetailModal.tsx`'s `Estimate (hours)` handler sends `null` when the field
is emptied, but the server declares `estimatedHours: z.number().nonnegative().optional()`
(`apps/api/src/routes/projectTasks.ts:242`) — optional, **not nullable**. So
clearing an estimate fails validation instead of clearing.

Pre-existing, and sitting a few lines above the `Actual (hours)` field added by
this branch, which handles the same case correctly by sending `undefined`. One
line to fix; it is queued for this branch's final review.

### `milestoneId` is not surfaced

The task type carries the id, but neither the type nor the tasks route returns a
`milestone` relation — only `phase` — so there is no name to display. Surfacing
it needs a one-line `include` on the API, which this plan's spec put out of
scope.
