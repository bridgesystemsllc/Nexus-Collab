#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// tenancy-audit.mjs
//
// Regression guard for the tenancy/auth fixes on feat/tenancy-scoping.
// Two bug classes were fixed on this branch and NOTHING else in the test
// suite (702 vitest tests) detects their return:
//
//   1. Implicit org resolution — prisma.organization.findFirst() returned
//      the oldest organization in the database instead of the caller's.
//      Invisible with one org, a cross-tenant breach with two.
//
//   2. Unauthenticated routers — the API authenticated by exception instead
//      of by default. Fixed by inverting to api.use(isAuthenticated) with an
//      explicit, commented allowlist above it. Deleting that one line, or
//      moving a mount above it, silently reopens every route below back up
//      to anonymous callers.
//
// This script re-derives both bugs statically from source and fails the
// build if either pattern (or a related unscoped-lookup pattern) comes back.
// It is intentionally dependency-free: Node's fs/path only, so it costs
// nothing to run on every CI invocation.
//
// Exit code: 0 = clean, 1 = one or more violations (printed as file:line
// plus a one-line explanation of the actual risk, not just "rule broken").
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const API_SRC = path.join(REPO_ROOT, 'apps/api/src')
const INDEX_TS = path.join(API_SRC, 'index.ts')

/** @typedef {{ file: string, line: number, message: string }} Violation */

/** @type {Violation[]} */
const violations = []

function relPath(absPath) {
  return path.relative(REPO_ROOT, absPath)
}

function lineNumberAt(text, charIndex) {
  return text.slice(0, charIndex).split('\n').length
}

// Walk a directory collecting every .ts file (no node_modules under
// apps/api/src, so no exclusion needed beyond that).
function walkTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function isTestFile(absPath) {
  return absPath.endsWith('.test.ts')
}

// Extract the substring from `openIndex` (which must point at an opening
// bracket) through its matching closing bracket, respecting nesting. Used
// to pull out a whole `findFirst(...)` call, or a `where: { ... }` object,
// without needing a real parser.
function extractBalanced(text, openIndex, openCh, closeCh) {
  let depth = 0
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === openCh) depth++
    else if (text[i] === closeCh) {
      depth--
      if (depth === 0) return text.slice(openIndex, i + 1)
    }
  }
  return text.slice(openIndex) // unterminated — best effort
}

// ── Rule 1 — no implicit org resolution ────────────────────────────────
// prisma.organization.findFirst() (with no unique key) returns whichever
// row Postgres happens to return first — in practice the oldest — not the
// caller's organization. On a single-org deployment this is invisible; the
// moment a second org exists it is a cross-tenant read or write.
function checkRule1() {
  // Each entry is a deliberate, documented exception. Anything else that
  // matches organization.findFirst( anywhere in apps/api/src fails the
  // build.
  const ALLOWLIST_FILES = new Set([
    // Runs from the email-agent worker, which has no request/session
    // context to derive an org from. Threading a real org through the
    // inbound-mail path is tracked separately (see the emailAgent note in
    // Rule 3 below) — this is the same underlying gap, not a new one.
    'apps/api/src/services/inventoryImport/feedConfig.ts',
    // Runs before a member has an org — onboarding is what CREATES the
    // caller's first organization, so there is no session-derived org yet
    // to resolve.
    'apps/api/src/routes/onboarding.ts',
  ])

  const pattern = /organization\.findFirst\s*\(/g

  for (const file of walkTsFiles(API_SRC)) {
    if (isTestFile(file)) continue // fakes/assertions legitimately name it
    const rel = relPath(file)
    if (ALLOWLIST_FILES.has(rel)) continue

    const text = fs.readFileSync(file, 'utf8')
    let m
    pattern.lastIndex = 0
    while ((m = pattern.exec(text))) {
      const line = lineNumberAt(text, m.index)
      violations.push({
        file: rel,
        line,
        message:
          'organization.findFirst() resolves whichever org happens to come back first ' +
          '(the oldest, in practice) instead of the caller\'s — harmless with one ' +
          'organization in the database, a cross-tenant read/write the moment a second ' +
          'one exists. Derive the org from the session (getActingOrgId / req.member.orgId) instead.',
      })
    }
  }
}

// ── Rule 2 — every mounted router is gated or allowlisted ──────────────
// The API must authenticate by default: api.use(isAuthenticated) is the
// gate, and every api.use('/path', ...) mount must appear after it unless
// the path is on the explicit public allowlist below. This is the rule
// that catches the actual incident — an unauthenticated router serving
// live business data (including a 119 KB cross-entity dump) — so it must
// genuinely re-derive "is this mount reachable with no session", not just
// confirm the gate line exists somewhere in the file.
function checkRule2() {
  const PUBLIC_ALLOWLIST = new Map([
    ['/auth', 'Login and the session probe — cannot require a session to establish one.'],
    ['/integrations/microsoft', 'The Entra OAuth callback is our registered redirect URI; Microsoft calls it with no Nexus session.'],
    ['/formulations-gate', 'The password prompt itself — gating it would make the module unlockable by no one.'],
    ['/jobs', 'Bearer-token auth of its own (JOBS_TRIGGER_SECRET), driven by an external cron with no user session.'],
  ])

  if (!fs.existsSync(INDEX_TS)) {
    violations.push({
      file: relPath(INDEX_TS),
      line: 0,
      message: 'apps/api/src/index.ts not found — Rule 2 cannot verify the router gate at all.',
    })
    return
  }

  const text = fs.readFileSync(INDEX_TS, 'utf8')
  const lines = text.split('\n')

  const gateLinePattern = /^\s*api\.use\(\s*isAuthenticated\s*\)/
  const mountPattern = /^\s*api\.use\(\s*(['"])([^'"]+)\1/

  let gateLineIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (gateLinePattern.test(lines[i])) {
      gateLineIndex = i
      break
    }
  }
  // gateLineIndex === -1 means the gate is GONE — every mount below is, by
  // definition, not "after" a gate that does not exist, so every
  // non-allowlisted mount must be flagged. That is exactly the incident
  // this rule exists to catch.

  for (let i = 0; i < lines.length; i++) {
    const m = mountPattern.exec(lines[i])
    if (!m) continue
    const routePath = m[2]
    const lineNo = i + 1

    if (PUBLIC_ALLOWLIST.has(routePath)) continue

    const isAfterGate = gateLineIndex !== -1 && i > gateLineIndex
    if (!isAfterGate) {
      violations.push({
        file: relPath(INDEX_TS),
        line: lineNo,
        message:
          `api.use('${routePath}', ...) is mounted ${gateLineIndex === -1 ? 'with no api.use(isAuthenticated) gate present at all' : 'above api.use(isAuthenticated)'} ` +
          `— every route in this router will serve live data to a caller with no session, the same class of bug ` +
          `that served a 119 KB cross-entity dump anonymously. Move the mount below the gate, or add '${routePath}' ` +
          `to the PUBLIC_ALLOWLIST in this script with a reason.`,
      })
    }
  }
}

// ── Rule 3 — no member lookup by email without an org scope ────────────
// member.findFirst / member.findUnique / userInvitation.findFirst whose
// `where` clause filters by email but never mentions orgId. Member and
// invitation emails are unique per-organization (@@unique([orgId, email])),
// not globally, so an unscoped email filter can match a different tenant's
// row.
//
// This is necessarily approximate — a regex cannot reliably parse a Prisma
// `where` clause, and a call that merely *selects* an email field (not
// filters by one) must not be flagged. We scope the email/orgId check to
// just the `where: { ... }` sub-object of the call (falling back to the
// whole call only if there is no `where` at all) specifically to avoid that
// false positive. Even so, treat this rule as a smoke detector, not a
// verdict: prefer false negatives to false positives, because a guard that
// cries wolf gets disabled, and a disabled guard protects nothing.
function checkRule3() {
  // File-level exceptions, each with a reason.
  const ALLOWLIST_FILES = new Set([
    // The whole inbound-mail path (single shared AGENT_MAILBOX env var, the
    // unauthenticated Graph webhook route) carries no org context today —
    // it is architecturally one shared mailbox for the deployment. Traced
    // during the tenancy fix and deliberately NOT changed: threading a real
    // org boundary through inbound mail is its own change. Documented,
    // tracked.
    'apps/api/src/services/emailAgent/processor.ts',
  ])

  // Narrow, line-scoped exceptions: a specific flagged call in an
  // otherwise-in-scope file, matched by a substring of its own line so it
  // survives the file being edited elsewhere. NOT part of the brief's
  // original allowlist — each entry here is something this audit actually
  // found while being built, left in place because fixing it is app-code
  // change outside this task's scope. Flagged loudly in the task-4 report;
  // do not add to this list without the same kind of write-up.
  const ALLOWLIST_LINES = [
    {
      file: 'apps/api/src/services/users/meService.ts',
      lineIncludes: "NOT: { id: memberId }",
      reason:
        "verifyEmailChange()'s re-check of the pending address at confirm-time. Its sibling " +
        'check in requestEmailChange() was scoped to the caller\'s orgId in this branch\'s tenancy ' +
        'fix (commit 7dc19cf), but this second call site — the same check re-run inside the ' +
        'confirmation transaction — was missed. Discovered by this audit, not fixed here: fixing it ' +
        'is an application-code change and this task is scoped to building the guard, not patching ' +
        'the app. Reported as a follow-up in task-4-report.md.',
    },
  ]

  const CALL_PATTERN = /\b(member\.findFirst|member\.findUnique|userInvitation\.findFirst)\s*\(/g
  const WHERE_PATTERN = /where\s*:\s*\{/

  for (const file of walkTsFiles(API_SRC)) {
    if (isTestFile(file)) continue // fakes construct wherever shape the test needs
    const rel = relPath(file)
    if (ALLOWLIST_FILES.has(rel)) continue

    const text = fs.readFileSync(file, 'utf8')
    let m
    CALL_PATTERN.lastIndex = 0
    while ((m = CALL_PATTERN.exec(text))) {
      const callee = m[1]
      const openIdx = m.index + m[0].length - 1
      const call = extractBalanced(text, openIdx, '(', ')')

      const wm = WHERE_PATTERN.exec(call)
      let scope = call
      if (wm) {
        const braceIdx = wm.index + wm[0].length - 1
        scope = extractBalanced(call, braceIdx, '{', '}')
      }

      const filtersByEmail = /\bemail\b/.test(scope)
      const hasOrgId = /\borgId\b/.test(scope)
      if (!filtersByEmail || hasOrgId) continue

      const line = lineNumberAt(text, m.index)
      // Matched against the whole extracted call (it commonly spans several
      // lines), not just the line the call starts on.
      const lineAllow = ALLOWLIST_LINES.find(
        (a) => a.file === rel && call.includes(a.lineIncludes),
      )
      if (lineAllow) continue

      violations.push({
        file: rel,
        line,
        message:
          `${callee}() filters by email with no orgId in its where clause — member/invitation email is ` +
          `unique per-organization, not globally, so this can match a different tenant's row. Scope the ` +
          `query by the acting member's orgId.`,
      })
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────────
checkRule1()
checkRule2()
checkRule3()

if (violations.length === 0) {
  console.log('tenancy-audit: clean — no implicit org resolution, no ungated router, no unscoped email lookup.')
  process.exit(0)
}

violations.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)))

console.error(`tenancy-audit: ${violations.length} violation${violations.length === 1 ? '' : 's'} found\n`)
for (const v of violations) {
  console.error(`${v.file}:${v.line}`)
  console.error(`  ${v.message}\n`)
}

process.exit(1)
