import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit tests for the module's pure logic (date maths, dependency ripple).
// Component rendering is covered by the Playwright verification runs rather
// than jsdom, so no DOM environment is configured here.
// §5.2: .test.tsx files now run with jsdom for IntegrationsSection render tests.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Pins the suite's calendar-day maths to a fixed timezone so the verdict
    // does not depend on the machine running it.
    env: { TZ: 'UTC' },
    // Use jsdom for .test.tsx files
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
    ],
    // Enable globals for @testing-library/jest-dom
    globals: true,
    // Setup file for testing-library matchers
    setupFiles: ['./src/test/setup.ts'],
  },
})
