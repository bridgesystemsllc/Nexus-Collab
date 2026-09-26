/**
 * Brief data payload preparation for save operations.
 * Ensures row identity (id, moduleId) is never persisted in the data blob.
 */

import { DEFAULT_BRIEF_STATUS } from '@/lib/briefStatus'
import type { BriefFormData } from './NewBriefModal'

/**
 * Prepares brief form data for saving to the API.
 * 
 * - Strips `id` and `moduleId` from the data (row identity lives on ModuleItem, not in data)
 * - Sets briefStatus to 'Draft' for drafts, or preserves/defaults existing status
 * - Ensures phase defaults to 1
 * 
 * @param form - The form data which may contain stale id/moduleId from legacy rows
 * @param isDraft - Whether this is a draft save
 * @returns Clean BriefFormData ready for API persistence
 */
export function briefDataForSave(
  form: BriefFormData & { id?: unknown; moduleId?: unknown },
  isDraft: boolean
): BriefFormData {
  // Destructure to remove id and moduleId, then spread the rest
  const { id, moduleId, ...rest } = form as BriefFormData & { id?: unknown; moduleId?: unknown }
  
  return {
    ...rest,
    briefStatus: isDraft ? 'Draft' : rest.briefStatus || DEFAULT_BRIEF_STATUS,
    phase: rest.phase || 1,
  } as BriefFormData
}
