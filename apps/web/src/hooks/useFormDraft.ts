import { useEffect, useRef, useState, useCallback } from 'react'
import type { ActiveForm } from '@/stores/appStore'
import { getDraftKey, setLiveDraftSource } from '@/lib/reauth'

const DEBOUNCE_MS = 400

/**
 * Hook to manage form draft persistence and restoration.
 *
 * - On mount: checks sessionStorage for a saved draft and calls onRestore if found
 * - While mounted: debounces writes of the form values to sessionStorage
 * - Registers the values getter with the reauth module for capture on 401
 * - clear(): removes the draft key (call on successful save or Cancel/Back)
 *
 * @param form The current ActiveForm
 * @param values The current form values
 * @param onRestore Callback with restored values when a draft exists
 * @returns { restored: boolean, clear: () => void }
 */
export function useFormDraft<T>(
  form: ActiveForm,
  values: T,
  onRestore: (values: T) => void
): { restored: boolean; clear: () => void } {
  const key = getDraftKey(form.formType, form.mode, form.recordId ?? null)
  const [restored, setRestored] = useState(false)
  const latestValues = useRef(values)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didRestore = useRef(false)

  // Keep latest values ref up to date
  latestValues.current = values

  // On mount: check for existing draft and restore
  useEffect(() => {
    if (didRestore.current) return

    try {
      const saved = sessionStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved) as T
        didRestore.current = true
        setRestored(true)
        onRestore(parsed)
      }
    } catch {
      // Ignore parse errors
    }
  }, [key, onRestore])

  // Register live draft source for reauth capture
  useEffect(() => {
    setLiveDraftSource(() => latestValues.current)
    return () => setLiveDraftSource(null)
  }, [])

  // Debounced write to sessionStorage
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }

    debounceTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(key, JSON.stringify(values))
      } catch {
        // Ignore storage errors
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [key, values])

  // Clear the draft key
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Ignore errors
    }
  }, [key])

  return { restored, clear }
}
