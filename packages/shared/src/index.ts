// ─── Shared Types for NEXUS ─────────────────────────────────

export type Role = 'ADMIN' | 'OPS_MANAGER' | 'DEPT_LEAD' | 'PROJECT_LEAD' | 'MEMBER'
export type MemberStatus = 'AVAILABLE' | 'FOCUSED' | 'IN_MEETING' | 'OOO'
export type DeptType = 'BUILTIN_RD' | 'BUILTIN_OPS' | 'CUSTOM'

export type ModuleType =
  | 'BRIEFS' | 'CM_PRODUCTIVITY' | 'TECH_TRANSFERS' | 'FORMULATIONS'
  | 'SKU_PIPELINE' | 'INVENTORY_HEALTH' | 'PRODUCTION_TRACKING'
  | 'CUSTOM_TABLE' | 'CUSTOM_KANBAN' | 'CUSTOM_LIST'

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'BLOCKED' | 'COMPLETE'
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'BLOCKED' | 'REVIEW' | 'COMPLETE' | 'ARCHIVED'
export type ProjectPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type CoworkType = 'PROJECT' | 'EMERGENCY' | 'INITIATIVE' | 'DEPARTMENT'
export type ActivityType = 'UPDATE' | 'SUBMISSION' | 'NOTE' | 'STATUS_CHANGE' | 'FILE_UPLOAD' | 'EMAIL_LINKED' | 'TASK_CREATED' | 'TASK_COMPLETED' | 'AI_ACTION'

export type DocumentType = 'BRIEF' | 'COA' | 'SPEC_SHEET' | 'QUOTE' | 'PRICING' | 'CONTRACT' | 'REPORT' | 'ARTWORK' | 'INVOICE' | 'OTHER'
export type PulseType = 'ALERT' | 'SIGNAL' | 'HEARTBEAT' | 'BROADCAST'

export type IntegrationType =
  | 'ERP_KAREVE_SYNC' | 'MICROSOFT_OUTLOOK' | 'MICROSOFT_TEAMS' | 'MICROSOFT_ONEDRIVE'
  | 'AMAZON_VENDOR_CENTRAL' | 'SHOPIFY' | 'GS1_SYNC' | 'SLACK' | 'ZAPIER'

export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'SYNCING'

// ─── Upload Validation ──────────────────────────────────────
// Shared rules for file uploads, enforced both client-side (pre-check)
// and server-side (request-url + attach). The max size is configurable
// via the API env var UPLOAD_MAX_BYTES; this constant is the default.
export const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024 // 25 MB

// Allowlist of accepted MIME types. Anything not listed is rejected.
export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
] as const

// Allowlist of accepted file extensions (lowercase, no leading dot).
// Used as a fallback when a MIME type is missing or generic.
export const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'zip',
] as const

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

export function formatMaxUploadSize(maxBytes: number): string {
  const mb = maxBytes / (1024 * 1024)
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`
}

export interface UploadValidationInput {
  name: string
  size?: number | null
  mimeType?: string | null
}

export interface UploadValidationResult {
  ok: boolean
  error?: string
}

// Validate a file against the size limit and MIME/extension allowlist.
// Returns a friendly error message when the file should be rejected.
export function validateUpload(
  input: UploadValidationInput,
  maxBytes: number = DEFAULT_UPLOAD_MAX_BYTES,
): UploadValidationResult {
  const { name, size, mimeType } = input

  if (typeof size === 'number' && size > maxBytes) {
    return {
      ok: false,
      error: `File is too large. Maximum size is ${formatMaxUploadSize(maxBytes)}.`,
    }
  }

  const ext = getExtension(name)
  const normalizedMime = (mimeType || '').toLowerCase().trim()
  const mimeAllowed = normalizedMime !== '' && ALLOWED_UPLOAD_MIME_TYPES.includes(normalizedMime)
  const extAllowed = ext !== '' && ALLOWED_UPLOAD_EXTENSIONS.includes(ext)

  // Accept when either the MIME type or the extension is on the allowlist.
  // This tolerates browsers that report a generic/empty MIME type while
  // still blocking clearly unsupported types.
  if (!mimeAllowed && !extAllowed) {
    return {
      ok: false,
      error: 'This file type is not supported.',
    }
  }

  return { ok: true }
}

// ─── WebSocket Events ───────────────────────────────────────
export const WS_EVENTS = {
  JOIN_SPACE: 'join_space',
  LEAVE_SPACE: 'leave_space',
  TYPING: 'typing',
  ACTIVITY_NEW: 'activity_new',
  TASK_UPDATED: 'task_updated',
  PULSE_NEW: 'pulse_new',
  SYNC_COMPLETE: 'sync_complete',
  MEMBER_STATUS: 'member_status',
} as const
