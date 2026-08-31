# Open Order Report (OOR) — Spec

Source: build prompt supplied by Ahmad George, 2026-08-30. Reproduced verbatim below so the plan
(`docs/superpowers/plans/2026-08-30-open-order-report.md`) argues from a spec that travels with it.

> **Note on target repo.** The prompt as written names `AmbiSyncOperations-V2`. Ahmad redirected the
> build to **Nexus-Collab** on 2026-08-30. The plan's "Spec vs repo" section records every place the
> prompt's assumptions differ from this codebase and how each was resolved.

---

## 0. Mission

Build the **Open Order Report (OOR)**: `Operations module → Purchase Order Tracking tab → Open Order Report tab`.

The OOR is the single operational surface where every **open PO line** is tracked from PO receipt through
production to ship, with its **shortage tree** (bulk → components → raw materials), its **status**, and its
full **collaboration history** (comments, notes, meeting updates, attached emails).

Today this lives in two Excel reports emailed around weekly. Both are in `fixtures/oor/`. They are the
literal spec for the on-screen grid and for the export. The feature replaces the manual spreadsheets;
it does not merely display them.

**Non-negotiables**
- Production-grade. No mock data, no `TODO`, no stubbed handlers, no placeholder components.
- Real migrations, real API routes, real parsers run against the two fixtures.
- Every list, filter, sort, and total is server-driven and paginated. No client-side "load everything."
- Follow existing repo conventions over anything in this spec that conflicts with them.

## 1. Plan before code

Recon first: map the Operations module (routing, tabs, layout shell, grid/modal primitives, auth/RBAC,
migration tooling, query layer, existing PO/order tables). Parse both fixtures. Report which entities
already exist that OOR must join to, and which are net new. Produce the plan and wait for approval.
Conflicts with the repo get stated in the plan, never silently forked into a second pattern.

## 2. The two report formats

### Format A — Customer Open Order Report (flat) — AcneFree fixture

Crystal Reports `Customer Open Order Rpt`. One row per open sales-order line. `Customer: ACNE FREE LLC`
above the grid. Columns in exact order with exact labels:

| # | Header | Type | Notes |
|---|---|---|---|
| 1 | `Customer PO Number` | text | Suffixes identify the channel: `PO06302026>CMLEX LOI`, `P06282025>AMZ`, `P06282025>Retail`. Never normalize the suffix away. |
| 2 | `Order` | text | e.g. `S0100057578` |
| 3 | `Item#` | text | `A` = Amazon, `F` = FD/secure tag, `MISC` = miscellaneous sales / changeover fee |
| 4 | `Description` | text | |
| 5 | `Qtys` | numeric-tolerant text | Dirty: one row holds `"50000+\n16,400"`. Parse when possible, else store raw and flag. |
| 6 | `RemQty` | numeric | **Defines "open."** |
| 7 | `Price` | currency | `$#,##0.00` |
| 8 | `Value` | currency | Dirty: one row reads `$114.004.22`. Recompute as `RemQty × Price`, store source, flag mismatch. |
| 9 | `OrdDt` | date | |
| 10 | `ShipDt` | date | |
| 11 | `Orig Date` | date | Mixed encoding: Excel serials (`46248`) and text (`7/ 2/26`, padded). |
| 12 | `Req.Del` | date | Same mixed encoding. |
| 13 | `WO` | text | e.g. `W0100134628`. Blank on `MISC` lines. |
| 14 | `Comments` | long text | Stacked dated entries, `MM.DD.YYYY - <text> <initials>`. Parse into structured records; render newest + count, expandable. |

### Format B — Open Order Shortage Report (hierarchical) — AMBI fixture

Sheet `CUstShortSSRS`. Merged title `A1`, header row 2, autofilter `A2:Q`, Arial 10. Three levels encoded
by which column is populated:

- **Level 0 — PO line (FG):** `PO`, `Order Date`, `Orig Req'd Date`, `PartNum`, `Cust Part`, `Description`, `Req'd Date`, `Qty Due`, `Unit Price`, `Job Num`.
- **Level 1 — job material (bulk/component):** `Job Num` + `Lvl1 Part`, `Description`, `QTY Need`, `UOM`, `CP?`, `Mfg Comment`.
- **Level 2 — raw material under a bulk:** `Lvl2Part`, `Description`, `QTY Need`, `UOM`, `Mfg Comment`.

Column order: `PO`, `Order Date`, `Orig Req'd Date`, `PartNum`, `Cust Part`, `Description`, `Req'd Date`,
`Qty Due`, `Unit Price`, `Job Num`, `Lvl1 Part`, `Lvl2Part`, `Description`, `QTY Need`, `UOM`, `CP?`, `Mfg Comment`.

Behaviors to preserve: `CP? = Y` is a first-class blocker flag, not a text column. `Qty Due` can appear on a
child row when a line splits across fills. `Mfg Comment` is multi-line, carrying manufacturing instructions
(`***HOT FILL***`), shortage status, and on-hand offsets — preserve line breaks, render wrapped. Type drift
in any text column must not crash the parser. Formats: `Unit Price` `$#,##0.00`; `Qty Due` `#,##0`;
`QTY Need` `#,##0.0` with negatives in parentheses; dates `mm-dd-yy`.

## 3. Data model

Tables as originally specified: `oor_report_run`, `oor_line`, `oor_shortage_node`, `oor_comment`, `oor_note`,
`oor_meeting_update`, `oor_email`, `oor_email_attachment`, `oor_status_event`. Every table carries
`created_at`/`updated_at`/`created_by`/`updated_by` and FK indexes on every lookup path.

Minimum indexes: `oor_line (brand_id, is_open, required_delivery_date)`, `oor_line (fulfillment_type, job_status)`,
`oor_shortage_node (oor_line_id, level, sort_index)`, `oor_comment (oor_line_id, created_at desc)`, GIN on `raw_row`.

## 4. Status and shortage vocabulary

**Line status:** `OPEN` · `IN_PRODUCTION` · `SHORT_MATERIAL` · `AWAITING_COMPONENT` · `AWAITING_ARTWORK` ·
`AWAITING_CUSTOMER_APPROVAL` · `ON_HOLD_QC` · `FILLED_AWAITING_PICKUP` · `PARTIAL_SHIP` · `SHIPPED` · `CLOSED` · `CANCELLED`

Derivation (one pure function, unit-tested):
- Descendant with `qty_needed > qty_on_hand` and class `RAW_MATERIAL` → `SHORT_MATERIAL`.
- Short `COMPONENT` → `AWAITING_COMPONENT`; label/artwork component type → `AWAITING_ARTWORK`.
- Any unresolved `customer_provided` node → `AWAITING_CUSTOMER_APPROVAL` (outranks the above).
- Manual override always wins, displayed with an "overridden" marker and hover reason.

**Shortage reasons:** `RAW_MATERIAL_DELAY` · `COMPONENT_DELAY` · `BULK_NOT_MADE` · `ARTWORK_PENDING` ·
`MOQ_CONSTRAINT` · `CAPACITY` · `QC_HOLD` · `COST_ROLL_PENDING` · `CUSTOMER_PROVIDED_PENDING` · `VENDOR_ETA_UNKNOWN` · `NONE`.

**Risk:** `critical` if any blocker ETA is unknown or past the required date; `at_risk` within 14 days; else
`on_track`. Drives row accent only — never hides data.

## 5. Ingestion & auto-population

1. `POST /api/operations/oor/imports` accepts `.xlsx` and legacy `.xls`, detects format by header signature, idempotent on file hash.
2. Format A if row 2 has `Customer PO Number` + `RemQty`; Format B if it has `Lvl1 Part` + `QTY Need`; else hard fail naming the headers found.
3. Hierarchy reconstruction walks rows top-down, carrying `Job Num` forward, preserving source order in `sort_index`.
4. **Upsert, don't replace** — match on `(brand, customer PO, sales order, item)`. User-authored content is never touched by an import.
5. Legacy comment migration splits the `Comments` cell into individual records with `entry_date` and `author_initials`, `source = 'imported_legacy'`. Never discard text.
6. A line is open when `qty_remaining > 0` and status not in `SHIPPED`/`CLOSED`/`CANCELLED`.
7. Every dirty value produces a parse warning surfaced in an Import Review panel with an inline fix control. Warnings never block the import.
8. Parsers sit behind a `SourceAdapter` interface so an EDI/SPS or ERP query can replace the file drop later without touching the UI.

## 6. API surface

All under `/api/operations/oor`, authenticated, scoped by the caller's permissions.

```
GET    /lines            ?brand&status[]&risk[]&fulfillment_type&cm_code&search&required_before&has_shortage&page&pageSize&sort
GET    /lines/:id        full line + shortage tree + counts
PATCH  /lines/:id        status override, risk, owner, dates
GET    /lines/:id/tree   shortage nodes, nested
PATCH  /nodes/:id        qty_on_hand, eta_date, shortage_reason, mfg_comment, node_status
GET    /lines/:id/comments · POST · PATCH /comments/:id (soft delete only)
GET/POST /lines/:id/notes · PATCH /notes/:id
GET/POST /lines/:id/meeting-updates · PATCH
POST   /lines/:id/emails · GET /lines/:id/emails/:emailId
GET    /lines/:id/activity   merged chronological feed
POST   /imports · GET /imports/:id
GET    /exports          ?format=xlsx&report_type=...
```

Every mutation returns the updated entity and writes an audit entry where a tracked field changed.

## 7. Frontend

**Grid.** Brand selector, report-type toggle, as-of date, and stat cards (Open Lines, Open Value, Lines Short,
Critical, Awaiting Customer Approval) that act as filter chips. Excel-parity grid: sticky header and first
column, per-column filters mirroring the source autofilter, multi-column sort, resize/reorder/hide with
per-user persisted layout, keyboard navigation, density toggle, TSV range copy. Column sets are §2's lists
plus app-only Status and Activity columns.

**Expandable lines.** `CONTRACT_MFG` lines display as `Contract Manufacture — {cm_code}` with an *Active*
badge for `job_status = 'ACT'` and expand to the shortage tree inline — level 1 indented one step, level 2
two, each showing part, description, QTY Need, UOM, on-hand, ETA, `CP?` badge, shortage reason, wrapped
`Mfg Comment`. Short rows accent danger; customer-provided blockers warning. Expansion persists per session;
trees load on first expand. Non-CM lines expand to the same component, with an empty state when there are no
nodes — the affordance is never hidden by type alone.

**Modal.** Row-level **Open Order Report** button (also `Enter` on the focused row, and in the overflow menu).
90vw / max 1400px, focus-trapped, `Esc` to close, deep-linkable so it can be pasted into Slack or email.
Header carries PO + channel tag, item + description, brand, inline-editable status pill (reason required on
override), risk badge, required date with countdown, owner, and Export / Copy link / Print.

Tabs: **Overview** (every source field plus derived, inline-editable with optimistic update and rollback) ·
**Production Tracker** (the tree as an editable Format B grid, row-level resolve, and a Bulk → Components →
Fill → QC → Pack → Ready → Shipped stage strip with blockers listed) · **Comments** (threaded, `@mention`,
markdown, pin, edit window, soft delete; imported entries keep their date and initials; composer prefills
`MM.DD.YYYY - ` and appends initials so exports stay readable) · **Notes** (titled, categorized, pinnable —
reference material, as distinct from the running log) · **Meeting Updates** (date, title, attendees, decision,
next action, owner, due date, status; overdue next-actions badge the grid row) · **Emails** (paste raw text,
upload `.eml`, or pull from the connected mailbox; rendered as a thread with downloadable attachments) ·
**Activity** (merged reverse-chronological feed of everything plus status events). Tabs 3–6 share one composer shell.

**Design.** Dark-first with full light support. Accent Electric Indigo `#7C3AED`. Semantic success/warning/danger.
Space Grotesk for UI, JetBrains Mono for every identifier and figure so columns align. Micro-interactions:
chevron rotate + height spring on expand, status pill morph, subtle pulse on unknown-ETA rows, toast with undo
on every mutation. Skeleton rows on load, never a spinner over the grid. Respect `prefers-reduced-motion`.

## 8. Export

`GET /exports` regenerates both formats as `.xlsx` with layout parity: same title row and merge, header on row 2
for Format B, same column order and labels, Arial 10, same number formats, autofilter on the header row, frozen
header, wrapped `Mfg Comment` at width 95, `Description` 57, level description 129. Opt-in flags add an appendix
sheet of collaboration history and a Status column; both default off so the file stays drop-in compatible with
what people already forward to the CM. Export must round-trip: exporting and re-importing produces zero net changes.

## 9. Permissions & audit

`oor.view` (brand-scoped), `oor.edit_status`, `oor.edit_tree`, `oor.comment`, `oor.import`, `oor.export`, `oor.admin`.
Comments, notes, meeting updates and emails are append-only from an audit standpoint — soft delete only.
Every status/tree mutation records actor, timestamp, before/after, and reason where required.

## 10. Tests and acceptance

**Parser, against the real fixtures.** AcneFree → 51 open lines, correct `RemQty` totals, `MISC` classified,
channel tags extracted, both date encodings resolved identically. AMBI → 7 / 33 / 80 nodes, correct parent
assignment for every level-2 node, `CP?` flags set, `***HOT FILL***` preserved with newlines. Dirty values
produce warnings, not exceptions. Legacy comment splitter yields `entry_date` and `author_initials`.

**API.** Filtering, pagination, status override + audit, comment CRUD with soft delete, `.eml` upload,
re-import idempotency, and the guarantee that re-import preserves all user-authored content.

**UI.** Expand a CM row and see its tree; open the modal from a row; add a comment, note, meeting update and
email and see each in Activity; override a status and see the marker and audit entry; export and re-import
with no diff.

**Acceptance.** A user can import the AcneFree file, open any line, see its full production tracker, log a
meeting update with an owner and due date, attach the vendor's ETA email, and export a file the contract
manufacturer opens in Excel and recognises as the same report they get today.

## 11. Build order

Migrations + seed → parsers + warnings (tests green before any UI) → API (lines, tree, status) → grid +
expandable rows → modal shell + Overview + Production Tracker → Comments → Notes → Meeting Updates → Emails →
Activity → export + round-trip → permissions, audit, empty/error/loading states, keyboard and accessibility passes.

Commit at each step. **Stop and show output after the parsers and after the modal.**
