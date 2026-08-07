import { defineConfig } from 'vitest/config'

// Integration suites — they need a live API and database, so they are kept out
// of the default `pnpm test` run and opted into with `pnpm test:integration`.
//
// Serial, not parallel: they share one database and several assert on
// engine-wide effects (the check-in engine sweeps every project), so
// concurrent files would see each other's rows and fail for the wrong reason.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
