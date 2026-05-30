---
name: Merge-induced duplicate declarations in web app
description: How bad merges surface in apps/web and how to catch them
---

When parallel feature branches merge into this repo, conflict resolution can leave **duplicate top-level declarations** (same `function X` twice) and **stale duplicate blocks** (e.g. old "FALLBACK_*" demo tabs alongside the real feature-rich ones) in large files like `apps/web/src/app/routes/departments/rd.tsx`.

**Why it bites:** Vite uses esbuild, which does NOT type-check — so undefined identifiers, prop mismatches, and missing imports run silently until that code path renders (then a runtime ReferenceError). Only a true duplicate `function` declaration is a hard babel *parse* error that blanks the page immediately.

**How to apply:**
- After any merge, run `cd apps/web && npx tsc --noEmit` to surface the latent errors esbuild ignores (missing imports, undefined names, prop-shape mismatches).
- For duplicated tab/component pairs, keep the **feature-rich** version (the one with create/delete/detail modals matching the non-duplicated siblings like BriefsTab/CMTab) and delete the simple/fallback duplicate.
- The R&D page's `moduleData` memo must expose `*ModuleId` fields (via `findModuleId`) for every tab whose call site passes `moduleId`; a merge that drops them makes "Create new entry" silently no-op.
