/**
 * Re-authentication support: draft capture and restoration across sign-in.
 *
 * When a 401 occurs during a save operation, we capture the current form state
 * to sessionStorage, redirect to login with a returnTo path, and restore the
 * draft after successful re-authentication.
 */

import type { ActiveForm } from '@/stores/appStore'
import { formRegistry } from '@/app/formRegistry'

const PENDING_DRAFT_KEY = 'nexus.pendingDraft.v1'
const DRAFT_EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

export type SerializableActiveForm = Pick<ActiveForm, 'formType' | 'mode' | 'recordId' | 'returnPage'> & {
  context: Record<string, unknown> | null
}

export interface PendingDraft {
  v: 1
  activeForm: SerializableActiveForm
  values: unknown
  returnTo: string
  memberId: string | null
  savedAt: number
}

// The current live draft source getter, set by useFormDraft
let liveDraftSource: (() => unknown) | null = null

/**
 * Register a getter for the current form's live draft values.
 * Called by useFormDraft while a form is mounted.
 */
export function setLiveDraftSource(getter: (() => unknown) | null): void {
  liveDraftSource = getter
}

/**
 * Get the current return-to path (pathname + search).
 */
export function currentReturnTo(): string {
  return window.location.pathname + window.location.search
}

/**
 * Build the login URL with an encoded returnTo parameter.
 */
export function loginUrl(returnTo: string): string {
  return '/api/login?returnTo=' + encodeURIComponent(returnTo)
}

/**
 * Serialize an ActiveForm for storage, dropping functions and non-JSON values.
 */
function serializeActiveForm(form: ActiveForm): SerializableActiveForm {
  let context: Record<string, unknown> | null = null

  if (form.context) {
    context = {}
    for (const [key, value] of Object.entries(form.context)) {
      // Only keep JSON-serializable values
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        Array.isArray(value) ||
        (typeof value === 'object' && value !== null && value.constructor === Object)
      ) {
        try {
          JSON.stringify(value)
          context[key] = value
        } catch {
          // Skip non-serializable values
        }
      }
    }
  }

  return {
    formType: form.formType,
    mode: form.mode,
    recordId: form.recordId ?? null,
    returnPage: form.returnPage,
    context,
  }
}

// Access to the app store state for capturing activeForm
// This is set by the api.ts module to avoid circular imports
let getActiveForm: (() => ActiveForm | null) | null = null
let getMemberId: (() => string | null) | null = null

/**
 * Set the accessor functions for store state.
 * Called during app initialization to avoid circular imports.
 */
export function setStoreAccessors(
  activeFormGetter: () => ActiveForm | null,
  memberIdGetter: () => string | null
): void {
  getActiveForm = activeFormGetter
  getMemberId = memberIdGetter
}

/**
 * Capture the current form draft for restoration after re-auth.
 *
 * Runs only when activeForm is non-null. Serializes the form state,
 * live draft values, current URL, and member id to sessionStorage.
 * JSON errors are logged with console.warn but don't prevent the redirect.
 */
export function captureDraftForReauth(): void {
  const activeForm = getActiveForm?.()
  if (!activeForm) return

  const values = liveDraftSource?.() ?? null

  const draft: PendingDraft = {
    v: 1,
    activeForm: serializeActiveForm(activeForm),
    values,
    returnTo: currentReturnTo(),
    memberId: getMemberId?.() ?? null,
    savedAt: Date.now(),
  }

  try {
    sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(draft))
  } catch (err) {
    console.warn('[reauth] draft not saved', err)
  }
}

/**
 * Take (read and remove) the pending draft from sessionStorage.
 *
 * Returns null and removes the key when:
 * - JSON is invalid
 * - v !== 1
 * - Draft is older than 30 minutes
 * - memberId differs (unless snapshot memberId is null AND returnTo matches current URL)
 * - formType is not in formRegistry
 *
 * @param memberId The current authenticated member's id
 * @param now Optional timestamp for testing (defaults to Date.now())
 */
export function takePendingDraft(memberId: string, now?: number): PendingDraft | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(PENDING_DRAFT_KEY)
    sessionStorage.removeItem(PENDING_DRAFT_KEY)
  } catch {
    return null
  }

  if (!raw) return null

  let draft: PendingDraft
  try {
    draft = JSON.parse(raw) as PendingDraft
  } catch {
    return null
  }

  // Version check
  if (draft.v !== 1) return null

  // Expiry check
  const timestamp = now ?? Date.now()
  if (timestamp - draft.savedAt > DRAFT_EXPIRY_MS) return null

  // Member check: draft must belong to same member, OR
  // snapshot memberId is null and returnTo matches current URL
  if (draft.memberId !== null && draft.memberId !== memberId) {
    return null
  }
  if (draft.memberId === null && draft.returnTo !== currentReturnTo()) {
    return null
  }

  // Form type validation
  if (!formRegistry[draft.activeForm.formType]) {
    return null
  }

  return draft
}

export { getDraftKey } from './formDraftKey'
