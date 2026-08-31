#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// design-tokens-audit.mjs
//
// Regression guard for undefined CSS custom properties in the web app.
//
// The bug this exists to prevent is quiet. `var(--border)` was never defined
// anywhere — not in design-system.css, not in the Tailwind config, not in the
// shipped bundle — and CSS answers an undefined variable by dropping the
// declaration rather than by complaining. So 76 borders across Settings and
// People fell through to currentColor and rendered near-black (rgb(26,26,26))
// instead of the intended #E8E5E0, and 39 backgrounds rendered transparent.
// Nothing caught it: it is not a type error, not a lint error, and not a test
// failure. It is only visible to a person looking at the screen.
//
// This scans every var(--name) reference in the web source and fails if the
// name is not defined in a stylesheet. Dependency-free, so it costs nothing
// to run on every CI invocation.
//
// Exit code: 0 = clean, 1 = one or more undefined tokens (printed as
// file:line with the count of places affected).
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const WEB_SRC = path.join(REPO_ROOT, 'apps/web/src')

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css'])
const DEFINITION = /^\s*(--[A-Za-z0-9-]+)\s*:/gm
const REFERENCE = /var\((--[A-Za-z0-9-]+)\s*(?:,|\))/g

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

if (!fs.existsSync(WEB_SRC)) {
  console.error(`design-tokens-audit: ${WEB_SRC} not found`)
  process.exit(1)
}

const files = walk(WEB_SRC)

// Every token defined anywhere in a stylesheet counts as available, wherever
// it is declared — :root, a theme block, or a component-scoped rule.
const defined = new Set()
for (const file of files) {
  if (path.extname(file) !== '.css') continue
  const source = fs.readFileSync(file, 'utf8')
  for (const match of source.matchAll(DEFINITION)) defined.add(match[1])
}

/** @type {Map<string, {file: string, line: number}[]>} */
const undefinedRefs = new Map()
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const lines = source.split('\n')
  lines.forEach((text, index) => {
    for (const match of text.matchAll(REFERENCE)) {
      const name = match[1]
      // A reference carrying its own fallback — var(--x, #fff) — still renders,
      // so it is a style choice rather than a bug.
      const hasFallback = match[0].endsWith(',')
      if (hasFallback || defined.has(name)) continue
      const list = undefinedRefs.get(name) ?? []
      list.push({ file: path.relative(REPO_ROOT, file), line: index + 1 })
      undefinedRefs.set(name, list)
    }
  })
}

if (undefinedRefs.size === 0) {
  console.log(`design-tokens-audit: clean — ${defined.size} tokens defined, every reference resolves.`)
  process.exit(0)
}

const total = [...undefinedRefs.values()].reduce((sum, list) => sum + list.length, 0)
console.error(`design-tokens-audit: ${undefinedRefs.size} undefined token(s), ${total} reference(s)\n`)
for (const [name, list] of [...undefinedRefs].sort((a, b) => b[1].length - a[1].length)) {
  console.error(`${name} — ${list.length} reference(s), first at ${list[0].file}:${list[0].line}`)
  console.error(
    '  CSS drops a declaration whose variable is undefined, so this renders as the inherited value —' +
      ' a background disappears, a border falls through to currentColor and comes out near-black.' +
      ' Define it in a stylesheet, or use an existing token.\n',
  )
}
process.exit(1)
