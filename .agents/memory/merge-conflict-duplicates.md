---
name: Bad merges leave latent runtime breakage in the web app
description: Classes of merge damage that esbuild won't catch, and how to surface them
---

Conflict resolution when merging feature branches into this repo tends to leave breakage that does NOT show as a build error, because Vite/esbuild does not type-check:
- duplicate top-level declarations (the only hard *parse* error — blanks the page immediately)
- stale duplicate component blocks left beside the real feature-rich versions
- dropped fields / prop-shape mismatches that throw only when that code path renders
- undefined identifiers and missing imports

**Why it bites:** the app appears to start fine; the crash only surfaces when the affected screen or endpoint is exercised.

**How to apply:** after any merge, run `tsc --noEmit` in the affected package (`apps/web`, `apps/api`) to surface the latent errors esbuild ignores, then click through the changed screens. When duplicate component versions exist, keep the feature-rich one (matching its non-duplicated siblings) and delete the simpler duplicate.
