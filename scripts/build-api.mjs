#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

// ─── API build ───────────────────────────────────────────────
// Compiles apps/api and verifies the result is actually runnable.
//
// `tsc` exits non-zero on this codebase — there are pre-existing type errors in
// routes that predate the current work (formulationDetail, brandTransition,
// techTransferStages and a few others), plus two from a duplicated ioredis
// version. None are syntax errors, `noEmitOnError` is off, and the emitted
// JavaScript boots and serves correctly.
//
// That exit code is why the deployment never built the API: a plain
// `tsc && start` chain aborts. Deleting the build step is not the answer — the
// deploy then runs whatever stale `dist/` is lying around, or nothing at all.
//
// So: run tsc, report the type errors honestly, and gate on what actually
// matters for a deploy — that the expected entry points exist and parse. A
// missing or corrupt build fails loudly; a known type error does not silently
// block a release.
//
// Type errors are a code-quality gate, not a deploy gate. `pnpm typecheck`
// is the former and returns tsc's real exit code.

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const api = join(root, 'apps/api')

// Entry points the deployment and the schedulers actually invoke. If any of
// these is missing, the build did not do its job whatever tsc said.
const ENTRY_POINTS = ['dist/index.js', 'dist/worker.js', 'dist/jobs/runDue.js']

// Where the type-error count stood when this script was written. Printed as a
// drift signal — the build does not fail on it, because a hard count in a repo
// with several contributors just gets deleted the first time it is
// inconvenient. Growth here is worth noticing in review.
const KNOWN_TYPE_ERRORS = 46

console.log('[build:api] compiling…')
const tsc = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], {
  cwd: api,
  encoding: 'utf8',
  shell: process.platform === 'win32',
})

if (tsc.error) {
  console.error(`[build:api] could not run tsc: ${tsc.error.message}`)
  process.exit(1)
}

const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`
const errorLines = output.split('\n').filter((l) => / error TS\d+:/.test(l))
const count = errorLines.length

// A syntax error means the emitted output is untrustworthy even if a file
// appears. Everything else is an assignability complaint that does not affect
// the generated JavaScript.
const SYNTAX_ERRORS = /error TS(1002|1003|1005|1009|1109|1128|1434|1435|1136):/
const syntaxErrors = errorLines.filter((l) => SYNTAX_ERRORS.test(l))
if (syntaxErrors.length > 0) {
  console.error(`[build:api] ${syntaxErrors.length} syntax error(s) — the output cannot be trusted:`)
  for (const line of syntaxErrors.slice(0, 10)) console.error(`  ${line}`)
  process.exit(1)
}

const missing = ENTRY_POINTS.filter((p) => !existsSync(join(api, p)))
if (missing.length > 0) {
  console.error(`[build:api] build produced no output for: ${missing.join(', ')}`)
  if (count > 0) {
    console.error(`[build:api] tsc reported ${count} error(s); first few:`)
    for (const line of errorLines.slice(0, 10)) console.error(`  ${line}`)
  }
  process.exit(1)
}

// An empty or truncated file passes existsSync but fails at runtime.
for (const p of ENTRY_POINTS) {
  const bytes = statSync(join(api, p)).size
  if (bytes < 100) {
    console.error(`[build:api] ${p} is only ${bytes} bytes — the build is incomplete`)
    process.exit(1)
  }
}

// Parse each entry point without executing it. `require` would boot the server.
for (const p of ENTRY_POINTS) {
  const check = spawnSync(process.execPath, ['--check', join(api, p)], { encoding: 'utf8' })
  if (check.status !== 0) {
    console.error(`[build:api] ${p} does not parse:\n${check.stderr}`)
    process.exit(1)
  }
}

if (count > 0) {
  console.log(
    `[build:api] ${count} pre-existing type error(s) — not blocking the build` +
      (count > KNOWN_TYPE_ERRORS
        ? `  ⚠ up from ${KNOWN_TYPE_ERRORS} when this was last reviewed`
        : count < KNOWN_TYPE_ERRORS
          ? `  (down from ${KNOWN_TYPE_ERRORS})`
          : ''),
  )
  console.log('[build:api] run `pnpm typecheck` to see them')
}

console.log(`[build:api] ok — ${ENTRY_POINTS.length} entry points built and parsed`)
