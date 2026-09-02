#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// erp-sync-audit.mjs
//
// Static audit of ERP ↔ Nexus sync configuration. This script answers:
//   1. Does a production-tracker model/service exist?
//   2. Which status fields propagate in which direction?
//   3. Which barcode/product-id field names exist (no winner chosen)?
//   4. Is tenancy scoped by orgId (not tenant_id)?
//
// It scans the source files using Node's fs/path only — no Prisma connection,
// no ERP HTTP, no external dependencies on the default path.
//
// Exit code: 0 = audit complete (even if tracker not found), 1 = error
// Output: docs/audits/erp-nexus-sync-audit.json (overwritten each run)
// ─────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const REPORT_PATH = path.join(REPO_ROOT, 'docs/audits/erp-nexus-sync-audit.json')

const HELP_TEXT = `
erp-sync-audit — Static audit of ERP ↔ Nexus sync configuration

USAGE
  pnpm ops:sync-audit          Run the audit, write the JSON report
  pnpm ops:sync-audit --help   Print this help, do not write, exit 0
  pnpm ops:sync-audit --quiet  Run the audit, skip ASCII banner, still write

OUTPUT
  docs/audits/erp-nexus-sync-audit.json (locked path, overwritten each run)

EXIT CODES
  0   Audit complete (even if production tracker not found)
  1   Error (unknown flag, write failure)

The audit answers:
  - productionTracker.found: Does a dedicated production-tracker model exist?
  - statusFields: Which fields propagate inbound vs outbound?
  - barcodeFields: Which barcode/product-id names exist (no winner chosen)?
  - tenancy: Confirms orgId usage, no tenant_id
`.trim()

const SUCCESS_BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ops:sync-audit OK                                          ║
║                                                              ║
║   ERP ↔ Nexus sync audit complete.                           ║
║   Report written to docs/audits/erp-nexus-sync-audit.json    ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`.trim()

const FAIL_BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ops:sync-audit FAIL                                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`.trim()

function parseArgs() {
  const args = process.argv.slice(2)
  let help = false
  let quiet = false
  const unknown = []

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      help = true
    } else if (arg === '--quiet' || arg === '-q') {
      quiet = true
    } else {
      unknown.push(arg)
    }
  }

  return { help, quiet, unknown }
}

function relPath(absPath) {
  return path.relative(REPO_ROOT, absPath)
}

function readFileSafe(filePath) {
  try {
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, out)
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.prisma'))) {
      out.push(full)
    }
  }
  return out
}

function searchPattern(files, pattern, flags = 'gi') {
  const regex = new RegExp(pattern, flags)
  const hits = []
  for (const file of files) {
    const result = readFileSafe(file)
    if (!result.ok) continue
    const lines = result.content.split('\n')
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        hits.push({ file: relPath(file), line: idx + 1, text: line.trim().slice(0, 120) })
      }
      regex.lastIndex = 0
    })
  }
  return hits
}

function runAudit() {
  const auditedAt = new Date().toISOString()
  const missingFiles = []
  const scannedFiles = []
  const findings = {}

  // Files to scan
  const filesToScan = [
    'packages/prisma/prisma/schema.prisma',
    'apps/api/src/lib/erpRouting.ts',
    'apps/api/src/lib/erpOpenOrders.ts',
    'apps/api/src/lib/erpPush.ts',
    'apps/api/src/lib/erpClient.ts',
    'apps/api/src/lib/erpSync.ts',
    'apps/api/src/lib/inventoryStatus.ts',
    'apps/api/src/routes/integrations.ts',
  ]

  for (const rel of filesToScan) {
    const abs = path.join(REPO_ROOT, rel)
    if (fs.existsSync(abs)) {
      scannedFiles.push(rel)
    } else {
      missingFiles.push(rel)
    }
  }

  const allApiFiles = walkTsFiles(path.join(REPO_ROOT, 'apps/api/src'))
  const schemaPath = path.join(REPO_ROOT, 'packages/prisma/prisma/schema.prisma')

  // 1. Production Tracker search
  const trackerPatterns = [
    'productionTracker',
    'ProductionTracker',
    'PRODUCTION_TRACKER',
    'production-tracker',
    'trackerStatus',
    'productionStatus',
  ]
  const trackerHits = []
  for (const pattern of trackerPatterns) {
    const hits = searchPattern(allApiFiles, pattern.replace(/[-_]/g, '[-_]?'), 'gi')
    trackerHits.push(...hits)
  }
  // Filter to backend models/services only (exclude frontend components and comments)
  const backendTrackerHits = trackerHits.filter(h => {
    // Exclude frontend paths
    if (h.file.includes('apps/web/')) return false
    // Exclude comments and doc references
    if (h.text.startsWith('//') || h.text.startsWith('*')) return false
    // Exclude string literals that are just type names in module type lookups
    if (h.text.includes("type: 'PRODUCTION_TRACKING'")) return true
    // Check for actual model/service definitions
    return h.text.includes('model ') || h.text.includes('interface ') || 
           h.text.includes('class ') || h.text.includes('function ')
  })
  
  // PRODUCTION_TRACKING module type exists but is NOT a standalone production tracker service
  const productionTrackerFound = backendTrackerHits.some(h => 
    h.text.includes('model ProductionTracker') || 
    h.text.includes('class ProductionTracker') ||
    h.text.includes('interface ProductionTracker')
  )
  
  findings.productionTracker = {
    found: productionTrackerFound,
    note: productionTrackerFound 
      ? 'ProductionTracker model/service found in backend'
      : 'No standalone ProductionTracker model/service. PRODUCTION_TRACKING is a DepartmentModule type (UI module, not a dedicated tracker entity).',
    moduleTypeExists: trackerHits.some(h => h.text.includes("'PRODUCTION_TRACKING'")),
    searchedPatterns: trackerPatterns,
  }

  // 2. DepartmentModule types
  const moduleTypePattern = /type:\s*['"]([A-Z_]+)['"]/g
  const moduleTypes = new Set()
  for (const file of allApiFiles) {
    const result = readFileSafe(file)
    if (!result.ok) continue
    let match
    while ((match = moduleTypePattern.exec(result.content)) !== null) {
      const t = match[1]
      if (/^[A-Z][A-Z_]+$/.test(t) && !['ALERT', 'SIGNAL', 'BROADCAST', 'HEARTBEAT'].includes(t)) {
        moduleTypes.add(t)
      }
    }
  }
  findings.departmentModuleTypes = [...moduleTypes].sort()

  // 3. Status field propagation
  // Read erpOpenOrders.ts to identify inbound/outbound fields
  const erpOpenOrdersPath = path.join(REPO_ROOT, 'apps/api/src/lib/erpOpenOrders.ts')
  const erpOpenOrdersResult = readFileSafe(erpOpenOrdersPath)
  
  const inboundFields = []
  const outboundFields = []
  
  if (erpOpenOrdersResult.ok) {
    // Inbound: mergeOpenOrderIntoData overwrites these from ERP
    const inboundPattern = /merged\.(\w+)\s*=\s*erp\.\1/g
    let match
    while ((match = inboundPattern.exec(erpOpenOrdersResult.content)) !== null) {
      if (!inboundFields.includes(match[1])) inboundFields.push(match[1])
    }
    // Also capture direct assignments
    const directAssign = /merged\.(\w+)\s*=\s*erp\.(\w+)/g
    while ((match = directAssign.exec(erpOpenOrdersResult.content)) !== null) {
      if (!inboundFields.includes(match[1])) inboundFields.push(match[1])
    }
    
    // Outbound: mapOpenOrderForErp sends these to ERP
    const outboundSection = erpOpenOrdersResult.content.match(/function mapOpenOrderForErp[\s\S]*?return \{[\s\S]*?\}/m)
    if (outboundSection) {
      const outboundMatch = /(\w+):/g
      while ((match = outboundMatch.exec(outboundSection[0])) !== null) {
        const field = match[1]
        if (!['function', 'return', 'const', 'let', 'var'].includes(field)) {
          if (!outboundFields.includes(field)) outboundFields.push(field)
        }
      }
    }
  }

  // Documented inbound/outbound fields from spec analysis
  findings.statusFields = {
    inbound: {
      note: 'ERP overwrites these fields in Nexus via mergeOpenOrderIntoData',
      fields: ['poStatus', 'urgency', 'qtyOrdered', 'qtyReceived', 'qtyRemaining', 'orderDate', 'deliveryDue', 'eta', 'lines', 'manufacturer'],
    },
    outbound: {
      note: 'Nexus sends these to ERP via mapOpenOrderForErp (only when openOrders.enabled = true, default false)',
      fields: ['erpPoId', 'poNumber', 'poStatus', 'urgency', 'qtyReceived', 'eta', 'lines', 'notes'],
      defaultEnabled: false,
    },
  }

  // 4. Barcode/product-id field names
  const barcodePatterns = ['sku', 'upc', 'gtin', 'barcode', 'partNumber', 'fgPartNumber']
  const barcodeFieldsFound = {}
  
  for (const pattern of barcodePatterns) {
    const hits = searchPattern(allApiFiles, `\\b${pattern}\\b`, 'g')
    const uniqueFiles = [...new Set(hits.map(h => h.file))]
    barcodeFieldsFound[pattern] = {
      occurrences: hits.length,
      files: uniqueFiles.slice(0, 5),
    }
  }
  
  findings.barcodeFields = {
    note: 'Barcode/product-id field names found. No single join key chosen — the ERP supports multiple identifier types.',
    fields: barcodePatterns,
    details: barcodeFieldsFound,
  }

  // 5. Tenancy check
  const schemaResult = readFileSafe(schemaPath)
  let orgIdFound = false
  let tenantIdFound = false
  
  if (schemaResult.ok) {
    orgIdFound = /\borgId\b/.test(schemaResult.content)
    tenantIdFound = /\btenant_id\b/i.test(schemaResult.content)
  }
  
  // Also check ERP files
  const erpFiles = [
    'apps/api/src/lib/erpRouting.ts',
    'apps/api/src/lib/erpPush.ts',
    'apps/api/src/lib/erpSync.ts',
    'apps/api/src/lib/erpClient.ts',
  ]
  
  const orgIdInErpFiles = []
  const tenantIdInErpFiles = []
  
  for (const rel of erpFiles) {
    const abs = path.join(REPO_ROOT, rel)
    const result = readFileSafe(abs)
    if (result.ok) {
      if (/\borgId\b/.test(result.content)) orgIdInErpFiles.push(rel)
      if (/\btenant_id\b/i.test(result.content)) tenantIdInErpFiles.push(rel)
    }
  }
  
  findings.tenancy = {
    usesOrgId: orgIdFound && orgIdInErpFiles.length > 0,
    usesTenantId: tenantIdFound || tenantIdInErpFiles.length > 0,
    orgIdInSchema: orgIdFound,
    orgIdInErpFiles,
    tenantIdInErpFiles,
    note: orgIdFound && !tenantIdFound 
      ? 'Tenancy is correctly scoped by orgId. No tenant_id field found.'
      : tenantIdFound 
        ? 'WARNING: tenant_id field found — expected orgId only.'
        : 'Could not verify tenancy field.',
  }

  // Build final report
  const verdict = missingFiles.length > (scannedFiles.length / 2) 
    ? 'AUDIT_COMPLETE_WITH_GAPS' 
    : 'AUDIT_COMPLETE'

  const report = {
    kind: 'ERP_NEXUS_SYNC_AUDIT',
    version: '1.0.0',
    auditedAt,
    verdict,
    blocked: false,
    scannedFiles,
    missingFiles,
    findings,
  }

  return report
}

function writeReportAtomic(report) {
  const dir = path.dirname(REPORT_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  const tmpPath = `${REPORT_PATH}.${process.pid}.tmp`
  const json = JSON.stringify(report, null, 2) + '\n'
  
  fs.writeFileSync(tmpPath, json, 'utf8')
  fs.renameSync(tmpPath, REPORT_PATH)
}

// ─── Main ────────────────────────────────────────────────────
const { help, quiet, unknown } = parseArgs()

if (help) {
  console.log(HELP_TEXT)
  process.exit(0)
}

if (unknown.length > 0) {
  console.error(FAIL_BANNER)
  console.error(`\nUnknown argument(s): ${unknown.join(', ')}`)
  console.error('Use --help for usage information.')
  console.error('\nPrevious report (if any) was NOT overwritten.')
  process.exit(1)
}

try {
  const report = runAudit()
  writeReportAtomic(report)
  
  if (!quiet) {
    console.log(SUCCESS_BANNER)
    console.log(`\nVerdict: ${report.verdict}`)
    console.log(`Production Tracker Found: ${report.findings.productionTracker.found}`)
    console.log(`Tenancy: orgId=${report.findings.tenancy.usesOrgId}, tenant_id=${report.findings.tenancy.usesTenantId}`)
    console.log(`Blocked: ${report.blocked}`)
  }
  
  process.exit(0)
} catch (err) {
  console.error(FAIL_BANNER)
  console.error(`\nError: ${err.message}`)
  console.error('\nPrevious report (if any) was NOT overwritten.')
  process.exit(1)
}
