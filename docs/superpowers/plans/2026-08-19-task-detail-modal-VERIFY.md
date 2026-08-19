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
9. **Escape inside the attachments panel.** Open Files & comments → Add
   comment → type something → press Escape. The whole task modal closes and
   the draft is lost. `TaskAttachments`' own sub-modals do not register with
   `useModalBehaviour`'s stack, so the task modal stays topmost and answers the
   key. Known; it belongs to the same cross-cutting ticket as the `canEdit`
   rollout. Note that step 4's picker test passes, because `TaskConversations`
   *does* use the hook — so this failure hides behind a passing neighbour.

## Fixed during final review

- **Clearing the Estimate field returned a 422.** The handler sent `null` for
  `estimatedHours`, which is `.optional()` but not `.nullable()`. Fixed in
  `f1dce13` — both the mutated value and the change-detection baseline now use
  `undefined`. The same bug in the Description field was found and fixed in the
  same commit.

## Known gaps

### Below `lg`, the body becomes two stacked scrollers

The two columns each keep `min-h-0 overflow-y-auto`, so on a narrow screen the
definite body height is split between two independently scrolling panes rather
than one continuous scroll as the drawer had. Nothing is clipped or
unreachable, so the responsive check passes — but it is an ergonomics
regression on mobile and wants an explicit look in the browser before anyone
calls this done.

### The attachments API has no authorization at all

`apps/api/src/routes/taskAttachments.ts` applies **no permission check on any
route**. This is pre-existing and reaches 13+ screens; it is not introduced by
this branch, but this branch is the first time it appears in the projects
module, which was rebuilt around capabilities that fail closed.

- `DELETE /attachments/:id` (`:242-257`) finds the row, confirms it exists, and
  soft-deletes it. There is no actor resolution, no ownership check, and no
  capability check. **There is no authentication gate on the API router at
  all** — `api.use(attachMember)` (`apps/api/src/index.ts:105`) is explicitly
  non-blocking (`apps/api/src/auth/session.ts:164-176`), and there is no
  `requireAuth`/`requireSession` anywhere on the `/api/v1` router. So `DELETE
  /api/v1/tasks/attachments/:id` is reachable by **anyone who can reach the
  API**, with no session at all.
- The `POST` routes for email, file, file-by-URL and comment are equally
  unguarded.
- `createdBy` is read from `req.body`, so attribution is client-supplied.
  `resolveActingMemberId` (`apps/api/src/routes/taskAttachments.ts:10-20`)
  falls back to `prisma.member.findFirst()` when the client-supplied
  `createdBy` does not resolve, so an unattributable upload is attributed to
  an arbitrary member.
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

### `milestoneId` is not surfaced

The task type carries the id, but neither the type nor the tasks route returns a
`milestone` relation — only `phase` — so there is no name to display. Surfacing
it needs a one-line `include` on the API, which this plan's spec put out of
scope.
