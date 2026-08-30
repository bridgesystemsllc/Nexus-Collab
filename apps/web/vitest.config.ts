import { defineConfig } from 'vitest/config'
import path from 'path'

// Unit tests for the module's pure logic (date maths, dependency ripple).
// Component rendering is covered by the Playwright verification runs rather
// than jsdom, so no DOM environment is configured here.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Pins the suite's calendar-day maths to a fixed timezone so the verdict
    // does not depend on the machine running it.
    env: { TZ: 'UTC' },
  },
})
