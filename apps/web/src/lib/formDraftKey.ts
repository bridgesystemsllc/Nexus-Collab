/**
 * sessionStorage keys for per-form drafts (see useFormDraft).
 *
 * Kept dependency-free so the app store can clear drafts without importing
 * the reauth module (which pulls in the form registry and would be circular).
 */

const DRAFT_PREFIX = 'nexus.formDraft.v1:'

/**
 * Get the draft key for a specific form instance.
 */
export function getDraftKey(formType: string, mode: string, recordId: string | null): string {
  return `${DRAFT_PREFIX}${formType}:${mode}:${recordId ?? 'new'}`
}

/**
 * Remove the saved draft for a form (on successful save or Back/Cancel).
 */
export function clearFormDraft(form: { formType: string; mode: string; recordId?: string | null }): void {
  try {
    sessionStorage.removeItem(getDraftKey(form.formType, form.mode, form.recordId ?? null))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Remove every saved form draft. Called once per page load before a re-auth
 * draft is restored: after a reload no form is open, so any draft left in
 * storage is orphaned and must not resurface the next time that form opens.
 */
export function purgeFormDrafts(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Ignore storage errors
  }
}
