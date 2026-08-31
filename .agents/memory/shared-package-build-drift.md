---
name: Shared package build drift
description: Prevent stale compiled exports from crashing consumers of the workspace shared package.
---

The web development and production build commands must compile the workspace shared package before starting Vite or compiling the web application.

**Why:** Workspace consumers resolve the shared package through its compiled distribution files, not directly from TypeScript source. New source exports can therefore typecheck in isolation while the browser crashes because the stale ESM bundle does not export them.

**How to apply:** Preserve the web package's pre-development and pre-build shared-package compilation. When a runtime error says the shared ESM index does not provide a named export that exists in source, rebuild the shared package before investigating application imports.