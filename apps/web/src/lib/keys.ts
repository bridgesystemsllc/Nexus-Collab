import type { KeyboardEvent } from 'react'

interface OnEnterOptions {
  /** If true, Shift+Enter also triggers the handler. Default: false (ignored). */
  allowShift?: boolean
}

/**
 * Creates a keyboard event handler that calls the given handler on Enter key.
 *
 * - Ignores Enter during IME composition (isComposing)
 * - By default, ignores Shift+Enter (allows native newline in inputs)
 * - Calls e.preventDefault() before invoking the handler
 */
export function onEnter(
  handler: () => void,
  opts?: OnEnterOptions
): (e: KeyboardEvent<HTMLElement>) => void {
  const allowShift = opts?.allowShift ?? false

  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Enter') return

    // Ignore Enter during IME composition (e.g. Japanese/Chinese input)
    if (e.nativeEvent.isComposing) return

    // By default, ignore Shift+Enter to allow native newlines
    if (e.shiftKey && !allowShift) return

    e.preventDefault()
    handler()
  }
}
