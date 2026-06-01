// Server-side upload validation. Kept self-contained (no cross-package
// source imports) so the API's tsc build stays within its rootDir. These
// rules intentionally mirror the shared client-side rules in
// `packages/shared/src/index.ts` — keep the two in sync if either changes.

const DEFAULT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024 // 25 MB

const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
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
]

const ALLOWED_UPLOAD_EXTENSIONS: readonly string[] = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'zip',
]

// Maximum upload size, configurable via the UPLOAD_MAX_BYTES env var.
// Falls back to the default (25 MB) when unset or invalid.
function resolveMaxBytes(): number {
  const raw = process.env.UPLOAD_MAX_BYTES
  if (!raw) return DEFAULT_UPLOAD_MAX_BYTES
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_UPLOAD_MAX_BYTES
}

export const UPLOAD_MAX_BYTES: number = resolveMaxBytes()

function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

function formatMaxUploadSize(maxBytes: number): string {
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
export function validateUpload(
  input: UploadValidationInput,
  maxBytes: number = UPLOAD_MAX_BYTES,
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
  if (!mimeAllowed && !extAllowed) {
    return { ok: false, error: 'This file type is not supported.' }
  }

  return { ok: true }
}
