---
name: Microsoft Graph attach features
description: Conventions shared by the per-user Outlook/OneDrive attach features
---

# Microsoft Graph attach features (per-user, delegated)

Outlook-email and OneDrive-file attach both read the **acting member's own**
Microsoft data. They share a foundation and these conventions:

- All data access goes through `graphGet(memberId, '/me/...')` in
  `apps/api/src/lib/microsoftGraph.ts`. It resolves the member's delegated token
  (silent refresh) so a request can only ever touch that member's own mailbox/drive.
  **Never** build a route that takes a target user/mailbox id from the client.
- **Degradation contract:** routes throw `MicrosoftNotConnectedError` →
  surface as HTTP **412** (`microsoft_not_connected`). The client treats 412 as
  "connection lapsed", invalidates the `['microsoft','status']` query, and shows
  the inline `<ConnectMicrosoft variant="inline" />` prompt. No crash, no fake data.
  **Why:** Azure secrets are often absent in dev; the feature must stay usable.
- **OData escaping gotcha:** the OneDrive search endpoint uses
  `/me/drive/root/search(q='...')` — single quotes in the term must be doubled
  (`q.replace(/'/g, "''")`) before URI-encoding, or the OData literal breaks.
  Outlook mail uses `$search="..."` (KQL) instead — different quoting rules.
- **Attach = link reference, not a copy.** OneDrive files are stored with
  `storage_url = webUrl` (+ `onedrive_item_id`, `uploaded_via:'onedrive'`); we do
  NOT pull bytes into object storage. The task file-attachment payload schema
  already carries `onedrive_item_id`.
