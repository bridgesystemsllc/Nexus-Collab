# AGENTS.md

## Project Context

Nexus Collab is a pnpm workspace with a Vite React frontend in `apps/web`, an Express API in `apps/api`, and Prisma schema/seed data in `packages/prisma`.

## Local Workflow

- Read the relevant route, component, hook, API route, and seed files before editing.
- Keep frontend and backend shape changes in sync. If module types, navigation states, or API data fields change, update UI handling and seed data together when practical.
- Prefer existing React, Zustand, React Query, Prisma, Tailwind, and design-system patterns over introducing new abstractions.
- Preserve local user changes. Do not revert lockfiles, generated build info, or unrelated work unless explicitly asked.

## Commands

- Install: `pnpm install`
- Web dev: `pnpm --filter @nexus/web dev`
- API dev: `pnpm --filter @nexus/api dev`
- Full dev: `pnpm dev`
- Web build: `pnpm --filter @nexus/web build`
- API build: `pnpm --filter @nexus/api build`
- Lint/test: use package scripts when present; otherwise run the narrowest build/typecheck that covers changed code.

## UI Standards

- Match the existing dark-first, premium dashboard language in `apps/web/src/styles/design-system.css`.
- Use lucide icons already available through `lucide-react`.
- Keep dashboard controls dense, scannable, and operational. Avoid landing-page patterns inside app surfaces.
- Verify responsive behavior for changed views when feasible.

## Data Safety

- Do not add secrets or real customer data.
- Keep seed data realistic but synthetic.
- Validate backend inputs with existing zod patterns where request shapes change.
