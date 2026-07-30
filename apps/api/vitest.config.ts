import { defineConfig } from 'vitest/config'

// Unit tests only for now. Suites that need a live database are excluded from
// the default run so `pnpm test` stays runnable without any local services;
// they are opted into with `vitest --mode integration`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/*.integration.test.ts'],
  },
})
